import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentMonitor } from './agent-monitor.js';
import logger from './logger.js';

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
  constructor(state, metrics = null) {
    this.state = state;
    this.metrics = metrics;
    this.interval = null;
    this.pollIntervalMs = 5000;
    this.agentMonitor = new AgentMonitor();
    this.lastSuccessfulPoll = {};
    this.failureCount = {};
    this.taskStartTimes = {};  // Track when tasks/beads were started
    this.previousBeadStatus = {}; // Track bead status changes
  }

  start() {
    this.poll();
    this.interval = setInterval(() => this.poll(), this.pollIntervalMs);
    logger.info('poller', 'GT poller started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async poll() {
    const startTime = Date.now();
    let success = true;
    try {
      await Promise.all([
        this.pollRigs(),
        this.pollAgents(),
        this.pollBeads(),
        this.pollHooks()
      ]);
    } catch (err) {
      success = false;
      logger.error('poller', 'Poll cycle failed', { error: err.message });
    } finally {
      const duration = Date.now() - startTime;
      if (this.metrics) {
        this.metrics.recordPollDuration(duration, success);
      }
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
        logger.warn('poller', 'Rig poll failed', { attempt: this.failureCount.rigs, error: err.message });
      }
      // Emit error event for UI visibility
      this.state.addError({
        component: 'poller',
        operation: 'pollRigs',
        severity: this.failureCount.rigs >= 3 ? 'error' : 'warning',
        message: `Rig poll failed: ${err.message}`,
        retryCount: this.failureCount.rigs,
        maxRetries: RETRY_CONFIG.maxRetries,
        lastSuccess: this.lastSuccessfulPoll.rigs || null
      });
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
    const allAgents = [];
    for (const rig of rigs) {
      try {
        const agents = await withRetry(
          () => this.getAgentsFromDir(rig),
          `pollAgents(${rig})`
        );
        this.state.updateAgents(rig, agents);
        this.failureCount[`agents-${rig}`] = 0;
        allAgents.push(...agents);
      } catch (e) {
        const key = `agents-${rig}`;
        this.failureCount[key] = (this.failureCount[key] || 0) + 1;
        if (this.failureCount[key] <= 3) {
          logger.warn('poller', 'Agent poll failed', { rig, error: e.message });
        }
        // Emit error event for UI visibility
        this.state.addError({
          component: 'poller',
          operation: 'pollAgents',
          rig,
          severity: this.failureCount[key] >= 3 ? 'error' : 'warning',
          message: `Agent poll failed for ${rig}: ${e.message}`,
          retryCount: this.failureCount[key],
          maxRetries: RETRY_CONFIG.maxRetries
        });
        // Graceful degradation: keep last known agent state
      }
    }

    // Update agent activity metrics
    if (this.metrics && allAgents.length > 0) {
      const agentMap = {};
      for (const agent of allAgents) {
        agentMap[agent.name] = { status: agent.status, beadId: agent.hookBead };
      }
      this.metrics.updateAgentActivity(agentMap);
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

        // Add rig information to each bead
        const beadsWithRig = beads.map(bead => ({ ...bead, rig }));

        // Track task completions and durations
        this.trackTaskCompletions(rig, beadsWithRig);

        this.state.updateBeads(rig, beadsWithRig);
        this.failureCount[`beads-${rig}`] = 0;
      } catch (e) {
        const key = `beads-${rig}`;
        this.failureCount[key] = (this.failureCount[key] || 0) + 1;
        if (this.failureCount[key] <= 3) {
          logger.warn('poller', 'Bead poll failed', { rig, error: e.message });
        }
        // Emit error event for UI visibility
        this.state.addError({
          component: 'poller',
          operation: 'pollBeads',
          rig,
          severity: this.failureCount[key] >= 3 ? 'error' : 'warning',
          message: `Bead poll failed for ${rig}: ${e.message}`,
          retryCount: this.failureCount[key],
          maxRetries: RETRY_CONFIG.maxRetries
        });
        // Graceful degradation: keep last known bead state
      }
    }
  }

  trackTaskCompletions(rig, beads) {
    const now = Date.now();

    for (const bead of beads) {
      const beadKey = `${rig}/${bead.id}`;
      const prevStatus = this.previousBeadStatus[beadKey];

      // Track start time when bead becomes in_progress
      if (bead.status === 'in_progress' && prevStatus !== 'in_progress') {
        this.taskStartTimes[beadKey] = now;
      }

      // Record completion when bead becomes done
      if (bead.status === 'done' && prevStatus !== 'done') {
        const startTime = this.taskStartTimes[beadKey];
        const duration = startTime ? now - startTime : null;

        // Find which agent completed this (from hooks)
        const hooks = this.state.getState().hooks[rig] || {};
        let completingAgent = null;
        for (const [agent, hookData] of Object.entries(hooks)) {
          if (hookData && hookData.bead === bead.id) {
            completingAgent = agent;
            break;
          }
        }

        if (completingAgent) {
          const agentKey = `${rig}/${completingAgent}`;
          this.state.updateAgentStats(agentKey, {
            completion: {
              beadId: bead.id,
              title: bead.title || '',
              completedAt: new Date().toISOString(),
              duration: duration
            }
          });
          logger.info('poller', 'Task completed', {
            rig,
            agent: completingAgent,
            beadId: bead.id,
            duration: duration ? `${Math.round(duration / 1000)}s` : 'unknown'
          });
        }

        delete this.taskStartTimes[beadKey];
      }

      this.previousBeadStatus[beadKey] = bead.status;
    }
  }

  parseBeads(output) {
    try {
      const data = JSON.parse(output);
      // Normalize JSON beads to include all expected fields
      if (Array.isArray(data)) {
        return data.map(bead => ({
          id: bead.id,
          title: bead.title || '',
          status: bead.status || 'open',
          priority: this.normalizePriority(bead.priority),
          labels: bead.labels || [],
          owner: bead.owner || null,
          assignee: bead.assignee || null,
          type: bead.type || null,
          description: bead.description || '',
          notes: bead.notes || [],
          dependsOn: bead.dependsOn || bead.depends_on || [],
          createdAt: bead.createdAt || bead.created || null,
          updatedAt: bead.updatedAt || bead.updated || null,
          closedAt: bead.closedAt || bead.closed || null
        }));
      }
      return this.parseBeadsText(output);
    } catch {
      return this.parseBeadsText(output);
    }
  }

  parseBeadsText(output) {
    const beads = [];
    const lines = output.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Parse: status-symbol id · title [● priority · STATUS]
      // Example: ? gt-abc123 · Add feature [● P2 · HOOKED]
      const fullMatch = line.match(/^([?○●✓✗])\s+(\S+)\s*·?\s*(.+?)(?:\s+\[([^\]]+)\])?$/);
      if (fullMatch) {
        const [, symbol, id, title, meta] = fullMatch;
        const bead = {
          id,
          title: title.trim(),
          status: this.parseStatusFromSymbol(symbol),
          priority: null,
          labels: []
        };

        if (meta) {
          // Parse metadata like "● P2 · HOOKED" or "● critical · OPEN"
          const priorityMatch = meta.match(/P([1-4])|critical|high|normal|low/i);
          if (priorityMatch) {
            const p = priorityMatch[0].toLowerCase();
            if (p === 'p1' || p === 'critical') bead.priority = 'critical';
            else if (p === 'p2' || p === 'high') bead.priority = 'high';
            else if (p === 'p3' || p === 'normal') bead.priority = 'normal';
            else if (p === 'p4' || p === 'low') bead.priority = 'low';
          }
          const statusMatch = meta.match(/HOOKED|OPEN|IN_PROGRESS|CLOSED|DONE/i);
          if (statusMatch) {
            bead.status = statusMatch[0].toLowerCase().replace('_', '_');
          }
        }
        beads.push(bead);
        continue;
      }

      // Fallback: simple format
      const simpleMatch = line.match(/(\S+)\s+(open|hooked|in_progress|done|closed)?\s*(.*)/);
      if (simpleMatch && simpleMatch[1]) {
        beads.push({
          id: simpleMatch[1],
          status: simpleMatch[2] || 'open',
          title: simpleMatch[3] || '',
          priority: null,
          labels: []
        });
      }
    }
    return beads;
  }

  parseStatusFromSymbol(symbol) {
    switch (symbol) {
      case '?': return 'open';
      case '○': return 'open';
      case '●': return 'hooked';
      case '✓': return 'done';
      case '✗': return 'closed';
      default: return 'open';
    }
  }

  async fetchBeadDetails(beadId, cwd) {
    try {
      const { stdout } = await execAsync(`bd show ${beadId} --json 2>/dev/null || bd show ${beadId}`, {
        cwd,
        timeout: 5000
      });
      return this.parseBeadDetails(stdout, beadId);
    } catch {
      return null;
    }
  }

  parseBeadDetails(output, beadId) {
    // Try JSON first
    try {
      const data = JSON.parse(output);
      return {
        id: data.id || beadId,
        title: data.title || '',
        description: data.description || '',
        status: data.status || 'open',
        priority: this.normalizePriority(data.priority),
        labels: data.labels || [],
        owner: data.owner || null,
        assignee: data.assignee || null,
        type: data.type || null,
        notes: data.notes || [],
        dependsOn: data.dependsOn || data.depends_on || [],
        createdAt: data.createdAt || data.created || null,
        updatedAt: data.updatedAt || data.updated || null,
        closedAt: data.closedAt || data.closed || null
      };
    } catch {}

    // Parse text output
    const details = {
      id: beadId,
      title: '',
      description: '',
      status: 'open',
      priority: null,
      labels: [],
      owner: null,
      assignee: null,
      type: null,
      notes: [],
      dependsOn: [],
      createdAt: null,
      updatedAt: null,
      closedAt: null
    };

    const lines = output.split('\n');
    let inDescription = false;
    let descriptionLines = [];

    for (const line of lines) {
      // Parse header line: ? bead-id · Title [● P2 · STATUS]
      const headerMatch = line.match(/^[?○●✓✗]\s+(\S+)\s*·\s*(.+?)(?:\s+\[([^\]]+)\])?$/);
      if (headerMatch) {
        details.id = headerMatch[1];
        details.title = headerMatch[2].trim();
        if (headerMatch[3]) {
          const meta = headerMatch[3];
          const priorityMatch = meta.match(/P([1-4])|critical|high|normal|low/i);
          if (priorityMatch) {
            details.priority = this.normalizePriority(priorityMatch[0]);
          }
          const statusMatch = meta.match(/HOOKED|OPEN|IN_PROGRESS|CLOSED|DONE/i);
          if (statusMatch) {
            details.status = statusMatch[0].toLowerCase();
          }
        }
        continue;
      }

      // Parse metadata fields
      const ownerMatch = line.match(/^Owner:\s*(.+)/);
      if (ownerMatch) { details.owner = ownerMatch[1].trim(); continue; }

      const assigneeMatch = line.match(/^Assignee:\s*(.+)/);
      if (assigneeMatch) { details.assignee = assigneeMatch[1].trim(); continue; }

      const typeMatch = line.match(/^Type:\s*(.+)/);
      if (typeMatch) { details.type = typeMatch[1].trim(); continue; }

      const createdMatch = line.match(/^Created:\s*(.+)/);
      if (createdMatch) { details.createdAt = createdMatch[1].trim(); continue; }

      const updatedMatch = line.match(/^Updated:\s*(.+)/);
      if (updatedMatch) { details.updatedAt = updatedMatch[1].trim(); continue; }

      // Description section
      if (line.match(/^DESCRIPTION/i)) {
        inDescription = true;
        continue;
      }

      if (inDescription) {
        if (line.match(/^[A-Z]+$/)) {
          inDescription = false;
          details.description = descriptionLines.join('\n').trim();
          descriptionLines = [];
        } else {
          descriptionLines.push(line);
        }
      }

      // Dependencies
      const depMatch = line.match(/^\s*→\s*[○●]\s*(\S+):/);
      if (depMatch) {
        details.dependsOn.push(depMatch[1]);
      }
    }

    if (descriptionLines.length > 0) {
      details.description = descriptionLines.join('\n').trim();
    }

    return details;
  }

  normalizePriority(p) {
    if (!p) return null;
    const lower = p.toLowerCase();
    if (lower === 'p1' || lower === 'critical') return 'critical';
    if (lower === 'p2' || lower === 'high') return 'high';
    if (lower === 'p3' || lower === 'normal') return 'normal';
    if (lower === 'p4' || lower === 'low') return 'low';
    return lower;
  }

  async pollHooks() {
    const rigs = this.state.getRigs();
    const gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;

    for (const rig of rigs) {
      try {
        const hooks = await withRetry(async () => {
          const rigHooks = {};
          const agents = ['mayor', 'witness', 'refinery'];

          for (const agent of agents) {
            try {
              const { stdout } = await execAsync(
                `gt hook --json 2>/dev/null || gt hook`,
                {
                  cwd: `${gtDir}/${rig}/${agent}`,
                  timeout: 5000,
                  env: { ...process.env, GT_ROLE: agent }
                }
              );
              const hookData = this.parseHookOutput(stdout, agent);
              if (hookData) {
                rigHooks[agent] = hookData;
              }
            } catch {}
          }

          // Also check polecats
          try {
            const { stdout: polecatList } = await execAsync(
              `ls ${gtDir}/${rig}/polecats 2>/dev/null || echo ""`
            );
            const polecats = polecatList.split('\n').filter(p => p.trim());
            for (const polecat of polecats) {
              try {
                const { stdout } = await execAsync(
                  `gt hook --json 2>/dev/null || gt hook`,
                  {
                    cwd: `${gtDir}/${rig}/polecats/${polecat}`,
                    timeout: 5000
                  }
                );
                const hookData = this.parseHookOutput(stdout, polecat);
                if (hookData) {
                  rigHooks[`polecat/${polecat}`] = hookData;
                }
              } catch {}
            }
          } catch {}

          return rigHooks;
        }, `pollHooks(${rig})`);

        this.state.updateHooks(rig, hooks);
        this.failureCount[`hooks-${rig}`] = 0;
      } catch (e) {
        const key = `hooks-${rig}`;
        this.failureCount[key] = (this.failureCount[key] || 0) + 1;
        if (this.failureCount[key] <= 3) {
          logger.warn('poller', 'Hook poll failed', { rig, error: e.message });
        }
        // Emit error event for UI visibility
        this.state.addError({
          component: 'poller',
          operation: 'pollHooks',
          rig,
          severity: this.failureCount[key] >= 3 ? 'error' : 'warning',
          message: `Hook poll failed for ${rig}: ${e.message}`,
          retryCount: this.failureCount[key],
          maxRetries: RETRY_CONFIG.maxRetries
        });
      }
    }
  }

  parseHookOutput(output, agent) {
    // Try JSON first
    try {
      const data = JSON.parse(output);
      if (data.bead || data.hooked) {
        return {
          agent,
          bead: data.bead || data.hooked,
          title: data.title || '',
          molecule: data.molecule || null,
          autonomousMode: data.autonomousMode || false,
          attachedAt: data.attachedAt || null
        };
      }
      return null;
    } catch {}

    // Parse text output
    // Look for "Hooked: <bead-id>: <title>" pattern
    const hookedMatch = output.match(/Hooked:\s*(\S+)(?::\s*(.*))?/);
    if (hookedMatch) {
      return {
        agent,
        bead: hookedMatch[1],
        title: hookedMatch[2] || '',
        molecule: null,
        autonomousMode: output.includes('AUTONOMOUS MODE'),
        attachedAt: null
      };
    }

    return null;
  }
}
