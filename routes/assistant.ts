/**
 * 🤖 ROUTES ASSISTANT - VERSION PROPRE
 * Routes principales pour les assistants IA (après refactoring)
 */

const { supabase } = require('../utils/supabase');
import express from 'express';
import logger from '../utils/logger';
import { validate, sanitize } from '../middlewares/validate';
import { askSchema, botsQuerySchema } from '../schemas/assistant.schema';
import { legacyAuthGuard } from '../middlewares/authguard';

// 🚀 IMPORT DES SERVICES MODULAIRES
import { 
  processAssistantQuestion,
  getAvailableBots 
} from '../services/assistantService';

import { 
  jwtAuthGuard,
  enterpriseLicenseGuard,
  usageLoggingMiddleware 
} from '../middlewares/assistantAuth';

import {
  getUserDetailedStats,
  getCompanyDetailedStats,
  getUserAnalytics,
  getDebugTokenData
} from '../services/statsService';

const router = express.Router();

// 🤖 ROUTE PRINCIPALE - INTERACTION AVEC ASSISTANT
router.post("/ask", 
  // Auth JWT + Licences + Logging
  jwtAuthGuard,
 // enterpriseLicenseGuard,
  usageLoggingMiddleware,
  
  // Validation des données
  sanitize,
  validate(askSchema, 'body'),
  
  // Handler principal
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { question, chatbot_id, preferences } = req.body;
      const user = req.user!; // Garanti par jwtAuthGuard
      
      logger.debug('🤖 Nouvelle requête assistant', {
        userId: user.id,
        chatbotId: chatbot_id,
        hasPreferences: !!preferences,
        questionLength: question?.length
      });
      
      // Validation
      if (!question || !chatbot_id) {
        return res.status(400).json({ 
          error: "Question et chatbot_id requis" 
        });
      }

      // ✅ TRAITEMENT VIA SERVICE MODULAIRE
      const result = await processAssistantQuestion(
        user.id,
        chatbot_id,
        question,
        preferences // Préférences frontend en priorité
      );

      const processingTime = Date.now() - startTime;
      logger.info('✅ Requête assistant traitée', {
        userId: user.id,
        chatbotId: chatbot_id,
        tokens: result.tokens_used,
        processingTime: `${processingTime}ms`
      });

      return res.json({
        answer: result.answer,
        tokens_used: result.tokens_used,
        preferences_applied: result.preferences_applied
      });
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('❌ Erreur requête assistant', {
        userId: req.user?.id,
        error: (error as Error).message,
        processingTime: `${processingTime}ms`
      });
      
      return res.status(500).json({ 
        error: "Erreur serveur Assistant",
        details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

// 🤖 ROUTE BOTS UTILISATEUR (avec licences actives)
router.get("/user-bots", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      const userId = req.user?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
      }

      console.log('🔍 Récupération bots utilisateur:', userId);

      // Récupérer les bots avec licences actives pour cet utilisateur
if (req.user?.role === 'admin') {
  const { data: allBots, error } = await supabase
    .from('bots')
    .select('id, name, description');
  
  const botNames = allBots?.map(bot => bot.name) || [];
  return res.json({ bots: botNames, user_bots: botNames });
} else {
  // Logique normale pour users
  const { data: userBots, error } = await supabase
    .from('user_bot_access')
    .select(`...`)
    .eq('user_id', userId)
    .eq('status', 'active');
}

      if (error) {
        logger.error("❌ Erreur récupération bots utilisateur", { 
          error: error.message, 
          userId 
        });
        return res.status(500).json({ 
          error: "Erreur lors de la récupération des bots." 
        });
      }

    // Transformer les données
const botNames = userBots?.map((access: any) => 
  access.licenses.bots.name
) || [];

console.log('✅ Bots utilisateur récupérés:', botNames);

// Retourner dans le format attendu par le frontend
return res.json({ 
  bots: botNames,
  user_bots: botNames  // Format cohérent
});
      
    } catch (err) {
      logger.error("❌ Erreur route /user-bots", { 
        error: (err as Error).message,
        userId: req.user?.sub || req.user?.id
      });
      return res.status(500).json({ error: "Erreur serveur." });
    }
  }
);

