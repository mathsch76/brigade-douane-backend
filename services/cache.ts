// services/cache.ts
export interface CacheItem {
  data: any;
  timestamp: number;
  ttl: number;
}

export class SimpleCache {
  private cache = new Map<string, CacheItem>();
  private redisUrl: string | null = null;

  constructor() {
    this.redisUrl = process.env.REDIS_URL || null;
    // Nettoyage automatique toutes les 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  async set(key: string, data: any, ttlSeconds: number = 3600): Promise<void> {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      total_keys: this.cache.size,
      redis_configured: !!this.redisUrl,
      cache_type: this.redisUrl ? 'redis-ready' : 'memory'
    };
  }
}