/**
 * Alerting Engine
 *
 * Evaluates user-defined alert rules against state changes and events.
 * Supports conditions based on:
 * - Agent status changes
 * - Bead status changes
 * - Metric thresholds
 * - Event patterns
 * - Composite conditions (AND/OR)
 */

import { EventEmitter } from 'events';
import logger from './logger.js';

/**
 * Condition types:
 * - agent_status: Agent changes to a specific status
 * - bead_status: Bead changes to a specific status
 * - metric_threshold: Metric exceeds/falls below threshold
 * - event_pattern: Event matches a pattern
 * - bead_duration: Bead stays in status for too long
 * - error_count: Number of errors in time window
 * - composite: Combine multiple conditions with AND/OR
 */

export class AlertingEngine extends EventEmitter {
  constructor(stateManager, rulesStore) {
    super();
    this.stateManager = stateManager;
    this.rulesStore = rulesStore;
    this.rules = [];
    this.ruleState = {}; // Track last triggered time, cooldown state per rule
    this.alertHistory = []; // Recent alerts
    this.errorCounts = {}; // Track error counts per rig/agent for windowed conditions
    this.beadTimers = {}; // Track bead duration alerts
  }

  async initialize() {
    // Load rules from store
    this.rules = await this.rulesStore.loadRules();
    logger.info('alerting', 'Alerting engine initialized', { ruleCount: this.rules.length });

    // Wire up event listeners
    this.stateManager.on('update', (state) => this.evaluateStateUpdate(state));
    this.stateManager.on('event', (event) => this.evaluateEvent(event));
    this.stateManager.on('metrics', (metrics) => this.evaluateMetrics(metrics));
  }

  /**
   * Evaluate rules on state update (agent/bead status changes)
   */
  evaluateStateUpdate(state) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const { condition } = rule;

