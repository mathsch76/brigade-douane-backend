// auth-backend/routes/admin/dashboard.ts
// Routes pour le dashboard administrateur et statistiques

import express from 'express';
import { legacyAuthGuard, AuthenticatedRequest } from '../../middlewares/authguard';
import logger from '../../utils/logger';
const { supabase } = require('../../utils/supabase');

const router = express.Router();

// Middleware admin pour ce module
const adminGuard = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Accès refusé. Seuls les admins peuvent accéder à cette ressource." });
  }
  next();
};

/**
 * 📊 GET /admin/dashboard/company-stats
 * Statistiques globales des entreprises avec quotas
 */
router.get("/company-stats", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    logger.info("📊 [ADMIN] Récupération stats entreprises dashboard", { 
      adminId: req.user?.id 
    });

    // Récupération depuis la vue matérialisée
    const { data: companies, error: companiesError } = await supabase
      .from('admin_company_stats')
      .select('*')
      .order('tokens_used_month', { ascending: false });

    if (companiesError) {
      logger.error("❌ [ADMIN] Erreur récupération company stats", { 
        error: companiesError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur récupération statistiques entreprises' 
      });
    }

    // Calculs globaux pour le dashboard
    const totalCompanies = companies?.length || 0;
    const totalActiveSeats = companies?.reduce((sum, company) => sum + (company.active_seats || 0), 0) || 0;
    const totalTokensUsed = companies?.reduce((sum, company) => sum + (company.tokens_used_month || 0), 0) || 0;
    const totalQuotaTokens = companies?.reduce((sum, company) => sum + (company.total_quota_tokens || 0), 0) || 0;

    const globalStats = {
      totalCompanies,
      totalActiveSeats,
      totalTokensUsed,
      totalQuotaTokens,
      utilizationRate: totalQuotaTokens > 0 ? Math.round((totalTokensUsed / totalQuotaTokens) * 100) : 0,
      avgTokensPerSeat: totalActiveSeats > 0 ? Math.round(totalTokensUsed / totalActiveSeats) : 0
    };

    logger.info("✅ [ADMIN] Stats entreprises récupérées", { 
      companiesCount: totalCompanies,
      totalTokensUsed,
      utilizationRate: globalStats.utilizationRate
    });

    return res.json({
      success: true,
      globalStats,
      companies: companies || []
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération company stats", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération des statistiques" 
    });
  }
});

/**
 * 🚨 GET /admin/dashboard/quota-alerts
 * Alertes pour les quotas dépassés ou proches de la limite
 */
router.get("/quota-alerts", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    logger.info("🚨 [ADMIN] Récupération alertes quotas", { 
      adminId: req.user?.id 
    });

    // Récupération depuis la vue des alertes
    const { data: alerts, error: alertsError } = await supabase
      .from('admin_quota_alerts')
      .select('*')
      .order('tokens_usage_percent', { ascending: false });

    if (alertsError) {
      logger.error("❌ [ADMIN] Erreur récupération alertes quotas", { 
        error: alertsError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur récupération alertes quotas' 
      });
    }

    // Séparer les alertes par type
    const exceeded = alerts?.filter(alert => alert.alert_status === 'EXCEEDED') || [];
    const warning = alerts?.filter(alert => alert.alert_status === 'WARNING') || [];

    logger.info("✅ [ADMIN] Alertes quotas récupérées", { 
      exceededCount: exceeded.length,
      warningCount: warning.length,
      totalAlerts: exceeded.length + warning.length
    });

    return res.json({
      success: true,
      data: {
        exceeded,
        warning,
        totalAlerts: exceeded.length + warning.length
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération alertes quotas", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération des alertes" 
    });
  }
});

/**
 * 🏢 GET /admin/dashboard/company/:companyId/details
 * Statistiques complètes d'une entreprise spécifique
 */
