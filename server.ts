// server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import compression from 'compression';
import authRoutes from './routes/auth';
import assistantRoutes from './routes/assistant';
import userRoutes from './routes/user';
import companiesRoutes from './routes/companies';
import { loginRateLimiter, assistantRateLimiter } from './middlewares/rateLimiter';
import { loginRateLimiterRedis, assistantRateLimiterRedis, generalRateLimiter } from './middlewares/rateLimiterRedis';
import { errorHandler } from './middlewares/errorHandler';
import logger from './utils/logger';
import config from './utils/config';
import { scheduleMonthlyReset } from './utils/scheduler';
import contactRoutes from './routes/contact';

// ✨ MISE À JOUR : Import du nouveau router admin modulaire
import adminRoutes from './routes/admin/index';

console.log("🔍 authRoutes importé:", !!authRoutes);
console.log("🔍 assistantRoutes importé:", !!assistantRoutes);
console.log("🔍 userRoutes importé:", !!userRoutes);
console.log("🔍 adminRoutes modulaire importé:", !!adminRoutes);

console.log("=== DÉMARRAGE DU SERVEUR (DÉBOGAGE) ===");
console.log("Logger configuré:", !!logger);
console.log("Config chargée:", !!config);

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('⚠️ Unhandled Rejection:', { reason });
  process.exit(1);
});

logger.info(`🚀 Démarrage du serveur en mode ${config.nodeEnv}`);

const app = express();

app.use(compression());

app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: config.session.cookie
}));

app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet({
  contentSecurityPolicy: config.isProd ? undefined : false,
  crossOriginEmbedderPolicy: config.isProd,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: config.isProd ? {
    maxAge: 15552000,
    includeSubDomains: true,
    preload: true
  } : false,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Rate limiters Redis (production) avec fallback mémoire (développement)
const useRedis = config.isProd && process.env.REDIS_URL;

if (useRedis) {
  logger.info('🔴 Rate limiting Redis activé (production)');
  app.use(generalRateLimiter); // Rate limiter général
  app.use('/auth/login', loginRateLimiterRedis);
  app.use('/assistant/ask', assistantRateLimiterRedis);
  app.use('/api/auth/login', loginRateLimiterRedis);
  app.use('/api/assistant/ask', assistantRateLimiterRedis);
} else {
  logger.info('🟡 Rate limiting mémoire activé (développement)');
  app.use('/auth/login', loginRateLimiter);
  app.use('/assistant/ask', assistantRateLimiter);
  app.use('/api/auth/login', loginRateLimiter);
  app.use('/api/assistant/ask', assistantRateLimiter);
}

// Routes (les deux versions)
app.use('/auth', authRoutes);
app.use('/assistant', assistantRoutes);
app.use('/user', userRoutes);
app.use('/companies', companiesRoutes);
// ✨ MISE À JOUR : Utilisation du nouveau router admin modulaire
app.use('/admin', adminRoutes);
app.use('/contact', contactRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/user', userRoutes);
app.use('/api/companies', companiesRoutes);
// ✨ MISE À JOUR : Utilisation du nouveau router admin modulaire (version API)
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes); 

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv,
    // ✨ AJOUT : Info sur la version admin modulaire
    features: {
      admin_modular: true,
      admin_dashboard: true,
      admin_quotas: true,
      admin_exports: true
    }
  });
});

app.get('/', (req, res) => {
  res.send('✅ API Auth-Backend opérationnelle avec admin modulaire.');
});

// ✨ AJOUT : Route pour lister les endpoints admin disponibles
app.get('/admin', (req, res) => {
  res.json({
    message: 'Admin API modulaire disponible',
    endpoints: {
      dashboard: [
        'GET /admin/dashboard/company-stats',
        'GET /admin/dashboard/quota-alerts', 
        'GET /admin/dashboard/company/:id/details',
        'POST /admin/dashboard/refresh'
      ],
      quotas: [
        'PUT /admin/quotas/update',
        'GET /admin/quotas/list',
        'GET /admin/quotas/license/:id'
      ],
      exports: [
        'GET /admin/export/companies?format=csv',
        'GET /admin/export/users?format=csv',
        'GET /admin/export/alerts?format=csv',
        'GET /admin/export/licenses?format=csv',
        'GET /admin/export/usage?format=csv',
        'GET /admin/export/stats/summary',
        'GET /admin/export/types'
      ]
    },
    version: '2.0-modular',
    last_updated: new Date().toISOString()
  });
});

app.use('*', (req, res) => {
  logger.warn(`Route non trouvée: ${req.originalUrl}`);
  res.status(404).json({
    error: "Route non trouvée",
    message: "La ressource demandée n'existe pas.",
    // ✨ AJOUT : Suggestion d'endpoints admin disponibles
    suggestion: req.originalUrl.includes('/admin') 
      ? "Consultez GET /admin pour voir les endpoints disponibles"
      : "Vérifiez l'URL de votre requête"
  });
});

app.use(errorHandler);
logger.info("⏳ Configuration terminée, lancement du serveur...");

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
 redis: process.env.REDIS_URL ? true : false,
      supabase: !!supabase
    }
  });
});

const server = app.listen(config.port, () => {
  logger.info(`🚀 Auth-Backend lancé sur http://localhost:${config.port}`);
  // ✨ AJOUT : Log des nouvelles fonctionnalités
  logger.info(`📊 Admin Dashboard disponible sur /admin/dashboard/`);
  logger.info(`⚙️ Admin Quotas disponible sur /admin/quotas/`);
  logger.info(`📥 Admin Exports disponible sur /admin/export/`);

  // ⏰ Reset mensuel automatique
  scheduleMonthlyReset();
  logger.info('⏰ Reset mensuel automatique activé');
});

process.on('SIGTERM', () => {
  logger.info('Signal SIGTERM reçu, fermeture du serveur...');
  server.close(() => {
    logger.info('Serveur arrêté.');
    process.exit(0);
  });
});

export default app;