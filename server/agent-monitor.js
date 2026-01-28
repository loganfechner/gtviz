import { exec } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export class AgentMonitor {
  constructor() {
    this.gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
    this.idleThresholdMs = 60000;
  }

  async getAgentStatus(rig, agentName, role) {
    const agentPath = this.getAgentPath(rig, agentName, role);

    const hasProcess = await this.checkForProcess(agentPath, agentName);
    const hasTmux = await this.checkTmuxSession(rig, agentName, role);

    if (hasProcess || hasTmux) {
      const isActive = await this.checkRecentActivity(agentPath);
      return isActive ? 'running' : 'idle';
    }

    return 'stopped';
  }

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

  async checkForProcess(agentPath, agentName) {
    try {
      const { stdout } = await execAsync(
        `pgrep -f "claude.*${agentPath}" 2>/dev/null || true`
      );
      if (stdout.trim()) return true;

      const { stdout: stdout2 } = await execAsync(
        `pgrep -f "claude-code.*${agentName}" 2>/dev/null || true`
      );
      if (stdout2.trim()) return true;

      const { stdout: stdout3 } = await execAsync(
        `lsof +D "${agentPath}" 2>/dev/null | grep -i claude || true`
      );
      return !!stdout3.trim();
    } catch {
      return false;
    }
  }

  async checkTmuxSession(rig, agentName, role) {
    try {
      const sessionPatterns = [
        `${rig}-${agentName}`,
        `${rig}_${agentName}`,
        `${agentName}`,
        `gt-${rig}-${agentName}`,
        `${role}-${agentName}`
      ];

      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
      const sessions = stdout.split('\n').filter(s => s.trim());

      for (const pattern of sessionPatterns) {
        if (sessions.some(s => s.toLowerCase().includes(pattern.toLowerCase()))) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async checkRecentActivity(agentPath) {
    try {
      const now = Date.now();

      const eventsPath = join(agentPath, '.events.jsonl');
      try {
        const eventsStat = await stat(eventsPath);
        if (now - eventsStat.mtimeMs < this.idleThresholdMs) {
          return true;
        }
      } catch {}

      const feedPath = join(agentPath, '.feed.jsonl');
      try {
        const feedStat = await stat(feedPath);
        if (now - feedStat.mtimeMs < this.idleThresholdMs) {
          return true;
        }
      } catch {}

      try {
        const { stdout } = await execAsync(
          `find "${join(agentPath, 'mail')}" -type f -mmin -1 2>/dev/null | head -1`
        );
        if (stdout.trim()) return true;
      } catch {}

      const sessionPath = join(agentPath, 'session.json');
      try {
        const sessionStat = await stat(sessionPath);
        if (now - sessionStat.mtimeMs < this.idleThresholdMs) {
          return true;
        }
      } catch {}

      try {
        const { stdout } = await execAsync(
          `find "${join(agentPath, '.claude')}" -type f -mmin -1 2>/dev/null | head -1`
        );
        if (stdout.trim()) return true;
      } catch {}

      return false;
    } catch {
      return false;
    }
  }

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