router.get("/company/:companyId/details", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;

    logger.info("🏢 [ADMIN] Récupération détails entreprise", { 
      companyId,
      adminId: req.user?.id 
    });

    // Stats générales de l'entreprise
    const { data: companyStats, error: statsError } = await supabase
      .from('admin_company_stats')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (statsError) {
      logger.error("❌ [ADMIN] Erreur récupération stats entreprise", { 
        error: statsError.message,
        companyId 
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Entreprise non trouvée' 
      });
    }

    // Utilisateurs de l'entreprise avec stats
    const { data: users, error: usersError } = await supabase
      .from('admin_user_stats')
      .select('*')
      .eq('company_id', companyId)
      .order('tokens_used_month', { ascending: false });

    if (usersError) {
      logger.error("❌ [ADMIN] Erreur récupération users entreprise", { 
        error: usersError.message,
        companyId 
      });
    }

    // Évolution mensuelle (derniers 6 mois)
    const { data: monthlyEvolution, error: monthlyError } = await supabase
      .rpc('get_company_monthly_evolution', { company_uuid: companyId });

    if (monthlyError) {
      logger.error("❌ [ADMIN] Erreur récupération évolution mensuelle", { 
        error: monthlyError.message,
        companyId 
      });
    }

    logger.info("✅ [ADMIN] Détails entreprise récupérés", { 
      companyId,
      usersCount: users?.length || 0,
      monthlyDataPoints: monthlyEvolution?.length || 0
    });

    return res.json({
      success: true,
      data: {
        company: companyStats,
        users: users || [],
        monthlyEvolution: monthlyEvolution || []
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération détails entreprise", {
      error: (err as Error).message,
      companyId: req.params.companyId,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération des détails" 
    });
  }
});

/**
 * 🔄 POST /admin/dashboard/refresh
 * Rafraîchissement manuel des vues matérialisées
 */
router.post("/refresh", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    logger.info("🔄 [ADMIN] Rafraîchissement manuel des vues", { 
      adminId: req.user?.id 
    });

    const { error: refreshError } = await supabase.rpc('refresh_admin_views');
    
    if (refreshError) {
      logger.error("❌ [ADMIN] Erreur rafraîchissement vues", { 
        error: refreshError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur lors du rafraîchissement des statistiques' 
      });
    }

    logger.info("✅ [ADMIN] Vues rafraîchies avec succès", { 
      adminId: req.user?.id,
      refreshedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Statistiques rafraîchies avec succès',
      refreshedAt: new Date().toISOString()
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception rafraîchissement", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors du rafraîchissement" 
    });
  }
});

// Ajout à insérer dans dashboard.ts après les autres routes

/**
 * 📊 GET /admin/dashboard/bot-history/:botId
 * Récupère l'historique de consommation d'un bot avec agrégation par période
 */

/**
 * 🧪 TEST - Route simplifiée pour debug
 */
router.get("/bot-history-test/:botId", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { botId } = req.params;
    
    logger.info("🧪 [TEST] Route simplifiée", { botId });
    
    return res.json({
      success: true,
      message: "Route de test OK",
      botId: botId,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    logger.error("❌ [TEST] Erreur route test", { error: (err as Error).message });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur test" 
    });
  }
});

/**
 * 📊 GET /admin/dashboard/bot-history/:botId
 * Récupère l'historique de consommation d'un bot avec agrégation par période
 */
