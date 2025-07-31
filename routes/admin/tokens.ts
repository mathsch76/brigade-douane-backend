// 📁 backend/routes/admin/tokens.ts
// 🔄 Route pour récupérer les tokens d'un utilisateur pour un bot spécifique

import { Router, Request, Response } from 'express';
// 🔧 IMPORTS SELON VOTRE STRUCTURE EXISTANTE
import { jwtAuthGuard } from '../../middlewares/assistantAuth';
import { adminGuard } from '../../middlewares/authguard';
// 🗄️ SUPABASE - Selon votre structure
const { supabase } = require('../../utils/supabase');

const router = Router();

// 🏷️ Interface pour les types de données
interface TokenData {
  bot_id: string;
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
  session_id?: string;
}

interface TokenStats {
  totalInput: number;
  totalOutput: number;
  totalRequests: number;
  dailyUsage: Record<string, {
    input: number;
    output: number;
    requests: number;
  }>;
  costs: {
    inputCostUSD: number;
    outputCostUSD: number;
    totalCostUSD: number;
    totalCostEUR: number;
  };
}

interface ChartDataPoint {
  date: string;
  input: number;
  output: number;
  total: number;
  requests: number;
}

/**
 * 🔄 GET /admin/users/:userId/tokens
 * Récupère les tokens d'un utilisateur pour un bot spécifique
 * 
 * @param userId - ID de l'utilisateur (route param)
 * @param bot_id - ID du bot (query param)
 * @param period - Période de filtrage: 1d, 7d, 30d, all (query param)
 * @returns Données tokens + statistiques + données graphiques
 */
