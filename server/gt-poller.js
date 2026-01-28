/**
 * GT Command Poller
 *
 * Periodically polls `gt hook` for each agent directory
 * to track hook status across the rig.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { parseHookOutput, getHookSummary } from './hook-parser.js';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2
};

// Error categories for better handling
const ErrorCategory = {
  TIMEOUT: 'timeout',
  COMMAND_NOT_FOUND: 'command_not_found',
  NETWORK: 'network',
  PERMISSION: 'permission',
  UNKNOWN: 'unknown'
};

/**
 * Categorize an error for better messaging
 * @param {Error} error - The error to categorize
 * @returns {string} Error category
 */
function categorizeError(error) {
  const message = error.message.toLowerCase();

  if (error.killed || message.includes('timeout') || message.includes('etimedout')) {
    return ErrorCategory.TIMEOUT;
  }
  if (message.includes('command not found') || message.includes('enoent')) {
    return ErrorCategory.COMMAND_NOT_FOUND;
  }
  if (message.includes('econnrefused') || message.includes('network')) {
    return ErrorCategory.NETWORK;
  }
  if (message.includes('permission') || message.includes('eacces')) {
    return ErrorCategory.PERMISSION;
  }
  return ErrorCategory.UNKNOWN;
}

/**
 * Get user-friendly error message
 * @param {string} category - Error category
 * @param {string} agentName - Agent name for context
 * @returns {string} User-friendly error message
 */
function getErrorMessage(category, agentName) {
  const messages = {
    [ErrorCategory.TIMEOUT]: `Agent ${agentName}: gt command timed out`,
    [ErrorCategory.COMMAND_NOT_FOUND]: `Agent ${agentName}: gt CLI not found in PATH`,
    [ErrorCategory.NETWORK]: `Agent ${agentName}: network error reaching gt service`,
    [ErrorCategory.PERMISSION]: `Agent ${agentName}: permission denied accessing agent directory`,
    [ErrorCategory.UNKNOWN]: `Agent ${agentName}: unexpected error polling hook status`
  };
  return messages[category] || messages[ErrorCategory.UNKNOWN];
}

/**
 * Calculate delay for exponential backoff
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt) {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute gt command with retry logic
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @param {string} agentName - Agent name for logging
 * @returns {Promise<{stdout: string, stderr: string, attempts: number}>}
 */