router.get("/bot-history/:botId", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {

  try {
    const { botId } = req.params;
    const { period = '1d', start, end } = req.query;

logger.info("🔍 [DEBUG] === DÉBUT REQUÊTE ===");
logger.info("🔍 [DEBUG] Paramètres COMPLETS", { botId, period, start, end, botIdType: typeof botId });
logger.info("📊 [ADMIN] Récupération historique bot", { 
  botId, 
  period,
  adminId: req.user?.id 
});

    // 1️⃣ CALCULER LES DATES
    const endDate = end ? new Date(end as string) : new Date();
    let startDate: Date;

    switch (period) {
      case '1d':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '1w':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1m':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = start ? new Date(start as string) : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

   // 2️⃣ REQUÊTE SUPABASE AVEC DEBUG
logger.info("🔍 [DEBUG] Dates calculées DÉTAILLÉES", {
  startDate: startDate.toISOString(),
  endDate: endDate.toISOString(),
  now: new Date().toISOString(),
  period: period
});
logger.info("🔍 [DEBUG] Paramètres requête", {
  botId,
  startDate: startDate.toISOString(),
  endDate: endDate.toISOString(),
  period
});

    const { data, error } = await supabase
      .from('openai_token_usage')
      .select('input_tokens, output_tokens, timestamp')
      .eq('bot_id', botId)
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      logger.error("❌ [ADMIN] Erreur Supabase DÉTAILLÉE", { 
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        botId,
        tableName: 'openai_token_usage'
      });
      return res.status(500).json({ 
        success: false, 
        error: `Erreur Supabase: ${error.message}` 
      });
    }

logger.info("🔍 [DEBUG] Résultats Supabase COMPLETS", {
  botIdRecherche: botId,
  botIdType: typeof botId,
  dataLength: data?.length || 0,
  premierRecord: data?.[0] || null,
  dernierRecord: data?.[data?.length - 1] || null
});
logger.info("✅ [DEBUG] Requête Supabase réussie", {
  dataLength: data?.length || 0,
  sampleRecord: data?.[0] || null
});

    if (!data || data.length === 0) {
  logger.info("❌ [DEBUG] AUCUNE DONNÉE TROUVÉE DÉTAILS", {
  botId: botId,
  botIdType: typeof botId,
  period: period,
  startDate: startDate.toISOString(),
  endDate: endDate.toISOString()
});
logger.info("ℹ️ [ADMIN] Aucune donnée pour le bot", { botId, period });
      return res.json({
        success: true,
        data: {
          bot_id: botId,
          period,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          total_records: 0,
          summary: {
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            total_requests: 0,
            estimated_cost_eur: 0
          },
          aggregated_data: []
        }
      });
    }

    // 3️⃣ AGRÉGATION PAR PÉRIODE
    const aggregatedData = aggregateByPeriod(data, period as string);

    // 4️⃣ CALCULS GLOBAUX
    const totalInputTokens = data.reduce((sum, record) => sum + (record.input_tokens || 0), 0);
    const totalOutputTokens = data.reduce((sum, record) => sum + (record.output_tokens || 0), 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    
    // Tarifs GPT-4 (EUR)
    const inputCostPer1000 = 0.002 * 0.93;   // ~0.00186€
    const outputCostPer1000 = 0.008 * 0.93;  // ~0.00744€
    
    const totalCost = (totalInputTokens / 1000) * inputCostPer1000 + 
                      (totalOutputTokens / 1000) * outputCostPer1000;

    logger.info("✅ [ADMIN] Historique bot récupéré", { 
      botId,
      recordsCount: data.length,
      totalTokens,
      totalCost: totalCost.toFixed(4)
    });

    // 5️⃣ RÉPONSE STRUCTURÉE
    return res.json({
      success: true,
      data: {
        bot_id: botId,
        period,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        total_records: data.length,
        summary: {
          total_input_tokens: totalInputTokens,
          total_output_tokens: totalOutputTokens,
          total_tokens: totalTokens,
          total_requests: data.length,
          estimated_cost_eur: totalCost
        },
        aggregated_data: aggregatedData
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération historique bot", {
      error: (err as Error).message,
      botId: req.params.botId,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération de l'historique" 
    });
  }
});

/**
 * 📈 Fonction d'agrégation par période
 */
function aggregateByPeriod(data: any[], period: string) {
  const aggregated: { [key: string]: any } = {};

  data.forEach(record => {
    const date = new Date(record.timestamp);
    let key: string;

    // Définir la clé d'agrégation selon la période
    switch (period) {
      case '1d':
        // Agrégation par heure
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
        break;
      case '1w':
        // Agrégation par jour
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        break;
      case '1m':
        // Agrégation par jour
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        break;
      case '1y':
        // Agrégation par mois
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toISOString().split('T')[0]; // Par jour par défaut
    }

    if (!aggregated[key]) {
      aggregated[key] = {
        date: key,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        requests: 0,
        cost_eur: 0
      };
    }

    const inputTokens = record.input_tokens || 0;
    const outputTokens = record.output_tokens || 0;
    
    aggregated[key].input_tokens += inputTokens;
    aggregated[key].output_tokens += outputTokens;
    aggregated[key].total_tokens += inputTokens + outputTokens;
    aggregated[key].requests += 1;
    
    // Calcul du coût pour cette période
    const inputCost = (inputTokens / 1000) * 0.002 * 0.93;
    const outputCost = (outputTokens / 1000) * 0.008 * 0.93;
    aggregated[key].cost_eur += inputCost + outputCost;
  });

  // Convertir en array et trier par date
  return Object.values(aggregated).sort((a: any, b: any) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * 🤖 GET /admin/dashboard/bot-stats
 * Statistiques globales et détaillées des bots pour le dashboard admin
 * ROUTE À AJOUTER DANS dashboard.ts
 */
router.get("/bot-stats", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { period = 'all' } = req.query;
    
    logger.info("🤖 [ADMIN] Récupération stats globales bots", { 
      period,
      adminId: req.user?.id 
    });

    // 📅 Calculer la période de filtrage
    const endDate = new Date();
    let startDate: Date;
    
    switch (period) {
 case 'all':                                                
    startDate = new Date('2020-01-01T00:00:00.000Z');           
    break;                                                    
      case '1d':
      case '24h':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    // 🔍 1. STATS GLOBALES (tous bots confondus)
    const { data: globalTokenData, error: globalError } = await supabase
      .from('openai_token_usage')
      .select(`
        input_tokens,
        output_tokens,
        total_tokens,
        response_time_ms,
        timestamp,
        bot_id
      `)
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString());

    if (globalError) {
      logger.error("❌ [ADMIN] Erreur récupération stats globales", { 
        error: globalError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur récupération statistiques globales' 
      });
    }

    // 📊 Calculs globaux
    const totalRequests = globalTokenData?.length || 0;
    const totalInputTokens = globalTokenData?.reduce((sum, record) => sum + (record.input_tokens || 0), 0) || 0;
    const totalOutputTokens = globalTokenData?.reduce((sum, record) => sum + (record.output_tokens || 0), 0) || 0;
    const totalTokens = totalInputTokens + totalOutputTokens;
    
    // ⏱️ Temps de réponse global moyen (CORRIGÉ)
    const validResponseTimes = globalTokenData?.filter(record => record.response_time_ms > 0) || [];
    const averageResponseTime = validResponseTimes.length > 0 
      ? Math.round(validResponseTimes.reduce((sum, record) => sum + record.response_time_ms, 0) / validResponseTimes.length)
      : 0;

    // 💰 Coûts estimés (tarifs GPT-4o actuels)
    const INPUT_COST_PER_1M = 2.50; // USD per 1M tokens
    const OUTPUT_COST_PER_1M = 10.00; // USD per 1M tokens
    const EUR_RATE = 0.92; // USD to EUR
    
    const inputCostUSD = (totalInputTokens / 1_000_000) * INPUT_COST_PER_1M;
    const outputCostUSD = (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
    const totalCostEUR = (inputCostUSD + outputCostUSD) * EUR_RATE;

    // 📈 Requêtes par heure
    const periodHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const requestsPerHour = periodHours > 0 ? Math.round((totalRequests / periodHours) * 10) / 10 : 0;

    // 🔍 2. STATS PAR BOT avec temps de réponse
    const botStatsMap = new Map();
    
    globalTokenData?.forEach(record => {
      const botId = record.bot_id;
      if (!botStatsMap.has(botId)) {
        botStatsMap.set(botId, {
          bot_id: botId,
          bot_name: getBotDisplayName(botId),
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          requests: 0,
          response_times: [], // Pour calculer la moyenne
          cost_eur: 0,
          users: new Set(),
          companies: new Set()
        });
      }
      
      const botStats = botStatsMap.get(botId);
      botStats.input_tokens += record.input_tokens || 0;
      botStats.output_tokens += record.output_tokens || 0;
      botStats.total_tokens += record.total_tokens || 0;
      botStats.requests += 1;
      
      // Collecter les temps de réponse valides
      if (record.response_time_ms > 0) {
        botStats.response_times.push(record.response_time_ms);
      }
    });

    // 🔍 3. Enrichir avec les utilisateurs/entreprises par bot
    const { data: userCompanyData, error: userError } = await supabase
      .from('openai_token_usage')
      .select('bot_id, user_id, company_id')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString());

    if (!userError && userCompanyData) {
      userCompanyData.forEach(record => {
        if (botStatsMap.has(record.bot_id)) {
          const botStats = botStatsMap.get(record.bot_id);
          if (record.user_id) botStats.users.add(record.user_id);
          if (record.company_id) botStats.companies.add(record.company_id);
        }
      });
    }

    // 📊 Finaliser les stats par bot
    const botPerformance = Array.from(botStatsMap.values())
      .map(bot => {
        // Calculer temps de réponse moyen pour ce bot
        const avgResponseTime = bot.response_times.length > 0
          ? Math.round(bot.response_times.reduce((sum: number, time: number) => sum + time, 0) / bot.response_times.length)
          : 0;

        // Calculer coût pour ce bot
        const inputCost = (bot.input_tokens / 1_000_000) * INPUT_COST_PER_1M * EUR_RATE;
        const outputCost = (bot.output_tokens / 1_000_000) * OUTPUT_COST_PER_1M * EUR_RATE;
        
        return {
          bot_id: bot.bot_id,
          bot_name: bot.bot_name,
          input_tokens: bot.input_tokens,
          output_tokens: bot.output_tokens,
          total_tokens: bot.total_tokens,
          requests: bot.requests,
          cost_eur: Math.round((inputCost + outputCost) * 10000) / 10000,
          users_count: bot.users.size,
          companies_count: bot.companies.size,
          average_response_time_ms: avgResponseTime // ✅ NOUVEAU
        };
      })
      .sort((a, b) => b.total_tokens - a.total_tokens); // Tri par usage décroissant

    // 🎯 Réponse finale structurée
    const response = {
      success: true,
      data: {
        // Métriques globales pour les cartes du dashboard
        global_metrics: {
          total_bots: botPerformance.length,
          active_bots: botPerformance.filter(bot => bot.requests > 0).length,
          total_tokens: totalTokens,
          total_cost_eur: Math.round(totalCostEUR * 10000) / 10000,
          average_uptime: 99.5, // Statique pour l'instant
          
          // Métriques temps réel GLOBALES (CORRIGÉ)
          realtime_metrics: {
            average_response_time_ms: averageResponseTime, // ✅ MOYENNE GLOBALE
            total_requests: totalRequests,
            requests_per_hour: requestsPerHour,
            estimated_cost_eur: Math.round(totalCostEUR * 10000) / 10000
          }
        },
        
        // Stats détaillées par bot pour le tableau
        bot_performance: botPerformance,
        
        // Métadonnées
        meta: {
          period: period,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          fetched_at: new Date().toISOString()
        }
      }
    };

    logger.info("✅ [ADMIN] Stats bots récupérées avec succès", { 
      totalBots: botPerformance.length,
      totalRequests,
      avgResponseTime: averageResponseTime,
      totalCost: totalCostEUR.toFixed(4)
    });

    return res.json(response);

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération stats bots", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération des statistiques bots" 
    });
  }
});

/**
 * 🏷️ Helper function pour obtenir des noms d'affichage des bots
 */
function getBotDisplayName(botId: string): string {
  const botNames: Record<string, string> = {
    'EMEBI ET TVA UE': 'EMEBI ET TVA UE',
    'MACF': 'MACF',
    'CODE DES DOUANES UE': 'CODE DES DOUANES UE', 
    'USA': 'USA',
    'EUDR': 'EUDR',
    'gpt-4': 'GPT-4',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4o': 'GPT-4o'
  };
  
  return botNames[botId] || botId;
}

export default router;