      if (condition.type === 'agent_status') {
        this.evaluateAgentStatusCondition(rule, state);
      } else if (condition.type === 'bead_status') {
        this.evaluateBeadStatusCondition(rule, state);
      } else if (condition.type === 'bead_duration') {
        this.evaluateBeadDurationCondition(rule, state);
      } else if (condition.type === 'composite') {
        this.evaluateCompositeCondition(rule, state, null, null);
      }
    }
  }

  /**
   * Evaluate rules on incoming events
   */
  evaluateEvent(event) {
    // Track error counts for error_count conditions
    if (event.type === 'log' && event.level === 'error') {
      const key = `${event.rig || 'unknown'}/${event.agent || 'unknown'}`;
      if (!this.errorCounts[key]) {
        this.errorCounts[key] = [];
      }
      this.errorCounts[key].push(Date.now());
      // Keep only last hour of error timestamps
      const oneHourAgo = Date.now() - 3600000;
      this.errorCounts[key] = this.errorCounts[key].filter(t => t > oneHourAgo);
    }

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const { condition } = rule;

      if (condition.type === 'event_pattern') {
        this.evaluateEventPatternCondition(rule, event);
      } else if (condition.type === 'error_count') {
        this.evaluateErrorCountCondition(rule, event);
      }
    }
  }

  /**
   * Evaluate rules on metrics updates
   */
  evaluateMetrics(metrics) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const { condition } = rule;

      if (condition.type === 'metric_threshold') {
        this.evaluateMetricThresholdCondition(rule, metrics);
      }
    }
  }

  /**
   * Evaluate agent status condition
   */
  evaluateAgentStatusCondition(rule, state) {
    const { condition } = rule;
    const { agent, rig, from, to } = condition;

    // Check agent history for recent status changes
    for (const [key, history] of Object.entries(state.agentHistory)) {
      const [rigName, agentName] = key.split('/');

      // Filter by rig if specified
      if (rig && rig !== '*' && rigName !== rig) continue;

      // Filter by agent if specified
      if (agent && agent !== '*' && agentName !== agent) continue;

      // Check most recent status change
      if (history.length > 0) {
        const latest = history[0];
        const previous = history[1];

        // Check if status matches
        const toMatches = !to || to === '*' || latest.status === to;
        const fromMatches = !from || from === '*' || (previous && previous.status === from);

        if (toMatches && fromMatches) {
          // Check if this is a new change (within last 10 seconds)
          const changeTime = new Date(latest.timestamp).getTime();
          if (Date.now() - changeTime < 10000) {
            this.triggerAlert(rule, {
              type: 'agent_status',
              agent: agentName,
              rig: rigName,
              from: previous?.status,
              to: latest.status,
              timestamp: latest.timestamp
            });
          }
        }
      }
    }
  }

  /**
   * Evaluate bead status condition
   */
  evaluateBeadStatusCondition(rule, state) {
    const { condition } = rule;
    const { bead, rig, from, to, priority } = condition;

    for (const [key, history] of Object.entries(state.beadHistory)) {
      const [rigName, beadId] = key.split('/');

      // Filter by rig if specified
      if (rig && rig !== '*' && rigName !== rig) continue;

      // Filter by bead if specified
      if (bead && bead !== '*' && beadId !== bead) continue;

      if (history.length > 0) {
        const latest = history[0];
        const previous = history[1];

        // Check status match
        const toMatches = !to || to === '*' || latest.status === to;
        const fromMatches = !from || from === '*' || (previous && previous.status === from);

        if (toMatches && fromMatches) {
          // Check if this is a new change
          const changeTime = new Date(latest.timestamp).getTime();
          if (Date.now() - changeTime < 10000) {
            // If priority filter is set, check bead priority
            if (priority) {
              const beads = state.beads[rigName] || [];
              const beadData = beads.find(b => b.id === beadId);
              if (beadData && beadData.priority !== priority) continue;
            }

            this.triggerAlert(rule, {
              type: 'bead_status',
              beadId,
              rig: rigName,
              from: previous?.status,
              to: latest.status,
              timestamp: latest.timestamp
            });
          }
        }
      }
    }
  }

  /**
   * Evaluate bead duration condition (bead stays in status too long)
   */
  evaluateBeadDurationCondition(rule, state) {
    const { condition } = rule;
    const { status, durationMs, rig } = condition;

    for (const [rigName, beads] of Object.entries(state.beads)) {
      if (rig && rig !== '*' && rigName !== rig) continue;

      for (const bead of beads) {
        if (bead.status === status) {
          const key = `${rule.id}:${rigName}/${bead.id}`;
          const history = state.beadHistory[`${rigName}/${bead.id}`] || [];

          // Find when bead entered this status
          const currentStatusEntry = history.find(h => h.status === status);
          if (currentStatusEntry) {
            const enteredAt = new Date(currentStatusEntry.timestamp).getTime();
            const duration = Date.now() - enteredAt;

            if (duration >= durationMs) {
              // Only trigger once per bead per rule
              if (!this.beadTimers[key]) {
                this.beadTimers[key] = true;
                this.triggerAlert(rule, {
                  type: 'bead_duration',
                  beadId: bead.id,
                  rig: rigName,
                  status,
                  duration,
                  threshold: durationMs
                });
              }
            }
          }
        } else {
          // Reset timer if bead left the status
          const key = `${rule.id}:${rigName}/${bead.id}`;
          delete this.beadTimers[key];
        }
      }
    }
  }

  /**
   * Evaluate metric threshold condition
   */
  evaluateMetricThresholdCondition(rule, metrics) {
    const { condition } = rule;
    const { metric, operator, threshold } = condition;

    // Get metric value (supports nested paths like 'agentActivity.error')
    const value = this.getNestedValue(metrics, metric);
    if (value === undefined) return;

    let triggered = false;
    switch (operator) {
      case '>':
        triggered = value > threshold;
        break;
      case '>=':
        triggered = value >= threshold;
        break;
      case '<':
        triggered = value < threshold;
        break;
      case '<=':
        triggered = value <= threshold;
        break;
      case '==':
        triggered = value === threshold;
        break;
      case '!=':
        triggered = value !== threshold;
        break;
    }

    if (triggered) {
      this.triggerAlert(rule, {
        type: 'metric_threshold',
        metric,
        value,
        operator,
        threshold
      });
    }
  }

  /**
   * Evaluate event pattern condition
   */
  evaluateEventPatternCondition(rule, event) {
    const { condition } = rule;
    const { eventType, source, pattern, level } = condition;

    // Check event type
    if (eventType && eventType !== '*' && event.type !== eventType) return;

    // Check source (rig)
    if (source && source !== '*' && event.source !== source && event.rig !== source) return;

    // Check log level (for log events)
    if (level && event.type === 'log' && event.level !== level) return;

    // Check pattern match (in message, content, or action)
    if (pattern) {
      const regex = new RegExp(pattern, 'i');
      const content = event.content || event.message || event.action || '';
      if (!regex.test(content)) return;
    }

    this.triggerAlert(rule, {
      type: 'event_pattern',
      event,
      matchedPattern: pattern
    });
  }

  /**
   * Evaluate error count condition (X errors in Y minutes)
   */
  evaluateErrorCountCondition(rule, event) {
    if (event.type !== 'log' || event.level !== 'error') return;

    const { condition } = rule;
    const { count, windowMs, agent, rig } = condition;

    const key = `${rig || event.rig || '*'}/${agent || event.agent || '*'}`;

    // Count errors in window
    const windowStart = Date.now() - windowMs;
    let errorCount = 0;

    for (const [errorKey, timestamps] of Object.entries(this.errorCounts)) {
      // Match key pattern
      const [errorRig, errorAgent] = errorKey.split('/');
      const rigMatches = !rig || rig === '*' || errorRig === rig;
      const agentMatches = !agent || agent === '*' || errorAgent === agent;

      if (rigMatches && agentMatches) {
        errorCount += timestamps.filter(t => t > windowStart).length;
      }
    }

    if (errorCount >= count) {
      this.triggerAlert(rule, {
        type: 'error_count',
        count: errorCount,
        threshold: count,
        windowMs,
        rig: rig || event.rig,
        agent: agent || event.agent
      });
    }
  }

  /**
   * Evaluate composite condition (AND/OR of multiple conditions)
   */
  evaluateCompositeCondition(rule, state, event, metrics) {
    const { condition } = rule;
    const { logic, conditions } = condition;

    const results = conditions.map(subCondition => {
      // Create a temporary rule for each sub-condition
      const tempRule = { ...rule, condition: subCondition, _isSubRule: true };
      return this.evaluateCondition(tempRule, state, event, metrics);
    });

    const triggered = logic === 'AND'
      ? results.every(r => r)
      : results.some(r => r);

    if (triggered) {
      this.triggerAlert(rule, {
        type: 'composite',
        logic,
        matchedConditions: conditions.filter((_, i) => results[i])
      });
    }
  }

  /**
   * Evaluate a single condition and return boolean
   */
  evaluateCondition(rule, state, event, metrics) {
    const { condition } = rule;
    // This is used for composite conditions - simplified evaluation
    // Returns true if condition would trigger
    switch (condition.type) {
      case 'metric_threshold':
        if (!metrics) return false;
        const value = this.getNestedValue(metrics, condition.metric);
        if (value === undefined) return false;
        return this.compareValues(value, condition.operator, condition.threshold);
      default:
        return false;
    }
  }

  /**
   * Compare values with operator
   */
  compareValues(value, operator, threshold) {
    switch (operator) {
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Trigger an alert
   */
  triggerAlert(rule, context) {
    // Check cooldown
    const ruleState = this.ruleState[rule.id] || { lastTriggered: 0 };
    const cooldownMs = (rule.cooldown || 60) * 1000; // Default 60 second cooldown

    if (Date.now() - ruleState.lastTriggered < cooldownMs) {
      return; // Still in cooldown
    }

    // Update rule state
    this.ruleState[rule.id] = {
      lastTriggered: Date.now(),
      triggerCount: (ruleState.triggerCount || 0) + 1
    };

    // Create alert record
    const alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      timestamp: new Date().toISOString(),
      context,
      actions: rule.actions
    };

    // Add to history
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(0, 100);
    }

    logger.info('alerting', 'Alert triggered', {
      rule: rule.name,
      type: context.type
    });

    // Execute actions
    this.executeActions(rule, alert);

    // Emit alert event for WebSocket broadcast
    this.emit('alert', alert);
  }

  /**
   * Execute alert actions
   */
  executeActions(rule, alert) {
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'log':
            const level = action.level || 'warn';
            logger[level]('alert', `Alert: ${rule.name}`, alert.context);
            break;

          case 'webhook':
            this.executeWebhookAction(action, alert);
            break;

          // toast and other UI actions are handled client-side
          // by broadcasting the alert via WebSocket
        }
      } catch (err) {
        logger.error('alerting', 'Error executing action', {
          action: action.type,
          error: err.message
        });
      }
    }
  }

  /**
   * Execute webhook action
   */
  async executeWebhookAction(action, alert) {
    const { url, method = 'POST', headers = {} } = action;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          alert: {
            id: alert.id,
            rule: alert.ruleName,
            timestamp: alert.timestamp,
            context: alert.context
          }
        })
      });

      if (!response.ok) {
        logger.error('alerting', 'Webhook failed', {
          url,
          status: response.status
        });
      }
    } catch (err) {
      logger.error('alerting', 'Webhook error', {
        url,
        error: err.message
      });
    }
  }

  /**
   * Get all rules
   */
  getRules() {
    return this.rules;
  }

  /**
   * Get a single rule by ID
   */
  getRule(id) {
    return this.rules.find(r => r.id === id);
  }

  /**
   * Create a new rule
   */
  async createRule(rule) {
    const newRule = {
      id: `rule-${Date.now()}`,
      enabled: true,
      cooldown: 60,
      createdAt: new Date().toISOString(),
      ...rule
    };

    this.rules.push(newRule);
    await this.rulesStore.saveRules(this.rules);

    logger.info('alerting', 'Rule created', { id: newRule.id, name: newRule.name });
    return newRule;
  }

  /**
   * Update an existing rule
   */
  async updateRule(id, updates) {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Rule not found: ${id}`);
    }

    this.rules[index] = {
      ...this.rules[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.rulesStore.saveRules(this.rules);

    logger.info('alerting', 'Rule updated', { id });
    return this.rules[index];
  }

  /**
   * Delete a rule
   */
  async deleteRule(id) {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Rule not found: ${id}`);
    }

    this.rules.splice(index, 1);
    delete this.ruleState[id];

    await this.rulesStore.saveRules(this.rules);

    logger.info('alerting', 'Rule deleted', { id });
  }

  /**
   * Toggle rule enabled/disabled
   */
  async toggleRule(id) {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    rule.enabled = !rule.enabled;
    await this.rulesStore.saveRules(this.rules);

    logger.info('alerting', 'Rule toggled', { id, enabled: rule.enabled });
    return rule;
  }

  /**
   * Get alert history
   */
  getAlertHistory() {
    return this.alertHistory;
  }

  /**
   * Get rule statistics
   */
  getRuleStats(id) {
    const state = this.ruleState[id];
    if (!state) {
      return { triggerCount: 0, lastTriggered: null };
    }
    return {
      triggerCount: state.triggerCount,
      lastTriggered: state.lastTriggered
        ? new Date(state.lastTriggered).toISOString()
        : null
    };
  }

  /**
   * Test a rule against current state (for rule builder preview)
   */
  testRule(rule) {
    const state = this.stateManager.getState();
    const results = [];

    // Simulate evaluation based on condition type
    const { condition } = rule;

    switch (condition.type) {
      case 'metric_threshold':
        const metrics = state.metrics;
        const value = this.getNestedValue(metrics, condition.metric);
        const triggered = this.compareValues(value, condition.operator, condition.threshold);
        results.push({
          condition: `${condition.metric} ${condition.operator} ${condition.threshold}`,
          currentValue: value,
          wouldTrigger: triggered
        });
        break;

      case 'agent_status':
        for (const [key, history] of Object.entries(state.agentHistory)) {
          const [rig, agent] = key.split('/');
          if (history.length > 0) {
            const latest = history[0];
            const matchesTo = !condition.to || condition.to === '*' || latest.status === condition.to;
            results.push({
              agent: `${rig}/${agent}`,
              currentStatus: latest.status,
              wouldTrigger: matchesTo
            });
          }
        }
        break;

      case 'bead_status':
        for (const [rigName, beads] of Object.entries(state.beads)) {
          for (const bead of beads) {
            const matchesTo = !condition.to || condition.to === '*' || bead.status === condition.to;
            results.push({
              bead: `${rigName}/${bead.id}`,
              currentStatus: bead.status,
              wouldTrigger: matchesTo
            });
          }
        }
        break;

      default:
        results.push({
          message: 'Test not available for this condition type'
        });
    }

    return results;
  }
}
