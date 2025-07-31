// auth-backend/routes/user/helpers/userHelpers.ts
import { supabase } from '../../../utils/supabase';
import logger from "../../../utils/logger";

// 🔧 NOUVELLE FONCTION DE CALCUL CORRECT
function calculateGPT41Cost(inputTokens: number, outputTokens: number): number {
  const INPUT_PRICE_USD_PER_1M = 2.00;
  const OUTPUT_PRICE_USD_PER_1M = 8.00;
  const EUR_USD_RATE = 0.92;

  const inputCostUSD = (inputTokens / 1_000_000) * INPUT_PRICE_USD_PER_1M;
  const outputCostUSD = (outputTokens / 1_000_000) * OUTPUT_PRICE_USD_PER_1M;
  const totalCostUSD = inputCostUSD + outputCostUSD;
  const totalCostEUR = totalCostUSD / EUR_USD_RATE;

  return Math.round(totalCostEUR * 10000) / 10000;
}

// ✅ Récupération du nombre de licences pour un utilisateur
export async function getLicenseCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("user_licenses")
      .select("id", { count: "exact" })
      .eq("user_id", userId);

    if (error) {
      logger.error("❌ Erreur lors du comptage des licences", { error: error.message });
      return 0;
    }
    logger.info(`✅ Nombre de licences pour l'utilisateur : ${count}`, { userId });
    return count || 0;
  } catch (err) {
    logger.error("❌ Erreur interne lors du comptage des licences", { 
      error: err instanceof Error ? err.message : String(err),
      userId
    });
    return 0;
  }
}

export async function getUserById(userId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select(`
      id,
      email,
      role,
      nickname,
      first_name,
      last_name,
      company_id,
      companies (
        id,
        name,
        siren
      ),
      user_bot (
        bot (
          id,
          name,
          description,
          avatar
        )
      ),
      user_license (
        license (
          id,
          company_id,
          bot (
            id,
            name,
            description,
            avatar
          )
        )
      )
    `)
    .eq("id", userId)
    .single();

  if (error || !user) {
    return null;
  }

  // 🧠 Fusionner bots directs + bots via licences
  const directBots = user.user_bot?.map((entry: any) => entry.bot) || [];
  const licensedBots = user.user_license?.map((entry: any) => entry.license?.bot) || [];

  const mergedBots = [...directBots, ...licensedBots].filter(Boolean);

  // ✅ Supprimer les doublons
  const uniqueBotsMap = new Map();
  mergedBots.forEach((bot: any) => {
    if (bot?.id) uniqueBotsMap.set(bot.id, bot);
  });

  const bots = Array.from(uniqueBotsMap.values());

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    nickname: user.nickname,
    first_name: user.first_name,
    last_name: user.last_name,
    company: user.companies || null,
    bots,
    licenses: user.user_license?.map((l: any) => l.license) || []
  };
}

// 🔥 FONCTION DEBUG RADICAL - getUserTokenStats (celle qui manquait !)
export async function getUserTokenStats(userId: string): Promise<any> {
  try {
    console.log('🔍 DÉBUT getUserTokenStats pour:', userId);
    
    // 🔥 REQUÊTE BRUTE AVEC TOUS LES LOGS
    const { data: rawData, error } = await supabase
      .from("openai_token_usage")
      .select("*")
      .eq("user_id", userId);

    console.log('🔍 SUPABASE RESPONSE:', { rawData, error, count: rawData?.length });

    if (error) {
      console.error('❌ ERREUR SUPABASE:', error);
      throw new Error(`Erreur: ${error.message}`);
    }

    if (!rawData || rawData.length === 0) {
      console.log('⚠️ AUCUNE DONNÉE TROUVÉE');
      return {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_requests: 0,
        estimated_cost_eur: 0,
        unique_bots_used: 0,
        last_activity: null,
        bot_breakdown: [],
        tokens: []
      };
    }

    // 🔥 CALCUL BRUT ET SIMPLE
    let totalTokens = 0;
    let totalInput = 0;
    let totalOutput = 0;
    
    rawData.forEach((row, index) => {
      console.log(`🔍 ROW ${index}:`, row);
      
      const input = parseInt(row.input_tokens) || 0;
      const output = parseInt(row.output_tokens) || 0;
      
      console.log(`   - input_tokens: ${row.input_tokens} → ${input}`);
      console.log(`   - output_tokens: ${row.output_tokens} → ${output}`);
      
      totalInput += input;
      totalOutput += output;
      totalTokens += input + output;
    });

    console.log('🔍 TOTAUX CALCULÉS:', { totalTokens, totalInput, totalOutput });

    const result = {
      total_tokens: totalTokens,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      total_requests: rawData.length,
      estimated_cost_eur: calculateGPT41Cost(totalInput, totalOutput),
      unique_bots_used: [...new Set(rawData.map(r => r.bot_id))].length,
      last_activity: rawData.length > 0 ? new Date().toISOString() : null,
      bot_breakdown: [],
      tokens: rawData
    };

    console.log('🎯 RÉSULTAT FINAL getUserTokenStats:', result);
    return result;

  } catch (err) {
    console.error('💥 ERREUR TOTALE:', err);
    throw err;
  }
}

