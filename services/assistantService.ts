/**
 * 🤖 SERVICE ASSISTANT OPENAI - VERSION AVEC TRACKING COMPLET
 * Gestion centralisée des interactions OpenAI et threads + sauvegarde tokens
 */

const { supabase } = require('../utils/supabase');
import { generateCacheKey, getCachedResponse, setCachedResponse } from './cacheService';
import { OpenAI } from 'openai';
import logger from '../utils/logger';
import config from '../utils/config';
import Redis from 'ioredis';

const redis = config.isProd && process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

import { 
  enterpriseCache, 
generateCacheKey as generateThreadCacheKey,
getCachedAssistantId,
  cacheAssistantId
} from '../utils/assistantCache';
import { 
  getUserPreferences, 
  buildCustomInstructions,
  type UserPreferences,
  type CachedThreadData
} from './preferencesService';

// 🔧 CLIENT OPENAI CONFIGURÉ
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  defaultHeaders: {
    "OpenAI-Beta": "assistants=v2",
  },
});

// 🎯 CONFIGURATION DES ASSISTANTS
const ASSISTANTS: Record<string, string | undefined> = {
  'EMEBI ET TVA UE': process.env.ASSISTANT_EMEBI,
  'MACF': process.env.ASSISTANT_MACF,
  'CODE DES DOUANES UE': process.env.ASSISTANT_CODE_DOUANES,
  'USA': process.env.ASSISTANT_USA,
  'EUDR': process.env.ASSISTANT_EUDR,
  'SANCTIONS RUSSES': process.env.ASSISTANT_SANCTIONS
};
// 📊 INTERFACE POUR SAUVEGARDE TOKENS
interface TokenUsageData {
  user_id: string;
  company_id: string;
  bot_id: string;
  thread_id: string;
  run_id: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  response_time_ms: number;
  timestamp: string;
}

// 💾 FONCTION DE SAUVEGARDE TOKENS (NOUVELLE)
/**
 * Sauvegarde les données d'usage des tokens dans Supabase
 */
async function saveTokenUsage(data: TokenUsageData): Promise<void> {
  try {
    const { error } = await supabase
      .from('openai_token_usage')
      .insert({
        user_id: data.user_id,
        company_id: data.company_id,
        bot_id: data.bot_id,
        thread_id: data.thread_id,
        run_id: data.run_id,
        total_tokens: data.total_tokens,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        response_time_ms: data.response_time_ms,
        timestamp: data.timestamp
      });

    if (error) {
      logger.error('❌ Erreur sauvegarde tokens', { 
        error: error.message,
        userId: data.user_id,
        botId: data.bot_id 
      });
    } else {
      logger.debug('✅ Tokens sauvegardés', { 
        userId: data.user_id,
        botId: data.bot_id,
        tokens: data.total_tokens,
        responseTime: data.response_time_ms 
      });
    }
  } catch (error) {
    logger.error('❌ Exception sauvegarde tokens', { 
      error: (error as Error).message,
      userId: data.user_id 
    });
  }
}

// 🔍 FONCTION POUR RÉCUPÉRER COMPANY_ID
/**
 * Récupère le company_id d'un utilisateur
 */
async function getUserCompanyId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (error || !data) {
      logger.warn('⚠️ Company ID introuvable', { userId, error: error?.message });
      return null;
    }

    return data.company_id;
  } catch (error) {
    logger.error('❌ Erreur récupération company_id', { 
      userId, 
      error: (error as Error).message 
    });
    return null;
  }
}

// 🧵 GESTION DES THREADS (INCHANGÉ)

