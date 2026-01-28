import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ErrorPatternAnalyzer } from './error-patterns.js';

const GT_DIR = process.env.GT_DIR || join(homedir(), 'gt');
const STATE_DIR = join(GT_DIR, '.gtviz');
const STATE_FILE = join(STATE_DIR, 'state.json');

/**
 * @typedef {import('./types.js').State} State
 * @typedef {import('./types.js').Agent} Agent
 * @typedef {import('./types.js').Bead} Bead
 * @typedef {import('./types.js').Rig} Rig
 * @typedef {import('./types.js').Event} Event
 * @typedef {import('./types.js').LogEntry} LogEntry
 * @typedef {import('./types.js').Metrics} Metrics
 * @typedef {import('./types.js').AgentStats} AgentStats
 * @typedef {import('./types.js').AgentCompletion} AgentCompletion
 * @typedef {import('./types.js').HookData} HookData
 */

/**
 * StateManager - Centralized state management for gtviz
 *
 * Manages all application state including rigs, agents, beads, hooks,
 * events, logs, and metrics. Emits events on state changes for reactive updates.
 *
 * @extends EventEmitter
 */
export class StateManager extends EventEmitter {
  constructor() {
    super();
    /** @type {State} */
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
      agentStats: {},    // Performance stats per agent: completions, durations
      errorPatterns: {   // Error pattern analysis
        patterns: [],
        summary: {
          totalPatterns: 0,
          totalErrors: 0,
          systemicCount: 0,
          isolatedCount: 0,
          errorCount: 0,
          warnCount: 0,
          affectedAgentsCount: 0,
          topPatterns: []
        }
      }
    };
    /** @type {Object<string, string>} */
    this.previousStatus = {};
    /** @type {Object<string, string>} */
    this.previousBeadStatus = {};
    /** @type {ErrorPatternAnalyzer} */
    this.errorPatternAnalyzer = new ErrorPatternAnalyzer();
  }

  /**
   * Save current state to disk for persistence across restarts
   * @returns {boolean} True if save succeeded, false otherwise
   */
  saveState() {
    try {
      if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
      }
      const snapshot = {
        version: 1,
        savedAt: new Date().toISOString(),
        state: this.state,
        previousStatus: this.previousStatus,
        previousBeadStatus: this.previousBeadStatus
      };
      writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Load state from disk if available
   * @returns {boolean} True if state was restored, false otherwise
   */
  loadState() {
    try {
      if (!existsSync(STATE_FILE)) {
        return false;
      }
      const data = readFileSync(STATE_FILE, 'utf-8');
      const snapshot = JSON.parse(data);

      if (snapshot.version !== 1) {
        return false;
      }

      // Restore state
      this.state = snapshot.state;
      this.previousStatus = snapshot.previousStatus || {};
      this.previousBeadStatus = snapshot.previousBeadStatus || {};

      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get the path to the state file (for logging)
   * @returns {string} Path to state file
   */
  static getStatePath() {
    return STATE_FILE;
  }

  /**
   * Get the current application state
   * @returns {State} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get list of rig names
   * @returns {string[]} Array of rig names
   */
  getRigs() {
    return Object.keys(this.state.rigs);
  }

  /**
   * Update rig data
   * @param {Object<string, Rig>} rigs - Rigs by name
   */
  updateRigs(rigs) {
    this.state.rigs = rigs;
    this.emit('update', this.state);
  }

  /**
   * Update agents for a rig, tracking status changes in history
   * @param {string} rigName - Rig name
   * @param {Agent[]} agents - Array of agent objects
   */
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

  /**
   * Update beads for a rig, tracking status changes in history
   * @param {string} rigName - Rig name
   * @param {Bead[]} beads - Array of bead objects
   */
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

  /**
   * Update hook data for a rig
   * @param {string} rigName - Rig name
   * @param {Object<string, HookData>} hooks - Hooks by agent name
   */
  updateHooks(rigName, hooks) {
    this.state.hooks[rigName] = hooks;
    this.emit('update', this.state);
  }

  /**
   * Add an event to the event stream
   * @param {Event} event - Event object
   */
  addEvent(event) {
    this.state.events.unshift(event);
    if (this.state.events.length > 100) {
      this.state.events = this.state.events.slice(0, 100);
    }
    this.emit('event', event);
  }

  /**
   * Add a mail message to the mail list
   * @param {Object} mail - Mail object with from, to, subject, etc.
   */
  addMail(mail) {
    this.state.mail.unshift(mail);
    if (this.state.mail.length > 50) {
      this.state.mail = this.state.mail.slice(0, 50);
    }
    this.emit('event', { type: 'mail', ...mail });
  }

  /**
   * Update system metrics
   * @param {Metrics} metrics - Metrics snapshot
   */
  updateMetrics(metrics) {
    this.state.metrics = metrics;
    this.emit('metrics', metrics);
  }

  /**
   * Add a log entry to the logs list
   * @param {LogEntry} log - Parsed log entry
   */
  addLog(log) {
    this.state.logs.unshift(log);
    if (this.state.logs.length > 500) {
      this.state.logs = this.state.logs.slice(0, 500);
    }
    this.emit('event', { type: 'log', ...log });

    // Update error pattern analysis for error/warn logs
    if (log.level === 'error' || log.level === 'warn') {
      this.errorPatternAnalyzer.addLog(log);
      this.updateErrorPatterns();
    }
  }

  updateErrorPatterns() {
    this.state.errorPatterns = {
      patterns: this.errorPatternAnalyzer.getPatterns(),
      summary: this.errorPatternAnalyzer.getSummary()
    };
    this.emit('errorPatterns', this.state.errorPatterns);
  }

  getErrorPatterns() {
    return this.state.errorPatterns;
  }

  /**
   * Add an error to the error list
   * @param {Object} error - Error object with message, source, etc.
   */
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

  /**
   * Clear a specific error by ID
   * @param {string} errorId - Error ID to clear
   */
  clearError(errorId) {
    this.state.errors = this.state.errors.filter(e => e.id !== errorId);
    this.emit('update', this.state);
  }

  /**
   * Get all current errors
   * @returns {Object[]} Array of error objects
   */
  getErrors() {
    return this.state.errors;
  }

  /**
   * Update agent statistics for performance tracking
   * @param {string} agentKey - Agent key (rig/agentName)
   * @param {Object} stats - Stats update
   * @param {AgentCompletion} [stats.completion] - Completion to record
   */
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

  /**
   * Get statistics for a specific agent
   * @param {string} agentKey - Agent key (rig/agentName)
   * @returns {AgentStats|null} Agent stats or null if not found
   */
  getAgentStats(agentKey) {
    return this.state.agentStats[agentKey] || null;
  }
}
