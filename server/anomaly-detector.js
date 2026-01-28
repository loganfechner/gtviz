/**
 * Anomaly Detector
 *
 * Detects anomalies in system metrics and generates alerts:
 * - Slow response times (poll duration exceeds threshold)
 * - Low success rates (poll failures exceed threshold)
 * - Agent status anomalies (unexpected error states, rapid status changes)
 * - High error rates in logs
 */

import { EventEmitter } from 'events';

/**
 * Alert severity levels
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

/**
 * Alert types
 */
export const AlertType = {
  SLOW_RESPONSE: 'slow_response',
  LOW_SUCCESS_RATE: 'low_success_rate',
  AGENT_ERROR: 'agent_error',
  AGENT_STATUS_FLAPPING: 'agent_status_flapping',
  HIGH_ERROR_RATE: 'high_error_rate',
  STALE_DATA: 'stale_data',
  CONNECTION_LOSS: 'connection_loss'
};

/**
 * Default thresholds for anomaly detection
 */
const DEFAULT_THRESHOLDS = {
  // Poll response time thresholds (ms)
  pollDurationWarning: 2000,    // 2 seconds
  pollDurationCritical: 5000,   // 5 seconds

  // Poll success rate thresholds (percentage)
  successRateWarning: 90,       // Below 90%
  successRateCritical: 70,      // Below 70%

  // Minimum polls before evaluating success rate
  minPollsForEvaluation: 5,

  // Agent status flapping detection
  statusChangesWarning: 5,      // 5 changes in evaluation window
  statusChangesEvaluationMs: 60000, // 1 minute window

  // Error log rate thresholds (per minute)
  errorRateWarning: 5,
  errorRateCritical: 15,

  // Stale data threshold (ms without updates)
  staleDataThreshold: 30000     // 30 seconds
};

/**
 * Create an anomaly detector
 * @param {Object} options - Configuration options
 * @param {Object} options.thresholds - Custom thresholds (merged with defaults)
 * @param {number} options.evaluationIntervalMs - How often to evaluate (default: 5000)
 * @param {number} options.alertCooldownMs - Cooldown between same alerts (default: 60000)
 * @param {number} options.maxAlerts - Maximum active alerts to keep (default: 100)
 * @returns {Object} Anomaly detector
 */
