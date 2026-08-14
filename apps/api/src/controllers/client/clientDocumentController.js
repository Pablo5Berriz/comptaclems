// apps/api/src/controllers/client/clientDocumentController.js
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class ClientDocumentController {
    /**
     * Récupérer les documents accessibles au client connecté
     */
    async getMyDocuments(req, res, next) {
        try {
            const clientId = req.client.id;
            const { year, authority } = req.query;

            let query = `
                SELECT 
                    d.id,
                    d.file_name,
                    d.original_name,
                    d.file_size,
                    d.mime_type,
                    d.document_authority,
                    d.tax_year,
                    d.declaration_type,
                    d.upload_date,
                    d.download_count,
                    d.status,
                    d.notes,
                    a.first_name as admin_first_name,
                    a.last_name as admin_last_name
                FROM comptaclems.admin_document_uploads d
                LEFT JOIN comptaclems.admin a ON d.admin_id = a.id
                WHERE d.client_id = $1 
                AND d.status = 'active'
                AND d.is_archived = false
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

            query += ` ORDER BY d.tax_year DESC, d.upload_date DESC`;

            const result = await db.query(query, params);

            // Formater la taille des fichiers pour l'affichage
            const documents = result.rows.map(doc => ({
                ...doc,
                file_size_formatted: this.formatFileSize(doc.file_size)
            }));

            res.json({
                success: true,
                documents
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Télécharger un document spécifique
     */
    async downloadDocument(req, res, next) {
        try {
            const { documentId } = req.params;
            const clientId = req.client.id;

            // Vérifier que le document appartient bien au client et est actif
            const docResult = await db.query(
                `SELECT * FROM comptaclems.admin_document_uploads 
                 WHERE id = $1 AND client_id = $2 AND status = 'active' AND is_archived = false`,
                [documentId, clientId]
            );

            if (docResult.rows.length === 0) {
                throw new AppError('Document non trouvé ou accès non autorisé', 404);
            }

            const document = docResult.rows[0];

            // Vérifier que le fichier existe
            try {
                await fs.promises.access(document.file_path);
            } catch (error) {
                logger.error(`Fichier manquant: ${document.file_path}`);
                throw new AppError('Le fichier n\'est plus disponible sur le serveur', 404);
            }

            // Enregistrer le téléchargement
            await db.query(
                `INSERT INTO comptaclems.admin_document_downloads 
                 (document_id, client_id, ip_address, user_agent, download_date) 
                 VALUES ($1, $2, $3, $4, NOW())`,
                [documentId, clientId, req.ip, req.headers['user-agent']]
            );

            // Mettre à jour le compteur de téléchargements
            await db.query(
                `UPDATE comptaclems.admin_document_uploads 
                 SET download_count = COALESCE(download_count, 0) + 1 
                 WHERE id = $1`,
                [documentId]
            );

            // Logger le téléchargement
            logger.info(`Client ${clientId} a téléchargé le document ${documentId}`);

            // Envoyer le fichier
            res.download(document.file_path, document.original_name, (err) => {
                if (err) {
                    logger.error('Erreur lors de l\'envoi du fichier:', err);
                    if (!res.headersSent) {
                        next(new AppError('Erreur lors du téléchargement', 500));
                    }
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Récupérer les statistiques personnelles du client
     */
    async getMyStats(req, res, next) {
        try {
            const clientId = req.client.id;

            const stats = await db.query(`
                SELECT 
                    COUNT(*) as total_documents,
                    COUNT(CASE WHEN document_authority = 'REVENU_QUEBEC' THEN 1 END) as quebec_docs,
                    COUNT(CASE WHEN document_authority = 'REVENU_CANADA' THEN 1 END) as canada_docs,
                    COALESCE(SUM(download_count), 0) as total_downloads,
                    MAX(tax_year) as latest_year,
                    COUNT(DISTINCT tax_year) as years_count,
                    MAX(upload_date) as latest_upload
                FROM comptaclems.admin_document_uploads
                WHERE client_id = $1 AND status = 'active' AND is_archived = false
            `, [clientId]);

            // Récupérer les années disponibles
            const years = await db.query(`
                SELECT DISTINCT tax_year 
                FROM comptaclems.admin_document_uploads 
                WHERE client_id = $1 AND status = 'active' AND is_archived = false
                ORDER BY tax_year DESC
            `, [clientId]);

            res.json({
                success: true,
                stats: stats.rows[0],
                available_years: years.rows.map(y => y.tax_year)
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Vérifier si un document est disponible
     */
    async checkDocumentAvailability(req, res, next) {
        try {
            const { documentId } = req.params;
            const clientId = req.client.id;

            const result = await db.query(
                `SELECT id, file_name, file_size, mime_type, document_authority, tax_year 
                 FROM comptaclems.admin_document_uploads 
                 WHERE id = $1 AND client_id = $2 AND status = 'active' AND is_archived = false`,
                [documentId, clientId]
            );

            res.json({
                success: true,
                available: result.rows.length > 0,
                document: result.rows[0] || null
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Formater la taille du fichier
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = new ClientDocumentController();