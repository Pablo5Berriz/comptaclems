// apps/api/src/controllers/admin/adminDocumentController.js
const fs = require('fs').promises;
const path = require('path');
const db = require('../../db');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const config = require('../../config/config');
const { sendDocumentUploadNotification } = require('../../services/mailer');
const { scheduleJob } = require('../../scheduledJobs');

class AdminDocumentController {
    constructor() {
        this.uploadDir = path.join(__dirname, '../../../uploads/government-docs');
    }

    /**
     * Téléverser un document gouvernemental pour un client
     */
    async uploadGovernmentDocument(req, res, next) {
        try {
            const { clientId } = req.params;
            const adminId = req.admin.id;
            const file = req.file;
            const { taxYear, documentAuthority, declarationType, notes } = req.body;

            // Validations de base
            if (!file) {
                throw new AppError('Aucun fichier téléversé', 400);
            }

            if (!taxYear || !documentAuthority) {
                throw new AppError('L\'année fiscale et l\'autorité sont requises', 400);
            }

            // Vérifier que le client existe
            const clientCheck = await db.query(
                'SELECT id, email, first_name, last_name FROM comptaclems.clients WHERE id = $1',
                [clientId]
            );

            if (clientCheck.rows.length === 0) {
                throw new AppError('Client non trouvé', 404);
            }

            // Créer le dossier spécifique au client si nécessaire
            const clientDir = path.join(this.uploadDir, `client-${clientId}`);
            await fs.mkdir(clientDir, { recursive: true });

            // Générer un nom de fichier unique
            const timestamp = Date.now();
            const sanitizedFileName = this.sanitizeFileName(file.originalname);
            const fileName = `${timestamp}_${documentAuthority}_${taxYear}_${sanitizedFileName}`;
            const filePath = path.join(clientDir, fileName);

            // Déplacer le fichier du dossier temporaire vers le dossier permanent
            await fs.rename(file.path, filePath);

            // Insérer dans la base de données
            const result = await db.query(
                `INSERT INTO comptaclems.admin_document_uploads 
                (client_id, admin_id, file_name, original_name, file_path, file_size, mime_type, 
                 document_authority, tax_year, declaration_type, notes, status, upload_date) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW()) 
                RETURNING *`,
                [
                    clientId,
                    adminId,
                    fileName,
                    file.originalname,
                    filePath,
                    file.size,
                    file.mimetype,
                    documentAuthority,
                    taxYear,
                    declarationType || null,
                    notes || null
                ]
            );

            // Logger l'action
            logger.info(`Document gouvernemental téléversé pour le client ${clientId} par l'admin ${adminId}`);

            // Notifier le client par email 
            const client = clientCheck.rows[0];
            const notifyClient = req.body.notifyClient === 'true' || req.body.notifyClient === true;
            if (notifyClient && client.email) {
              const uploadDate = new Date().toLocaleDateString('fr-CA', {
                year: 'numeric', month: 'long', day: 'numeric',
              });
              const portalUrl = `${process.env.APP_URL || 'http://localhost:4000'}/espace-client/document-gouvernemental.html`;
              sendDocumentUploadNotification(client.email, {
                clientName: `${client.first_name} ${client.last_name}`,
                originalName: file.originalname,
                taxYear: taxYear,
                documentAuthority: documentAuthority,
                declarationType: declarationType || null,
                notes: notes || null,
                uploadDate,
                portalUrl,
              }).catch(err => logger.error('Email document non envoyé:', err.message));

              // Planifie un email de demande de témoignage 1h après le dépôt
              scheduleJob(
                'testimonial_request',
                {
                  clientName:  `${client.first_name} ${client.last_name}`,
                  clientEmail: client.email,
                  documentId:  result.rows[0].id,
                },
                60 * 60 * 1000  
              ).catch(err => logger.error('Planification témoignage échouée:', err.message));
            }

            res.status(201).json({
                success: true,
                message: 'Document téléversé avec succès',
                document: result.rows[0]
            });

        } catch (error) {
            if (req.file && req.file.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    logger.error('Erreur lors du nettoyage du fichier temporaire:', unlinkError);
                }
            }
            next(error);
        }
    }

    /**
     * Récupérer tous les documents d'un client
     */
    async getClientDocuments(req, res, next) {
        try {
            const { clientId } = req.params;
            const { year, authority, status } = req.query;

            let query = `
                SELECT d.*, 
                       a.email as admin_email,
                       a.first_name as admin_first_name,
                       a.last_name as admin_last_name,
                       COALESCE(d.download_count, 0) as download_count
                FROM comptaclems.admin_document_uploads d
                LEFT JOIN comptaclems.admin a ON d.admin_id = a.id
                WHERE d.client_id = $1
            `;
            const params = [clientId];
            let paramIndex = 2;

            if (year) {
                query += ` AND d.tax_year = $${paramIndex}`;
                params.push(year);
                paramIndex++;
            }

            if (authority) {
                query += ` AND d.document_authority = $${paramIndex}`;
                params.push(authority);
                paramIndex++;
            }

            if (status && status !== 'all') {
                query += ` AND d.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            query += ` ORDER BY d.tax_year DESC, d.upload_date DESC`;

            const result = await db.query(query, params);

            res.json({
                success: true,
                documents: result.rows
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Supprimer un document (soft delete ou hard delete)
     */
    async deleteDocument(req, res, next) {
        try {
            const { documentId } = req.params;
            const adminId = req.admin.id;
            const { permanent } = req.query; 

            // Récupérer le document
            const docResult = await db.query(
                'SELECT * FROM comptaclems.admin_document_uploads WHERE id = $1',
                [documentId]
            );

            if (docResult.rows.length === 0) {
                throw new AppError('Document non trouvé', 404);
            }

            const document = docResult.rows[0];

            if (permanent === 'true') {
                // Suppression définitive
                try {
                    await fs.unlink(document.file_path);
                } catch (unlinkError) {
                    logger.warn(`Fichier non trouvé ou déjà supprimé: ${document.file_path}`);
                }

                // Supprimer l'entrée en base (CASCADE supprimera les downloads)
                await db.query(
                    'DELETE FROM comptaclems.admin_document_uploads WHERE id = $1',
                    [documentId]
                );

                logger.info(`Document ${documentId} supprimé définitivement par admin ${adminId}`);

                res.json({
                    success: true,
                    message: 'Document supprimé définitivement'
                });
            } else {
                await db.query(
                    `UPDATE comptaclems.admin_document_uploads 
                     SET status = 'archived', is_archived = true 
                     WHERE id = $1`,
                    [documentId]
                );

                logger.info(`Document ${documentId} archivé par admin ${adminId}`);

                res.json({
                    success: true,
                    message: 'Document archivé avec succès'
                });
            }

        } catch (error) {
            next(error);
        }
    }

    /**
     * Mettre à jour les informations d'un document
     */
    async updateDocument(req, res, next) {
        try {
            const { documentId } = req.params;
            const { declarationType, notes, status, documentAuthority, taxYear } = req.body;

            // Construire la requête dynamiquement
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (declarationType !== undefined) {
                updates.push(`declaration_type = $${paramIndex}`);
                params.push(declarationType);
                paramIndex++;
            }
            if (notes !== undefined) {
                updates.push(`notes = $${paramIndex}`);
                params.push(notes);
                paramIndex++;
            }
            if (status !== undefined) {
                updates.push(`status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }
            if (documentAuthority !== undefined) {
                updates.push(`document_authority = $${paramIndex}`);
                params.push(documentAuthority);
                paramIndex++;
            }
            if (taxYear !== undefined) {
                updates.push(`tax_year = $${paramIndex}`);
                params.push(taxYear);
                paramIndex++;
            }

            if (updates.length === 0) {
                throw new AppError('Aucune donnée à mettre à jour', 400);
            }

            params.push(documentId);
            const query = `
                UPDATE comptaclems.admin_document_uploads 
                SET ${updates.join(', ')} 
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await db.query(query, params);

            if (result.rows.length === 0) {
                throw new AppError('Document non trouvé', 404);
            }

            res.json({
                success: true,
                message: 'Document mis à jour avec succès',
                document: result.rows[0]
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Récupérer les statistiques des documents pour un client
     */
    async getDocumentStats(req, res, next) {
        try {
            const { clientId } = req.params;

            const stats = await db.query(`
                SELECT 
                    COUNT(*) as total_documents,
                    COUNT(CASE WHEN document_authority = 'REVENU_QUEBEC' THEN 1 END) as quebec_docs,
                    COUNT(CASE WHEN document_authority = 'REVENU_CANADA' THEN 1 END) as canada_docs,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_docs,
                    COALESCE(SUM(download_count), 0) as total_downloads,
                    MAX(tax_year) as latest_year,
                    COUNT(DISTINCT tax_year) as years_count
                FROM comptaclems.admin_document_uploads
                WHERE client_id = $1
            `, [clientId]);

            res.json({
                success: true,
                stats: stats.rows[0]
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Liste tous les documents avec pagination et filtres globaux
     */
    async getAllDocuments(req, res, next) {
        try {
            const { page = 1, limit = 20, search = '', year = '', authority = '', status = 'all' } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            const conditions = [];
            const params = [];
            let i = 1;

            if (search) {
                conditions.push(`(d.original_name ILIKE $${i} OR c.first_name ILIKE $${i} OR c.last_name ILIKE $${i} OR c.email ILIKE $${i})`);
                params.push(`%${search}%`);
                i++;
            }
            if (year) {
                conditions.push(`d.tax_year = $${i}`);
                params.push(parseInt(year));
                i++;
            }
            if (authority) {
                conditions.push(`d.document_authority = $${i}`);
                params.push(authority);
                i++;
            }
            if (status && status !== 'all') {
                conditions.push(`d.status = $${i}`);
                params.push(status);
                i++;
            }

            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

            const countResult = await db.query(
                `SELECT COUNT(*) FROM comptaclems.admin_document_uploads d
                 LEFT JOIN comptaclems.clients c ON d.client_id = c.id
                 ${where}`,
                params
            );
            const total = parseInt(countResult.rows[0].count);

            const result = await db.query(
                `SELECT d.*,
                        c.first_name || ' ' || c.last_name AS client_name,
                        c.email AS client_email,
                        a.first_name || ' ' || a.last_name AS admin_name,
                        COALESCE(d.download_count, 0) AS download_count
                 FROM comptaclems.admin_document_uploads d
                 LEFT JOIN comptaclems.clients c ON d.client_id = c.id
                 LEFT JOIN comptaclems.admin a ON d.admin_id = a.id
                 ${where}
                 ORDER BY d.upload_date DESC
                 LIMIT $${i} OFFSET $${i + 1}`,
                [...params, parseInt(limit), offset]
            );

            const totalPages = Math.ceil(total / parseInt(limit));
            res.json({
                success: true,
                documents: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages,
                    start: total === 0 ? 0 : offset + 1,
                    end: Math.min(offset + result.rows.length, total)
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Stats globales de tous les documents
     */
    async getGlobalStats(req, res, next) {
        try {
            const result = await db.query(`
                SELECT
                    COUNT(*) AS total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
                    COALESCE(SUM(download_count), 0) AS total_downloads,
                    COUNT(CASE WHEN document_authority = 'REVENU_QUEBEC' THEN 1 END) AS quebec_docs,
                    COUNT(CASE WHEN document_authority = 'REVENU_CANADA' THEN 1 END) AS canada_docs
                FROM comptaclems.admin_document_uploads
            `);
            res.json({ success: true, stats: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Détail d'un document par son ID
     */
    async getDocumentById(req, res, next) {
        try {
            const { documentId } = req.params;
            const result = await db.query(
                `SELECT d.*,
                        c.first_name || ' ' || c.last_name AS client_name,
                        c.email AS client_email,
                        a.first_name || ' ' || a.last_name AS admin_name,
                        COALESCE(d.download_count, 0) AS download_count
                 FROM comptaclems.admin_document_uploads d
                 LEFT JOIN comptaclems.clients c ON d.client_id = c.id
                 LEFT JOIN comptaclems.admin a ON d.admin_id = a.id
                 WHERE d.id = $1`,
                [documentId]
            );
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'Document introuvable' });
            }
            res.json({ success: true, document: result.rows[0] });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Télécharger un document (admin)
     */
    async downloadDocument(req, res, next) {
        try {
            const { documentId } = req.params;
            const result = await db.query(
                `SELECT * FROM comptaclems.admin_document_uploads WHERE id = $1`,
                [documentId]
            );
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'Document introuvable' });
            }
            const doc = result.rows[0];

            // Enregistrer dans admin_document_downloads
            await db.query(
                `INSERT INTO comptaclems.admin_document_downloads (document_id, client_id, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4)`,
                [doc.id, doc.client_id, req.ip || null, req.headers['user-agent'] || null]
            );

            // Incrémenter le compteur
            await db.query(
                `UPDATE comptaclems.admin_document_uploads
                 SET download_count = COALESCE(download_count, 0) + 1
                 WHERE id = $1`,
                [documentId]
            );

            res.download(doc.file_path, doc.original_name);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Nettoyer le nom du fichier
     */
    sanitizeFileName(fileName) {
        return fileName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') 
            .replace(/[^a-zA-Z0-9.-]/g, '_') 
            .replace(/_+/g, '_'); 
    }
}

module.exports = new AdminDocumentController();