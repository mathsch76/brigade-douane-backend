const { supabase } = require('../utils/supabase');
// auth-backend/middlewares/licenseControl.ts
// 🎯 MIDDLEWARE SIMPLIFIÉ - UTILISE req.user.license DE authguard
import { Request, Response, NextFunction } from 'express';

import logger from '../utils/logger';
import config from '../utils/config';
import { AuthenticatedRequest } from './authguard'; // Import du type



/**
 * 🛡️ Middleware simplifié : Vérifier l'accès au chatbot
 * Usage : app.use('/assistant/ask', checkBotLicense);
 */
export const checkBotLicense = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('🔍 LICENSE CONTROL - Début vérification');
    
    // 1. Récupérer les infos utilisateur (enrichies par authguard)
    const user = req.user;
    const { chatbot_id } = req.body;

    if (!user) {
      console.log('❌ Pas d\'utilisateur dans req.user');
      return res.status(401).json({ 
        error: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!chatbot_id) {
      console.log('❌ chatbot_id manquant');
      return res.status(400).json({ 
        error: 'Nom du bot requis',
        code: 'BOT_NAME_REQUIRED'
      });
    }

    console.log('🔍 Infos utilisateur:', {
      id: user.id,
      email: user.email,
      role: user.role,
      hasLicense: !!user.license,
      chatbot_id
    });

    // 2. 👑 BYPASS ADMIN - Les admins ont accès à tout
    if (user.role === 'admin') {
      console.log('👑 ADMIN DÉTECTÉ - Accès autorisé sans vérification licence');
      logger.info('👑 Admin accès autorisé', { 
        userId: user.id, 
        email: user.email, 
        chatbot_id 
      });
      
      // Attacher des infos fictives pour éviter les erreurs
      (req as any).userLicense = {
        id: 'admin-unlimited',
        requests_used: 0,
        max_requests: 999999
      };
      
      return next();
    }

    // 3. 🎫 VÉRIFICATION LICENCE POUR LES USERS
    console.log('🎫 Vérification licence user...');
    
    if (!user.license) {
      console.log('❌ Aucune licence trouvée pour le user');
      logger.warn('❌ User sans licence active', { 
        userId: user.id, 
        email: user.email, 
        chatbot_id 
      });
      return res.status(403).json({
        error: 'Licence requise',
        message: 'Vous n\'avez pas de licence active. Contactez votre administrateur.',
        code: 'NO_ACTIVE_LICENSE'
      });
    }

    const license = user.license;
    console.log('🎫 Licence trouvée:', {
      licenseId: license.license_id,
      isActive: license.license?.is_active,
      requestsUsed: license.requests_used,
      maxRequests: license.license?.max_requests
    });

    // 4. Vérifier que la licence est active
    if (!license.license?.is_active) {
      console.log('❌ Licence inactive');
      logger.warn('❌ Licence inactive', { 
        userId: user.id, 
        licenseId: license.license_id 
      });
      return res.status(403).json({
        error: 'Licence inactive',
        message: 'Votre licence est inactive. Contactez votre administrateur.',
        code: 'INACTIVE_LICENSE'
      });
    }

    // 5. 🤖 VÉRIFIER L'ACCÈS AU BOT SPÉCIFIQUE
    // Maintenant on vérifie si l'user a accès à ce bot précis
    console.log('🤖 Vérification accès bot spécifique...');
    
    const { data: botAccess, error: botError } = await supabase
      .from('user_bots')
      .select(`
        id,
        bots!inner (
          id,
          name
        )
      `)
      .eq('user_id', user.id)
      .eq('bots.name', chatbot_id)
      .limit(1);

    if (botError) {
      console.log('❌ Erreur vérification accès bot:', botError);
      logger.error('❌ Erreur vérification accès bot', { 
        error: botError.message,
        userId: user.id,
        chatbot_id
      });
      return res.status(500).json({
        error: 'Erreur de vérification',
        message: 'Impossible de vérifier l\'accès au bot.',
        code: 'BOT_ACCESS_CHECK_ERROR'
      });
    }

    if (!botAccess || botAccess.length === 0) {
      console.log('❌ Pas d\'accès au bot spécifique');
      logger.warn('❌ User sans accès au bot', { 
        userId: user.id, 
        chatbot_id 
      });
      return res.status(403).json({
        error: 'Accès bot refusé',
        message: `Vous n'avez pas accès au bot ${chatbot_id}. Contactez votre administrateur.`,
        code: 'BOT_ACCESS_DENIED'
      });
    }

    console.log('✅ Accès bot autorisé');

    // 6. Vérifier les quotas
    const requestsUsed = license.requests_used || 0;
    const maxRequests = license.license?.max_requests || 1000;

    console.log('📊 Vérification quotas:', { requestsUsed, maxRequests });

    if (maxRequests > 0 && requestsUsed >= maxRequests) {
      console.log('❌ Quota dépassé');
      logger.warn('❌ Quota dépassé', {
        userId: user.id,
        chatbot_id,
        requestsUsed, 
        maxRequests 
      });
      return res.status(429).json({
        error: 'Quota dépassé',
        message: `Quota mensuel atteint (${requestsUsed}/${maxRequests}). Contactez votre administrateur.`,
        code: 'QUOTA_EXCEEDED',
        usage: {
          used: requestsUsed,
          max: maxRequests,
          remaining: 0
        }
      });
    }

    // 7. ✅ TOUT EST BON !
    console.log('✅ Toutes les vérifications passées');
    
    // Attacher les infos pour l'incrémentation ultérieure
    (req as any).userLicense = {
      id: license.id,
      requests_used: requestsUsed,
      max_requests: maxRequests
    };

    logger.info(`✅ Accès autorisé pour ${chatbot_id}`, {
      userId: user.id,
      email: user.email,
      chatbot_id,
      usage: `${requestsUsed}/${maxRequests}`
    });

    next();

  } catch (err) {
    console.log('❌ Exception dans checkBotLicense:', (err as Error).message);
    logger.error('❌ Exception dans checkBotLicense', {
      error: (err as Error).message,
      stack: (err as Error).stack,
      userId: req.user?.id
    });
    return res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur inattendue s\'est produite.',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * 📊 Middleware pour incrémenter le compteur après un appel réussi
 * Usage : Utiliser APRÈS le middleware principal ET la route d'assistant
 */
export const incrementUsage = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Sauvegarder la méthode json originale
  const originalJson = res.json;

  // Intercepter la réponse pour détecter le succès
  res.json = function(body: any) {
    // Si la réponse est un succès ET qu'on a les infos de licence
    if (res.statusCode >= 200 && res.statusCode < 300 && (req as any).userLicense) {
      
      const userLicense = (req as any).userLicense;
      
      // ✅ NE PAS INCRÉMENTER POUR LES ADMINS
      if (userLicense.id === 'admin-unlimited') {
        console.log('🔓 Admin : pas d\'incrémentation d\'usage');
        return originalJson.call(this, body);
      }
      
      // Incrémenter en arrière-plan pour les utilisateurs normaux
      console.log('📈 Incrémentation usage en cours...');
      supabase
        .from('user_licenses')
        .update({ 
          requests_used: userLicense.requests_used + 1 
        })
        .eq('id', userLicense.id)
        .then(({ error }) => {
          if (error) {
            logger.error('❌ Erreur incrémentation usage', { 
              error: error.message,
              userLicenseId: userLicense.id
            });
          } else {
            console.log('✅ Usage incrémenté avec succès');
            logger.info('✅ Usage incrémenté', { 
              userLicenseId: userLicense.id,
              newCount: userLicense.requests_used + 1
            });
          }
        })
        .catch(err => {
          logger.error('❌ Exception incrémentation usage', { 
            error: err.message 
          });
        });
    }

    // Appeler la méthode json originale
    return originalJson.call(this, body);
  };

  next();
};

/**
 * 🔍 Fonction utilitaire : Récupérer les bots accessibles d'un utilisateur
 * Usage : Pour afficher seulement les bots autorisés dans le frontend
 */
export const getUserAccessibleBots = async (userId: string): Promise<any[]> => {
  try {
    const { data: userBots, error } = await supabase
      .from('user_bots')
      .select(`
        id,
        created_at,
        bots (
          id,
          name,
          description
        )
      `)
      .eq('user_id', userId);

    if (error) {
      logger.error('❌ Erreur récupération bots accessibles', { 
        error: error.message,
        userId
      });
      return [];
    }

    // Transformer les données pour le frontend
    const accessibleBots = (userBots || []).map(ub => {
      const bot = ub.bots;
      return {
        id: bot.id,
        name: bot.name,
        description: bot.description,
        enabled: true,
        granted_at: ub.created_at
      };
    });

    logger.info(`✅ ${accessibleBots.length} bots accessibles récupérés`, { userId });
    return accessibleBots;

  } catch (err) {
    logger.error('❌ Exception récupération bots accessibles', {
      error: (err as Error).message,
      userId
    });
    return [];
  }
};