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
    // Use ps + grep instead of pgrep (better with special chars)
    // Gas Town claude processes have patterns like:
    // "[GAS TOWN] mayor" or "[GAS TOWN] gtviz/refinery"
    const patterns = [
      `GAS TOWN.*${rig}/${agentName}`,    // [GAS TOWN] gtviz/refinery
      `GAS TOWN.*${agentName} <-`,         // [GAS TOWN] mayor <- human
      `GAS TOWN.*${agentName}`,            // [GAS TOWN] deacon
    ];

    for (const pattern of patterns) {
      const stdout = await safeExec(`ps aux | grep -E "${pattern}" | grep -v grep | head -1`);
      if (stdout.trim()) return true;
    }

    return false;
  }

  /**
   * Check if agent has an active tmux session
   */
  async checkTmuxSession(rig, agentName, role) {
    // Gas Town tmux session naming patterns:
    // gt-{rig}-{agent} (e.g., gt-gtviz-refinery)
    // hq-{agent} (e.g., hq-mayor, hq-deacon)
    // {rig}-{agent}
    const sessionPatterns = [
      `gt-${rig}-${agentName}`,    // gt-gtviz-refinery
      `hq-${agentName}`,            // hq-mayor, hq-deacon
      `${rig}-${agentName}`,        // gtviz-refinery
      `${agentName}`,               // just the agent name
    ];

    const stdout = await safeExec('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
    const sessions = stdout.split('\n').filter(s => s.trim()).map(s => s.toLowerCase());

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
