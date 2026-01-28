/**
 * Cache Manager Tests
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createCache, makeAgentCacheKey } from './cache.js';

describe('createCache', () => {
  let cache;

  beforeEach(() => {
    cache = createCache({ defaultTTL: 100 }); // 100ms TTL for tests
  });

  it('returns null for missing keys', () => {
    assert.strictEqual(cache.get('nonexistent'), null);
  });

  it('stores and retrieves values', () => {
    cache.set('key1', { data: 'test' });
    const result = cache.get('key1');
    assert.deepStrictEqual(result, { data: 'test' });
  });

  it('expires values after TTL', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL
    assert.strictEqual(cache.get('key1'), 'value1');

    await new Promise(resolve => setTimeout(resolve, 60));
    assert.strictEqual(cache.get('key1'), null);
  });

  it('has() returns correct state', () => {
    assert.strictEqual(cache.has('key1'), false);
    cache.set('key1', 'value1');
    assert.strictEqual(cache.has('key1'), true);
  });

  it('invalidate() clears specific key', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.invalidate('key1');
    assert.strictEqual(cache.get('key1'), null);
    assert.strictEqual(cache.get('key2'), 'value2');
  });

  it('invalidate() clears all keys when called without argument', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.invalidate();
    assert.strictEqual(cache.get('key1'), null);
    assert.strictEqual(cache.get('key2'), null);
  });

  it('invalidatePattern() clears matching keys', () => {
    cache.set('hook:/path/a', 'value1');
    cache.set('hook:/path/b', 'value2');
    cache.set('other:/path/c', 'value3');
    cache.invalidatePattern('hook:');
    assert.strictEqual(cache.get('hook:/path/a'), null);
    assert.strictEqual(cache.get('hook:/path/b'), null);
    assert.strictEqual(cache.get('other:/path/c'), 'value3');
  });

  it('tracks hit and miss statistics', () => {
    cache.set('key1', 'value1');

    // Miss
    cache.get('nonexistent');
    let stats = cache.getStats();
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hits, 0);

    // Hit
    cache.get('key1');
    stats = cache.getStats();
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.hitRate, '50.0%');
  });

  it('tracks invalidation count', () => {
    cache.set('key1', 'value1');
    cache.invalidate();
    const stats = cache.getStats();
    assert.strictEqual(stats.invalidations, 1);
  });

  it('clear() removes all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    const stats = cache.getStats();
    assert.strictEqual(stats.size, 0);
  });

  it('resetStats() resets statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('nonexistent');
    cache.invalidate();

    cache.resetStats();
    const stats = cache.getStats();
    assert.strictEqual(stats.hits, 0);
    assert.strictEqual(stats.misses, 0);
    assert.strictEqual(stats.invalidations, 0);
  });

  it('getStats() counts valid and expired entries', async () => {
    cache.set('key1', 'value1', 200); // Long TTL
    cache.set('key2', 'value2', 30);  // Short TTL

    await new Promise(resolve => setTimeout(resolve, 50));

    const stats = cache.getStats();
    assert.strictEqual(stats.size, 2);
    assert.strictEqual(stats.validEntries, 1);
    assert.strictEqual(stats.expiredEntries, 1);
  });
});

describe('makeAgentCacheKey', () => {
  it('creates cache key from agent path', () => {
    const key = makeAgentCacheKey('/path/to/agent');
    assert.strictEqual(key, 'hook:/path/to/agent');
  });
});
