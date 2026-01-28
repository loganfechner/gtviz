import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentMonitor } from './agent-monitor.js';

const execAsync = promisify(exec);

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2
};

/**
 * Execute with exponential backoff retry
 */
async function withRetry(fn, context = 'operation') {
  let lastError;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_CONFIG.maxRetries) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
      }
    }
  }
  throw lastError;
}

export class GtPoller {
  constructor(state) {
    this.state = state;
    this.interval = null;
    this.pollIntervalMs = 5000;
    this.agentMonitor = new AgentMonitor();
    this.lastSuccessfulPoll = {};
    this.failureCount = {};
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
      const rigs = await withRetry(async () => {
        const { stdout } = await execAsync('gt rig list --json 2>/dev/null || gt rig list', { timeout: 10000 });
        return this.parseRigList(stdout);
      }, 'pollRigs');

      this.state.updateRigs(rigs);
      this.lastSuccessfulPoll.rigs = Date.now();
      this.failureCount.rigs = 0;
    } catch (err) {
      this.failureCount.rigs = (this.failureCount.rigs || 0) + 1;
      if (this.failureCount.rigs <= 3) {
        console.warn(`[gtviz] Rig poll failed (attempt ${this.failureCount.rigs}): ${err.message}`);
      }
      // Graceful degradation: keep last known state
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
        const agents = await withRetry(
          () => this.getAgentsFromDir(rig),
          `pollAgents(${rig})`
        );
        this.state.updateAgents(rig, agents);
        this.failureCount[`agents-${rig}`] = 0;
      } catch (e) {
        const key = `agents-${rig}`;
        this.failureCount[key] = (this.failureCount[key] || 0) + 1;
        if (this.failureCount[key] <= 3) {
          console.warn(`[gtviz] Agent poll failed for ${rig}: ${e.message}`);
        }
        // Graceful degradation: keep last known agent state
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
    const gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;

    for (const rig of rigs) {
      try {
        const beads = await withRetry(async () => {
          try {
            const { stdout } = await execAsync(`bd list --json 2>/dev/null`, {
              cwd: `${gtDir}/${rig}`,
              timeout: 10000
            });
            return this.parseBeads(stdout);
          } catch {
            const { stdout } = await execAsync(`bd list 2>/dev/null || echo ""`, {
              cwd: `${gtDir}/${rig}`,
              timeout: 10000
            });
            return this.parseBeadsText(stdout);
          }
        }, `pollBeads(${rig})`);

        this.state.updateBeads(rig, beads);
        this.failureCount[`beads-${rig}`] = 0;
      } catch (e) {
        const key = `beads-${rig}`;
        this.failureCount[key] = (this.failureCount[key] || 0) + 1;
        if (this.failureCount[key] <= 3) {
          console.warn(`[gtviz] Bead poll failed for ${rig}: ${e.message}`);
        }
        // Graceful degradation: keep last known bead state
      }
    }
  }

  parseBeads(output) {
    try {
      return JSON.parse(output);
    } catch {
      return this.parseBeadsText(output);
    }
  }

  parseBeadsText(output) {
    const beads = [];
    const lines = output.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/(\S+)\s+(open|in_progress|done)?\s*(.*)/);
      if (match && match[1]) {
        beads.push({
          id: match[1],
          status: match[2] || 'open',
          title: match[3] || ''
        });
      }
    }
    return beads;
  }
}
