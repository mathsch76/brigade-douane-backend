// rateLimiter.ts
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

// Limiteur pour les tentatives de connexion
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite de 100 requêtes
  message: (req, res) => {
    const retryAfter = res.getHeaders()['retry-after'];
    return `🚫 Trop de tentatives de connexion. Réessayez dans ${retryAfter} secondes.`;
  },
  handler: (req, res, next, options) => {
    logger.warn(`🚫 Tentative de connexion excessive depuis IP: ${req.ip}`);
    res.status(options.statusCode).send(options.message(req, res));
  },
  standardHeaders: true, // Retourne les informations de rate limit dans les en-têtes
  legacyHeaders: false, // Désactive les anciens en-têtes X-RateLimit
});

// Limiteur pour l'assistant IA
export const assistantRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limite de 10 requêtes
  message: (req, res) => {
    const retryAfter = res.getHeaders()['retry-after'];
    return `🚫 Trop de requêtes vers l'assistant. Réessayez dans ${retryAfter} secondes.`;
  },
  handler: (req, res, next, options) => {
    logger.warn(`🚫 Usage excessif de l'assistant depuis IP: ${req.ip}`);
    res.status(options.statusCode).send(options.message(req, res));
  },
  standardHeaders: true, // Retourne les informations de rate limit dans les en-têtes
  legacyHeaders: false, // Désactive les anciens en-têtes X-RateLimit
});
