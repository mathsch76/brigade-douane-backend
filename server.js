"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts
var express_1 = require("express");
var cors_1 = require("cors");
var helmet_1 = require("helmet");
var express_session_1 = require("express-session");
var compression_1 = require("compression"); // À installer si pas déjà fait
var auth_1 = require("./routes/auth");
var assistant_1 = require("./routes/assistant");
var user_1 = require("./routes/user");
var rateLimiter_1 = require("./middlewares/rateLimiter");
var errorHandler_1 = require("./middlewares/errorHandler");
var logger_1 = require("./utils/logger");
var config_1 = require("./utils/config");
// Au début du fichier, après les imports
console.log("=== DÉMARRAGE DU SERVEUR (DÉBOGAGE) ===");
console.log("Logger configuré:", !!logger_1.default);
console.log("Config chargée:", !!config_1.default);
// Ajout des gestionnaires d'erreurs non capturées
process.on('uncaughtException', function (error) {
    logger_1.default.error('⚠️ Uncaught Exception:', { error: error.message, stack: error.stack });
    process.exit(1);
});
process.on('unhandledRejection', function (reason, promise) {
    logger_1.default.error('⚠️ Unhandled Rejection:', { reason: reason });
    process.exit(1);
});
logger_1.default.info("\uD83D\uDE80 D\u00E9marrage du serveur en mode ".concat(config_1.default.nodeEnv));
// L'appel à dotenv.config() n'est plus nécessaire ici car il est déjà fait dans config.ts
// La vérification des variables d'environnement est également faite dans config.ts
var app = (0, express_1.default)();
// Compression des réponses pour améliorer les performances
app.use((0, compression_1.default)());
// 💾 Configuration des sessions avec les paramètres sécurisés
app.use((0, express_session_1.default)({
    secret: config_1.default.session.secret,
    resave: false,
    saveUninitialized: false, // Plus sécurisé que true
    cookie: config_1.default.session.cookie
}));
// 🔧 Configuration CORS sécurisée
app.use((0, cors_1.default)({
    origin: config_1.default.cors.origin,
    credentials: config_1.default.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Configuration avancée de helmet pour la sécurité
app.use((0, helmet_1.default)({
    contentSecurityPolicy: config_1.default.isProd ? undefined : false, // Activer CSP en production
    crossOriginEmbedderPolicy: config_1.default.isProd, // Activer en production
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: config_1.default.isProd ? {
        maxAge: 15552000, // 180 jours
        includeSubDomains: true,
        preload: true
    } : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
}));
// Limitation de la taille des requêtes pour prévenir les attaques DoS
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// 🔎 Logging amélioré avec plus d'informations
app.use(function (req, res, next) {
    logger_1.default.info("[".concat(req.method, "] ").concat(req.url), {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});
// 🛡️ Rate limiting
app.use('/auth/login', rateLimiter_1.loginRateLimiter);
app.use('/assistant/ask', rateLimiter_1.assistantRateLimiter);
// 📦 Routes
app.use('/auth', auth_1.default);
app.use('/assistant', assistant_1.default);
app.use('/user', user_1.default);
// 🧪 Health check amélioré
app.get('/health', function (req, res) {
    res.status(200).json({
        status: 'ok',
        time: new Date().toISOString(),
        env: config_1.default.nodeEnv
    });
});
// Route pour la compatibilité
app.get('/', function (req, res) {
    res.send('✅ API Auth-Backend opérationnelle.');
});
// Route pour gérer les 404
app.use('*', function (req, res) {
    logger_1.default.warn("Route non trouv\u00E9e: ".concat(req.originalUrl));
    res.status(404).json({
        error: "Route non trouvée",
        message: "La ressource demandée n'existe pas."
    });
});
// 🔥 Global error handler
app.use(errorHandler_1.errorHandler);
logger_1.default.info("⏳ Configuration terminée, lancement du serveur...");
// Stocke le serveur dans une variable pour pouvoir y faire référence
var server = app.listen(config_1.default.port, function () {
    logger_1.default.info("\uD83D\uDE80 Auth-Backend lanc\u00E9 sur http://localhost:".concat(config_1.default.port));
});
// Gestion gracieuse de l'arrêt
process.on('SIGTERM', function () {
    logger_1.default.info('Signal SIGTERM reçu, fermeture du serveur...');
    server.close(function () {
        logger_1.default.info('Serveur arrêté.');
        process.exit(0);
    });
});
exports.default = app;