export function createAnomalyDetector(options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const evaluationIntervalMs = options.evaluationIntervalMs || 5000;
  const alertCooldownMs = options.alertCooldownMs || 60000;
  const maxAlerts = options.maxAlerts || 100;

  const emitter = new EventEmitter();
  const activeAlerts = [];
  const alertCooldowns = new Map(); // type:key -> timestamp
  const statusChangeHistory = new Map(); // agentKey -> [{ timestamp, status }]
  const errorLogCounts = { current: 0, lastReset: Date.now() };

  let evaluationInterval = null;
  let lastMetrics = null;
  let lastUpdateTime = Date.now();

  /**
   * Generate a unique ID for an alert
   */
  function generateAlertId() {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if we should throttle this alert type
   */
  function shouldThrottle(type, key = '') {
    const cooldownKey = `${type}:${key}`;
    const lastAlert = alertCooldowns.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert < alertCooldownMs) {
      return true;
    }
    return false;
  }

  /**
   * Record alert sent (for throttling)
   */
  function recordAlertSent(type, key = '') {
    const cooldownKey = `${type}:${key}`;
    alertCooldowns.set(cooldownKey, Date.now());
  }

  /**
   * Create and emit a new alert
   */
  function createAlert(type, severity, message, details = {}) {
    const key = details.agentKey || details.rig || '';

    if (shouldThrottle(type, key)) {
      return null;
    }

    const alert = {
      id: generateAlertId(),
      type,
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false
    };

    activeAlerts.unshift(alert);
    if (activeAlerts.length > maxAlerts) {
      activeAlerts.pop();
    }

    recordAlertSent(type, key);
    emitter.emit('alert', alert);
    return alert;
  }

  /**
   * Evaluate metrics for anomalies
   */
  function evaluateMetrics(metrics) {
    if (!metrics) return;

    lastMetrics = metrics;
    lastUpdateTime = Date.now();

    // Check poll duration
    if (metrics.avgPollDuration >= thresholds.pollDurationCritical) {
      createAlert(
        AlertType.SLOW_RESPONSE,
        AlertSeverity.CRITICAL,
        `Critical: Average poll duration is ${metrics.avgPollDuration}ms (threshold: ${thresholds.pollDurationCritical}ms)`,
        { avgPollDuration: metrics.avgPollDuration, threshold: thresholds.pollDurationCritical }
      );
    } else if (metrics.avgPollDuration >= thresholds.pollDurationWarning) {
      createAlert(
        AlertType.SLOW_RESPONSE,
        AlertSeverity.WARNING,
        `Warning: Average poll duration is ${metrics.avgPollDuration}ms (threshold: ${thresholds.pollDurationWarning}ms)`,
        { avgPollDuration: metrics.avgPollDuration, threshold: thresholds.pollDurationWarning }
      );
    }

    // Check success rate (only after enough polls)
    if (metrics.totalPolls >= thresholds.minPollsForEvaluation) {
      if (metrics.successRate < thresholds.successRateCritical) {
        createAlert(
          AlertType.LOW_SUCCESS_RATE,
          AlertSeverity.CRITICAL,
          `Critical: Poll success rate is ${metrics.successRate}% (threshold: ${thresholds.successRateCritical}%)`,
          { successRate: metrics.successRate, threshold: thresholds.successRateCritical }
        );
      } else if (metrics.successRate < thresholds.successRateWarning) {
        createAlert(
          AlertType.LOW_SUCCESS_RATE,
          AlertSeverity.WARNING,
          `Warning: Poll success rate is ${metrics.successRate}% (threshold: ${thresholds.successRateWarning}%)`,
          { successRate: metrics.successRate, threshold: thresholds.successRateWarning }
        );
      }
    }

    // Check agent activity for errors
    if (metrics.agentActivity && metrics.agentActivity.error > 0) {
      createAlert(
        AlertType.AGENT_ERROR,
        AlertSeverity.WARNING,
        `${metrics.agentActivity.error} agent(s) in error state`,
        { errorCount: metrics.agentActivity.error }
      );
    }
  }

  /**
   * Track agent status change for flapping detection
   */
  function trackAgentStatusChange(agentKey, status) {
    if (!statusChangeHistory.has(agentKey)) {
      statusChangeHistory.set(agentKey, []);
    }

    const history = statusChangeHistory.get(agentKey);
    const now = Date.now();

    // Add new status
    history.push({ timestamp: now, status });

    // Clean old entries
    const cutoff = now - thresholds.statusChangesEvaluationMs;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    // Check for flapping (rapid status changes)
    if (history.length >= thresholds.statusChangesWarning) {
      createAlert(
        AlertType.AGENT_STATUS_FLAPPING,
        AlertSeverity.WARNING,
        `Agent ${agentKey} status changing rapidly (${history.length} changes in last minute)`,
        { agentKey, changeCount: history.length }
      );
    }
  }

  /**
   * Record an error log entry
   */
  function recordErrorLog(logEntry) {
    const now = Date.now();

    // Reset counter every minute
    if (now - errorLogCounts.lastReset >= 60000) {
      // Check error rate before resetting
      if (errorLogCounts.current >= thresholds.errorRateCritical) {
        createAlert(
          AlertType.HIGH_ERROR_RATE,
          AlertSeverity.CRITICAL,
          `Critical: ${errorLogCounts.current} errors in last minute (threshold: ${thresholds.errorRateCritical})`,
          { errorCount: errorLogCounts.current, threshold: thresholds.errorRateCritical }
        );
      } else if (errorLogCounts.current >= thresholds.errorRateWarning) {
        createAlert(
          AlertType.HIGH_ERROR_RATE,
          AlertSeverity.WARNING,
          `Warning: ${errorLogCounts.current} errors in last minute (threshold: ${thresholds.errorRateWarning})`,
          { errorCount: errorLogCounts.current, threshold: thresholds.errorRateWarning }
        );
      }

      errorLogCounts.current = 0;
      errorLogCounts.lastReset = now;
    }

    errorLogCounts.current++;
  }

  /**
   * Check for stale data (called periodically)
   */
  function checkStaleData() {
    const timeSinceUpdate = Date.now() - lastUpdateTime;
    if (timeSinceUpdate >= thresholds.staleDataThreshold) {
      createAlert(
        AlertType.STALE_DATA,
        AlertSeverity.WARNING,
        `No data updates for ${Math.round(timeSinceUpdate / 1000)} seconds`,
        { timeSinceUpdate }
      );
    }
  }

  return {
    /**
     * Start the anomaly detector
     */
    start() {
      if (evaluationInterval) return;

      evaluationInterval = setInterval(() => {
        if (lastMetrics) {
          evaluateMetrics(lastMetrics);
        }
        checkStaleData();
      }, evaluationIntervalMs);
    },

    /**
     * Stop the anomaly detector
     */
    stop() {
      if (evaluationInterval) {
        clearInterval(evaluationInterval);
        evaluationInterval = null;
      }
    },

    /**
     * Process new metrics
     * @param {Object} metrics - Metrics from the metrics collector
     */
    processMetrics(metrics) {
      lastUpdateTime = Date.now();
      evaluateMetrics(metrics);
    },

    /**
     * Process agent status change
     * @param {string} agentKey - Agent key (rig/agentName)
     * @param {string} status - New status
     * @param {string} previousStatus - Previous status
     */
    processAgentStatusChange(agentKey, status, previousStatus) {
      lastUpdateTime = Date.now();
      trackAgentStatusChange(agentKey, status);

      // Alert on transition to error state
      if (status === 'error' && previousStatus !== 'error') {
        createAlert(
          AlertType.AGENT_ERROR,
          AlertSeverity.WARNING,
          `Agent ${agentKey} entered error state`,
          { agentKey, previousStatus, currentStatus: status }
        );
      }
    },

    /**
     * Process a log entry
     * @param {Object} logEntry - Log entry object
     */
    processLogEntry(logEntry) {
      lastUpdateTime = Date.now();
      if (logEntry.level === 'error') {
        recordErrorLog(logEntry);
      }
    },

    /**
     * Get all active alerts
     * @returns {Array} Active alerts
     */
    getAlerts() {
      return [...activeAlerts];
    },

    /**
     * Get unacknowledged alerts
     * @returns {Array} Unacknowledged alerts
     */
    getUnacknowledgedAlerts() {
      return activeAlerts.filter(a => !a.acknowledged && !a.resolved);
    },

    /**
     * Acknowledge an alert
     * @param {string} alertId - Alert ID to acknowledge
     * @returns {boolean} True if alert was found and acknowledged
     */
    acknowledgeAlert(alertId) {
      const alert = activeAlerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        alert.acknowledgedAt = new Date().toISOString();
        emitter.emit('alertUpdated', alert);
        return true;
      }
      return false;
    },

    /**
     * Resolve an alert
     * @param {string} alertId - Alert ID to resolve
     * @returns {boolean} True if alert was found and resolved
     */
    resolveAlert(alertId) {
      const alert = activeAlerts.find(a => a.id === alertId);
      if (alert) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        emitter.emit('alertUpdated', alert);
        return true;
      }
      return false;
    },

    /**
     * Dismiss an alert (remove from active list)
     * @param {string} alertId - Alert ID to dismiss
     * @returns {boolean} True if alert was found and dismissed
     */
    dismissAlert(alertId) {
      const index = activeAlerts.findIndex(a => a.id === alertId);
      if (index !== -1) {
        const [dismissed] = activeAlerts.splice(index, 1);
        emitter.emit('alertDismissed', dismissed);
        return true;
      }
      return false;
    },

    /**
     * Clear all alerts
     */
    clearAlerts() {
      activeAlerts.length = 0;
      emitter.emit('alertsCleared');
    },

    /**
     * Get current thresholds
     * @returns {Object} Current thresholds
     */
    getThresholds() {
      return { ...thresholds };
    },

    /**
     * Update thresholds
     * @param {Object} newThresholds - New threshold values to merge
     */
    updateThresholds(newThresholds) {
      Object.assign(thresholds, newThresholds);
    },

    /**
     * Subscribe to alert events
     * @param {string} event - Event name ('alert', 'alertUpdated', 'alertDismissed', 'alertsCleared')
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
      emitter.on(event, handler);
    },

    /**
     * Unsubscribe from alert events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    off(event, handler) {
      emitter.off(event, handler);
    }
  };
}
