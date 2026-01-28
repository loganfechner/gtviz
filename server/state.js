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
      events: []
    };
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
}
