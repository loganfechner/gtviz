import { EventEmitter } from 'events';

export class StateManager extends EventEmitter {
  constructor() {
    super();
    this.state = {
      rigs: {},
      agents: {},
      beads: {},
      hooks: {},
      mail: [],
      events: [],
      errors: [],        // Backend errors (poll failures, file watcher errors)
      agentHistory: {},  // Track status changes per agent
      metrics: {},       // System metrics
      beadHistory: {},   // Track status changes per bead
      logs: [],          // Log entries from town.log, daemon.log
      agentStats: {}     // Performance stats per agent: completions, durations
    };
    this.previousStatus = {};  // For detecting agent status changes
    this.previousBeadStatus = {};  // For detecting bead status changes
  }

  getState() {
    return this.state;
  }

  getRigs() {
    return Object.keys(this.state.rigs);
  }

  updateRigs(rigs) {
    this.state.rigs = rigs;
    this.emit('update', this.state);
  }

  updateAgents(rigName, agents) {
    // Track status changes in history
    for (const agent of agents) {
      const key = `${rigName}/${agent.name}`;
      const prevStatus = this.previousStatus[key];

      if (prevStatus !== agent.status) {
        // Status changed - record in history
        if (!this.state.agentHistory[key]) {
          this.state.agentHistory[key] = [];
        }
        this.state.agentHistory[key].unshift({
          status: agent.status,
          timestamp: new Date().toISOString(),
          agent: agent.name,
          rig: rigName
        });
        // Keep last 50 entries per agent
        if (this.state.agentHistory[key].length > 50) {
          this.state.agentHistory[key] = this.state.agentHistory[key].slice(0, 50);
        }
        this.previousStatus[key] = agent.status;
      }
    }

    this.state.agents[rigName] = agents;
    this.emit('update', this.state);
  }

  updateBeads(rigName, beads) {
    // Track status changes in history
    for (const bead of beads) {
      const key = `${rigName}/${bead.id}`;
      const prevStatus = this.previousBeadStatus[key];

      if (prevStatus !== bead.status) {
        // Status changed - record in history
        if (!this.state.beadHistory[key]) {
          this.state.beadHistory[key] = [];
        }
        this.state.beadHistory[key].unshift({
          status: bead.status,
          timestamp: new Date().toISOString(),
          beadId: bead.id,
          rig: rigName
        });
        // Keep last 50 entries per bead
        if (this.state.beadHistory[key].length > 50) {
          this.state.beadHistory[key] = this.state.beadHistory[key].slice(0, 50);
        }
        this.previousBeadStatus[key] = bead.status;

        // Add event for status change
        if (prevStatus) {
          this.addEvent({
            type: 'bead_status_change',
            beadId: bead.id,
            rig: rigName,
            from: prevStatus,
            to: bead.status,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Attach status history to bead for display in modal
      bead.statusHistory = this.state.beadHistory[key] || [];
    }

    this.state.beads[rigName] = beads;
    this.emit('update', this.state);
  }

  updateHooks(rigName, hooks) {
    this.state.hooks[rigName] = hooks;
    this.emit('update', this.state);
  }

  addEvent(event) {
    this.state.events.unshift(event);
    // Keep only last 100 events
    if (this.state.events.length > 100) {
      this.state.events = this.state.events.slice(0, 100);
    }
    this.emit('event', event);
  }

  addMail(mail) {
    this.state.mail.unshift(mail);
    if (this.state.mail.length > 50) {
      this.state.mail = this.state.mail.slice(0, 50);
    }
    this.emit('event', { type: 'mail', ...mail });
  }

  updateMetrics(metrics) {
    this.state.metrics = metrics;
    this.emit('metrics', metrics);
  }

  addLog(log) {
    this.state.logs.unshift(log);
    if (this.state.logs.length > 500) {
      this.state.logs = this.state.logs.slice(0, 500);
    }
    this.emit('event', { type: 'log', ...log });
  }

  addError(error) {
    const errorEvent = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...error
    };
    this.state.errors.unshift(errorEvent);
    // Keep only last 50 errors
    if (this.state.errors.length > 50) {
      this.state.errors = this.state.errors.slice(0, 50);
    }
    this.emit('error', errorEvent);
    // Also emit as event so it shows in the event log
    this.emit('event', { type: 'error', ...errorEvent });
  }

  clearError(errorId) {
    this.state.errors = this.state.errors.filter(e => e.id !== errorId);
    this.emit('update', this.state);
  }

  getErrors() {
    return this.state.errors;
  }

  updateAgentStats(agentKey, stats) {
    if (!this.state.agentStats[agentKey]) {
      this.state.agentStats[agentKey] = {
        completions: [],
        totalCompleted: 0,
        avgDuration: 0
      };
    }
    const agentStats = this.state.agentStats[agentKey];

    if (stats.completion) {
      agentStats.completions.unshift(stats.completion);
      if (agentStats.completions.length > 50) {
        agentStats.completions = agentStats.completions.slice(0, 50);
      }
      agentStats.totalCompleted = agentStats.completions.length;

      // Calculate average duration
      const durations = agentStats.completions
        .filter(c => c.duration)
        .map(c => c.duration);
      if (durations.length > 0) {
        agentStats.avgDuration = Math.round(
          durations.reduce((a, b) => a + b, 0) / durations.length
        );
      }
    }

    this.emit('update', this.state);
  }

  getAgentStats(agentKey) {
    return this.state.agentStats[agentKey] || null;
  }
}
