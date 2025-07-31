// ===============================
// 📄 auth-backend/routes/admin/metrics.ts
// ===============================
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 📊 MÉTRIQUES TEMPS RÉEL PAR BOT
router.get('/realtime/:botId', async (req, res) => {
  try {
    console.log('📊 [METRICS API] Récupération métriques temps réel');
    
    const { botId } = req.params;
    const { timeframe = '24h' } = req.query;
    
    console.log(`🤖 Bot demandé: "${botId}"`);
    console.log(`⏰ Période: ${timeframe}`);
    
    // ⏰ CALCULER PÉRIODE
    const now = new Date();
    const timeAgo = new Date(now.getTime() - getTimeMs(timeframe as string));
    
    console.log(`📅 Période analysée: ${timeAgo.toISOString()} → ${now.toISOString()}`);
    
    // 🔍 RÉCUPÉRER MÉTRIQUES - VRAIES COLONNES SUPABASE !
    const { data: metrics, error } = await supabase
      .from('openai_token_usage')
      .select(`
        input_tokens,
        output_tokens,
        timestamp,
        user_id,
        company_id,
        bot_id,
        thread_id,
        run_id,
        total_tokens,
        response_time_ms
      `)
      .eq('bot_id', botId)
      .gte('timestamp', timeAgo.toISOString())
      .order('timestamp', { ascending: false });
    
    if (error) {
      console.error('❌ Erreur openai_token_usage:', error);
      throw error;
    }
    
    console.log(`📊 Trouvé ${metrics?.length || 0} entrées openai_token_usage`);
    
    // 🔢 CALCULER STATS
    const stats = calculateBotStats(metrics || []);
    
    console.log('✅ Métriques calculées:', {
      total_queries: stats.total_queries,
      avg_response_time_ms: stats.avg_response_time_ms,
      total_tokens: stats.total_tokens
    });
    
    res.json({
      success: true,
      data: stats,
      meta: {
        bot_id: botId,
        timeframe,
        raw_count: metrics?.length || 0,
        period: {
          start: timeAgo.toISOString(),
          end: now.toISOString()
        }
      }
    });
    
  } catch (error: any) {
    console.error('❌ Erreur métriques DÉTAILLÉE:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération des métriques',
      details: error.message
    });
  }
});

