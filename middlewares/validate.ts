// auth-backend/middlewares/validate.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import logger from '../utils/logger';

/**
 * Middleware pour valider les données entrantes selon un schéma Zod
 * @param schema Schéma Zod à utiliser pour la validation
 * @param source Source des données à valider (body, query, params)
 */
export const validate = (schema: AnyZodObject, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Valider les données selon le schéma
      await schema.parseAsync(req[source]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('❌ Validation des données échouée', {
          path: req.path,
          ip: req.ip,
          errors: error.errors,
        });
        
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        return res.status(400).json({
          error: 'Données invalides',
          details: formattedErrors,
        });
      }
      
      logger.error('❌ Erreur inattendue lors de la validation', {
        error: (error as Error).message,
      });
      
      return res.status(500).json({
        error: 'Erreur serveur lors de la validation des données',
      });
    }
  };
};

/**
 * Middleware pour sanitiser les données entrantes
 * Cette fonction nettoie les entrées pour prévenir les XSS et autres attaques
 */
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  // Fonction pour sanitiser une chaîne
  const sanitizeString = (str: string): string => {
    if (!str) return str;
    
    // Échapper les caractères spéciaux HTML
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  };
  
  // Fonction pour sanitiser récursivement un objet
  const sanitizeObject = (obj: any): any => {
    if (!obj) return obj;
    
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = sanitizeObject(obj[key]);
        }
      }
      return result;
    }
    
    return obj;
  };
  
  // Sanitiser les données du corps de la requête
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitiser les paramètres de la requête
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  // Sanitiser les paramètres de la requête
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};