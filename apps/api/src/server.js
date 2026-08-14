'use strict';

// ─── CHARGEMENT .ENV EN TOUT PREMIER ─────────────────────────────────────────
const path = require('path');
const fs   = require('fs');

const ENV_CANDIDATES = [
  path.join(__dirname, '..', '..', '..', '.env'),  
  '/opt/comptaclems/.env',                         
];

let envFile = null;
for (const p of ENV_CANDIDATES) {
  if (fs.existsSync(p)) { envFile = p; break; }
}

if (envFile) {
  require('dotenv').config({ path: envFile });
  console.log('.env chargé depuis :', envFile);
} else {
  console.warn('⚠️  Aucun .env trouvé — chemins testés :', ENV_CANDIDATES);
}

// ─── Vérification immédiate ───────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET manquant. Vérifiez que', envFile || ENV_CANDIDATES[0], 'contient JWT_SECRET.');
  process.exit(1); 
}

console.log('PGHOST =', process.env.PGHOST || '(non défini)');

// ─── Imports (après dotenv) ───────────────────────────────────────────────────
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const db = require('./db');

const setupSecurityMiddleware = require('./middleware/security');
const maintenanceMiddleware   = require('./middleware/maintenance');
const authClient              = require('./middleware/authClient');
const adminRoutes             = require('./routes/admin');
const clientRoutes            = require('./routes/client');
const publicRoutes            = require('./routes/public');
const contactRoutes           = require('./routes/public/contact');
const clientAuthRoutes        = require('./routes/client/authAccount');
const adminDeclarations       = require('./routes/admin/declarations');
const taxesParticuliersRoutes = require('./routes/client/taxesParticuliers');
const { restorePendingJobs }  = require('./scheduledJobs');
const { startReminderCron }   = require('./services/reminderCron');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT     = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD  = NODE_ENV === 'production';

const PUBLIC_DIR = IS_PROD
  ? '/opt/comptaclems/apps/web/public'
  : path.join(__dirname, '..', '..', '..', 'apps', 'web', 'public');

console.log('✅ PUBLIC_DIR =', PUBLIC_DIR, '| existe:', fs.existsSync(PUBLIC_DIR));

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

if (!db || typeof db.query !== 'function') throw new Error('db.js invalide');

/* =========================
 * LOGGING DEV
 * ========================= */
if (!IS_PROD) {
  app.use((req, res, next) => {
    console.log(`🔥 ${req.method} ${req.url}`);
    next();
  });
}

/* =========================
 * SÉCURITÉ / PERF
 * ========================= */
if (!IS_PROD) {
  app.use(helmet({ contentSecurityPolicy: false }));
}
app.use(compression());

/* =========================
 * PARSING + COOKIES
 * ========================= */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

/* =========================
 * FICHIERS STATIQUES
 * ========================= */
app.use(express.static(PUBLIC_DIR, { etag: true, maxAge: IS_PROD ? '7d' : 0 }));
app.use('/public', express.static(PUBLIC_DIR, { etag: true, maxAge: IS_PROD ? '7d' : 0 }));

/* =========================
 * DEBUG (dev uniquement)
 * ========================= */
if (!IS_PROD) {
  app.get('/debug-files', (req, res) => {
    try {
      res.json({
        public_dir:        PUBLIC_DIR,
        public_dir_exists: fs.existsSync(PUBLIC_DIR),
        auth_exists:       fs.existsSync(path.join(PUBLIC_DIR, 'auth', 'login.html')),
        admin_exists:      fs.existsSync(path.join(PUBLIC_DIR, 'admin', 'adminLogin.html')),
        env_file:          envFile,
        node_env:          NODE_ENV,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

/* =========================
 * CORS
 * ========================= */
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin refusée'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* =========================
 * RATE LIMITING GLOBAL
 * ========================= */
app.use('/api',            rateLimit({ windowMs: 15*60*1000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth',       rateLimit({ windowMs: 15*60*1000, max: 40,  standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin/auth', rateLimit({ windowMs: 15*60*1000, max: 30,  standardHeaders: true, legacyHeaders: false }));

/* =========================
 * SÉCURITÉ AVANCÉE
 * setupSecurityMiddleware applique 
 * ========================= */
setupSecurityMiddleware(app, IS_PROD);

/* =========================
 * MAINTENANCE
 * ========================= */
app.use(maintenanceMiddleware);

/* =========================
 * PAGES PROTÉGÉES
 * ========================= */
const PROTECTED_PAGES = [
  'pme.html', 'autonome.html', 'declaration.html', 'documents.html',
  'document-gouvernemental.html', 'profil.html', 'parametres.html',
  'suivi-declaration.html', 'merci.html',
  'messages.html', 'factures.html', 'client-documents.html',
];

PROTECTED_PAGES.forEach((page) => {
  app.get(`/espace-client/${page}`, authClient, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'espace-client', page));
  });
});

/* =========================
 * ROUTES API
 * ========================= */
app.use('/api/admin',                             adminRoutes);
app.use('/api/admin/declarations',                adminDeclarations);
app.use('/api/public',                            publicRoutes);
app.use('/api/interest',                          require('./routes/public/interest'));
app.use('/api/auth',                              clientAuthRoutes);
app.use('/api/client',                            clientRoutes);
// BUG FIX: les routes forgot-password et reset-password sont déjà
// incluses dans clientRoutes via client/index.js (montées à /forgot-password
// et /reset-password). Les doublons retirés pour éviter les conflits.
app.use('/api/contact',                           contactRoutes);
app.use('/api/taxes/particuliers',                taxesParticuliersRoutes);
app.use('/api/client/espace-client/declarations', taxesParticuliersRoutes);

/* =========================
 * HEALTH
 * ========================= */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, timestamp: new Date().toISOString() });
});

/* =========================
 * PAGE D'ACCUEIL
 * ========================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* =========================
 * 404 API
 * ========================= */
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route API introuvable', path: req.originalUrl });
});

/* =========================
 * 404 STATIQUES
 * ========================= */
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api')) return;
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), err => {
    if (err) res.status(404).send('Page non trouvée');
  });
});

/* =========================
 * ERREURS API
 * ========================= */
app.use((err, req, res, next) => {
  if (!req.originalUrl.startsWith('/api')) return next(err);
  const message = IS_PROD ? 'Erreur serveur' : err.message;
  res.status(500).json({ error: message });
});

/* =========================
 * DÉMARRAGE
 * ========================= */
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================');
  console.log('✅ ComptaClems backend démarré');
  console.log(`   Environnement  : ${NODE_ENV}`);
  console.log(`   URL API        : http://localhost:${PORT}/api/health`);
  console.log(`   Dossier public : ${PUBLIC_DIR}`);
  console.log('====================================');

  restorePendingJobs().catch(err =>
    console.error('[SCHEDULER] Erreur restauration au démarrage:', err.message)
  );

  // Démarrer les rappels automatiques d'échéances fiscales
  startReminderCron();
});