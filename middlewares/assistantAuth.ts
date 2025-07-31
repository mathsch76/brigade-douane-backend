/**
 * 🔐 MIDDLEWARE D'AUTHENTIFICATION ASSISTANT - VERSION CORRIGÉE
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken'; // ✅ AJOUT IMPORT JWT
const { supabase } = require('../utils/supabase');
import logger from '../utils/logger';
import config from '../utils/config'; // ✅ AJOUT IMPORT CONFIG
import { getCompanyLicenses } from '../services/licenseService';

// 🎯 TYPES POUR L'AUTH
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  sub?: string;
  license?: UserLicense;
}

export interface UserLicense {
  id: string;
  license_id: string;
  requests_used: number;
  max_requests: number;
  license?: {
    is_active: boolean;
    max_requests: number;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userLicense?: UserLicense;
    }
  }
}

// 🔧 UTILITAIRES D'AUTH

/**
 * ✅ CORRECTION - Décode et valide un token JWT SÉCURISÉ
 */
function decodeJWTToken(token: string): AuthenticatedUser | null {
  try {
    // ✅ VÉRIFICATION SÉCURISÉE avec la clé secrète
    const payload = jwt.verify(token, config.jwt.secret) as any;
    
    if (!payload.id || !payload.email || !payload.role) {
      logger.warn('❌ Token JWT invalide - Payload incomplet', payload);
      return null;
    }

    logger.debug('✅ JWT décodé avec succès', { 
      userId: payload.id, 
      email: payload.email, 
      role: payload.role 
    });

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role
    };
  } catch (err) {
    logger.error('❌ Erreur décodage JWT sécurisé', { 
      error: (err as Error).message 
    });
    return null;
  }
}

// 🛡️ MIDDLEWARES D'AUTHENTIFICATION

/**
 * Middleware d'authentification JWT basique - VERSION CORRIGÉE
 */
export function jwtAuthGuard(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    logger.warn('❌ Token manquant', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      path: req.path 
    });
    res.status(401).json({ error: 'Token manquant' });
    return;
  }
  
  const user = decodeJWTToken(token);
  if (!user) {
    logger.warn('❌ Token invalide ou expiré', { 
      ip: req.ip,
      path: req.path 
    });
    res.status(401).json({ error: 'Token invalide ou expiré' });
    return;
  }
  
  req.user = user;
  logger.debug('✅ Auth JWT sécurisé OK', { 
    userId: user.id, 
    email: user.email, 
    role: user.role 
  });
  next();
}

/**
 * Middleware de vérification des licences entreprise
 */
