// auth-backend/services/cacheService.ts - VERSION OPTIMISÉE
import { redis } from '../middlewares/rateLimiterRedis';
import logger from '../utils/logger';
import crypto from 'crypto';

// Questions génériques (peuvent être cachées globalement)
const GENERIC_KEYWORDS = [
  'qu\'est-ce que',
  'définition',
  'c\'est quoi',
  'expliquer',
  'principe de',
  'règles de',
  'comment fonctionne',
  'bases de',
  'introduction',
  'liste des',
  'types de',
  'différence entre'
];

// 🆕 TTL ADAPTATIF selon type de questions
const TTL_CONFIG = {
  generic: 3600,        // 1h pour questions génériques
  personalized: 600,    // 10min pour questions personnalisées
  technical: 1800,      // 30min pour questions techniques
  regulatory: 2400      // 40min pour questions réglementaires
};

// 🆕 CACHE STATS GLOBALES
let cacheStats = {
  hits: 0,
  misses: 0,
  saves: 0,
  errors: 0,
  totalSize: 0,
  startTime: Date.now()
};

// Déterminer si une question est générique
function isGenericQuestion(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  return GENERIC_KEYWORDS.some(keyword => lowerQuestion.includes(keyword));
}

// 🆕 Déterminer le type de question pour TTL adaptatif
function getQuestionType(question: string): keyof typeof TTL_CONFIG {
  const lower = question.toLowerCase();
  
  if (isGenericQuestion(question)) {
    return 'generic';
  }
  
  // Questions techniques (code, API, procédures)
  if (lower.includes('api') || lower.includes('code') || lower.includes('procédure') || 
      lower.includes('comment faire') || lower.includes('étapes')) {
    return 'technical';
  }
  
  // Questions réglementaires (lois, règlements, obligations)
  if (lower.includes('règlement') || lower.includes('obligation') || 
      lower.includes('conformité') || lower.includes('sanction') || 
      lower.includes('article')) {
    return 'regulatory';
  }
  
  return 'personalized';
}

// Générer hash de la question (optimisé)
function generateQuestionHash(question: string): string {
  // Normaliser la question pour meilleure correspondance
  const normalized = question.toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Supprimer ponctuation
    .replace(/\s+/g, ' ');   // Normaliser espaces
    
  return crypto.createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 16); // 16 chars pour éviter collisions
}

// 🆕 Générer clé de cache intelligente avec préfixe bot
export function generateCacheKey(
  botId: string, 
  question: string, 
  userPreferences?: {
    communication_style: string;
    content_level: string;
  }
): string {
  const questionHash = generateQuestionHash(question);
  const questionType = getQuestionType(question);
  
  if (questionType === 'generic') {
    // Questions génériques → Cache global par bot
    return `ai:${botId}:generic:${questionHash}`;
  } else {
    // Questions contextuelles → Cache personnalisé avec type
    const style = userPreferences?.communication_style || 'professional';
    const level = userPreferences?.content_level || 'intermediate';
    return `ai:${botId}:${questionType}:${style}-${level}:${questionHash}`;
  }
}

// 🆕 Récupérer réponse du cache avec stats détaillées
export async function getCachedResponse(cacheKey: string): Promise<any | null> {
  const startTime = Date.now();
  
  try {
    if (!redis) {
      logger.warn('📊 CACHE DISABLED - Redis non disponible');
      return null;
    }
    
    const cached = await redis.get(cacheKey);
    const responseTime = Date.now() - startTime;
    
    if (cached) {
      cacheStats.hits++;
      const parsedResponse = JSON.parse(cached);
      
      logger.info('🚀 CACHE HIT', { 
        cacheKey: cacheKey.substring(0, 50) + '...',
        responseTime: `${responseTime}ms`,
        size: cached.length + ' bytes',
        totalHits: cacheStats.hits,
        hitRate: `${(cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)}%`
      });
      
      return parsedResponse;
    }
    
    cacheStats.misses++;
    logger.info('❌ CACHE MISS', { 
      cacheKey: cacheKey.substring(0, 50) + '...',
      responseTime: `${responseTime}ms`,
      totalMisses: cacheStats.misses,
      hitRate: `${(cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)}%`
    });
    
    return null;
  } catch (error) {
    cacheStats.errors++;
    logger.error('❌ CACHE READ ERROR:', {
      error: (error as Error).message,
      cacheKey: cacheKey.substring(0, 50) + '...',
      totalErrors: cacheStats.errors
    });
    return null;
  }
}

