import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentMonitor } from './agent-monitor.js';

const execAsync = promisify(exec);

export class GtPoller {
  constructor(state) {
    this.state = state;
    this.interval = null;
    this.pollIntervalMs = 5000;
    this.agentMonitor = new AgentMonitor();
  }

  start() {
    this.poll();
    this.interval = setInterval(() => this.poll(), this.pollIntervalMs);
    console.log('GT poller started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async poll() {
    try {
      await Promise.all([
        this.pollRigs(),
        this.pollAgents(),
        this.pollBeads()
      ]);
    } catch (err) {
      console.error('Poll error:', err.message);
    }
  }

  async pollRigs() {
    try {
      const { stdout } = await execAsync('gt rig list --json 2>/dev/null || gt rig list');
      const rigs = this.parseRigList(stdout);
      this.state.updateRigs(rigs);
    } catch (err) {
      // Fallback: try parsing text output
      try {
        const { stdout } = await execAsync('gt rig list');
        const rigs = this.parseRigListText(stdout);
        this.state.updateRigs(rigs);
      } catch (e) {
        console.error('Failed to poll rigs:', e.message);
      }
    }
  }

  parseRigList(output) {
    try {
      return JSON.parse(output);
    } catch {
      return this.parseRigListText(output);
    }
  }

  parseRigListText(output) {
    const rigs = {};
    const lines = output.split('\n');
    let currentRig = null;

    for (const line of lines) {
      // Rig names are lines starting with exactly 2 spaces followed by a word (no colon)
      const rigMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_-]*)$/);
      if (rigMatch) {
        currentRig = rigMatch[1];
        rigs[currentRig] = {
          name: currentRig,
          polecats: 0,
          crew: 0,
          agents: [],
          status: 'unknown'
        };
        continue;
      }

      // Parse metadata lines for current rig
      if (currentRig && line.includes('Polecats:')) {
        const polecatMatch = line.match(/Polecats:\s*(\d+)/);
        const crewMatch = line.match(/Crew:\s*(\d+)/);
        if (polecatMatch) rigs[currentRig].polecats = parseInt(polecatMatch[1]);
        if (crewMatch) rigs[currentRig].crew = parseInt(crewMatch[1]);
      }

