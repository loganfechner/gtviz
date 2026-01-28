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
      agentHistory: {},  // Track status changes per agent
      metrics: {}        // System metrics
    };
    this.previousStatus = {};  // For detecting changes
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
}
