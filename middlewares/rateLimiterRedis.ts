import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import config from '../utils/config';
import logger from '../utils/logger';
import type { Store } from 'express-rate-limit';

const redis = config.isProd && process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

class RedisStoreCompat implements Store {
  private client: Redis;
  private prefix: string;

  constructor(client: Redis, prefix = 'rl:') {
    this.client = client;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{
    totalHits: number;
    resetTime?: Date;
  }> {
    if (!this.client) return { totalHits: 1 };

    const redisKey = `${this.prefix}${key}`;
    try {
      const current = await this.client.incr(redisKey);

      if (current === 1) {
        await this.client.expire(redisKey, 900); // 15 min
      }

      const ttl = await this.client.ttl(redisKey);
      return {
        totalHits: current,
        resetTime: ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined
      };
    } catch (error) {
      logger.error('❌ Redis increment error:', error);
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.decr(`${this.prefix}${key}`);
    } catch (error) {
      logger.error('❌ Redis decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(`${this.prefix}${key}`);
    } catch (error) {
      logger.error('❌ Redis resetKey error:', error);
    }
  }
}

// Limiteurs
export const loginRateLimiterRedis = rateLimit({
  store: redis ? new RedisStoreCompat(redis, 'rl:login:') : undefined,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('🚫 Login rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
  },
});

export const assistantRateLimiterRedis = rateLimit({
  store: redis ? new RedisStoreCompat(redis, 'rl:assistant:') : undefined,
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Trop de requêtes vers les assistants. Réessayez dans 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('🚫 Assistant rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(429).json({ error: 'Trop de requêtes vers les assistants. Réessayez plus tard.' });
  },
});

export const generalRateLimiter = rateLimit({
  store: redis ? new RedisStoreCompat(redis, 'rl:general:') : undefined,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export { redis };