      if (currentRig && line.includes('Agents:')) {
        const agentsMatch = line.match(/Agents:\s*\[([^\]]*)\]/);
        if (agentsMatch) {
          rigs[currentRig].agents = agentsMatch[1].split(/\s+/).filter(a => a);
        }
      }
    }

    return rigs;
  }

  async pollAgents() {
    const rigs = this.state.getRigs();
    for (const rig of rigs) {
      try {
        const agents = await this.getAgentsFromDir(rig);
        this.state.updateAgents(rig, agents);
      } catch (e) {
        console.error(`Failed to poll agents for ${rig}:`, e.message);
      }
    }
  }

  async getAgentsFromDir(rig) {
    const agents = [];
    const gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
    const rigPath = `${gtDir}/${rig}`;

    // Standard agents
    const standardAgents = ['witness', 'refinery', 'mayor'];
    for (const agent of standardAgents) {
      try {
        const { stdout } = await execAsync(`ls -d ${rigPath}/${agent} 2>/dev/null`);
        if (stdout.trim()) {
          agents.push({
            name: agent,
            role: agent,
            rig: rig,
            status: 'unknown'
          });
        }
      } catch {}
    }

    // Check crew
    try {
      const { stdout } = await execAsync(`ls ${rigPath}/crew 2>/dev/null`);
      const crewMembers = stdout.split('\n').filter(c => c.trim());
      for (const crew of crewMembers) {
        agents.push({
          name: crew,
          role: 'crew',
          rig: rig,
          status: 'unknown'
        });
      }
    } catch {}

    // Check polecats
    try {
      const { stdout } = await execAsync(`ls ${rigPath}/polecats 2>/dev/null`);
      const polecats = stdout.split('\n').filter(p => p.trim());
      for (const polecat of polecats) {
        agents.push({
          name: polecat,
          role: 'polecat',
          rig: rig,
          status: 'unknown'
        });
      }
    } catch {}

    // Detect actual status for each agent
    const agentsWithStatus = await this.agentMonitor.getAgentStatuses(agents);
    return agentsWithStatus;
  }

  parseAgents(output, rig) {
    const agents = [];
    const lines = output.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/(\S+)\s+(\S+)?\s*(\S+)?/);
      if (match && match[1]) {
        agents.push({
          name: match[1],
          role: match[2] || 'agent',
          rig: rig,
          status: match[3] || 'unknown'
        });
      }
    }
    return agents;
  }

  async pollBeads() {
    const rigs = this.state.getRigs();
    for (const rig of rigs) {
      try {
        const gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
        const { stdout } = await execAsync(`bd list --json --limit 100 2>/dev/null`, {
          cwd: `${gtDir}/${rig}`
        });
        const beads = this.parseBeads(stdout);
        this.state.updateBeads(rig, beads);
      } catch {
        try {
          const gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
          const { stdout } = await execAsync(`bd list --limit 100 2>/dev/null || echo ""`, {
            cwd: `${gtDir}/${rig}`
          });
          const beads = this.parseBeadsText(stdout);
          this.state.updateBeads(rig, beads);
        } catch (e) {
          console.error(`Failed to poll beads for ${rig}:`, e.message);
        }
      }
    }
  }

  parseBeads(output) {
    try {
      const rawBeads = JSON.parse(output);
      return this.filterAndGroupBeads(rawBeads);
    } catch {
      return this.parseBeadsText(output);
    }
  }

  // Filter out agent/system beads (wisps, molecules, gates) and group by status
  filterAndGroupBeads(beads) {
    // Filter out wisps and other agent beads
    const filtered = beads.filter(bead => {
      // Exclude wisp beads (ephemeral workflow steps)
      if (bead.id && bead.id.includes('-wisp-')) return false;
      // Exclude molecule types
      if (bead.issue_type === 'molecule') return false;
      // Exclude gate types
      if (bead.issue_type === 'gate') return false;
      // Exclude ephemeral beads
      if (bead.ephemeral) return false;
      return true;
    });

    // Normalize and enhance bead data
    return filtered.map(bead => ({
      id: bead.id,
      title: bead.title || 'Untitled',
      status: this.normalizeStatus(bead.status),
      priority: bead.priority,
      type: bead.issue_type || 'task',
      assignee: bead.assignee || null,
      description: bead.description || '',
      created_at: bead.created_at,
      updated_at: bead.updated_at
    }));
  }

  // Normalize status values for consistent display
  normalizeStatus(status) {
    const statusMap = {
      'open': 'open',
      'in_progress': 'in_progress',
      'hooked': 'in_progress',  // Treat hooked as in_progress
      'blocked': 'blocked',
      'deferred': 'deferred',
      'closed': 'closed',
      'done': 'closed'
    };
    return statusMap[status] || status || 'open';
  }

  parseBeadsText(output) {
    const beads = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      // Skip tip lines and empty lines
      if (line.startsWith('💡') || line.startsWith('Showing')) continue;

      // Parse format: "○ gt-xyz [● P1] [task] @assignee - Title"
      // Status symbols: ○ (open), ◐ (in_progress), ✓ (closed), ? (hooked), ⊗ (blocked)
      const match = line.match(/^([○◐✓?⊗])\s+(\S+)\s+\[●\s*(P\d)\]\s+\[(\w+)\]\s*(?:@(\S+))?\s*-?\s*(.*)/);

      if (match) {
        const [, statusSymbol, id, priority, type, assignee, title] = match;

        // Skip wisps and molecules
        if (id.includes('-wisp-')) continue;
        if (type === 'molecule' || type === 'gate') continue;

        const statusFromSymbol = {
          '○': 'open',
          '◐': 'in_progress',
          '✓': 'closed',
          '?': 'in_progress',  // hooked
          '⊗': 'blocked'
        };

        beads.push({
          id,
          title: title.trim() || 'Untitled',
          status: statusFromSymbol[statusSymbol] || 'open',
          priority: parseInt(priority.replace('P', '')),
          type,
          assignee: assignee || null
        });
      }
    }

    return beads;
  }
}
