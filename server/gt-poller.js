/**
 * GT Command Poller
 *
 * Periodically polls `gt hook` for each agent directory
 * to track hook status across all rigs in the town.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { parseHookOutput, getHookSummary } from './hook-parser.js';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Discover all rigs in the town directory
 * @param {string} townPath - Path to the Gas Town directory
 * @returns {Promise<Array>} List of rig info objects with name and path
 */
export async function discoverRigs(townPath) {
  const rigs = [];

  // Common directories to skip
  const skipDirs = new Set(['.beads', '.git', 'mayor', 'docs', 'node_modules', '.runtime']);

  try {
    const entries = fs.readdirSync(townPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      const rigPath = path.join(townPath, entry.name);
      // Check if this looks like a rig (has polecats, witness, or refinery)
      const hasPolecats = fs.existsSync(path.join(rigPath, 'polecats'));
      const hasWitness = fs.existsSync(path.join(rigPath, 'witness'));
      const hasRefinery = fs.existsSync(path.join(rigPath, 'refinery'));

      if (hasPolecats || hasWitness || hasRefinery) {
        rigs.push({
          name: entry.name,
          path: rigPath
        });
      }
    }
  } catch (error) {
    console.error('Error discovering rigs:', error);
  }

  return rigs;
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
 * Poll hook status for all agents across all rigs in town
 * @param {string} townPath - Path to the Gas Town directory
 * @returns {Promise<Object>} Map of rig name to { agents: { agentName: hookStatus }, summary: { total, active, idle, error } }
 */
export async function pollAllRigs(townPath) {
  const rigs = await discoverRigs(townPath);
  const rigStatuses = {};

  await Promise.all(
    rigs.map(async (rig) => {
      const agents = await pollAllAgentHooks(rig.path);

      // Calculate summary stats
      const agentList = Object.values(agents);
      const summary = {
        total: agentList.length,
        active: agentList.filter(a => a.status === 'active').length,
        hooked: agentList.filter(a => a.status === 'hooked').length,
        idle: agentList.filter(a => a.status === 'idle').length,
        error: agentList.filter(a => a.status === 'error').length
      };

      rigStatuses[rig.name] = {
        name: rig.name,
        path: rig.path,
        agents,
        summary
      };
    })
  );

  return rigStatuses;
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
      const hooks = await pollAllAgentHooks(rigPath);
      onUpdate(hooks);
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

/**
 * Create a multi-rig poller that polls all rigs in town
 * @param {string} townPath - Path to the Gas Town directory
 * @param {Function} onUpdate - Callback when rigs are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} Poller control object
 */
export function createMultiRigPoller(townPath, onUpdate, intervalMs = 5000) {
  let intervalId = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const rigs = await pollAllRigs(townPath);
      onUpdate(rigs);
    } catch (error) {
      console.error('Multi-rig polling error:', error);
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
      return pollAllRigs(townPath);
    }
  };
}
