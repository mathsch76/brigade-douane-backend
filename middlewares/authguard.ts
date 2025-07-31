// auth-backend/middlewares/authguard.ts
// 🔥 VERSION CORRIGÉE - Rôle depuis DB
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import logger from '../utils/logger';
import config from '../utils/config';

// ✅ AJOUT IMPORT SUPABASE
const { supabase } = require('../utils/supabase');

// Importer l'interface depuis assistantAuth pour éviter les conflits
import { AuthenticatedUser } from './assistantAuth';

// Interface personnalisée pour le payload du JWT
interface JwtUserPayload extends JwtPayload {
  id?: string;
  email?: string;
  role?: string;
  sub?: string;
}

// Typage personnalisé pour inclure user dans Request
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Middleware de contrôle d'accès basé sur les rôles
 * @param requiredRoles Tableau des rôles autorisés pour accéder à la route
 */
export const authGuard = (requiredRoles: string[] = ['user', 'admin']) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // 🔥 DEBUG SUPER DÉTAILLÉ
      console.log('🔍 AuthGuard - Début vérification');
      console.log('   Headers complets:', JSON.stringify(req.headers, null, 2));
      console.log('   Auth header RAW:', req.headers.authorization);
      console.log('   Auth header LENGTH:', req.headers.authorization?.length);
      console.log('   Required roles:', requiredRoles);
      console.log('   JWT Secret défini:', !!config.jwt.secret);
      
      // Récupération du token depuis les headers
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        console.log('❌ Aucun header authorization');
        logger.warn('🚫 Aucun header d\'autorisation fourni', { 
          ip: req.ip, 
          path: req.path 
        });
        return res.status(401).json({ 
          error: 'Accès non autorisé', 
          message: 'Authentication requise.'
        });
      }

      // 🔥 DEBUG SPLIT
      console.log('🔍 AVANT SPLIT - authHeader:', authHeader);
      const parts = authHeader.split(' ');
      console.log('🔍 APRÈS SPLIT - parts:', parts);
      console.log('🔍 parts.length:', parts.length);
      console.log('🔍 parts[0]:', parts[0]);
      console.log('🔍 parts[1] (premières 20 chars):', parts[1]?.substring(0, 20));
      
      // Vérification du format du token
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        console.log('❌ Format token invalide:', authHeader);
        logger.warn('🚫 Format de token invalide', { 
          ip: req.ip, 
          path: req.path 
        });
        return res.status(401).json({ 
          error: 'Format de token invalide', 
          message: 'Le token doit être au format "Bearer [token]".'
        });
      }

      const token = parts[1];
      console.log('✅ Token extrait, longueur:', token.length);
      console.log('✅ Token premières chars:', token.substring(0, 50));

      // Vérification et décodage du token
      try {
        console.log('🔑 Tentative décodage JWT...');
        const decoded = jwt.verify(token, config.jwt.secret) as JwtUserPayload;
        console.log('✅ JWT décodé avec succès:', { 
          id: decoded.id, 
          email: decoded.email, 
          role: decoded.role 
        });

// 🔄 Recharge dynamique du rôle depuis Supabase
const { data: userData, error } = await supabase
  .from('users')
  .select('id, email, role, company_id')
  .eq('id', decoded.id)
  .single();

if (error || !userData) {
  return res.status(403).json({ error: 'Utilisateur introuvable ou rôle inaccessible' });
}

req.user = {
  id: userData.id,
  email: userData.email,
  role: userData.role,
  company_id: userData.company_id
};      
    console.log('✅ Utilisateur attaché à req.user avec rôle DB:', userData.role);
logger.info("🔓 Utilisateur authentifié", { 
  userId: userData.id, 
  role: userData.role,
  path: req.path
});

next();

      } catch (err) {
        console.log('❌ Erreur JWT:', (err as Error).name, (err as Error).message);
        
        if ((err as Error).name === 'TokenExpiredError') {
          logger.warn('🚫 Token expiré', { path: req.path });
          return res.status(401).json({ 
            error: 'Token expiré', 
            message: 'Veuillez vous reconnecter.'
          });
        }
        
        logger.warn('🚫 Token invalide', { 
          error: (err as Error).message,
          path: req.path
        });
        return res.status(401).json({ 
          error: 'Token invalide', 
          message: 'Authentication invalide.'
        });
      }
    } catch (err) {
      console.log('❌ Exception AuthGuard:', (err as Error).message);
      logger.error('❌ Erreur dans le middleware authGuard', { 
        error: (err as Error).message,
        stack: (err as Error).stack
      });
      return res.status(500).json({ 
        error: 'Erreur serveur', 
        message: 'Une erreur est survenue lors de l\'authentification.'
      });
    }
  };
};

export const legacyAuthGuard = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret) as JwtUserPayload;

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, email, role, company_id')
      .eq('id', decoded.id || decoded.sub)
      .single();

    if (error || !userData) {
      return res.status(403).json({ error: 'Utilisateur introuvable (legacy)' });
    }

    req.user = {
      id: userData.id,
      email: userData.email,
      role: userData.role,
      company_id: userData.company_id
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Échec vérification legacy', message: err instanceof Error ? err.message : 'Erreur inconnue' });
  }
};


// Middleware pour les routes admin uniquement
export const adminGuard = authGuard(['admin']);

// Middleware pour les routes utilisateur ou admin
export const userGuard = authGuard(['user', 'admin']);