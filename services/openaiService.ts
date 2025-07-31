// auth-backend/services/openaiService.ts - VERSION CORRIGÉE
import OpenAI from 'openai';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 🎯 Mapping des noms de bots vers leurs assistant_id
 * Basé sur votre .env actuel
 */
const BOT_ASSISTANT_MAP: Record<string, string> = {
  // Noms exacts depuis votre Supabase
  'EMEBI ET TVA UE': process.env.ASSISTANT_EMEBI || '',
  'MACF': process.env.ASSISTANT_MACF || '',
  'EUDR': process.env.ASSISTANT_EUDR || '',
  
  // Alias pour compatibilité (minuscules)
  'emebi et tva ue': process.env.ASSISTANT_EMEBI || '',
  'macf': process.env.ASSISTANT_MACF || '',
  'eudr': process.env.ASSISTANT_EUDR || '',
  
  // Autres variations possibles
  'EMEBI': process.env.ASSISTANT_EMEBI || '',
  'TVA': process.env.ASSISTANT_EMEBI || '',
  'emebi': process.env.ASSISTANT_EMEBI || '',
  'tva': process.env.ASSISTANT_EMEBI || '',
};

/**
 * 🔍 Récupère l'assistant_id pour un nom de bot donné
 */
function getAssistantId(botName: string): string {
  // Recherche exacte d'abord
  let assistantId = BOT_ASSISTANT_MAP[botName];
  
  // Si pas trouvé, recherche insensible à la casse
  if (!assistantId) {
    const normalizedBotName = botName.toLowerCase();
    assistantId = BOT_ASSISTANT_MAP[normalizedBotName];
  }
  
  // Si toujours pas trouvé, chercher par correspondance partielle
  if (!assistantId) {
    const matchingKey = Object.keys(BOT_ASSISTANT_MAP).find(key => 
      key.toLowerCase().includes(botName.toLowerCase()) ||
      botName.toLowerCase().includes(key.toLowerCase())
    );
    if (matchingKey) {
      assistantId = BOT_ASSISTANT_MAP[matchingKey];
    }
  }

  if (!assistantId) {
    const availableBots = Object.keys(BOT_ASSISTANT_MAP).filter(key => BOT_ASSISTANT_MAP[key]);
    logger.error(`❌ Assistant non trouvé pour le bot: "${botName}"`);
    logger.info(`✅ Bots disponibles: ${availableBots.join(', ')}`);
    throw new Error(`Assistant non trouvé pour le bot "${botName}". Bots disponibles: ${availableBots.join(', ')}`);
  }

  logger.info(`🎯 Bot "${botName}" → Assistant "${assistantId}"`);
  return assistantId;
}

/**
 * 🧪 Vérifie qu'un assistant existe sur OpenAI
 */
async function validateAssistant(assistantId: string): Promise<boolean> {
  try {
    await openai.beta.assistants.retrieve(assistantId);
    logger.info(`✅ Assistant ${assistantId} validé sur OpenAI`);
    return true;
  } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
    logger.error(`❌ Assistant ${assistantId} introuvable sur OpenAI:`, error);
    return false;
  }
}

/**
 * 🚀 Fonction principale : Lance un assistant OpenAI
 */
export async function runAssistant(
  botName: string, 
  messages: { role: string; content: string }[]
) {
  try {
    logger.info(`🤖 Démarrage conversation avec bot: ${botName}`);
    
    // 1. Récupérer l'assistant_id
    const assistantId = getAssistantId(botName);
    
    // 2. Validation optionnelle (désactiver en production pour la performance)
    if (process.env.NODE_ENV !== 'production') {
      const isValid = await validateAssistant(assistantId);
      if (!isValid) {
        throw new Error(`Assistant ${assistantId} invalide sur OpenAI`);
      }
    }
    
    // 3. Créer le thread avec les messages
    logger.info(`📝 Création thread avec ${messages.length} message(s)`);
    const thread = await openai.beta.threads.create({
      messages: messages.length > 0 ? messages : undefined
    });
    
    logger.info(`🎯 Thread créé: ${thread.id}`);
    
    // 4. Lancer l'assistant
    logger.info(`🚀 Lancement assistant ${assistantId} sur thread ${thread.id}`);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });
    
    logger.info(`✅ Run créé: ${run.id} avec status: ${run.status}`);
    
    return {
      threadId: thread.id,
      runId: run.id,
      assistantId: assistantId,
      status: run.status
    };
    
  } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
    logger.error(`❌ Erreur runAssistant pour bot "${botName}":`, error);
    throw error;
  }
}

/**
 * 🔄 Vérifie le statut d'un run
 */
export async function checkRunStatus(threadId: string, runId: string) {
  try {
    const run = await openai.beta.threads.runs.retrieve(runId, threadId);
    logger.info(`📊 Run ${runId} status: ${run.status}`);
    return run;
  } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
    logger.error(`❌ Erreur vérification run ${runId}:`, error);
    throw error;
  }
}

/**
 * 💬 Récupère les messages d'un thread
 */
export async function getThreadMessages(threadId: string) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId, {
      order: 'desc',
      limit: 20
    });
    
    logger.info(`📨 Récupéré ${messages.data.length} messages du thread ${threadId}`);
    return messages.data;
  } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
    logger.error(`❌ Erreur récupération messages thread ${threadId}:`, error);
    throw error;
  }
}

/**
 * 💭 Récupère la dernière réponse de l'assistant
 */
export async function getLatestAssistantResponse(threadId: string): Promise<string | null> {
  try {
    const messages = await getThreadMessages(threadId);
    const assistantMessage = messages.find(msg => msg.role === 'assistant');
    
    if (assistantMessage?.content[0]?.type === 'text') {
      const response = assistantMessage.content[0].text.value;
      logger.info(`💭 Réponse assistant récupérée: ${response.substring(0, 100)}...`);
      return response;
    }
    
    logger.warn(`⚠️ Aucune réponse d'assistant trouvée dans thread ${threadId}`);
    return null;
  } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
    logger.error(`❌ Erreur récupération réponse assistant:`, error);
    return null;
  }
}

/**
 * 🧪 Fonction de test pour vérifier tous les bots
 */
export async function testAllBots() {
  const botNames = ['EMEBI ET TVA UE', 'MACF', 'EUDR'];
  const results = [];
  
  for (const botName of botNames) {
    try {
      logger.info(`\n🧪 Test du bot: ${botName}`);
      
      const result = await runAssistant(botName, [
        { role: 'user', content: 'Bonjour, peux-tu te présenter brièvement ?' }
      ]);
      
      results.push({
        botName,
        success: true,
        assistantId: result.assistantId,
        threadId: result.threadId,
        runId: result.runId
      });
      
      logger.info(`✅ ${botName} test réussi`);
      
    } catch (error) {  // ✅ CORRIGÉ : "err: anyor" → "error"
      results.push({
        botName,
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      });
      
      logger.error(`❌ ${botName} test échoué:`, error);
    }
  }
  
  return results;
}