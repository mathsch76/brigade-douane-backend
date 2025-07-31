// utils/logger.ts - VERSION OPTIMISÉE POUR CACHE
import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs';

// Assurons-nous que le dossier logs existe
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 🆕 Format personnalisé pour les logs cache
const cacheFormat = format.printf(({ timestamp, level, message, ...meta }) => {
  let output = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  
  // 🚀 Affichage spécial pour les logs cache
  if (meta.cacheKey) {
    output += ` | Cache: ${meta.cacheKey}`;
  }
  if (meta.responseTime) {
    output += ` | Time: ${meta.responseTime}`;
  }
  if (meta.hitRate) {
    output += ` | Hit Rate: ${meta.hitRate}`;
  }
  if (meta.totalHits) {
    output += ` | Hits: ${meta.totalHits}`;
  }
  if (meta.size) {
    output += ` | Size: ${meta.size}`;
  }
  
  // Autres métadonnées importantes
  if (Object.keys(meta).length > 0) {
    const cleanMeta = { ...meta };
    delete cleanMeta.cacheKey;
    delete cleanMeta.responseTime;
    delete cleanMeta.hitRate;
    delete cleanMeta.totalHits;
    delete cleanMeta.size;
    
    if (Object.keys(cleanMeta).length > 0) {
      output += ` | ${JSON.stringify(cleanMeta)}`;
    }
  }
  
  return output;
});

// Création du logger optimisé
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.metadata()
  ),
  transports: [
    // Console avec format cache optimisé
    new transports.Console({
      format: format.combine(
        format.colorize(),
        cacheFormat
      )
    }),
    
    // Log général avec rotation
    new transports.File({ 
      filename: path.join(logDir, 'app.log'),
      format: format.json(),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    
    // 🆕 Log spécifique pour le cache
    new transports.File({ 
      filename: path.join(logDir, 'cache.log'),
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      // Filtrer seulement les logs cache
      filter: (info) => {
        return info.message.includes('CACHE') || 
               info.message.includes('Cache') ||
               info.cacheKey !== undefined;
      }
    }),
    
    // Erreurs dans un fichier séparé
    new transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: format.json(),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 🆕 Méthodes spécifiques pour le cache
logger.cache = {
  hit: (data: any) => logger.info('🚀 CACHE HIT', data),
  miss: (data: any) => logger.info('❌ CACHE MISS', data),
  save: (data: any) => logger.info('💾 CACHE SAVED', data),
  error: (data: any) => logger.error('❌ CACHE ERROR', data),
  stats: (data: any) => logger.info('📊 CACHE STATS', data)
};

// 🆕 Intercepter console.log mais garder séparé pour debug
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  // En développement, garder console.log visible
  if (process.env.NODE_ENV !== 'production') {
    originalConsoleLog(...args);
  }
  logger.info(args.join(' '));
};

console.error = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    originalConsoleError(...args);
  }
  logger.error(args.join(' '));
};

console.warn = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    originalConsoleWarn(...args);
  }
  logger.warn(args.join(' '));
};

// 🆕 Méthode pour afficher stats cache en temps réel
logger.displayCacheStats = () => {
  console.log('\n📊 ===== CACHE PERFORMANCE DASHBOARD =====');
  // Cette méthode sera appelée périodiquement pour afficher les stats
};

export default logger;