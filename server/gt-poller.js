/**
 * GT Command Poller
 *
 * Periodically polls `gt hook` for each agent directory
 * to track hook status across the rig.
 *
 * Uses caching layer to reduce duplicate queries for same agents.
 * Cache is invalidated on file watch events.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { parseHookOutput, getHookSummary } from './hook-parser.js';
import { createCache, makeAgentCacheKey } from './cache.js';
import path from 'path';
import fs from 'fs';

// Global cache instance for gt hook responses
const hookCache = createCache({ defaultTTL: 3000 });

const execAsync = promisify(exec);

/**
 * Discover agent directories in a rig
 * @param {string} rigPath - Path to the rig directory
 * @returns {Promise<Array>} List of agent info objects
 */
export async function discoverAgents(rigPath) {
  const agents = [];

  // Check for polecats directory
  const polecatsDir = path.join(rigPath, 'polecats');
  if (fs.existsSync(polecatsDir)) {
    const polecatDirs = fs.readdirSync(polecatsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({
        name: d.name,
        role: 'polecat',
        path: path.join(polecatsDir, d.name)
      }));
    agents.push(...polecatDirs);
  }

  // Check for witness directory
  const witnessDir = path.join(rigPath, 'witness');
  if (fs.existsSync(witnessDir)) {
    agents.push({
      name: 'witness',
      role: 'witness',
      path: witnessDir
    });
  }

  // Check for refinery directory
  const refineryDir = path.join(rigPath, 'refinery');
  if (fs.existsSync(refineryDir)) {
    agents.push({
      name: 'refinery',
      role: 'refinery',
      path: refineryDir
    });
  }

  return agents;
}

/**
 * Get hook status for a specific agent
 * @param {Object} agent - Agent info object
 * @param {Object} options - Options
 * @param {boolean} options.skipCache - Skip cache lookup (force fresh query)
 * @returns {Promise<Object>} Hook status for the agent
 */
export async function getAgentHookStatus(agent, options = {}) {
  const { skipCache = false } = options;
  const cacheKey = makeAgentCacheKey(agent.path);

  // Check cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = hookCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        fromCache: true
      };
    }
  }

  try {
    // Run gt hook in the agent's directory
    const { stdout, stderr } = await execAsync('gt hook', {
      cwd: agent.path,
      timeout: 5000
    });

    const hookOutput = stdout || stderr;
    const parsed = parseHookOutput(hookOutput);
    const summary = getHookSummary(parsed);

    const result = {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      ...summary,
      raw: parsed,
      lastUpdated: new Date().toISOString(),
      fromCache: false
    };

    // Cache the result
    hookCache.set(cacheKey, result);

    return result;
  } catch (error) {
    const errorResult = {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      status: 'error',
      label: error.message,
      beadId: null,
      beadTitle: null,
      error: error.message,
      lastUpdated: new Date().toISOString(),
      fromCache: false
    };

    // Don't cache errors - allow retry on next poll
    return errorResult;
  }
}

/**
 * Poll hook status for all agents in a rig
 * @param {string} rigPath - Path to the rig directory
 * @returns {Promise<Object>} Map of agent name to hook status
 */
export async function pollAllAgentHooks(rigPath) {
  const agents = await discoverAgents(rigPath);
  const hookStatuses = {};

  await Promise.all(
    agents.map(async (agent) => {
      const status = await getAgentHookStatus(agent);
      hookStatuses[agent.name] = status;
    })
  );

  return hookStatuses;
}

/**
 * Create a hook poller that updates state periodically
 * @param {string} rigPath - Path to the rig directory
 * @param {Function} onUpdate - Callback when hooks are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @param {Object} options - Additional options
 * @param {boolean} options.enableFileWatch - Enable file watching for cache invalidation
 * @returns {Object} Poller control object
 */
export function createHookPoller(rigPath, onUpdate, intervalMs = 5000, options = {}) {
  const { enableFileWatch = true } = options;
  let intervalId = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const startTime = performance.now();
      const hooks = await pollAllAgentHooks(rigPath);
      const pollDuration = Math.round(performance.now() - startTime);
      onUpdate(hooks, pollDuration);
    } catch (error) {
      console.error('Hook polling error:', error);
    }
  };

  return {
    start() {
      if (isRunning) return;
      isRunning = true;

      // Start file watching for cache invalidation
      if (enableFileWatch) {
        const watchPaths = [
          path.join(rigPath, 'polecats'),
          path.join(rigPath, 'witness'),
          path.join(rigPath, 'refinery'),
          path.join(rigPath, '.beads')
        ].filter(p => fs.existsSync(p));

        hookCache.startWatching(watchPaths, (event, filePath) => {
          // Trigger immediate poll after cache invalidation on file changes
          if (isRunning) {
            poll();
          }
        });
      }

      poll(); // Initial poll
      intervalId = setInterval(poll, intervalMs);
    },

    stop() {
      isRunning = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      hookCache.stopWatching();
    },

    async pollNow() {
      return pollAllAgentHooks(rigPath);
    },

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
      return hookCache.getStats();
    },

    /**
     * Invalidate the cache (force fresh queries on next poll)
     */
    invalidateCache() {
      hookCache.invalidate();
    }
  };
}
