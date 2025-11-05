interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class BusinessContextCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && (now - cached.timestamp) < this.TTL_MS) {
      console.log(`[Cache HIT] ${key} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
      return cached.data as T;
    }

    console.log(`[Cache MISS] ${key} - fetching fresh data`);
    const data = await fetchFn();
    
    this.cache.set(key, {
      data,
      timestamp: now
    });

    return data;
  }

  invalidate(key: string) {
    this.cache.delete(key);
    console.log(`[Cache INVALIDATE] ${key}`);
  }

  invalidatePattern(pattern: RegExp) {
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[Cache INVALIDATE PATTERN] ${pattern} - removed ${count} entries`);
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Cache CLEAR] Removed ${size} entries`);
  }

  private cleanupExpired() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if ((now - entry.timestamp) >= this.TTL_MS) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[Cache CLEANUP] Removed ${removed} expired entries`);
    }
  }

  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000); // Cleanup every minute
  }
}

export const businessContextCache = new BusinessContextCache();
businessContextCache.startCleanupInterval();