export async function getQuickThread(userId: string, chatbotId: string): Promise<CachedThreadData> {
  const cacheKey = generateThreadCacheKey(userId, chatbotId);
  
  // ⚡ Cache hit
  const cached = enterpriseCache.get(cacheKey);
  if (cached) {
    logger.debug('⚡ Cache hit thread', { userId, chatbotId });
    return cached;
  }

  // 🔧 FIX : Déclarer threadId AVANT les blocs if/else
  let threadId: string;

  try {
    // 🔍 Requête unique optimisée
    const [threadData, prefsData] = await Promise.all([
      supabase.from('user_threads')
        .select('thread_id, last_used_at')
        .eq('user_id', userId)
        .eq('chatbot_id', chatbotId)
        .maybeSingle(),
      getUserPreferences(userId, chatbotId)
    ]);

    const preferences = prefsData;
    
    // Thread existant et récent ? (moins d'1h)
    if (threadData.data && (Date.now() - new Date(threadData.data.last_used_at).getTime()) < 3600000) {
      // 🔧 FIX : Pas de "let" ici, on assigne à la variable globale
      threadId = threadData.data.thread_id;
      
      // Update async sans attendre
      setImmediate(() => {
        supabase.from('user_threads')
          .update({ last_used_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('chatbot_id', chatbotId)
          .then(() => logger.debug('✅ Thread timestamp updated'))
          .catch(() => logger.warn('⚠️ Failed to update thread timestamp'));
      });
      
      console.log('✅ Thread existant réutilisé:', threadId);
      
    } else {
      // Créer nouveau thread
      console.log('🔄 Création nouveau thread...');
      const thread = await openai.beta.threads.create();
      
      // 🔧 FIX : Pas de "const" ici, on assigne à la variable globale
      threadId = thread.id;
      
      // 🔧 VALIDATION CRITIQUE
      if (!threadId) {
        console.error("❌ ERREUR CRITIQUE - threadId undefined après création thread !");
        throw new Error("Impossible de créer un thread valide. OpenAI n'a pas retourné d'ID.");
      }
      
      console.log('✅ Nouveau thread créé:', threadId);
      
      // Sauver async sans attendre
      setImmediate(() => {
        supabase.from('user_threads').upsert({
          user_id: userId, 
          chatbot_id: chatbotId, 
          thread_id: threadId,
          created_at: new Date().toISOString(), 
          last_used_at: new Date().toISOString(), 
          message_count: 0
        }, { onConflict: 'user_id,chatbot_id' })
        .then(() => logger.debug('✅ Thread saved to DB'))
        .catch((err) => logger.warn('⚠️ Failed to save thread to DB:', err.message));
      });
    }

    // 🔧 VALIDATION FINALE avant retour
    if (!threadId || threadId === 'undefined') {
      throw new Error(`ThreadId invalide après traitement: ${threadId}`);
    }

    const result = { threadId, preferences };
    enterpriseCache.set(cacheKey, result);
    
    console.log('✅ getQuickThread résultat:', { threadId, preferences });
    return result;

  } catch (error) {
    console.error('❌ Erreur dans getQuickThread:', error);
    logger.error('❌ Erreur thread', { error: (error as Error).message });
    
    // Fallback : créer thread temporaire
    console.log('🚨 Fallback: création thread temporaire...');
    const thread = await openai.beta.threads.create();
    threadId = thread.id;
    
    if (!threadId) {
      throw new Error("Impossible de créer un thread même en fallback");
    }
    
    console.log('✅ Thread fallback créé:', threadId);
    
    return { 
      threadId: threadId, 
      preferences: { contentLevel: 'intermediate', communicationStyle: 'professional' }
    };
  }
}

// 🤖 GESTION DES ASSISTANTS (INCHANGÉ)

/**
 * Récupère l'assistant ID avec validation
 */
export function getAssistantId(chatbotId: string): string | null {
  // Vérifier cache d'abord
  const cached = getCachedAssistantId(chatbotId);
  if (cached) {
    return cached;
  }

  // Récupérer depuis la config
  const assistantId = ASSISTANTS[chatbotId];
  if (!assistantId) {
    logger.error(`❌ Assistant non configuré`, { chatbotId, available: Object.keys(ASSISTANTS) });
    return null;
  }

  // Mettre en cache
  cacheAssistantId(chatbotId, assistantId);
  return assistantId;
}

/**
 * Récupère la liste des bots disponibles
 */
export function getAvailableBots(): string[] {
  return Object.keys(ASSISTANTS).filter(bot => ASSISTANTS[bot]);
}

// 🔄 GESTION DES RUNS (INCHANGÉ)

/**
 * Attend la complétion d'un run OpenAI - VERSION CORRIGÉE
 */
export async function waitForRunCompletion(threadId: string, runId: string): Promise<any> {
  // 🔍 DEBUG - Vérifier les paramètres reçus
  console.log('🔍 DEBUG waitForRunCompletion - threadId:', threadId);
  console.log('🔍 DEBUG waitForRunCompletion - runId:', runId);
    console.log('🚨🚨🚨 NOUVEAU CODE DÉPLOYÉ - VERSION 17:50 🚨🚨🚨');
  console.log('🔍 DEBUG waitForRunCompletion - threadId:', threadId);

  // ✅ VALIDATION STRICTE DES PARAMÈTRES
  if (!threadId || threadId === 'undefined') {
    throw new Error(`ThreadId invalide: ${threadId}`);
  }
  
  if (!runId || runId === 'undefined') {
    throw new Error(`RunId invalide: ${runId}`);
  }
  
  // ✅ VÉRIFIER QUE C'EST BIEN UN THREAD ID (commence par "thread_")
  if (!threadId.startsWith('thread_')) {
    console.error('❌ ERREUR PARAMÈTRES - threadId ne commence pas par thread_:', threadId);
    console.error('❌ ERREUR PARAMÈTRES - runId reçu:', runId);
    throw new Error(`ThreadId invalide (ne commence pas par thread_): ${threadId}`);
  }
  
  // ✅ VÉRIFIER QUE C'EST BIEN UN RUN ID (commence par "run_")
  if (!runId.startsWith('run_')) {
    console.error('❌ ERREUR PARAMÈTRES - runId ne commence pas par run_:', runId);
    console.error('❌ ERREUR PARAMÈTRES - threadId reçu:', threadId);
    throw new Error(`RunId invalide (ne commence pas par run_): ${runId}`);
  }

 console.log('🚨 AVANT APPEL OPENAI - threadId type:', typeof threadId);
  console.log('🚨 AVANT APPEL OPENAI - threadId value:', JSON.stringify(threadId));
  console.log('🚨 AVANT APPEL OPENAI - runId type:', typeof runId);
  console.log('🚨 AVANT APPEL OPENAI - runId value:', JSON.stringify(runId));

  // Forcer les types string
  const safeThreadId = String(threadId);
  const safeRunId = String(runId);

console.log('🚨 DEBUG FINAL - safeThreadId:', safeThreadId, 'safeRunId:', safeRunId);
let runStatus = await openai.beta.threads.runs.retrieve(safeThreadId, safeRunId);

  let runStatus = await openai.beta.threads.runs.retrieve(safeThreadId, safeRunId);
  // 👆👆👆 Utilise safeThreadId et safeRunId au lieu de threadId et runId

  let attempts = 0;
  const maxAttempts = 60; // 60 secondes max
  
  while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
    if (attempts >= maxAttempts) {
      throw new Error(`Timeout: Run ${runId} a pris plus de ${maxAttempts} secondes`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
runStatus = await openai.beta.threads.runs.retrieve(safeThreadId, safeRunId);

    attempts++;
    
    logger.debug(`🔄 Run status: ${runStatus.status}`, { threadId, runId, attempt: attempts });
  }
  
  if (runStatus.status !== 'completed') {
    logger.error(`❌ Run failed`, { threadId, runId, status: runStatus.status });
  }
  
  return runStatus;
}

// 🚀 FONCTION PRINCIPALE DE TRAITEMENT (MODIFIÉE)

/**
 * Traite une question avec un assistant spécifique + SAUVEGARDE TOKENS
 */
export async function processAssistantQuestion(
  userId: string,
  chatbotId: string,
  question: string,
  providedPreferences?: UserPreferences
): Promise<{
  answer: string;
  tokens_used: number;
  preferences_applied: UserPreferences;
}> {
  const globalStartTime = Date.now();

try {
  console.log('🔍 DEBUG processAssistantQuestion - DÉBUT');
  console.log('🔍 DEBUG userId:', userId);
  console.log('🔍 DEBUG chatbotId:', chatbotId);
  console.log('🔍 DEBUG question:', question?.substring(0, 50) + '...');
  
// 1. Récupérer l'assistant ID
console.log('🔍 DEBUG - Avant getAssistantId');
const assistantId = getAssistantId(chatbotId);
console.log('🔍 DEBUG - Assistant ID récupéré:', assistantId);
if (!assistantId) {
  throw new Error(`Bot ${chatbotId} non configuré`);
}

console.log('🔍 DEBUG - Avant getUserCompanyId');
// 2. Récupérer company_id pour tracking
const companyId = await getUserCompanyId(userId);
console.log('🔍 DEBUG - Company ID récupéré:', companyId);

console.log('🔍 DEBUG - Avant gestion préférences');

// 🧵 GESTION PRÉFÉRENCES ET CACHE (VERSION CORRIGÉE)
let threadId: string | null = null;
let finalPreferences: UserPreferences;
let intelligentCacheKey: string;

console.log('🔍 DEBUG - providedPreferences:', providedPreferences);

if (providedPreferences?.communication_style && providedPreferences?.content_orientation) {
  console.log('🔍 DEBUG - Utilisation préférences frontend');
  finalPreferences = {
    contentLevel: providedPreferences.content_orientation,
    communicationStyle: providedPreferences.communication_style
  };

  console.log('🔍 DEBUG - finalPreferences créées:', finalPreferences);
  logger.debug('✅ Utilisation préférences frontend', { finalPreferences });

  // 🆕 CACHE INTELLIGENT - Vérifier AVANT tout traitement
  intelligentCacheKey = generateCacheKey(chatbotId, question, {
    // communication_style: finalPreferences.communicationStyle,
    content_level: finalPreferences.contentLevel
  });

  console.log('🚀 CACHE - clé générée:', intelligentCacheKey.substring(0, 60) + '...');
  logger.info('🔍 CACHE CHECK - Vérification cache intelligent', { 
    cacheKey: intelligentCacheKey.substring(0, 60) + '...',
    botId: chatbotId,
    preferences: finalPreferences
  });

  const cachedResponse = await getCachedResponse(intelligentCacheKey);
  console.log('🔍 CACHE - Réponse trouvée:', !!cachedResponse);
  
  if (cachedResponse) {
    logger.info('🚀 PERFORMANCE BOOST - Réponse servie depuis cache', { 
      userId, 
      chatbotId, 
      cacheKey: intelligentCacheKey.substring(0, 60) + '...',
      responseLength: cachedResponse.answer?.length || 0
    });
    return {
      answer: cachedResponse.answer,
      tokens_used: 0, // Économie totale tokens
      preferences_applied: finalPreferences
    };
  }

  logger.info('🔍 CACHE MISS - Appel OpenAI nécessaire', { 
    cacheKey: intelligentCacheKey.substring(0, 60) + '...'
  });

  // Récupérer threadId seulement si pas de cache
  console.log('🔍 DEBUG - Récupération threadId pour frontend');
  const threadData = await getQuickThread(userId, chatbotId);
  threadId = threadData.threadId;
  console.log('🔍 DEBUG - Thread ID récupéré pour frontend:', threadId);

} else {
  console.log('🔍 DEBUG - Fallback vers BDD');
  // Fallback : récupérer depuis la base via getQuickThread
  const threadData = await getQuickThread(userId, chatbotId);
  threadId = threadData.threadId;
  finalPreferences = threadData.preferences;
  console.log('🔍 DEBUG - Thread ID récupéré depuis BDD:', threadId);
  logger.debug('✅ Utilisation préférences BDD', { finalPreferences });

  // 🆕 CACHE INTELLIGENT - Vérifier aussi pour le fallback BDD
  intelligentCacheKey = generateCacheKey(chatbotId, question, {
    // communication_style: finalPreferences.communicationStyle,
    content_level: finalPreferences.contentLevel
  });

  logger.info('🔍 CACHE CHECK BDD - Vérification cache', { 
    cacheKey: intelligentCacheKey.substring(0, 60) + '...',
    botId: chatbotId 
  });

  const cachedResponse = await getCachedResponse(intelligentCacheKey);
  if (cachedResponse) {
    logger.info('🚀 PERFORMANCE BOOST BDD - Cache hit', { 
      userId, 
      chatbotId, 
      cacheKey: intelligentCacheKey.substring(0, 60) + '...' 
    });
    return {
      answer: cachedResponse.answer,
      tokens_used: 0,
      preferences_applied: finalPreferences
    };
  }

  logger.info('🔍 CACHE MISS BDD - Appel OpenAI', { 
    cacheKey: intelligentCacheKey.substring(0, 60) + '...' 
  });
}
// 5. Construire instructions personnalisées
const customInstructions = buildCustomInstructions(
  finalPreferences.contentLevel, 
  finalPreferences.communicationStyle, 
  chatbotId,
  providedPreferences?.nickname  // ✅ AJOUT DU NICKNAME
);
    
    logger.debug('📋 Instructions personnalisées générées', {
      niveau: finalPreferences.contentLevel,
      style: finalPreferences.communicationStyle
    });

    // 6. Ajouter message utilisateur
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: question
    });

    // ⏱️ 🚀 DÉMARRAGE CHRONO OPENAI (NOUVEAU)
    const openaiStartTime = Date.now();

// 7. Créer et exécuter le run avec instructions personnalisées
console.log('🔍 DEBUG AVANT création run - threadId:', threadId);
console.log('🔍 DEBUG AVANT création run - assistantId:', assistantId);

// const cacheKey = `thread:${userId}:${chatbotId}`;

// 🧠 Récupérer threadId depuis Redis
// threadId = redis ? await redis.get(cacheKey) : null;

// if (!threadId) {
  // const thread = await openai.beta.threads.create();
  // threadId = thread.id; // ❗️Pas de let ici

  // if (redis) {
    // 💾 Stocker avec expiration (7 jours)
    // await redis.set(cacheKey, threadId, 'EX', 60 * 60 * 24 * 7);
 //  }
// }

const run = await openai.beta.threads.runs.create(threadId, {
  assistant_id: assistantId,
  // additional_instructions: customInstructions
});

console.log('🔍 DEBUG APRÈS création run - run:', run);
console.log('🔍 DEBUG APRÈS création run - run.id:', run.id);
logger.debug('🚀 Run créé avec instructions personnalisées', { runId: run.id });
    
    
    // 8. Attendre la complétion
    // 🔧 CORRECTION - Ajoutez ces logs AVANT l'appel waitForRunCompletion

// Ligne ~430 - AVANT cette ligne :
// const runStatus = await waitForRunCompletion(threadId, run.id);

// AJOUTEZ CES LOGS DE DEBUG :
console.log('🔍 DEBUG AVANT waitForRunCompletion - threadId:', threadId);
console.log('🔍 DEBUG AVANT waitForRunCompletion - threadId type:', typeof threadId);
console.log('🔍 DEBUG AVANT waitForRunCompletion - run.id:', run.id);
console.log('🔍 DEBUG AVANT waitForRunCompletion - run.id type:', typeof run.id);

// ✅ VALIDATION AJOUTÉE AVANT L'APPEL
if (!threadId) {
  console.error('❌ ERREUR CRITIQUE - threadId est undefined avant waitForRunCompletion');
  console.error('❌ DEBUG - userId:', userId);
  console.error('❌ DEBUG - chatbotId:', chatbotId);
  throw new Error(`ThreadId est undefined avant waitForRunCompletion. userId: ${userId}, chatbotId: ${chatbotId}`);
}

if (!run.id) {
  console.error('❌ ERREUR CRITIQUE - run.id est undefined');
  throw new Error(`Run.id est undefined`);
}

// 8. Attendre la complétion
const runStatus = await waitForRunCompletion(threadId, run.id);
    
    // ⏱️ 🏁 FIN CHRONO OPENAI (NOUVEAU)
    const openaiResponseTime = Date.now() - openaiStartTime;
    
    if (runStatus.status !== 'completed') {
      throw new Error(`Erreur lors du traitement: ${runStatus.status}`);
    }

    // 9. Extraire la réponse et les tokens
    const totalTokens = runStatus?.usage?.total_tokens ?? 0;
    const inputTokens = runStatus?.usage?.prompt_tokens ?? 0;
    const outputTokens = runStatus?.usage?.completion_tokens ?? 0;
    
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    const latestMessage = assistantMessages[0];
    const botReply = latestMessage?.content[0]?.text?.value || "Désolé, erreur de récupération.";

// 🆕 SAUVEGARDER EN CACHE avec TTL adaptatif
await setCachedResponse(intelligentCacheKey, { answer: botReply });
logger.info('💾 CACHE INTELLIGENT - Réponse sauvegardée', { 
  cacheKey: intelligentCacheKey.substring(0, 60) + '...',
  botId: chatbotId,
  responseLength: botReply.length,
  tokensSaved: totalTokens
});

    // 💾 🆕 SAUVEGARDE TOKENS AVEC TEMPS DE RÉPONSE (NOUVEAU)
    if (companyId && totalTokens > 0) {
      await saveTokenUsage({
        user_id: userId,
        company_id: companyId,
        bot_id: chatbotId,
        thread_id: threadId,
        run_id: run.id,
        total_tokens: totalTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        response_time_ms: openaiResponseTime, // ✅ TEMPS RÉEL CAPTURÉ
        timestamp: new Date().toISOString()
      });
    }

    const totalProcessingTime = Date.now() - globalStartTime;
    logger.info('✅ Question traitée avec succès + tokens sauvegardés', {
      userId,
      chatbotId,
      tokens: totalTokens,
      openaiTime: `${openaiResponseTime}ms`,
      totalTime: `${totalProcessingTime}ms`,
      preferences: finalPreferences
    });

    return {
      answer: botReply,
      tokens_used: totalTokens,
      preferences_applied: finalPreferences
    };

} catch (error) {
    const totalProcessingTime = Date.now() - globalStartTime;
    logger.error('❌ Erreur traitement question - DÉTAIL COMPLET', {
      userId,
      chatbotId,
      error: (error as Error).message,
      stack: (error as Error).stack,
      totalTime: `${totalProcessingTime}ms`
    });
    console.error('🚨 ERREUR COMPLÈTE:', error);
    throw error;
  }
}

// 📊 UTILITAIRES DE MONITORING (INCHANGÉ)

/**
 * Stats du service OpenAI
 */
export function getOpenAIServiceStats(): {
  availableBots: string[];
  configuredAssistants: number;
} {
  return {
    availableBots: getAvailableBots(),
    configuredAssistants: Object.values(ASSISTANTS).filter(id => id).length
  };
}

// 🧪 FONCTIONS DE TEST (INCHANGÉ)

/**
 * Teste la connexion OpenAI
 */
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    const models = await openai.models.list();
    logger.info('✅ Connexion OpenAI OK', { modelCount: models.data.length });
    return true;
  } catch (error) {
    logger.error('❌ Connexion OpenAI failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Teste un assistant spécifique
 */
/**
 * Teste un assistant spécifique
 */
export async function testAssistant(chatbotId: string): Promise<boolean> {
  try {
    const assistantId = getAssistantId(chatbotId);
    if (!assistantId) return false;

    const assistant = await openai.beta.assistants.retrieve(assistantId);
    logger.info('✅ Assistant testé', { chatbotId, assistantName: assistant.name });
    return true;
  } catch (error) {
    logger.error('❌ Test assistant failed', { chatbotId, error: (error as Error).message });
    return false;
  }
}

/**
 * Test spécifique pour SANCTIONS RUSSES
 */
export async function testSanctionsAssistant(): Promise<void> {
  try {
    console.log('🧪 TEST ASSISTANT SANCTIONS RUSSES');
    console.log('🔑 API Key (10 premiers chars):', config.openai.apiKey?.substring(0, 10));
    
    const assistantId = 'asst_YmfmThzygMKhSoWoJdwEllo';
    console.log('🎯 Assistant ID:', assistantId);
    
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    console.log('✅ Assistant récupéré:', {
      id: assistant.id,
      name: assistant.name,
      model: assistant.model,
      created_at: assistant.created_at
    });
    
    logger.info('✅ Test SANCTIONS RUSSES réussi', { 
      assistantName: assistant.name,
      assistantModel: assistant.model 
    });
    
  } catch (error) {
    console.error('❌ Erreur test SANCTIONS:', error);
    logger.error('❌ Test SANCTIONS échoué', { 
      error: (error as Error).message,
      stack: (error as Error).stack 
    });
  }
}