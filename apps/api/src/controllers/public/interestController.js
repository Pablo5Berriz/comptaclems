// apps/api/src/controllers/public/interestController.js
'use strict';

const db     = require('../../db');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class InterestController {

    /* ================================================
     * POST /api/interest/register
     * Enregistrer l'intérêt d'un client pour un service
     * ================================================ */
    async registerInterest(req, res, next) {
        try {
            // CORRECTION : authClient injecte req.client (pas req.user)
            if (!req.client || !req.client.id) {
                throw new AppError('Vous devez être connecté pour vous inscrire', 401);
            }

            const clientId = req.client.id;

            // Validation du service demandé
            const service = String(req.body?.service || '').trim();

            const validServices = ['travailleurs-autonomes', 'pme'];
            if (!service) {
                throw new AppError('Le service est requis', 400);
            }
            if (!validServices.includes(service)) {
                throw new AppError('Service non valide', 400);
            }

            // Récupérer les infos complètes du client depuis la BD
            // (le JWT ne contient que id, email et first_name)
            const clientResult = await db.query(
                'SELECT id, email, first_name, last_name FROM comptaclems.clients WHERE id = $1',
                [clientId]
            );

            if (clientResult.rows.length === 0) {
                throw new AppError('Client introuvable', 404);
            }

            const client     = clientResult.rows[0];
            const clientEmail = client.email;
            const clientName  = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Client';

            // Vérifier si déjà inscrit pour ce service
            const existing = await db.query(
                'SELECT id FROM comptaclems.service_interests WHERE email = $1 AND service = $2',
                [clientEmail, service]
            );

            if (existing.rows.length > 0) {
                return res.json({
                    success: true,
                    message: 'Vous êtes déjà inscrit pour être informé de ce service.',
                    alreadyRegistered: true
                });
            }

            // Enregistrer l'intérêt
            const insert = await db.query(
                `INSERT INTO comptaclems.service_interests
                    (client_id, email, client_name, service, registered_at, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4, NOW(), $5, $6)
                 RETURNING id, service`,
                [
                    clientId,
                    clientEmail,
                    clientName,
                    service,
                    req.ip || null,
                    req.headers['user-agent'] || null
                ]
            );

            // Email de confirmation (production uniquement)
            const serviceDisplay = service === 'pme'
                ? 'les solutions PME'
                : 'les services pour travailleurs autonomes';

            if (process.env.NODE_ENV === 'production') {
                await this._sendInterestEmail(clientEmail, clientName, serviceDisplay).catch((err) => {
                    // L'email est non-bloquant : on log l'erreur mais on répond quand même OK
                    logger.error(`Erreur email intérêt (${clientEmail}) :`, err);
                });
            } else {
                console.log(`📧 [DEV] Email simulé → ${clientEmail} — service: ${serviceDisplay}`);
            }

            logger.info(`Intérêt "${service}" enregistré — client #${clientId} (${clientEmail})`);

            return res.status(201).json({
                success: true,
                message: 'Votre intérêt a bien été enregistré. Vous serez contacté(e) en priorité lors de l\'ouverture.',
                data: {
                    id:      insert.rows[0].id,
                    service: insert.rows[0].service
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /* ================================================
     * GET /api/interest/admin/interests
     * Liste paginée des inscriptions (admin)
     * ================================================ */
    async getInterests(req, res, next) {
        try {
            const service = req.query.service ? String(req.query.service).trim() : null;
            const page    = Math.max(1, parseInt(req.query.page, 10)  || 1);
            const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
            const offset  = (page - 1) * limit;

            let baseWhere  = '';
            let baseParams = [];

            if (service) {
                baseWhere  = 'WHERE service = $1';
                baseParams = [service];
            }

            const dataQuery = `
                SELECT * FROM comptaclems.service_interests
                ${baseWhere}
                ORDER BY registered_at DESC
                LIMIT $${baseParams.length + 1}
                OFFSET $${baseParams.length + 2}
            `;

            const countQuery = `
                SELECT COUNT(*) FROM comptaclems.service_interests ${baseWhere}
            `;

            const [dataResult, countResult] = await Promise.all([
                db.query(dataQuery, [...baseParams, limit, offset]),
                db.query(countQuery, baseParams)
            ]);

            const total = parseInt(countResult.rows[0].count, 10);

            return res.json({
                success: true,
                interests: dataResult.rows,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /* ================================================
     * GET /api/interest/admin/interests/export
     * Export CSV des inscriptions (admin)
     * ================================================ */
    async exportInterests(req, res, next) {
        try {
            const service = req.query.service ? String(req.query.service).trim() : null;

            let query  = 'SELECT * FROM comptaclems.service_interests';
            let params = [];

            if (service) {
                query += ' WHERE service = $1';
                params = [service];
            }

            query += ' ORDER BY registered_at DESC';

            const result = await db.query(query, params);

            const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

            const header = 'ID,Email,Client,Service,Date,IP,User Agent\n';
            const rows   = result.rows.map((r) =>
                [
                    r.id,
                    escape(r.email),
                    escape(r.client_name),
                    escape(r.service),
                    r.registered_at ? new Date(r.registered_at).toISOString() : '',
                    escape(r.ip_address),
                    escape(r.user_agent)
                ].join(',')
            ).join('\n');

            const filename = `interets-${service || 'tous'}-${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send('\uFEFF' + header + rows); // BOM UTF-8 pour Excel

        } catch (error) {
            next(error);
        }
    }

    /* ================================================
     * Méthode privée — Email de confirmation d'intérêt
     * ================================================ */
    async _sendInterestEmail(clientEmail, clientName, serviceDisplay) {
        const mailer = require('../../services/mailer');
        // Si mailer expose une fonction générique, l'utiliser
        // Sinon construire l'email directement ici
        if (typeof mailer.sendInterestConfirmationEmail === 'function') {
            return mailer.sendInterestConfirmationEmail(clientEmail, { clientName, serviceDisplay });
        }
        // Fallback : log uniquement (à compléter selon les besoins)
        logger.info(`[INTEREST EMAIL] Confirmation pour ${clientEmail} — ${serviceDisplay}`);
    }
}

module.exports = new InterestController();