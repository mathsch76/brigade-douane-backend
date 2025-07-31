// auth-backend/routes/user/admin.ts - AVEC ROUTE TOKENS AJOUTÉE
const { supabase } = require('../../utils/supabase');
import { validate, sanitize } from '../../middlewares/validate';
import { userIdParamSchema, revokeLicenseSchema, tokensQuerySchema, analyticsQuerySchema } from '../../schemas/admin.schema';
import express from "express";
import { legacyAuthGuard, AuthenticatedRequest } from "../../middlewares/authguard";
import logger from "../../utils/logger";
import { getUserUsageStats, enrichBotsWithNames, getLicenseCount } from "./helpers/userHelpers";

const router = express.Router();

// ✅ GET /user - Liste de tous les utilisateurs avec licences (pour les admins)
router.get("/", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    // Vérifier le rôle admin
    if (req.user?.role !== 'admin') {
      logger.warn("❌ Accès refusé - rôle non admin:", req.user?.role);
      return res.status(403).json({ error: "Accès refusé. Seuls les admins peuvent voir la liste des utilisateurs." });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, nickname, job_title, role, company");

    if (error) {
      logger.error("❌ Erreur lors de la récupération des utilisateurs", { 
        error: error.message 
      });
      return res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs." });
    }

    const usersWithLicenses = await Promise.all(
      data.map(async (user) => {
        const licenseCount = await getLicenseCount(user.id);
        return { ...user, licenses_count: licenseCount };
      })
    );

    logger.info("✅ Liste des utilisateurs récupérée", { count: usersWithLicenses.length });
    res.json({ users: usersWithLicenses });
  } catch (err) {
    logger.error("❌ Erreur interne lors de la récupération des utilisateurs", { 
      error: (err as Error).message 
    });
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🆕 GET /user/:userId/details - Récupération détaillée avec VRAIES STATS D'USAGE
router.get("/:userId/details", legacyAuthGuard, validate(userIdParamSchema, 'params'), async (req: AuthenticatedRequest, res) => {

  try {
    logger.info(`🔍 Récupération détails utilisateur ID: ${req.params.userId}`);
    
    // Vérifier le rôle admin
    if (req.user?.role !== 'admin') {
      logger.warn("❌ Accès refusé - rôle non admin:", req.user?.role);
      return res.status(403).json({ error: "Accès refusé. Seuls les admins peuvent voir les détails des utilisateurs." });
    }

    const { userId } = req.params;
    
    // 1️⃣ Récupérer les infos de base de l'utilisateur
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, nickname, job_title, role, company, created_at, first_login")
      .eq("id", userId)
      .single();
    
    if (userError) {
      logger.error(`❌ Erreur lors de la récupération de l'utilisateur: ${userError.message}`);
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }
    
    // 2️⃣ Récupérer les licences de l'utilisateur avec les noms des bots
    const { data: userLicenses, error: licensesError } = await supabase
      .from("user_licenses")
      .select(`
        id, 
        assigned_at, 
        license_id,
        requests_used,
        licenses (
          id,
          start_date,
          end_date,
          status,
          max_requests_per_month,
          bots (
            id,
            name,
            description
          )
        )
      `)
      .eq("user_id", userId);
    
    if (licensesError) {
      logger.error(`❌ Erreur lors de la récupération des licences: ${licensesError.message}`);
      // Continuer même si les licences échouent
    }

    // 3️⃣ 🆕 RÉCUPÉRER LES VRAIES STATS D'USAGE DEPUIS openai_token_usage
    logger.info(`📊 Récupération des stats d'usage pour ${userId}`);
    const usageStats = await getUserUsageStats(userId);
    
    // 4️⃣ 🆕 ENRICHIR LES DONNÉES BOT AVEC LES NOMS
    const enrichedBots = await enrichBotsWithNames(usageStats.bot_breakdown);

    // 5️⃣ Calculer les stats des licences
    const licenseStats = {
      total: userLicenses?.length || 0,
      active: userLicenses?.filter(l => l.licenses?.status === 'active').length || 0,
      expired: userLicenses?.filter(l => l.licenses?.status === 'expired').length || 0,
      revoked: userLicenses?.filter(l => l.licenses?.status === 'revoked').length || 0
    };

    // 🎯 NOUVELLE STRUCTURE DE RÉPONSE AVEC VRAIES STATS
    const response = {
      success: true,
      user: {
        // Infos utilisateur de base
        ...user,
        
        // Licences assignées
        licenses: userLicenses || [],
        license_stats: licenseStats,
        
        // 🆕 VRAIES STATS D'USAGE depuis openai_token_usage
        usage_stats: {
          total_tokens: usageStats.total_tokens,
          input_tokens: usageStats.input_tokens,
          output_tokens: usageStats.output_tokens,
          total_requests: usageStats.total_requests,
          estimated_cost_eur: usageStats.estimated_cost_eur,
          unique_bots_used: usageStats.unique_bots_used,
          last_activity: usageStats.last_activity
        },

        // 🤖 BOTS UTILISÉS AVEC STATS DÉTAILLÉES
        bots_usage: enrichedBots.map(bot => ({
          bot_id: bot.bot_id,
          bot_name: bot.bot_name,
          bot_description: bot.bot_description,
          stats: {
            total_tokens: bot.total_tokens,
            input_tokens: bot.input_tokens,
            output_tokens: bot.output_tokens,
            requests_count: bot.requests_count,
            estimated_cost: bot.estimated_cost,
            last_used: bot.last_used,
            utilization_percent: Math.min(Math.round((bot.total_tokens / 10000) * 100), 100) // Estimation
          },
          status: 'active' // Déterminé par la présence d'usage
        }))
      }
    };

    logger.info(`✅ Détails utilisateur récupérés avec stats d'usage`, {
      userId,
      totalTokens: usageStats.total_tokens,
      totalRequests: usageStats.total_requests,
      estimatedCost: usageStats.estimated_cost_eur,
      botsCount: enrichedBots.length
    });

    return res.status(200).json(response);
    
  } catch (error) {
    logger.error("❌ Erreur générale lors de la récupération des détails:", error);
    return res.status(500).json({ error: "Erreur serveur interne." });
  }
});

// 🎯 NOUVELLE ROUTE : GET /user/:userId/tokens - Récupérer les tokens d'un utilisateur
router.get("/:userId/tokens", legacyAuthGuard, validate(userIdParamSchema, 'params'), validate(tokensQuerySchema, 'query'), async (req: AuthenticatedRequest, res) => {

  try {
    const { userId } = req.params;
    const { bot_id } = req.query;
    
    // Vérifier le rôle admin
    if (req.user?.role !== 'admin') {
      logger.warn("❌ Accès refusé - rôle non admin:", req.user?.role);
      return res.status(403).json({ error: "Accès refusé." });
    }
    
    if (!userId) {
      return res.status(400).json({ error: "userId requis" });
    }

    console.log(`🔍 Récupération tokens pour userId: ${userId}, bot_id: ${bot_id}`);

    // 🎯 Query de base pour récupérer les tokens
    let query = supabase
      .from("openai_token_usage")
      .select(`
        bot_id,
        input_tokens,
        output_tokens,
        timestamp,
        model,
        cost_eur
      `)
      .eq("user_id", userId)
      .order("timestamp", { ascending: true });

    // 🎯 Filtrer par bot si spécifié
    if (bot_id && bot_id !== 'all') {
      query = query.eq("bot_id", bot_id as string);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Erreur récupération tokens:", error);
      return res.status(500).json({ 
        error: "Erreur récupération tokens",
        details: error.message 
      });
    }

    // 🎯 Transformer les données pour le frontend
    const tokens = data?.map(token => ({
      bot_id: token.bot_id,
      input_tokens: token.input_tokens || 0,
      output_tokens: token.output_tokens || 0,
      timestamp: token.timestamp, // Format ISO standard
      model: token.model || 'gpt-4',
      cost_eur: token.cost_eur || 0
    })) || [];

    console.log(`✅ Tokens trouvés: ${tokens.length} entrées`);

    return res.json({
      success: true,
      tokens: tokens,
      count: tokens.length,
      user_id: userId,
      bot_id: bot_id || 'all'
    });

  } catch (error) {
    console.error("❌ Erreur route tokens:", error);
    return res.status(500).json({ 
      error: "Erreur serveur",
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// ✅ PATCH /user/:userId/revoke-license - Révoquer une licence spécifique
router.patch("/:userId/revoke-license", legacyAuthGuard, sanitize, validate(userIdParamSchema, 'params'), validate(revokeLicenseSchema), async (req: AuthenticatedRequest, res) => {

  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Accès refusé." });
    }

    const { userId } = req.params;
    const { licenseId } = req.body;

    if (!licenseId) {
      return res.status(400).json({ error: "ID de licence requis." });
    }

    // Vérifier que la licence appartient bien à cet utilisateur
    const { data: userLicense, error: checkError } = await supabase
      .from("user_licenses")
      .select("id, license_id")
      .eq("user_id", userId)
      .eq("license_id", licenseId)
      .single();

    if (checkError || !userLicense) {
      return res.status(404).json({ error: "Licence non trouvée pour cet utilisateur." });
    }

    // Révoquer la licence
    const { error: revokeError } = await supabase
      .from("licenses")
      .update({ 
        status: 'revoked',
        end_date: new Date().toISOString() // Termine la licence maintenant
      })
      .eq("id", licenseId);

    if (revokeError) {
      logger.error("❌ Erreur lors de la révocation de la licence", {
        error: revokeError.message,
        licenseId,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la révocation de la licence." });
    }

    logger.info("✅ Licence révoquée avec succès", { 
      licenseId,
      userId,
      adminId: req.user?.id
    });

    return res.json({
      success: true,
      message: "Licence révoquée avec succès"
    });

  } catch (err) {
    logger.error("❌ Erreur lors de la révocation de licence", {
      error: (err as Error).message,
      userId: req.params.userId
    });
    return res.status(500).json({ error: "Erreur serveur lors de la révocation." });
  }
});

// 🆕 GET /user/:userId/usage-analytics - Analytics détaillées d'usage (bonus)
router.get("/:userId/usage-analytics", legacyAuthGuard, validate(userIdParamSchema, 'params'), validate(analyticsQuerySchema, 'query'), async (req: AuthenticatedRequest, res) => {

  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Accès refusé." });
    }

    const { userId } = req.params;
    const { period = '30' } = req.query; // Période en jours

    logger.info(`📈 Récupération analytics usage pour ${userId} sur ${period} jours`);

    // Récupérer les données avec filtre temporel
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(period as string));

    const { data: usageData, error } = await supabase
      .from("openai_token_usage")
      .select("input_tokens, output_tokens, bot_id, timestamp")
      .eq("user_id", userId)
      .gte("timestamp", dateFrom.toISOString())
      .order("timestamp", { ascending: true });

    if (error) {
      logger.error("❌ Erreur récupération analytics:", error.message);
      return res.status(500).json({ error: "Erreur lors de la récupération des analytics." });
    }

    // Traitement des données pour analytics
    const dailyUsage = usageData?.reduce((acc: any, entry) => {
      const date = entry.timestamp.split('T')[0]; // Format YYYY-MM-DD
      if (!acc[date]) {
        acc[date] = { tokens: 0, requests: 0, cost: 0 };
      }
      acc[date].tokens += (entry.input_tokens || 0) + (entry.output_tokens || 0);
      acc[date].requests += 1;
      acc[date].cost += ((entry.input_tokens || 0) * 0.03 + (entry.output_tokens || 0) * 0.06) / 1000;
      return acc;
    }, {});

    const analytics = {
      period_days: parseInt(period as string),
      total_entries: usageData?.length || 0,
      daily_breakdown: dailyUsage || {},
      summary: {
        total_tokens: usageData?.reduce((sum, entry) => sum + (entry.input_tokens || 0) + (entry.output_tokens || 0), 0) || 0,
        total_requests: usageData?.length || 0,
        total_cost: usageData?.reduce((sum, entry) => sum + ((entry.input_tokens || 0) * 0.03 + (entry.output_tokens || 0) * 0.06) / 1000, 0) || 0
      }
    };

    logger.info(`✅ Analytics générées pour ${userId}:`, analytics.summary);
    return res.json({ success: true, analytics });

  } catch (err) {
    logger.error("❌ Erreur génération analytics:", (err as Error).message);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;