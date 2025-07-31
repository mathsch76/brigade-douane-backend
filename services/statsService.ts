/**
 * 📊 STATS SERVICE - VERSION CORRIGÉE (DATES)
 * Gestion des statistiques avec gestion correcte des dates
 */

const { supabase } = require('../utils/supabase');
import logger from '../utils/logger';

// 🕐 UTILITAIRES DE DATES FIABLES
class DateUtils {
  /**
   * Obtenir la date/heure actuelle en UTC
   */
  static now(): string {
    return new Date().toISOString();
  }

  /**
   * Obtenir le début d'une période (ex: 30 jours)
   */
  static daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  /**
   * Obtenir le début du mois actuel
   */
  static startOfCurrentMonth(): string {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }

  /**
   * Filtrer seulement les données réelles (pas futures)
   */
  static filterRealData<T extends { timestamp: string }>(data: T[]): T[] {
    const now = new Date();
    return data.filter(item => new Date(item.timestamp) <= now);
  }

  /**
   * Formater date pour affichage (timezone locale)
   */
  static formatForDisplay(isoString: string): string {
    return new Date(isoString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// 💰 CALCULS DE COÛTS (GPT-4 Pricing Juin 2025)
class CostCalculator {
  private static readonly INPUT_COST_PER_1M = 2.5;   // $2.50 per 1M input tokens
  private static readonly OUTPUT_COST_PER_1M = 10;   // $10.00 per 1M output tokens
  private static readonly EUR_RATE = 0.92;           // Approximatif EUR/USD

  static calculateCost(inputTokens: number, outputTokens: number): {
    usd: number;
    eur: number;
  } {
    const inputCost = (inputTokens * this.INPUT_COST_PER_1M) / 1000000;
    const outputCost = (outputTokens * this.OUTPUT_COST_PER_1M) / 1000000;
    const totalUsd = inputCost + outputCost;
    
    return {
      usd: parseFloat(totalUsd.toFixed(4)),
      eur: parseFloat((totalUsd * this.EUR_RATE).toFixed(4))
    };
  }
}

/**
 * 📊 STATS DÉTAILLÉES UTILISATEUR (DATES CORRIGÉES)
 */
export async function getUserDetailedStats(userId: string): Promise<any> {
  try {
    logger.debug('📊 Calcul stats utilisateur', { userId });

    // ✅ REQUÊTE AVEC FILTRE TEMPOREL STRICT
    const { data: rawUsage, error } = await supabase
      .from('openai_token_usage')
      .select(`
        bot_id,
        total_tokens,
        input_tokens,
        output_tokens,
        timestamp
      `)
      .eq('user_id', userId)
      .lte('timestamp', DateUtils.now()) // ← CRUCIAL : Pas de données futures !
      .order('timestamp', { ascending: false });

    if (error) {
      logger.error("❌ Erreur récupération stats utilisateur", { userId, error: error.message });
      throw new Error(error.message);
    }

    // ✅ DOUBLE FILTRAGE CÔTÉ APPLICATION
    const usageData = DateUtils.filterRealData(rawUsage);
    
    logger.debug('📊 Données filtrées', { 
      userId, 
      totalRaw: rawUsage.length, 
      totalFiltered: usageData.length 
    });

    // Calculs globaux
    const totalTokens = usageData.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
    const totalInputTokens = usageData.reduce((sum, record) => sum + (record.input_tokens || 0), 0);
    const totalOutputTokens = usageData.reduce((sum, record) => sum + (record.output_tokens || 0), 0);
    
    // Coûts
    const costs = CostCalculator.calculateCost(totalInputTokens, totalOutputTokens);

    // Stats par bot
    const botStats = usageData.reduce((acc, record) => {
      const botId = record.bot_id;
      if (!acc[botId]) {
        acc[botId] = {
          bot_name: botId,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          request_count: 0
        };
      }
      
      acc[botId].total_tokens += record.total_tokens || 0;
      acc[botId].input_tokens += record.input_tokens || 0;
      acc[botId].output_tokens += record.output_tokens || 0;
      acc[botId].request_count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    // Ajouter coûts par bot
    Object.values(botStats).forEach((bot: any) => {
      const botCosts = CostCalculator.calculateCost(bot.input_tokens, bot.output_tokens);
      bot.estimated_cost_usd = botCosts.usd;
      bot.estimated_cost_eur = botCosts.eur;
    });

    // Stats période (30 derniers jours)
    const thirtyDaysAgo = DateUtils.daysAgo(30);
    const recentUsage = usageData.filter(record => 
      record.timestamp >= thirtyDaysAgo
    );
    const recentTokens = recentUsage.reduce((sum, record) => sum + (record.total_tokens || 0), 0);

    // ✅ DERNIÈRE ACTIVITÉ RÉELLE
    const lastActivity = usageData.length > 0 ? usageData[0].timestamp : null;

    logger.info("✅ Stats utilisateur calculées", { 
      userId, 
      totalTokens, 
      totalRequests: usageData.length,
      lastActivity: lastActivity ? DateUtils.formatForDisplay(lastActivity) : 'Aucune',
      uniqueBots: Object.keys(botStats).length,
      totalCost: costs.usd 
    });

    return {
      user_stats: {
        total_tokens: totalTokens,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_requests: usageData.length,
        estimated_cost_usd: costs.usd,
        estimated_cost_eur: costs.eur,
        last_30_days_tokens: recentTokens,
        unique_bots_used: Object.keys(botStats).length,
        last_activity: lastActivity ? DateUtils.formatForDisplay(lastActivity) : null,
        last_activity_raw: lastActivity
      },
      bot_breakdown: Object.values(botStats),
      period_info: {
        data_from: usageData.length > 0 ? DateUtils.formatForDisplay(usageData[usageData.length - 1].timestamp) : null,
        data_to: lastActivity ? DateUtils.formatForDisplay(lastActivity) : null,
        timezone: 'UTC/Local'
      }
    };

  } catch (err: any) {
    logger.error("❌ Erreur serveur stats utilisateur", { 
      userId, 
      error: (err as Error).message 
    });
    throw err;
  }
}

/**
 * 🏢 STATS ENTREPRISE (DATES CORRIGÉES)
 */
export async function getCompanyDetailedStats(companyId: string): Promise<any> {
  try {
    logger.debug('🏢 Calcul stats entreprise', { companyId });

    // Récupérer toutes les données entreprise (FILTRÉES)
    const { data: rawCompanyUsage, error } = await supabase
      .from('openai_token_usage')
      .select(`
        user_id,
        bot_id,
        total_tokens,
        input_tokens,
        output_tokens,
        timestamp
      `)
      .eq('company_id', companyId)
      .lte('timestamp', DateUtils.now()) // ← FILTRE TEMPOREL
      .order('timestamp', { ascending: false });

    if (error) {
      logger.error("❌ Erreur récupération stats entreprise", { companyId, error: error.message });
      throw new Error(error.message);
    }

    // Double filtrage
    const companyUsage = DateUtils.filterRealData(rawCompanyUsage);

    // Calculs similaires mais pour l'entreprise
    const totalTokens = companyUsage.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
    const totalInputTokens = companyUsage.reduce((sum, record) => sum + (record.input_tokens || 0), 0);
    const totalOutputTokens = companyUsage.reduce((sum, record) => sum + (record.output_tokens || 0), 0);
    const costs = CostCalculator.calculateCost(totalInputTokens, totalOutputTokens);

    // Stats par utilisateur
    const userStats = companyUsage.reduce((acc, record) => {
      const userId = record.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          request_count: 0
        };
      }
      
      acc[userId].total_tokens += record.total_tokens || 0;
      acc[userId].input_tokens += record.input_tokens || 0;
      acc[userId].output_tokens += record.output_tokens || 0;
      acc[userId].request_count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    // Ajouter coûts par utilisateur
    Object.values(userStats).forEach((user: any) => {
      const userCosts = CostCalculator.calculateCost(user.input_tokens, user.output_tokens);
      user.estimated_cost_usd = userCosts.usd;
      user.estimated_cost_eur = userCosts.eur;
    });

    // Stats par bot
    const botStats = companyUsage.reduce((acc, record) => {
      const botId = record.bot_id;
      if (!acc[botId]) {
        acc[botId] = {
          bot_name: botId,
          total_tokens: 0,
          unique_users: new Set(),
          request_count: 0
        };
      }
      
      acc[botId].total_tokens += record.total_tokens || 0;
      acc[botId].unique_users.add(record.user_id);
      acc[botId].request_count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    // Convertir Set en nombre
    Object.values(botStats).forEach((bot: any) => {
      bot.unique_users = bot.unique_users.size;
    });

    logger.info("✅ Stats entreprise calculées", { 
      companyId, 
      totalTokens, 
      totalUsers: Object.keys(userStats).length,
      totalCost: costs.usd 
    });

    return {
      company_stats: {
        total_tokens: totalTokens,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_requests: companyUsage.length,
        estimated_cost_usd: costs.usd,
        estimated_cost_eur: costs.eur,
        unique_users: Object.keys(userStats).length,
        unique_bots: Object.keys(botStats).length,
        data_period: {
          from: companyUsage.length > 0 ? DateUtils.formatForDisplay(companyUsage[companyUsage.length - 1].timestamp) : null,
          to: companyUsage.length > 0 ? DateUtils.formatForDisplay(companyUsage[0].timestamp) : null
        }
      },
      user_breakdown: Object.values(userStats),
      bot_breakdown: Object.values(botStats)
    };

  } catch (err: any) {
    logger.error("❌ Erreur stats entreprise", { 
      companyId, 
      error: (err as Error).message 
    });
    throw err;
  }
}

/**
 * 📈 ANALYTICS AVEC PÉRIODE (DATES CORRIGÉES)
 */
export async function getUserAnalytics(
  userId: string, 
  periodDays: number = 30, 
  botId?: string
): Promise<any> {
  try {
    const startDate = DateUtils.daysAgo(periodDays);
    const endDate = DateUtils.now();
    
    logger.debug('📈 Calcul analytics', { userId, periodDays, botId });

    // Requête avec filtre de période ET données réelles
    let query = supabase
      .from('openai_token_usage')
      .select(`
        bot_id,
        total_tokens,
        input_tokens,
        output_tokens,
        timestamp
      `)
      .eq('user_id', userId)
      .gte('timestamp', startDate)
      .lte('timestamp', endDate) // ← Pas de données futures
      .order('timestamp', { ascending: true });
    
    if (botId) {
      query = query.eq('bot_id', botId);
    }
    
    const { data: rawUsageData, error } = await query;
    
    if (error) {
      throw new Error(error.message);
    }

    // Triple filtrage (paranoia)
    const usageData = DateUtils.filterRealData(rawUsageData);

    // Analytics temporelles (par jour)
    const dailyStats = usageData.reduce((acc, record) => {
      const date = record.timestamp.split('T')[0]; // YYYY-MM-DD
      
      if (!acc[date]) {
        acc[date] = {
          date,
          total_tokens: 0,
          requests: 0,
          bots_used: new Set()
        };
      }
      
      acc[date].total_tokens += record.total_tokens || 0;
      acc[date].requests += 1;
      acc[date].bots_used.add(record.bot_id);
      
      return acc;
    }, {} as Record<string, any>);

    // Convertir Set en array et compter
    Object.values(dailyStats).forEach((day: any) => {
      day.bots_used = Array.from(day.bots_used);
      day.unique_bots = day.bots_used.length;
    });

    // Statistiques globales
    const totalTokens = usageData.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
    const totalDays = Object.keys(dailyStats).length;
    const avgTokensPerDay = totalDays > 0 ? Math.round(totalTokens / totalDays) : 0;

    // Pic d'utilisation
    const peakDay = Object.values(dailyStats).reduce((max: any, day: any) => 
      day.total_tokens > max.total_tokens ? day : max, 
      { total_tokens: 0, date: null }
    );

    logger.info("✅ Analytics calculées", { 
      userId, 
      period: periodDays, 
      totalTokens, 
      avgPerDay: avgTokensPerDay,
      peakDay: peakDay.date
    });

    return {
      period_stats: {
        period_days: periodDays,
        actual_days_with_data: totalDays,
        total_tokens: totalTokens,
        total_requests: usageData.length,
        avg_tokens_per_day: avgTokensPerDay,
        peak_usage_day: peakDay.date ? {
          date: peakDay.date,
          tokens: peakDay.total_tokens,
          requests: peakDay.requests
        } : null,
        period_range: {
          from: DateUtils.formatForDisplay(startDate),
          to: DateUtils.formatForDisplay(endDate)
        }
      },
      daily_breakdown: Object.values(dailyStats).sort((a: any, b: any) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      bot_filter: botId || null
    };

  } catch (err: any) {
    logger.error("❌ Erreur analytics", { 
      userId, 
      error: (err as Error).message 
    });
    throw err;
  }
}

/**
 * 🔍 DEBUG TOKEN DATA (DATES CORRIGÉES)
 */
export async function getDebugTokenData(userId: string): Promise<any> {
  try {
    const now = DateUtils.now();
    
    // Données brutes (avec futures potentielles)
    const { data: rawData, error } = await supabase
      .from('openai_token_usage')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message);
    }

    // Séparer données réelles vs futures
    const realData = rawData.filter(item => new Date(item.timestamp) <= new Date(now));
    const futureData = rawData.filter(item => new Date(item.timestamp) > new Date(now));

    // Compter total
    const { count, error: countError } = await supabase
      .from('openai_token_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    logger.info("🔍 Debug tokens", { 
      userId, 
      totalRecords: count, 
      realRecords: realData.length,
      futureRecords: futureData.length 
    });

    return {
      debug_info: {
        user_id: userId,
        total_records_in_db: count,
        real_data_count: realData.length,
        future_data_count: futureData.length,
        current_time: DateUtils.formatForDisplay(now),
        sample_real_records: realData.slice(0, 5),
        sample_future_records: futureData.slice(0, 5),
        table_structure: rawData[0] ? Object.keys(rawData[0]) : [],
        timezone_info: {
          server_time: now,
          server_formatted: DateUtils.formatForDisplay(now)
        }
      },
      recommendations: futureData.length > 0 ? [
        "⚠️ Données futures détectées - vérifier la logique d'insertion",
        "🔧 Exécuter le script de nettoyage si nécessaire",
        "⏰ Vérifier la configuration timezone du serveur"
      ] : [
        "✅ Aucune donnée future détectée",
        "✅ Timestamps cohérents"
      ]
    };

  } catch (err: any) {
    logger.error("❌ Erreur debug tokens", { 
      userId, 
      error: (err as Error).message 
    });
    throw err;
  }
}