async function execWithRetry(command, options, agentName) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await execAsync(command, options);
      return { ...result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      const category = categorizeError(error);

      // Don't retry certain errors
      if (category === ErrorCategory.COMMAND_NOT_FOUND ||
          category === ErrorCategory.PERMISSION) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoffDelay(attempt);
        console.warn(
          `[gt-poller] Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} for ${agentName} ` +
          `(${category}) - waiting ${Math.round(delay)}ms`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

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

// Track agent health for graceful degradation
const agentHealth = new Map();

/**
 * Update agent health tracking
 * @param {string} agentName - Agent name
 * @param {boolean} success - Whether the poll succeeded
 * @param {string|null} errorCategory - Error category if failed
 */
function updateAgentHealth(agentName, success, errorCategory = null) {
  const current = agentHealth.get(agentName) || {
    consecutiveFailures: 0,
    lastSuccess: null,
    lastError: null,
    errorCategory: null
  };

  if (success) {
    agentHealth.set(agentName, {
      consecutiveFailures: 0,
      lastSuccess: new Date().toISOString(),
      lastError: current.lastError,
      errorCategory: null
    });
  } else {
    agentHealth.set(agentName, {
      consecutiveFailures: current.consecutiveFailures + 1,
      lastSuccess: current.lastSuccess,
      lastError: new Date().toISOString(),
      errorCategory
    });
  }
}

/**
 * Get health status for an agent
 * @param {string} agentName - Agent name
 * @returns {Object} Agent health info
 */
export function getAgentHealth(agentName) {
  return agentHealth.get(agentName) || {
    consecutiveFailures: 0,
    lastSuccess: null,
    lastError: null,
    errorCategory: null
  };
}

/**
 * Get all agent health statuses
 * @returns {Object} Map of agent name to health status
 */
export function getAllAgentHealth() {
  const health = {};
  for (const [name, status] of agentHealth) {
    health[name] = status;
  }
  return health;
}

/**
 * Check if agent should be considered unreachable
 * @param {string} agentName - Agent name
 * @returns {boolean} True if agent is unreachable
 */
function isAgentUnreachable(agentName) {
  const health = agentHealth.get(agentName);
  // Consider unreachable after 5 consecutive failures
  return health && health.consecutiveFailures >= 5;
}

/**
 * Get hook status for a specific agent
 * @param {Object} agent - Agent info object
 * @returns {Promise<Object>} Hook status for the agent
 */
export async function getAgentHookStatus(agent) {
  // Check for graceful degradation
  if (isAgentUnreachable(agent.name)) {
    const health = getAgentHealth(agent.name);
    console.warn(
      `[gt-poller] Agent ${agent.name} marked unreachable ` +
      `(${health.consecutiveFailures} failures, last success: ${health.lastSuccess || 'never'})`
    );

    return {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      status: 'unreachable',
      label: `Agent unreachable (${health.consecutiveFailures} consecutive failures)`,
      beadId: null,
      beadTitle: null,
      error: getErrorMessage(health.errorCategory || ErrorCategory.UNKNOWN, agent.name),
      health: health,
      lastUpdated: new Date().toISOString()
    };
  }

  try {
    // Run gt hook in the agent's directory with retry logic
    const { stdout, stderr, attempts } = await execWithRetry('gt hook', {
      cwd: agent.path,
      timeout: 5000
    }, agent.name);

    const hookOutput = stdout || stderr;
    const parsed = parseHookOutput(hookOutput);
    const summary = getHookSummary(parsed);

    // Update health tracking on success
    updateAgentHealth(agent.name, true);

    if (attempts > 1) {
      console.log(`[gt-poller] Agent ${agent.name}: succeeded after ${attempts} attempts`);
    }

    return {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      ...summary,
      raw: parsed,
      health: getAgentHealth(agent.name),
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    const category = categorizeError(error);
    const friendlyMessage = getErrorMessage(category, agent.name);

    // Update health tracking on failure
    updateAgentHealth(agent.name, false, category);
    const health = getAgentHealth(agent.name);

    console.error(
      `[gt-poller] ${friendlyMessage}: ${error.message} ` +
      `(failures: ${health.consecutiveFailures})`
    );

    return {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      status: 'error',
      label: friendlyMessage,
      beadId: null,
      beadTitle: null,
      error: error.message,
      errorCategory: category,
      health: health,
      lastUpdated: new Date().toISOString()
    };
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
 * Reset health for an agent, allowing retry of unreachable agents
 * @param {string} agentName - Agent name to reset
 */
export function resetAgentHealth(agentName) {
  agentHealth.delete(agentName);
  console.log(`[gt-poller] Reset health for agent: ${agentName}`);
}

/**
 * Reset health for all agents
 */
export function resetAllAgentHealth() {
  agentHealth.clear();
  console.log('[gt-poller] Reset health for all agents');
}

/**
 * Create a hook poller that updates state periodically
 * @param {string} rigPath - Path to the rig directory
 * @param {Function} onUpdate - Callback when hooks are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} Poller control object
 */
export function createHookPoller(rigPath, onUpdate, intervalMs = 5000) {
  let intervalId = null;
  let isRunning = false;
  let pollCount = 0;

  // Periodically reset unreachable agents to allow recovery
  const HEALTH_RESET_INTERVAL = 30; // Reset unreachable agents every 30 polls

  const poll = async () => {
    if (!isRunning) return;

    pollCount++;

    // Periodically allow unreachable agents to be retried
    if (pollCount % HEALTH_RESET_INTERVAL === 0) {
      const health = getAllAgentHealth();
      for (const [name, status] of Object.entries(health)) {
        if (status.consecutiveFailures >= 5) {
          console.log(`[gt-poller] Allowing retry for unreachable agent: ${name}`);
          // Reduce failure count to allow one retry
          agentHealth.set(name, { ...status, consecutiveFailures: 4 });
        }
      }
    }

    try {
      const startTime = performance.now();
      const hooks = await pollAllAgentHooks(rigPath);
      const pollDuration = Math.round(performance.now() - startTime);

      // Include health info in update
      const healthInfo = getAllAgentHealth();
      onUpdate(hooks, pollDuration, healthInfo);
    } catch (error) {
      console.error('[gt-poller] Hook polling error:', error.message);
    }
  };

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      console.log(`[gt-poller] Starting hook poller (interval: ${intervalMs}ms)`);
      poll(); // Initial poll
      intervalId = setInterval(poll, intervalMs);
    },

    stop() {
      isRunning = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      console.log('[gt-poller] Hook poller stopped');
    },

    async pollNow() {
      return pollAllAgentHooks(rigPath);
    },

    getHealth() {
      return getAllAgentHealth();
    },

    resetHealth(agentName) {
      if (agentName) {
        resetAgentHealth(agentName);
      } else {
        resetAllAgentHealth();
      }
    }
  };
}
