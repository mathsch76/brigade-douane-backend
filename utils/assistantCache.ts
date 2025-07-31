/**
 * 🚀 CACHE SYSTÈME ASSISTANT
 * Cache LRU optimisé pour les performances Assistant
 */

import logger from './logger';

// 🏗️ CACHE LRU ENTERPRISE
export class LRUCache<T> {
  private cache = new Map<string, { value: T; lastUsed: number }>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    logger.debug(`🏗️ LRUCache initialisé`, { maxSize });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      logger.debug(`❌ Cache miss`, { key });
      return null;
    }
    
    item.lastUsed = Date.now();
    logger.debug(`✅ Cache hit`, { key });
    return item.value;
  }

  set(key: string, value: T): void {
    // Vérifier si on doit supprimer le plus ancien
    if (this.cache.size >= this.maxSize) {
      let oldestKey = '';
      let oldestTime = Date.now();
      
      for (const [k, v] of this.cache.entries()) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(`🗑️ Cache éviction`, { removedKey: oldestKey });
      }
    }
    
    this.cache.set(key, { value, lastUsed: Date.now() });
    logger.debug(`💾 Cache set`, { key, cacheSize: this.cache.size });
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug(`🗑️ Cache delete`, { key });
    }
    return deleted;
  }

  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    logger.info(`🧹 Cache cleared`, { previousSize });
  }

  size(): number {
    return this.cache.size;
  }

  // 📊 Stats pour monitoring
  getStats(): {
    size: number;
    maxSize: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 🎯 CACHE SPÉCIALISÉS ASSISTANT

// Cache pour les threads + préférences utilisateur
export const enterpriseCache = new LRUCache<{
  threadId: string;
  preferences: { contentLevel: string; communicationStyle: string };
}>(1000);

// Cache pour les bot IDs (plus petit, plus permanent)
export const botIdCache = new Map<string, string>();

// Cache pour les assistant IDs OpenAI
export const assistantIdCache = new Map<string, string>();

// 🔧 HELPERS DE CACHE

/**
 * Génère une clé de cache standardisée
 */
export function generateCacheKey(userId: string, chatbotId: string): string {
  return `${userId}_${chatbotId}`;
}

/**
 * Cache bot ID avec gestion d'erreurs
 */
export function cacheBotId(botName: string, botId: string): void {
  try {
    botIdCache.set(botName, botId);
    logger.debug(`🤖 Bot ID cached`, { botName, botId });
  } catch (error) {
    logger.error(`❌ Erreur cache bot ID`, { botName, error: (error as Error).message });
  }
}

/**
 * Récupère bot ID depuis le cache
 */
export function getCachedBotId(botName: string): string | null {
  const cached = botIdCache.get(botName);
  if (cached) {
    logger.debug(`⚡ Bot ID cache hit`, { botName });
  }
  return cached || null;
}

/**
 * Cache assistant ID OpenAI
 */
export function cacheAssistantId(chatbotId: string, assistantId: string): void {
  try {
    assistantIdCache.set(chatbotId, assistantId);
    logger.debug(`🤖 Assistant ID cached`, { chatbotId, assistantId });
  } catch (error) {
    logger.error(`❌ Erreur cache assistant ID`, { chatbotId, error: (error as Error).message });
  }
}

/**
 * Récupère assistant ID depuis le cache
 */
export function getCachedAssistantId(chatbotId: string): string | null {
  const cached = assistantIdCache.get(chatbotId);
  if (cached) {
    logger.debug(`⚡ Assistant ID cache hit`, { chatbotId });
  }
  return cached || null;
}

/**
 * Nettoie tous les caches (pour maintenance)
 */
export function clearAllCaches(): void {
  enterpriseCache.clear();
  botIdCache.clear();
  assistantIdCache.clear();
  logger.info(`🧹 Tous les caches nettoyés`);
}

/**
 * Stats globales des caches
 */
export function getAllCacheStats(): {
  enterprise: ReturnType<typeof enterpriseCache.getStats>;
  botIds: number;
  assistantIds: number;
} {
  return {
    enterprise: enterpriseCache.getStats(),
    botIds: botIdCache.size,
    assistantIds: assistantIdCache.size
  };
}