// 🌍 MÉTRIQUES GLOBALES
router.get('/global', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const now = new Date();
    const timeAgo = new Date(now.getTime() - getTimeMs(timeframe as string));
    
    // 📊 TOUTES LES MÉTRIQUES - VRAIES COLONNES SUPABASE !
    const { data: allMetrics, error } = await supabase
      .from('openai_token_usage')
      .select('bot_id, input_tokens, output_tokens, timestamp, user_id, company_id')
      .gte('timestamp', timeAgo.toISOString());
    
    if (error) throw error;
    
    // 🤖 GROUPER PAR BOT
    const byBot = groupByBot(allMetrics || []);
    const globalStats = calculateBotStats(allMetrics || []);
    
    res.json({
      success: true,
      global: globalStats,
      by_bot: byBot,
      timeframe,
      total_records: allMetrics?.length || 0
    });
    
  } catch (error: any) {
    console.error('❌ Erreur métriques globales:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 📈 HISTORIQUE PAR BOT
router.get('/history/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { days = '7' } = req.query;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));
    
    // VRAIES COLONNES SUPABASE !
    const { data: history, error } = await supabase
      .from('openai_token_usage')
      .select('*')
      .eq('bot_id', botId)
      .gte('timestamp', daysAgo.toISOString())
      .order('timestamp', { ascending: true });
    
    if (error) throw error;
    
    // 📅 GROUPER PAR JOUR
    const dailyStats = groupByDay(history || []);
    
    res.json({
      success: true,
      data: dailyStats,
      bot_id: botId,
      period_days: days
    });
    
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🛠️ FONCTIONS UTILITAIRES
function getTimeMs(timeframe: string): number {
  const units: { [key: string]: number } = {
    '1h': 1 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  return units[timeframe] || units['24h'];
}

function calculateBotStats(metrics: any[]) {
  if (!metrics.length) {
    return {
      total_queries: 0,
      avg_response_time_ms: 0,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_eur: 0,
      queries_per_hour: 0,
      last_activity: null,
      unique_users: 0,
      unique_companies: 0
    };
  }
  
  const total = metrics.length;
  const totalInputTokens = metrics.reduce((sum, m) => sum + (m.input_tokens || 0), 0);
  const totalOutputTokens = metrics.reduce((sum, m) => sum + (m.output_tokens || 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  
  // 👥 UTILISATEURS ET ENTREPRISES UNIQUES (vraies données Supabase!)
  const uniqueUsers = new Set(metrics.map(m => m.user_id).filter(Boolean)).size;
  const uniqueCompanies = new Set(metrics.map(m => m.company_id).filter(Boolean)).size;
  
  // ⚡ VRAIS TEMPS DE RÉPONSE ! (colonne response_time_ms existe)
  const validResponseTimes = metrics
    .filter(m => m.response_time_ms && m.response_time_ms > 0)
    .map(m => m.response_time_ms);
  
  const avgResponseTime = validResponseTimes.length > 0 
    ? Math.round(validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length)
    : 0;
  
  console.log(`⚡ Temps de réponse calculé: ${avgResponseTime}ms (${validResponseTimes.length} mesures valides sur ${metrics.length} total)`);
  console.log(`👥 Utilisateurs uniques: ${uniqueUsers}, Entreprises uniques: ${uniqueCompanies}`);
  
  // 💰 CALCUL COÛT (tarifs GPT-4 en EUR)
  const inputCost = (totalInputTokens / 1000) * 0.002 * 0.93; // ~0.00186€/1K
  const outputCost = (totalOutputTokens / 1000) * 0.008 * 0.93; // ~0.00744€/1K
  const estimatedCost = inputCost + outputCost;
  
  // ⏰ ACTIVITÉ - UTILISE timestamp
  const sortedMetrics = [...metrics].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  const lastActivity = sortedMetrics[0]?.timestamp;
  const firstActivity = sortedMetrics[sortedMetrics.length - 1]?.timestamp;
  
  const hoursSpan = firstActivity && lastActivity ? 
    (new Date(lastActivity).getTime() - new Date(firstActivity).getTime()) / (1000 * 60 * 60) : 1;
  const queriesPerHour = hoursSpan > 0 ? total / hoursSpan : total;
  
  return {
    total_queries: total,
    avg_response_time_ms: avgResponseTime,
    total_tokens: totalTokens,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    estimated_cost_eur: estimatedCost,
    queries_per_hour: Math.round(queriesPerHour * 10) / 10,
    last_activity: lastActivity,
    unique_users: uniqueUsers,
    unique_companies: uniqueCompanies,
    period_start: firstActivity,
    period_end: lastActivity
  };
}

function groupByBot(metrics: any[]) {
  const groups: { [key: string]: any[] } = {};
  
  metrics.forEach(metric => {
    const botId = metric.bot_id || 'unknown';
    if (!groups[botId]) groups[botId] = [];
    groups[botId].push(metric);
  });
  
  return Object.entries(groups).map(([botId, botMetrics]) => ({
    bot_id: botId,
    ...calculateBotStats(botMetrics)
  }));
}

function groupByDay(metrics: any[]) {
  const groups: { [key: string]: any[] } = {};
  
  metrics.forEach(metric => {
    const day = metric.timestamp.split('T')[0]; // YYYY-MM-DD
    if (!groups[day]) groups[day] = [];
    groups[day].push(metric);
  });
  
  return Object.entries(groups).map(([date, dayMetrics]) => ({
    date,
    ...calculateBotStats(dayMetrics)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export default router;