/**
 * Agent Status Detection Module
 *
 * Detects runtime status of Gas Town agents by querying the gt CLI.
 * Status values: running, idle, stopped
 */

import { execFileSync } from 'child_process';

/**
 * Validate rig/polecat name to prevent injection
 * Only allows alphanumeric, hyphens, and underscores
 * @param {string} name - Name to validate
 * @returns {boolean} True if valid
 */
function isValidName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Agent status enum
 */
export const AgentStatus = {
  RUNNING: 'running',   // Session active, working on task
  IDLE: 'idle',         // Session active, no work assigned
  STOPPED: 'stopped',   // Session not running
  UNKNOWN: 'unknown'    // Unable to determine status
};

/**
 * Execute a gt command and parse JSON output
 * @param {string[]} args - Command arguments (passed as array, not shell string)
 * @returns {object|null} Parsed JSON or null on error
 */
function execGtJson(args) {
  try {
    const result = execFileSync('gt', [...args, '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(result.trim());
  } catch (error) {
    return null;
  }
}

/**
 * Get list of all rigs
 * @returns {Promise<string[]>} Array of rig names
 */
export async function listRigs() {
  try {
    const result = execFileSync('gt', ['rig', 'ls'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // Parse rig names from output (one per line)
    return result.trim().split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

/**
 * Get all sessions across all rigs
 * @returns {object[]} Array of session objects
 */
export function listSessions() {
  return execGtJson(['session', 'list']) || [];
}

/**
 * Get polecats for a specific rig
 * @param {string} rig - Rig name
 * @returns {object[]} Array of polecat objects
 */
export function listPolecats(rig) {
  if (!isValidName(rig)) {
    return [];
  }
  return execGtJson(['polecat', 'list', rig]) || [];
}

/**
 * Get detailed status for a specific polecat
 * @param {string} rig - Rig name
 * @param {string} polecat - Polecat name
 * @returns {object|null} Polecat status object
 */
export function getPolecatStatus(rig, polecat) {
  if (!isValidName(rig) || !isValidName(polecat)) {
    return null;
  }
  return execGtJson(['polecat', 'status', `${rig}/${polecat}`]);
}

/**
 * Check if a polecat has work on its hook by reading its agent bead
 * @param {string} rig - Rig name
 * @param {string} polecat - Polecat name
 * @returns {object} Hook status with has_work, hook_bead, agent_state
 */
function getHookStatus(rig, polecat) {
  try {
    // Validate inputs to prevent injection
    if (!isValidName(rig) || !isValidName(polecat)) {
      return { has_work: false };
    }

    // Agent bead ID format: gt-{rig}-polecat-{name}
    const agentBeadId = `gt-${rig}-polecat-${polecat}`;
    const result = execFileSync('gt', ['bd', 'show', agentBeadId, '--json'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const beads = JSON.parse(result.trim());
    const bead = Array.isArray(beads) ? beads[0] : beads;

    if (!bead) {
      return { has_work: false };
    }

    // Check if hook_bead is set (indicates work is assigned)
    const hookBead = bead.hook_bead || null;

    return {
      has_work: !!hookBead,
      hook_bead: hookBead,
      agent_state: bead.description?.match(/agent_state:\s*(\w+)/)?.[1] || null
    };
  } catch {
    return { has_work: false };
  }
}

/**
 * Determine agent status from polecat and hook data
 * @param {object} polecat - Polecat data from gt CLI
 * @param {object} hookInfo - Hook status from gt hook
 * @returns {string} Status value from AgentStatus enum
 */
function determineStatus(polecat, hookInfo = {}) {
  if (!polecat) return AgentStatus.UNKNOWN;

  // Session not running = stopped
  if (!polecat.session_running) {
    return AgentStatus.STOPPED;
  }

  // Check if there's work on the hook = running
  // This is the primary indicator that an agent is actively working
  if (hookInfo.has_work) {
    return AgentStatus.RUNNING;
  }

  // Session running with active work states = running
  // States that indicate active work: "working", "spawning", "recovering"
  const workingStates = ['working', 'spawning', 'recovering', 'assigned'];
  if (workingStates.includes(polecat.state)) {
    return AgentStatus.RUNNING;
  }

  // Session running but no work = idle
  // States that indicate idle: "done", "ready", null/undefined
  return AgentStatus.IDLE;
}

/**
 * Get status for all agents in a rig
 * @param {string} rig - Rig name
 * @returns {object[]} Array of agent status objects
 */
export function getRigAgentStatus(rig) {
  if (!isValidName(rig)) {
    return [];
  }
  const polecats = listPolecats(rig);

  return polecats.map(polecat => {
    // Check hook status for each polecat
    const hookInfo = getHookStatus(rig, polecat.name);

    return {
      rig: polecat.rig,
      name: polecat.name,
      status: determineStatus(polecat, hookInfo),
      sessionRunning: polecat.session_running,
      state: polecat.state,
      hasWork: hookInfo.has_work || false,
      currentBead: hookInfo.hook_bead || null,
      sessionId: `gt-${polecat.rig}-${polecat.name}`
    };
  });
}

/**
 * Get status for all agents across all rigs
 * @returns {Promise<object>} Map of rig name to array of agent statuses
 */
export async function getAllAgentStatus() {
  const sessions = listSessions();
  const statusByRig = {};

  // Group sessions by rig
  const rigSet = new Set(sessions.map(s => s.rig));

  for (const rig of rigSet) {
    statusByRig[rig] = getRigAgentStatus(rig);
  }

  return statusByRig;
}

/**
 * Get flattened list of all agent statuses
 * @returns {Promise<object[]>} Array of all agent status objects
 */
export async function getAllAgentStatusFlat() {
  const byRig = await getAllAgentStatus();
  return Object.values(byRig).flat();
}

/**
 * Status detector with polling support
 */
export class StatusDetector {
  constructor(options = {}) {
    this.pollInterval = options.pollInterval || 5000;
    this.listeners = new Set();
    this.lastStatus = {};
    this.polling = false;
    this.pollTimer = null;
  }

  /**
   * Subscribe to status updates
   * @param {function} callback - Called with status updates
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of status update
   * @param {object} status - Current status
   * @param {object[]} changes - Array of changed agents
   */
  notify(status, changes) {
    for (const listener of this.listeners) {
      try {
        listener(status, changes);
      } catch (error) {
        console.error('Status listener error:', error);
      }
    }
  }

  /**
   * Detect changes between old and new status
   * @param {object} oldStatus - Previous status by rig
   * @param {object} newStatus - Current status by rig
   * @returns {object[]} Array of changed agents
   */
  detectChanges(oldStatus, newStatus) {
    const changes = [];

    for (const [rig, agents] of Object.entries(newStatus)) {
      for (const agent of agents) {
        const oldAgents = oldStatus[rig] || [];
        const oldAgent = oldAgents.find(a => a.name === agent.name);

        if (!oldAgent || oldAgent.status !== agent.status) {
          changes.push({
            rig,
            name: agent.name,
            oldStatus: oldAgent?.status || null,
            newStatus: agent.status,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    return changes;
  }

  /**
   * Poll for status updates
   */
  async poll() {
    try {
      const newStatus = await getAllAgentStatus();
      const changes = this.detectChanges(this.lastStatus, newStatus);

      if (changes.length > 0) {
        this.notify(newStatus, changes);
      }

      this.lastStatus = newStatus;
      return { status: newStatus, changes };
    } catch (error) {
      console.error('Status poll error:', error);
      return { status: this.lastStatus, changes: [], error };
    }
  }

  /**
   * Start polling for status updates
   */
  start() {
    if (this.polling) return;

    this.polling = true;

    const doPoll = async () => {
      if (!this.polling) return;

      await this.poll();
      this.pollTimer = setTimeout(doPoll, this.pollInterval);
    };

    doPoll();
  }

  /**
   * Stop polling
   */
  stop() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get current status (one-shot, no polling)
   * @returns {Promise<object>} Current status by rig
   */
  async getStatus() {
    return getAllAgentStatus();
  }
}

export default StatusDetector;
