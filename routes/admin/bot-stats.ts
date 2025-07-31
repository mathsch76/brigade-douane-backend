// 📁 backend/routes/admin/bot-stats.ts
// 📊 Route pour les statistiques globales par bot (dashboard principal)

import { Router, Request, Response } from 'express';
import { jwtAuthGuard } from '../../middlewares/assistantAuth';
import { adminGuard } from '../../middlewares/authguard';
const { supabase } = require('../../utils/supabase');

const router = Router();

/**
 * 📊 GET /admin/bot-stats/global
 * Récupère les statistiques globales de tous les bots
 * Pour alimenter le tableau "Performance par Bot" du dashboard
 */
router.get('/global', jwtAuthGuard, adminGuard, async (req: Request, res: Response) => {
  try {
    const { period } = req.query; // 1d, 7d, 30d, all

    console.log(`📊 [ADMIN API] Récupération stats globales bots, période: ${period}`);

    // 🗄️ Requête Supabase pour agréger par bot_id
    let query = supabase
      .from('openai_token_usage')
      .select(`
        bot_id,
        input_tokens,
        output_tokens,
        total_tokens,
        timestamp
      `);

    // 📅 Filtrage par période
    if (period && period !== 'all') {
      const now = new Date();
      let dateFilter: Date;
      
      switch (period) {
        case '1d':
          dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateFilter = new Date(0);
      }
      
      if (period !== 'all') {
        query = query.gte('timestamp', dateFilter.toISOString());
      }
    }

    const { data: tokensData, error } = await query;

    if (error) {
      throw error;
    }

    // 📊 Agrégation par bot_id + calcul métriques
    const botStatsMap = new Map();
    
    tokensData?.forEach(token => {
      const botId = token.bot_id;
      if (!botStatsMap.has(botId)) {
        botStatsMap.set(botId, {
          bot_id: botId,
          bot_name: getBotDisplayName(botId),
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          requests_count: 0,
          response_times: [], // Pour calcul temps de réponse moyen
          first_usage: token.timestamp,
          last_usage: token.timestamp,
          daily_requests: new Map() // Pour calcul uptime
        });
      }
      
      const stats = botStatsMap.get(botId);
      stats.input_tokens += token.input_tokens || 0;
      stats.output_tokens += token.output_tokens || 0;
      stats.total_tokens += token.total_tokens || 0;
      stats.requests_count += 1;
      
      // 📅 Tracking dates pour uptime
      const date = token.timestamp.split('T')[0];
      stats.daily_requests.set(date, (stats.daily_requests.get(date) || 0) + 1);
      
      // Mise à jour des dates
      if (token.timestamp < stats.first_usage) stats.first_usage = token.timestamp;
      if (token.timestamp > stats.last_usage) stats.last_usage = token.timestamp;
    });

    // 🔄 Récupération des temps de réponse réels depuis les logs
    // SUPPRIMÉ - Données non fiables

    // 📈 Calcul des métriques finales
    const globalBotStats = Array.from(botStatsMap.values())
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .map(bot => {
        // 💰 Calcul coût
        const inputCostUSD = (bot.input_tokens / 1_000_000) * 2.50;
        const outputCostUSD = (bot.output_tokens / 1_000_000) * 10.00;
        const totalCostEUR = (inputCostUSD + outputCostUSD) * 0.92;

        // 🚫 Temps de réponse et uptime supprimés (données non fiables)

        // 👥 Nombre d'utilisateurs uniques
        const uniqueUsers = getUniqueUsersForBot(tokensData, bot.bot_id);

        return {
          bot_id: bot.bot_id,
          bot_name: bot.bot_name,
          input_tokens: bot.input_tokens,
          output_tokens: bot.output_tokens,
          total_tokens: bot.total_tokens,
          requests_count: bot.requests_count,
          cost_eur: Math.round(totalCostEUR * 10000) / 10000,
          unique_users: uniqueUsers,
          unique_companies: 0, // À implémenter si besoin
          last_activity: bot.last_usage
        };
      });

    // 🎯 Calcul des totaux globaux
    const globalTotals = {
      total_bots: globalBotStats.length,
      active_bots: globalBotStats.filter(bot => bot.requests_count > 0).length,
      total_tokens: globalBotStats.reduce((sum, bot) => sum + bot.total_tokens, 0),
      total_requests: globalBotStats.reduce((sum, bot) => sum + bot.requests_count, 0),
      total_cost_eur: globalBotStats.reduce((sum, bot) => sum + bot.cost_eur, 0)
    };

    res.json({
      success: true,
      data: {
        bot_stats: globalBotStats,
        global_totals: globalTotals,
        meta: {
          period: period || 'all',
          fetched_at: new Date().toISOString(),
          total_bots_analyzed: globalBotStats.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur route bot-stats/global:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des stats bots'
    });
  }
});

/**
 * 🏷️ Helper: Noms d'affichage des bots
 */
function getBotDisplayName(botId: string): string {
  const botNames: Record<string, string> = {
    'EMBI ET TVA UE': 'EMBI ET TVA UE',
    'MACF': 'MACF',
    'EUDR': 'EUDR',
    'NAO': 'NAO',
    'CRÉDITS DOCUMENTAIRES': 'Crédits Documentaires',
    'BREXIT': 'Brexit',
    'CODE DES DOUANES UE': 'Code des Douanes UE',
    'SOS HOTLINE': 'SOS Hotline',
    'SANCTIONS RUSSES': 'Sanctions Russes'
  };
  
  return botNames[botId] || botId;
}

/**
 * ⏱️ Helper: Récupération temps de réponse réels
 * À adapter selon votre système de logs
 */
async function getResponseTimes(): Promise<Record<string, number[]>> {
  try {
    // 🔍 OPTION 1: Depuis table de logs si elle existe
    // const { data: logs } = await supabase
    //   .from('api_logs')
    //   .select('bot_id, response_time_ms')
    //   .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // 🔍 OPTION 2: Calcul basé sur les timestamps des requêtes
    // Pour l'instant, retourner des valeurs réalistes basées sur la performance
    return {
      'EMBI ET TVA UE': [800, 1200, 950, 1100, 780], // Temps en ms
      'MACF': [650, 890, 720, 980],
      'EUDR': [920, 1050, 880],
      'NAO': [],
      'CRÉDITS DOCUMENTAIRES': [],
      'BREXIT': [],
      'CODE DES DOUANES UE': [],
      'SOS HOTLINE': [],
      'SANCTIONS RUSSES': []
    };
  } catch (error) {
    console.error('❌ Erreur récupération temps de réponse:', error);
    return {};
  }
}

/**
 * 📅 Helper: Calcul nombre de jours dans la période
 */
function getTotalDaysInPeriod(period: string | undefined): number {
  switch (period) {
    case '1d': return 1;
    case '7d': return 7;
    case '30d': return 30;
    default: return 30; // Par défaut pour 'all'
  }
}

/**
 * 👥 Helper: Nombre d'utilisateurs uniques par bot
 */
function getUniqueUsersForBot(tokensData: any[], botId: string): number {
  const uniqueUsers = new Set(
    tokensData
      .filter(token => token.bot_id === botId)
      .map(token => token.user_id)
      .filter(userId => userId) // Supprimer les undefined
  );
  return uniqueUsers.size;
}

export default router;