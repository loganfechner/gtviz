/**
 * Agent Poller
 *
 * Polls agent information from Gas Town rig directories.
 * Combines hook status, role descriptions, and last output.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseHookOutput, getHookSummary } from './hook-parser.js';
import { getRoleDescription } from './role-descriptions.js';
import { getLastOutput, getLastActivity } from './agent-output.js';

const execAsync = promisify(exec);

/**
 * Discover all agents in a rig
 * @param {string} rigPath - Path to the rig directory
 * @returns {Array} List of agent info objects
 */
export function discoverAgents(rigPath) {
  const agents = [];

  // Check for polecats
  const polecatsDir = join(rigPath, 'polecats');
  if (existsSync(polecatsDir)) {
    const entries = readdirSync(polecatsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        agents.push({
          name: entry.name,
          role: 'polecat',
          path: join(polecatsDir, entry.name)
        });
      }
    }
  }

  // Check for witness
  const witnessDir = join(rigPath, 'witness');
  if (existsSync(witnessDir)) {
    agents.push({
      name: 'witness',
      role: 'witness',
      path: witnessDir
    });
  }

  // Check for refinery
  const refineryDir = join(rigPath, 'refinery');
  if (existsSync(refineryDir)) {
    agents.push({
      name: 'refinery',
      role: 'refinery',
      path: refineryDir
    });
  }

  // Check for mayor
  const mayorDir = join(rigPath, 'mayor');
  if (existsSync(mayorDir)) {
    agents.push({
      name: 'mayor',
      role: 'mayor',
      path: mayorDir
    });
  }

  // Check for crew
  const crewDir = join(rigPath, 'crew');
  if (existsSync(crewDir)) {
    const entries = readdirSync(crewDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        agents.push({
          name: entry.name,
          role: 'crew',
          path: join(crewDir, entry.name)
        });
      }
    }
  }

  return agents;
}

/**
 * Get complete agent info including hook, description, and output
 * @param {Object} agent - Basic agent info
 * @returns {Promise<Object>} Complete agent info
 */
export async function getAgentInfo(agent) {
  const roleDesc = getRoleDescription(agent.role);

  // Get hook status
  let hookInfo = { status: 'unknown', task: null };
  try {
    const { stdout, stderr } = await execAsync('gt hook', {
      cwd: agent.path,
      timeout: 5000
    });
    const hookOutput = stdout || stderr;
    const parsed = parseHookOutput(hookOutput);
    hookInfo = getHookSummary(parsed);
  } catch (error) {
    hookInfo = { status: 'error', error: error.message };
  }

  // Get last output
  let lastOutput = null;
  let lastActivity = null;
  try {
    lastOutput = await getLastOutput(agent.path);
    lastActivity = await getLastActivity(agent.path);
  } catch {
    // Ignore errors getting output
  }

  return {
    name: agent.name,
    role: agent.role,
    path: agent.path,
    description: roleDesc.short,
    fullDescription: roleDesc.description,
    status: hookInfo.status,
    task: hookInfo.task,
    beadId: hookInfo.beadId,
    beadTitle: hookInfo.beadTitle,
    moleculeId: hookInfo.moleculeId,
    progress: hookInfo.progress,
    lastOutput: lastOutput,
    lastActivity: lastActivity?.toISOString() || null,
    error: hookInfo.error || null,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Poll all agents in a rig
 * @param {string} rigPath - Path to the rig directory
 * @returns {Promise<Array>} Array of agent info objects
 */
export async function pollAllAgents(rigPath) {
  const agents = discoverAgents(rigPath);

  const agentInfos = await Promise.all(
    agents.map(agent => getAgentInfo(agent))
  );

  return agentInfos;
}

/**
 * Create a poller that periodically updates agent info
 * @param {string} rigPath - Path to the rig directory
 * @param {Function} onUpdate - Callback when agents are updated
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Object} Poller control object
 */
export function createAgentPoller(rigPath, onUpdate, intervalMs = 5000) {
  let intervalId = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const agents = await pollAllAgents(rigPath);
      onUpdate(agents);
    } catch (error) {
      console.error('Agent polling error:', error);
    }
  };

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      poll(); // Initial poll
      intervalId = setInterval(poll, intervalMs);
      console.log(`Agent poller started for ${rigPath}`);
    },

    stop() {
      isRunning = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      console.log('Agent poller stopped');
    },

    async pollNow() {
      return pollAllAgents(rigPath);
    }
  };
}