// 🧪 TEST TEMPORAIRE - AUTH DÉSACTIVÉE
router.get('/users/:userId/tokens', /* jwtAuthGuard, adminGuard, */ async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { bot_id, period } = req.query;
    
    console.log(`🔍 [ADMIN API] Récupération tokens - User: ${userId}, Bot: ${bot_id}, Period: ${period}`);
    
    // 🛡️ Validation des paramètres
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID requis',
        code: 'MISSING_USER_ID'
      });
    }
    
    if (!bot_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Bot ID requis (paramètre bot_id)',
        code: 'MISSING_BOT_ID'
      });
    }

    // 🔍 Vérification existence utilisateur dans Supabase
    const { data: userExists, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !userExists) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // 📊 Construction requête Supabase avec les VRAIES colonnes
    let query = supabase
      .from('openai_token_usage')
      .select(`
        bot_id,
        input_tokens,
        output_tokens,
        total_tokens,
        timestamp,
        run_id,
        thread_id
      `)
      .eq('user_id', userId);

    // 🤖 Filtrage par bot spécifique
    if (bot_id && bot_id !== 'all') {
      query = query.eq('bot_id', bot_id);
    }

    // 📅 Filtrage par période
    if (period && period !== 'all') {
      let dateFilter = '';
      const now = new Date();
      
      switch (period) {
        case '1d':
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          query = query.gte('timestamp', oneDayAgo.toISOString());
          break;
        case '7d':
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          query = query.gte('timestamp', sevenDaysAgo.toISOString());
          break;
        case '30d':
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          query = query.gte('timestamp', thirtyDaysAgo.toISOString());
          break;
      }
    }

    // ⏰ Tri par date décroissante
    query = query.order('timestamp', { ascending: false });

    // 🔍 Exécution requête Supabase
    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      console.error('❌ [SUPABASE ERROR] Récupération tokens:', tokensError);
      throw tokensError;
    }

    console.log(`✅ [SUCCESS] ${tokens?.length || 0} tokens récupérés pour user ${userId}`);

    // 📈 Calcul des statistiques
    const stats: TokenStats = (tokens || []).reduce((acc, token) => {
      acc.totalInput += token.input_tokens || 0;
      acc.totalOutput += token.output_tokens || 0;
      acc.totalRequests += 1;
      
      // 📅 Tracking par jour pour les graphiques
      const date = token.timestamp.split('T')[0]; // YYYY-MM-DD
      if (!acc.dailyUsage[date]) {
        acc.dailyUsage[date] = { input: 0, output: 0, requests: 0 };
      }
      acc.dailyUsage[date].input += token.input_tokens || 0;
      acc.dailyUsage[date].output += token.output_tokens || 0;
      acc.dailyUsage[date].requests += 1;
      
      return acc;
    }, { 
      totalInput: 0, 
      totalOutput: 0, 
      totalRequests: 0,
      dailyUsage: {},
      costs: {
        inputCostUSD: 0,
        outputCostUSD: 0,
        totalCostUSD: 0,
        totalCostEUR: 0
      }
    });

    // 💰 Calcul coût estimé (tarifs actuels GPT-4o)
    const INPUT_COST_PER_1M = 2.50;  // USD per 1M input tokens
    const OUTPUT_COST_PER_1M = 10.00; // USD per 1M output tokens
    const EUR_RATE = 0.92; // Approximation USD->EUR

    const inputCostUSD = (stats.totalInput / 1_000_000) * INPUT_COST_PER_1M;
    const outputCostUSD = (stats.totalOutput / 1_000_000) * OUTPUT_COST_PER_1M;
    const totalCostUSD = inputCostUSD + outputCostUSD;
    const totalCostEUR = totalCostUSD * EUR_RATE;

    stats.costs = {
      inputCostUSD: Math.round(inputCostUSD * 10000) / 10000,
      outputCostUSD: Math.round(outputCostUSD * 10000) / 10000,
      totalCostUSD: Math.round(totalCostUSD * 10000) / 10000,
      totalCostEUR: Math.round(totalCostEUR * 10000) / 10000
    };

    // 📊 Formatage données pour graphiques frontend
    const chartData: ChartDataPoint[] = Object.entries(stats.dailyUsage)
      .sort(([a], [b]) => a.localeCompare(b)) // Tri chronologique
      .map(([date, usage]) => ({
        date,
        input: usage.input,
        output: usage.output,
        total: usage.input + usage.output,
        requests: usage.requests
      }));

    // 🎉 Réponse finale
    res.json({
      success: true,
      data: {
        tokens: tokens || [],
        stats,
        chartData,
        meta: {
          userId,
          botId: bot_id,
          period: period || 'all',
          totalRecords: tokens?.length || 0,
          fetchedAt: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ [CRITICAL ERROR] Route /admin/users/:userId/tokens:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tokens',
      code: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * 📊 GET /admin/users/:userId/tokens/summary
 * Version légère : uniquement les statistiques sans détail des tokens
 */
router.get('/users/:userId/tokens/summary', /* jwtAuthGuard, adminGuard, */ async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { bot_id } = req.query;

    // Requête Supabase pour le résumé
    let query = supabase
      .from('openai_token_usage')
      .select(`
        input_tokens,
        output_tokens,
        total_tokens,
        timestamp
      `)
      .eq('user_id', userId);

    if (bot_id && bot_id !== 'all') {
      query = query.eq('bot_id', bot_id);
    }

    const { data: tokens, error } = await query;

    if (error) {
      throw error;
    }

    // Calcul du résumé
    const summary = {
      total_requests: tokens?.length || 0,
      total_input: tokens?.reduce((sum, t) => sum + (t.input_tokens || 0), 0) || 0,
      total_output: tokens?.reduce((sum, t) => sum + (t.output_tokens || 0), 0) || 0,
      first_usage: tokens?.length ? tokens[tokens.length - 1]?.timestamp : null,
      last_usage: tokens?.length ? tokens[0]?.timestamp : null
    };

    res.json({
      success: true,
      data: {
        summary,
        meta: { userId, botId: bot_id }
      }
    });

  } catch (error) {
    console.error('❌ Erreur route summary:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

/**
 * 🤖 GET /admin/users/:userId/bots
 * Récupère la liste des bots utilisés par un utilisateur avec leurs stats
 * Utile pour alimenter UserBotStatsTable
 */
router.get('/users/:userId/bots', /* jwtAuthGuard, adminGuard, */ async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { period } = req.query;

    console.log(`🤖 [ADMIN API] Récupération bots utilisateur: ${userId}, période: ${period}`);

    // Requête Supabase pour agréger les stats par bot
    let query = supabase
      .from('openai_token_usage')
      .select(`
        bot_id,
        input_tokens,
        output_tokens,
        total_tokens,
        timestamp
      `)
      .eq('user_id', userId);

    // Filtrage par période
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
          dateFilter = new Date(0); // Pas de filtre
      }
      
      if (period !== 'all') {
        query = query.gte('timestamp', dateFilter.toISOString());
      }
    }

    const { data: tokensData, error } = await query;

    if (error) {
      throw error;
    }

    // 📊 Agrégation par bot_id (côté JavaScript)
    const botStats = new Map();
    
    tokensData?.forEach(token => {
      const botId = token.bot_id;
      if (!botStats.has(botId)) {
        botStats.set(botId, {
          bot_id: botId,
          requests_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          first_usage: token.timestamp,
          last_usage: token.timestamp
        });
      }
      
      const stats = botStats.get(botId);
      stats.requests_count += 1;
      stats.input_tokens += token.input_tokens || 0;
      stats.output_tokens += token.output_tokens || 0;
      stats.total_tokens += token.total_tokens || 0;
      
      // Mise à jour des dates
      if (token.timestamp < stats.first_usage) stats.first_usage = token.timestamp;
      if (token.timestamp > stats.last_usage) stats.last_usage = token.timestamp;
    });

    // 💰 Calcul des coûts pour chaque bot + formatage final
    const botsUsage = Array.from(botStats.values())
      .sort((a, b) => b.total_tokens - a.total_tokens) // Tri par usage décroissant
      .map(bot => {
        const inputCostUSD = (bot.input_tokens / 1_000_000) * 2.50;
        const outputCostUSD = (bot.output_tokens / 1_000_000) * 10.00;
        const totalCostEUR = (inputCostUSD + outputCostUSD) * 0.92;

        return {
          bot_id: bot.bot_id,
          bot_name: getBotDisplayName(bot.bot_id),
          stats: {
            input_tokens: bot.input_tokens,
            output_tokens: bot.output_tokens,
            total_tokens: bot.total_tokens,
            requests_count: bot.requests_count,
            estimated_cost: Math.round(totalCostEUR * 10000) / 10000
          },
          usage_period: {
            first_usage: bot.first_usage,
            last_usage: bot.last_usage
          }
        };
      });

    res.json({
      success: true,
      data: {
        botsUsage,
        meta: {
          userId,
          period: period || 'all',
          totalBots: botsUsage.length,
          fetchedAt: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur route bots:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des bots'
    });
  }
});

/**
 * 🏷️ Helper function pour obtenir un nom d'affichage lisible pour les bots
 */
function getBotDisplayName(botId: string): string {
  const botNames: Record<string, string> = {
    'gpt-4': 'GPT-4',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3-sonnet': 'Claude 3 Sonnet',
    'claude-3-haiku': 'Claude 3 Haiku',
    'gemini-pro': 'Gemini Pro',
    'mistral-large': 'Mistral Large'
  };
  
  return botNames[botId] || botId;
}

export default router;