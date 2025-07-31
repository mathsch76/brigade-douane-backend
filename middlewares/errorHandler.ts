// errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Gestion des erreurs globales
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error(`❌ Erreur serveur: ${err.message}`, {
    method: req.method,
    url: req.url,
    stack: err.stack,
  });

  if (res.headersSent) {
    return next(err);
  }

  // Si l'erreur a un statut défini, utiliser ce code, sinon 500 par défaut
  const statusCode = err.status || 500;

  res.status(statusCode).json({
    error: 'Erreur interne du serveur',
    message: err.message || 'Une erreur est survenue.',
    statusCode: statusCode,
  });
}
