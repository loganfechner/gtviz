import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { stat, readdir } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Escape string for use in shell commands (prevents injection)
 */
function escapeShell(str) {
  if (typeof str !== 'string') return '';
  // Only allow alphanumeric, dash, underscore, slash, dot
  if (!/^[a-zA-Z0-9_\-./]+$/.test(str)) {
    return str.replace(/[^a-zA-Z0-9_\-./]/g, '');
  }
  return str;
}

/**
 * Validate agent/rig name - must be safe identifier
 */
function isValidName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_\-]+$/.test(name);
}

/**
 * Safe exec with timeout - returns empty string on failure
 */
async function safeExec(cmd, options = {}) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 5000, ...options });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Safe execFile with timeout - returns empty string on failure
 */
async function safeExecFile(cmd, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000, ...options });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * AgentMonitor - Detects running/idle/stopped status for Gas Town agents
 *
 * Detection strategy:
 * 1. Check for running claude processes associated with agent directories
 * 2. Check tmux sessions for active agents
 * 3. Check recent activity via .events.jsonl or session files
 */
export class AgentMonitor {
  constructor() {
    this.gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
    this.idleThresholdMs = 60000; // Consider idle if no activity for 60 seconds
  }

  /**
   * Get status for a single agent
   * @returns 'running' | 'idle' | 'stopped'
   */
  async getAgentStatus(rig, agentName, role) {
    const agentPath = this.getAgentPath(rig, agentName, role);

    // Check if there's an active process
    const hasProcess = await this.checkForProcess(rig, agentName, role);

    // Check tmux session
    const hasTmux = await this.checkTmuxSession(rig, agentName, role);

    if (hasProcess || hasTmux) {
      // Process/tmux exists = running (don't second-guess with activity check)
      return 'running';
    }

    // No process but check for recent activity (might be between commands)
    const hasRecentActivity = await this.checkRecentActivity(agentPath);
    return hasRecentActivity ? 'idle' : 'stopped';
  }

  /**
   * Get agent directory path based on role
   */
  getAgentPath(rig, agentName, role) {
    const rigPath = join(this.gtDir, rig);

    switch (role) {
      case 'polecat':
        return join(rigPath, 'polecats', agentName);
      case 'crew':
        return join(rigPath, 'crew', agentName);
      case 'witness':
      case 'refinery':
      case 'mayor':
        return join(rigPath, agentName);
      default:
        return join(rigPath, agentName);
    }
  }

  /**
   * Check for running claude process associated with agent
   */
  async checkForProcess(rig, agentName, role) {
    // Validate inputs to prevent injection
    if (!isValidName(rig) || !isValidName(agentName)) {
      return false;
    }

    // Get process list safely using execFile
    const psOutput = await safeExecFile('ps', ['aux']);
    if (!psOutput) return false;

    // Search for Gas Town patterns in output (safe string matching, no shell)
    const lines = psOutput.split('\n');
    const patterns = [
      `GAS TOWN] ${rig}/${agentName}`,    // [GAS TOWN] gtviz/refinery
      `GAS TOWN] ${agentName} <-`,         // [GAS TOWN] mayor <- human
      `GAS TOWN] ${agentName}`,            // [GAS TOWN] deacon
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        if (line.includes(pattern)) return true;
      }
    }

    return false;
  }

  /**
   * Check if agent has an active tmux session
   */
  async checkTmuxSession(rig, agentName, role) {
    // Validate inputs to prevent injection
    if (!isValidName(rig) || !isValidName(agentName)) {
      return false;
    }

    // Use execFile for safe tmux call
    const stdout = await safeExecFile('tmux', ['list-sessions', '-F', '#{session_name}']);
    const sessions = stdout.split('\n').filter(s => s.trim()).map(s => s.toLowerCase());

    // Gas Town tmux session naming patterns (safe string comparison)
    const sessionPatterns = [
      `gt-${rig}-${agentName}`,    // gt-gtviz-refinery
      `hq-${agentName}`,            // hq-mayor, hq-deacon
      `${rig}-${agentName}`,        // gtviz-refinery
      `${agentName}`,               // just the agent name
    ];

    for (const pattern of sessionPatterns) {
      if (sessions.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for recent activity to distinguish running from idle
   */
  async checkRecentActivity(agentPath) {
    const now = Date.now();

    // Check .events.jsonl for recent events
    try {
      const eventsStat = await stat(join(agentPath, '.events.jsonl'));
      if (now - eventsStat.mtimeMs < this.idleThresholdMs) return true;
    } catch {}

    // Check .feed.jsonl
    try {
      const feedStat = await stat(join(agentPath, '.feed.jsonl'));
      if (now - feedStat.mtimeMs < this.idleThresholdMs) return true;
    } catch {}

    // Check mail directory for recent files using fs instead of shell find
    try {
      const mailPath = join(agentPath, 'mail');
      const files = await readdir(mailPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile()) {
          const fileStat = await stat(join(mailPath, file.name));
          if (now - fileStat.mtimeMs < 60000) return true; // 1 minute
        }
      }
    } catch {}

    // Check session.json for recent updates
    try {
      const sessionStat = await stat(join(agentPath, 'session.json'));
      if (now - sessionStat.mtimeMs < this.idleThresholdMs) return true;
    } catch {}

    return false;
  }

  /**
   * Batch check status for multiple agents
   */
  async getAgentStatuses(agents) {
    const results = await Promise.all(
      agents.map(async (agent) => {
        const status = await this.getAgentStatus(agent.rig, agent.name, agent.role);
        return { ...agent, status };
      })
    );
    return results;
  }
}