// 🤖 ROUTE LISTE DES BOTS
router.get("/bots", 
  legacyAuthGuard, 
  sanitize, 
  validate(botsQuerySchema, 'query'), 
  async (req, res) => {
    try {
      const { data: bots, error } = await supabase
        .from("bots")
        .select("name");

      if (error) {
        logger.error("❌ Erreur récupération bots", { error: error.message });
        return res.status(500).json({ 
          error: "Erreur lors de la récupération des bots." 
        });
      }

      const botNames = bots.map((bot: any) => bot.name);
      const availableBots = getAvailableBots(); // Bots avec assistant configuré
      
      logger.info("✅ Liste des bots récupérée", { 
        total: botNames.length,
        configured: availableBots.length 
      });
      
      return res.json({ 
        bots: botNames,
        configured_bots: availableBots
      });
      
    } catch (err) {
      logger.error("❌ Erreur route /bots", { error: (err as Error).message });
      return res.status(500).json({ error: "Erreur serveur." });
    }
  }
);

// 📊 ROUTES DE STATISTIQUES

/**
 * Stats détaillées utilisateur
 */
router.get("/usage-stats/:userId", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = req.user!;
      
      // Vérification sécurité : utilisateur peut voir ses stats OU admin
      if (user.id !== userId && user.role !== 'admin') {
        return res.status(403).json({ 
          error: "Accès non autorisé à ces statistiques" 
        });
      }
      
      const stats = await getUserDetailedStats(userId);
      return res.json(stats);
      
    } catch (error) {
      logger.error("❌ Erreur stats utilisateur", { 
        userId: req.params.userId, 
        error: (error as Error).message 
      });
      return res.status(500).json({ 
        error: (error as Error).message 
      });
    }
  }
);

/**
 * Stats entreprise détaillées
 */
router.get("/company-stats/:companyId", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      const { companyId } = req.params;
      const user = req.user!;
      
      // Vérification sécurité : appartenance entreprise OU admin
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (userError || (userData.company_id !== companyId && user.role !== 'admin')) {
        return res.status(403).json({ 
          error: "Accès non autorisé à ces statistiques" 
        });
      }
      
      const stats = await getCompanyDetailedStats(companyId);
      return res.json(stats);
      
    } catch (error) {
      logger.error("❌ Erreur stats entreprise", { 
        companyId: req.params.companyId, 
        error: (error as Error).message 
      });
      return res.status(500).json({ 
        error: (error as Error).message 
      });
    }
  }
);

/**
 * Analytics avancées avec période
 */
router.get("/analytics/:userId", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { period = '30', bot_id } = req.query;
      const user = req.user!;
      
      // Vérification sécurité
      if (user.id !== userId && user.role !== 'admin') {
        return res.status(403).json({ 
          error: "Accès non autorisé à ces analytics" 
        });
      }
      
      const analytics = await getUserAnalytics(
        userId, 
        parseInt(period as string), 
        bot_id as string | undefined
      );
      
      return res.json(analytics);
      
    } catch (error) {
      logger.error("❌ Erreur analytics", { 
        userId: req.params.userId, 
        error: (error as Error).message 
      });
      return res.status(500).json({ 
        error: (error as Error).message 
      });
    }
  }
);

/**
 * Debug tokens (développement)
 */
router.get("/debug-tokens/:userId", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      // Restriction : seulement en développement ou pour les admins
      const user = req.user!;
      if (process.env.NODE_ENV !== 'development' && user.role !== 'admin') {
        return res.status(403).json({ 
          error: "Route de debug non disponible en production" 
        });
      }
      
      const { userId } = req.params;
      const debugData = await getDebugTokenData(userId);
      
      return res.json(debugData);
      
    } catch (error) {
      logger.error("❌ Erreur debug tokens", { 
        userId: req.params.userId, 
        error: (error as Error).message 
      });
      return res.status(500).json({ 
        error: (error as Error).message 
      });
    }
  }
);

// 🧪 ROUTE DE TEST SANCTIONS RUSSES
router.get("/test-sanctions", 
  legacyAuthGuard, 
  async (req, res) => {
    try {
      // Import de la fonction de test
      const { testSanctionsAssistant } = await import('../services/assistantService');
      
      await testSanctionsAssistant();
      res.json({ 
        status: 'success', 
        message: 'Test réussi - voir logs console' 
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        message: (error as Error).message 
      });
    }
  }
);

// 🔍 ROUTE DE SANTÉ
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "assistant",
    timestamp: new Date().toISOString(),
    version: "2.0.0-modular"
  });
});

export default router;