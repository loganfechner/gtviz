import { exec } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

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
    const hasProcess = await this.checkForProcess(agentPath, agentName);

    // Check tmux session
    const hasTmux = await this.checkTmuxSession(rig, agentName, role);

    if (hasProcess || hasTmux) {
      // Process exists - check if it's actively doing work
      const isActive = await this.checkRecentActivity(agentPath);
      return isActive ? 'running' : 'idle';
    }

    return 'stopped';
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
   * Check for running claude process associated with agent directory
   */
  async checkForProcess(agentPath, agentName) {
    // Check for claude processes with this agent's directory in the command
    const stdout = await safeExec(`pgrep -f "claude.*${agentPath}" 2>/dev/null || true`);
    if (stdout.trim()) return true;

    // Also check for processes with the agent name
    const stdout2 = await safeExec(`pgrep -f "claude-code.*${agentName}" 2>/dev/null || true`);
    if (stdout2.trim()) return true;

    // Skip lsof check - it's slow and often times out
    return false;
  }

  /**
   * Check if agent has an active tmux session
   */
  async checkTmuxSession(rig, agentName, role) {
    // Common tmux session naming patterns for Gas Town agents
    const sessionPatterns = [
      `${rig}-${agentName}`,
      `${rig}_${agentName}`,
      `${agentName}`,
      `gt-${rig}-${agentName}`,
      `${role}-${agentName}`
    ];

    const stdout = await safeExec('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
    const sessions = stdout.split('\n').filter(s => s.trim());

    for (const pattern of sessionPatterns) {
      if (sessions.some(s => s.toLowerCase().includes(pattern.toLowerCase()))) {
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

    // Check mail directory for recent files (use safeExec with short timeout)
    const mailCheck = await safeExec(
      `find "${join(agentPath, 'mail')}" -type f -mmin -1 2>/dev/null | head -1`
    );
    if (mailCheck.trim()) return true;

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