// 🆕 Sauvegarder réponse en cache avec TTL adaptatif
export async function setCachedResponse(
  cacheKey: string, 
  response: any, 
  customTtl?: number
): Promise<void> {
  const startTime = Date.now();
  
  try {
    if (!redis) return;
    
    // Déterminer TTL adaptatif si pas spécifié
    let ttlSeconds = customTtl;
    if (!ttlSeconds) {
      const questionType = extractQuestionTypeFromKey(cacheKey);
      ttlSeconds = TTL_CONFIG[questionType] || TTL_CONFIG.personalized;
    }
    
    const responseStr = JSON.stringify(response);
    await redis.setex(cacheKey, ttlSeconds, responseStr);
    
    const saveTime = Date.now() - startTime;
    cacheStats.saves++;
    cacheStats.totalSize += responseStr.length;
    
    logger.info('💾 CACHE SAVED', { 
      cacheKey: cacheKey.substring(0, 50) + '...',
      ttl: `${ttlSeconds}s`,
      size: responseStr.length + ' bytes',
      saveTime: `${saveTime}ms`,
      totalSaves: cacheStats.saves,
      totalCacheSize: `${(cacheStats.totalSize / 1024).toFixed(1)}KB`
    });
    
  } catch (error) {
    cacheStats.errors++;
    logger.error('❌ CACHE SAVE ERROR:', {
      error: (error as Error).message,
      cacheKey: cacheKey.substring(0, 50) + '...',
      totalErrors: cacheStats.errors
    });
  }
}

// 🆕 Extraire type de question depuis la clé cache
function extractQuestionTypeFromKey(cacheKey: string): keyof typeof TTL_CONFIG {
  if (cacheKey.includes(':generic:')) return 'generic';
  if (cacheKey.includes(':technical:')) return 'technical';
  if (cacheKey.includes(':regulatory:')) return 'regulatory';
  return 'personalized';
}

// 🆕 Statistiques détaillées du cache
export async function getCacheStats(): Promise<any> {
  try {
    if (!redis) return { status: 'disabled' };
    
    const [info, keys] = await Promise.all([
      redis.info('memory'),
      redis.keys('ai:*')
    ]);
    
    const uptime = Math.round((Date.now() - cacheStats.startTime) / 1000);
    const hitRate = cacheStats.hits + cacheStats.misses > 0 
      ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)
      : '0.0';
    
    return {
      status: 'active',
      performance: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hit_rate: hitRate + '%',
        total_operations: cacheStats.hits + cacheStats.misses,
        saves: cacheStats.saves,
        errors: cacheStats.errors
      },
      storage: {
        total_keys: keys.length,
        estimated_size: `${(cacheStats.totalSize / 1024).toFixed(1)}KB`,
        uptime_seconds: uptime
      },
      redis: {
        memory_info: info,
        connected: true
      },
      ttl_config: TTL_CONFIG
    };
  } catch (error) {
    cacheStats.errors++;
    logger.error('❌ CACHE STATS ERROR:', { 
      error: (error as Error).message,
      totalErrors: cacheStats.errors 
    });
    return { 
      status: 'error', 
      error: (error as Error).message,
      fallback_stats: cacheStats
    };
  }
}

// 🆕 Reset des statistiques cache
export function resetCacheStats(): void {
  cacheStats = {
    hits: 0,
    misses: 0,
    saves: 0,
    errors: 0,
    totalSize: 0,
    startTime: Date.now()
  };
  logger.info('🔄 Cache stats réinitialisées');
}

// 🆕 Nettoyer le cache (utilitaire admin)
export async function clearCache(pattern: string = 'ai:*'): Promise<number> {
  try {
    if (!redis) return 0;
    
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    
    const deleted = await redis.del(...keys);
    logger.info('🧹 Cache nettoyé', { 
      pattern, 
      deletedKeys: deleted,
      totalKeys: keys.length 
    });
    
    return deleted;
  } catch (error) {
    logger.error('❌ Erreur nettoyage cache:', error);
    return 0;
  }
}