// 🆕 Récupération des statistiques d'usage détaillées pour un utilisateur
export async function getUserUsageStats(userId: string): Promise<any> {
  try {
    logger.info(`📊 Récupération des stats d'usage pour l'utilisateur: ${userId}`);

    // Récupérer toutes les données d'usage
    const { data: usageStats, error: usageError } = await supabase
      .from("openai_token_usage")
      .select("input_tokens, output_tokens, bot_id, timestamp")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false });

    if (usageError) {
      logger.error(`❌ Erreur récupération stats usage:`, {
        message: usageError.message,
        details: usageError.details,
        hint: usageError.hint,
        code: usageError.code,
        fullError: usageError
      });
      return {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_requests: 0,
        estimated_cost_eur: 0,
        unique_bots_used: 0,
        last_activity: null,
        bot_breakdown: []
      };
    }

    if (!usageStats || usageStats.length === 0) {
      logger.info(`📊 Aucune donnée d'usage trouvée pour l'utilisateur: ${userId}`);
      return {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_requests: 0,
        estimated_cost_eur: 0,
        unique_bots_used: 0,
        last_activity: null,
        bot_breakdown: []
      };
    }

    // 🔍 DEBUG : Afficher ce qu'on a récupéré
    console.log('🔍 DEBUG - userId:', userId);
    console.log('🔍 DEBUG - usageStats.length:', usageStats.length);
    console.log('🔍 DEBUG - Premier élément:', JSON.stringify(usageStats[0], null, 2));
    console.log('🔍 DEBUG - Tous les bot_ids:', usageStats.map(s => s.bot_id));
    
    logger.info(`🔍 DEBUG - Données récupérées:`, {
      userId,
      nbEntries: usageStats.length,
      sampleEntry: usageStats[0],
      allBotIds: [...new Set(usageStats.map(s => s.bot_id))]
    });

    // 💰 Calculer les totaux
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    console.log('🔍 CALCUL DÉTAILLÉ:');
    usageStats.forEach((stat, index) => {
      const input = parseInt(stat.input_tokens) || 0;
      const output = parseInt(stat.output_tokens) || 0;
      console.log(`ROW ${index}: input=${stat.input_tokens} (${input}) + output=${stat.output_tokens} (${output})`);
      totalInputTokens += input;
      totalOutputTokens += output;
    });

    const totalTokens = totalInputTokens + totalOutputTokens;
    console.log('🎯 TOTAUX FINAUX:', totalInputTokens, totalOutputTokens, totalTokens);
    console.log('🎯 RÉSULTAT FINAL AVANT RETURN:', {
      total_tokens: totalTokens,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_requests: usageStats.length
    });  
    
    // Coût estimé (prix OpenAI approximatifs : 0.03€/1000 input, 0.06€/1000 output)
    const estimatedCost = calculateGPT41Cost(totalInputTokens, totalOutputTokens);
    const totalRequests = usageStats.length;

    // 🤖 Analyser par bot
    const botUsage = usageStats.reduce((acc: any, stat) => {
      const botId = stat.bot_id;
      if (!acc[botId]) {
        acc[botId] = {
          bot_id: botId,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          requests_count: 0,
          estimated_cost: 0,
          last_used: null
        };
      }
      
      acc[botId].total_tokens += (stat.input_tokens || 0) + (stat.output_tokens || 0);
      acc[botId].input_tokens += stat.input_tokens || 0;
      acc[botId].output_tokens += stat.output_tokens || 0;
      acc[botId].requests_count += 1;
      acc[botId].estimated_cost += calculateGPT41Cost(stat.input_tokens || 0, stat.output_tokens || 0);

      
      if (!acc[botId].last_used || new Date(stat.timestamp) > new Date(acc[botId].last_used)) {
        acc[botId].last_used = stat.timestamp;
      }
      
      return acc;
    }, {});

    const botBreakdown = Object.values(botUsage);
    const uniqueBots = Object.keys(botUsage).length;

    // 📅 Dernière activité
    const lastActivity = usageStats.length > 0 ? usageStats[0].timestamp : null;

    const result = {
      total_tokens: totalTokens,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_requests: totalRequests,
      estimated_cost_eur: Math.round(estimatedCost * 10000) / 10000, // 4 décimales
      unique_bots_used: uniqueBots,
      last_activity: lastActivity,
      bot_breakdown: botBreakdown
    };

    console.log('🔥 BACKEND - RESULT AVANT RETURN:', JSON.stringify(result, null, 2));

    logger.info(`✅ Stats d'usage calculées pour ${userId}:`, {
      totalTokens,
      totalRequests,
      estimatedCost: result.estimated_cost_eur,
      uniqueBots
    });

    return result;
    
  } catch (err) {
    logger.error("❌ Erreur lors du calcul des stats d'usage", {
      error: err instanceof Error ? err.message : String(err),
      userId
    });
    return {
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_requests: 0,
      estimated_cost_eur: 0,
      unique_bots_used: 0,
      last_activity: null,
      bot_breakdown: []
    };
  }
}

// 🤖 Récupération des détails des bots avec les noms depuis la table bots
export async function enrichBotsWithNames(botBreakdown: any[]): Promise<any[]> {
  try {
    if (!botBreakdown || botBreakdown.length === 0) {
      return [];
    }

    const botCodes = botBreakdown.map(bot => bot.bot_id); // bot_id contient le code
    
    const { data: botsData, error: botsError } = await supabase
      .from("bots")
      .select("id, name, description, code")
      .in("code", botCodes); // Recherche par CODE et non par ID

    if (botsError) {
      logger.error("❌ Erreur lors de la récupération des noms de bots", botsError.message);
      return botBreakdown; // Retourner sans enrichissement
    }

    // Enrichir avec les noms en matchant par CODE
    const enrichedBots = botBreakdown.map(botStat => {
      const botInfo = botsData?.find(bot => bot.code === botStat.bot_id);
      return {
        ...botStat,
        bot_name: botInfo?.name || `Bot ${botStat.bot_id}`,
        bot_description: botInfo?.description || 'Description non disponible'
      };
    });

    return enrichedBots;
    
  } catch (err) {
    logger.error("❌ Erreur lors de l'enrichissement des bots", err instanceof Error ? err.message : String(err));
    return botBreakdown;
  }
}