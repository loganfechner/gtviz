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
 * @returns {Promise<Object>} Hook status for the agent
 */
export async function getAgentHookStatus(agent) {
  try {
    // Run gt hook in the agent's directory
    const { stdout, stderr } = await execAsync('gt hook', {
      cwd: agent.path,
      timeout: 5000
    });

    const hookOutput = stdout || stderr;
    const parsed = parseHookOutput(hookOutput);
    const summary = getHookSummary(parsed);

    return {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      ...summary,
      raw: parsed,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    return {
      agent: agent.name,
      role: agent.role,
      path: agent.path,
      status: 'error',
      label: error.message,
      beadId: null,
      beadTitle: null,
      error: error.message,
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
 * Create a hook poller that updates state periodically
 * @param {string} rigPath - Path to the rig directory
 * @param {Function} onUpdate - Callback when hooks are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} Poller control object
 */
export function createHookPoller(rigPath, onUpdate, intervalMs = 5000) {
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
      poll(); // Initial poll
      intervalId = setInterval(poll, intervalMs);
    },

    stop() {
      isRunning = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    async pollNow() {
      return pollAllAgentHooks(rigPath);
    }
  };
}