export async function enterpriseLicenseGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!; // Garanti par jwtAuthGuard
    const { chatbot_id } = req.body;
    
    logger.debug(`🎫 Vérification licence entreprise`, { 
      userId: user.id, 
      role: user.role, 
      botId: chatbot_id 
    });
    
    // BYPASS TOTAL POUR LES ADMINS
    if (user.role === 'admin') {
      logger.info('🔓 Admin détecté - Accès illimité accordé');
      req.userLicense = {
        id: 'admin-unlimited',
        license_id: 'admin-unlimited',
        requests_used: 0,
        max_requests: -1
      };
      return next();
    }
    
    // Vérification entreprise utilisateur
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single();

    console.log('🔍 DEBUG - chatbot_id reçu:', chatbot_id);
    console.log('🔍 DEBUG - user.id:', user.id);
    console.log('🔍 DEBUG - userData:', userData);

    if (userError || !userData?.company_id) {
      logger.warn('❌ Utilisateur sans entreprise', { userId: user.id });
      res.status(403).json({
        error: 'Entreprise requise',
        message: 'Vous devez être associé à une entreprise. Contactez votre administrateur.',
        code: 'NO_COMPANY'
      });
      return;
    }

    // Vérification licences entreprise
    const companyLicenses = await getCompanyLicenses(userData.company_id);
    const hasLicenseForBot = companyLicenses.some(license => 
      license.bot_name === chatbot_id && license.is_valid
    );

    if (!hasLicenseForBot) {
      logger.warn(`❌ Licence entreprise manquante`, { 
        companyId: userData.company_id, 
        botId: chatbot_id 
      });
      res.status(403).json({
        error: 'Licence entreprise requise',
        message: `Votre entreprise n'a pas de licence active pour le bot ${chatbot_id}. Contactez votre administrateur.`,
        code: 'NO_COMPANY_LICENSE'
      });
      return;
    }

    // Vérification accès utilisateur au bot
    const { data: botData, error: botError } = await supabase
      .from('bots')
      .select('id')
      .eq('name', chatbot_id)
      .single();

    console.log('🔍 DEBUG - Recherche bot name:', chatbot_id);
    console.log('🔍 DEBUG - botData trouvé:', botData);
    console.log('🔍 DEBUG - botError:', botError);

    if (botError || !botData) {
      logger.warn(`❌ Bot non trouvé`, { botId: chatbot_id });
      res.status(404).json({
        error: 'Bot non trouvé',
        code: 'BOT_NOT_FOUND'
      });
      return;
    }

    // Vérifier accès spécifique au bot demandé
    const { data: userBotAccess, error: accessError } = await supabase
      .from('user_bot_access')
      .select(`
        id,
        licenses!inner(
          bot_id,
          bots!inner(name)
        )
      `)
      .eq('user_id', user.id)
      .eq('licenses.bots.name', chatbot_id)
      .eq('status', 'active')
      .single();

    if (accessError || !userBotAccess) {
      logger.warn(`❌ Accès bot refusé`, { 
        userId: user.id, 
        botId: chatbot_id 
      });
      res.status(403).json({
        error: 'Accès bot refusé',
        message: `Vous n'avez pas accès au bot ${chatbot_id}. Contactez votre administrateur.`,
        code: 'USER_BOT_ACCESS_DENIED'
      });
      return;
    }

    // Licence validée - Stocker les infos
    const activeLicense = companyLicenses.find(l => l.bot_name === chatbot_id);
    req.userLicense = {
      id: activeLicense?.id || 'company-license',
      license_id: activeLicense?.id || 'company-license',
      requests_used: 0,
      max_requests: activeLicense?.max_requests_per_month || 1000
    };

    logger.info(`✅ Licence entreprise validée`, { 
      userId: user.id, 
      companyId: userData.company_id,
      botId: chatbot_id
    });
    
    next();

  } catch (err) {
    logger.error('❌ Erreur middleware licence entreprise', { 
      error: (err as Error).message 
    });
    res.status(500).json({
      error: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
}

/**
 * Middleware de logging d'usage (optionnel)
 */
export function usageLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  
  res.json = function(body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.userLicense) {
      const license = req.userLicense;
      
      if (license.id === 'admin-unlimited') {
        logger.debug('🔓 Usage admin - Pas de décompte');
      } else {
        logger.info('📊 Usage autorisé - Licence entreprise', {
          userId: req.user?.id,
          licenseId: license.id,
          maxRequests: license.max_requests
        });
      }
    }
    
    return originalJson.call(this, body);
  };
  
  next();
}

// Reste du fichier inchangé...
export function fullAssistantAuth(req: Request, res: Response, next: NextFunction): void {
  jwtAuthGuard(req, res, (err1) => {
    if (err1) return;
    
    enterpriseLicenseGuard(req, res, (err2) => {
      if (err2) return;
      
      usageLoggingMiddleware(req, res, next);
    });
  });
}

export async function checkUserBotAccess(userId: string, botName: string): Promise<boolean> {
  try {
    const { data: botData, error: botError } = await supabase
      .from('bots')
      .select('id')
      .eq('name', botName)
      .single();

    if (botError || !botData) return false;

    const { data: access, error: accessError } = await supabase
      .from('user_bots')
      .select('id')
      .eq('user_id', userId)
      .eq('bot_id', botData.id)
      .single();

    return !accessError && !!access;
  } catch (err) {
    logger.error('❌ Erreur vérification accès bot', { 
      userId, 
      botName, 
      error: (err as Error).message 
    });
    return false;
  }
}

export async function getUserAccessibleBots(userId: string): Promise<string[]> {
  try {
    const { data: userBots, error } = await supabase
      .from('user_bots')
      .select(`
        bot_id,
        bots!inner(name)
      `)
      .eq('user_id', userId);

    if (error || !userBots) {
      logger.warn('❌ Erreur récupération bots utilisateur', { userId, error: error?.message });
      return [];
    }

    return userBots.map((ub: any) => ub.bots.name);
  } catch (err) {
    logger.error('❌ Erreur getUserAccessibleBots', { 
      userId, 
      error: (err as Error).message 
    });
    return [];
  }
}

export function getAuthStats(): {
  middleware: string;
  version: string;
} {
  return {
    middleware: 'assistantAuth',
    version: '1.0.0'
  };
}