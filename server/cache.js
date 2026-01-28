/**
 * Cache Manager
 *
 * TTL-based cache for gt CLI responses with file watch invalidation.
 * Reduces duplicate queries for same agents by caching results until
 * TTL expires or file changes trigger invalidation.
 */

import chokidar from 'chokidar';

/**
 * Create a cache manager with TTL and file watch support
 * @param {Object} options - Cache configuration
 * @param {number} options.defaultTTL - Default time-to-live in ms (default: 3000)
 * @returns {Object} Cache manager
 */
export function createCache(options = {}) {
  const {
    defaultTTL = 3000  // 3 seconds default TTL
  } = options;

  const cache = new Map();  // key -> { value, expiresAt, cachedAt }
  let watcher = null;
  let stats = {
    hits: 0,
    misses: 0,
    invalidations: 0
  };

  return {
    /**
     * Get a cached value if not expired
     * @param {string} key - Cache key
     * @returns {*} Cached value or null if not found/expired
     */
    get(key) {
      const entry = cache.get(key);
      if (!entry) {
        stats.misses++;
        return null;
      }
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        stats.misses++;
        return null;
      }
      stats.hits++;
      return entry.value;
    },

    /**
     * Set a value in the cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time-to-live in ms (optional, uses default)
     */
    set(key, value, ttl = defaultTTL) {
      const now = Date.now();
      cache.set(key, {
        value,
        cachedAt: now,
        expiresAt: now + ttl
      });
    },

    /**
     * Check if a key exists and is not expired
     * @param {string} key - Cache key
     * @returns {boolean} True if key exists and is valid
     */
    has(key) {
      const entry = cache.get(key);
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return false;
      }
      return true;
    },

    /**
     * Invalidate cache entries
     * @param {string} key - Specific key to invalidate, or null for all
     */
    invalidate(key = null) {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
      stats.invalidations++;
    },

    /**
     * Invalidate cache entries matching a pattern
     * @param {string} pattern - Key prefix to match
     */
    invalidatePattern(pattern) {
      for (const key of cache.keys()) {
        if (key.startsWith(pattern)) {
          cache.delete(key);
        }
      }
      stats.invalidations++;
    },

    /**
     * Start watching paths for file changes that trigger cache invalidation
     * @param {string|string[]} paths - Paths to watch
     * @param {Function} onInvalidate - Optional callback on invalidation
     * @returns {Object} Watcher info
     */
    startWatching(paths, onInvalidate = null) {
      if (watcher) {
        return { status: 'already_watching' };
      }

      const watchPaths = Array.isArray(paths) ? paths : [paths];

      watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        // Watch for changes to .beads, hook files, and agent state
        ignored: /(^|[\/\\])\.(?!beads)[^\/\\]+$/,  // Ignore hidden files except .beads
        persistent: true,
        depth: 3  // Don't recurse too deep
      });

      watcher.on('all', (event, filePath) => {
        // Invalidate entire cache on relevant file changes
        this.invalidate();
        if (onInvalidate) {
          onInvalidate(event, filePath);
        }
      });

      return { status: 'watching', paths: watchPaths };
    },

    /**
     * Stop watching for file changes
     */
    stopWatching() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
      const now = Date.now();
      let validEntries = 0;
      let expiredEntries = 0;

      for (const entry of cache.values()) {
        if (now <= entry.expiresAt) {
          validEntries++;
        } else {
          expiredEntries++;
        }
      }

      return {
        size: cache.size,
        validEntries,
        expiredEntries,
        hits: stats.hits,
        misses: stats.misses,
        invalidations: stats.invalidations,
        hitRate: stats.hits + stats.misses > 0
          ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1) + '%'
          : '0%'
      };
    },

    /**
     * Reset cache statistics
     */
    resetStats() {
      stats = { hits: 0, misses: 0, invalidations: 0 };
    },

    /**
     * Clear all cache entries
     */
    clear() {
      cache.clear();
    }
  };
}

/**
 * Create a cache key for agent hook status
 * @param {string} agentPath - Path to agent directory
 * @returns {string} Cache key
 */
export function makeAgentCacheKey(agentPath) {
  return `hook:${agentPath}`;
}
