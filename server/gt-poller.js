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

// Directories to skip when discovering rigs
const SKIP_DIRS = new Set([
  '.beads', '.claude', '.git', '.runtime',
  'logs', 'plugins', 'settings', 'mayor',
  'node_modules', 'abqm_history_db'
]);

/**
 * Discover all rigs in the town directory
 * @param {string} townPath - Path to the town directory
 * @returns {Promise<Array>} List of rig info objects
 */
export async function discoverRigs(townPath) {
  const rigs = [];

  if (!fs.existsSync(townPath)) {
    return rigs;
  }

  const entries = fs.readdirSync(townPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }

    const rigPath = path.join(townPath, entry.name);

    // A valid rig has a polecats directory or is a recognized agent type
    const hasPolecats = fs.existsSync(path.join(rigPath, 'polecats'));
    const hasWitness = fs.existsSync(path.join(rigPath, 'witness'));
    const hasRefinery = fs.existsSync(path.join(rigPath, 'refinery'));

    if (hasPolecats || hasWitness || hasRefinery) {
      rigs.push({
        name: entry.name,
        path: rigPath,
        hasPolecats,
        hasWitness,
        hasRefinery
      });
    }
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
 * Poll all rigs in the town
 * @param {string} townPath - Path to the town directory
 * @returns {Promise<Object>} Map of rig name to rig data (with agents)
 */
export async function pollAllRigs(townPath) {
  const rigs = await discoverRigs(townPath);
  const rigData = {};

  await Promise.all(
    rigs.map(async (rig) => {
      const agents = await pollAllAgentHooks(rig.path);

      // Calculate summary stats
      const agentList = Object.values(agents);
      const activeCount = agentList.filter(a => a.status === 'active').length;
      const hookedCount = agentList.filter(a => a.beadId).length;
      const idleCount = agentList.filter(a => !a.beadId && a.status !== 'error').length;
      const errorCount = agentList.filter(a => a.status === 'error').length;

      rigData[rig.name] = {
        name: rig.name,
        path: rig.path,
        agents,
        summary: {
          total: agentList.length,
          active: activeCount,
          hooked: hookedCount,
          idle: idleCount,
          error: errorCount
        },
        lastUpdated: new Date().toISOString()
      };
    })
  );

  return rigData;
}

/**
 * Create a hook poller that updates state periodically
 * @param {string} townPath - Path to the town directory
 * @param {Function} onUpdate - Callback when rigs are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} Poller control object
 */
export function createHookPoller(townPath, onUpdate, intervalMs = 5000) {
  let intervalId = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const rigData = await pollAllRigs(townPath);
      onUpdate(rigData);
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
      return pollAllRigs(townPath);
    }
  };
}
