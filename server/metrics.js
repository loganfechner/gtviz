/**
 * Metrics Collector
 *
 * Tracks performance metrics for gtviz:
 * - Poll response times
 * - Update frequency
 * - Agent activity rates
 * - Event volume over time
 */

/**
 * Create a metrics collector
 * @param {number} historySize - Number of data points to retain (default: 60 for 1 hour at 1/min)
 * @returns {Object} Metrics collector
 */
export function createMetricsCollector(historySize = 60) {
  // Circular buffers for historical data
  const pollDurations = [];      // ms per poll
  const eventVolume = [];        // events per interval
  const timestamps = [];         // ISO timestamps for each data point

  // Current interval counters
  let currentIntervalEvents = 0;
  let lastIntervalTime = Date.now();
  const INTERVAL_MS = 60000;     // 1 minute intervals for historical data

  // Real-time metrics
  let lastPollDuration = 0;
  let totalPolls = 0;
  let totalEvents = 0;

  // Agent activity tracking
  const agentActivity = {
    active: 0,
    hooked: 0,
    idle: 0,
    error: 0
  };

  /**
   * Add value to circular buffer
   */
  function addToBuffer(buffer, value) {
    buffer.push(value);
    if (buffer.length > historySize) {
      buffer.shift();
    }
  }

  /**
   * Maybe rotate interval (called periodically)
   */
  function maybeRotateInterval() {
    const now = Date.now();
    if (now - lastIntervalTime >= INTERVAL_MS) {
      addToBuffer(eventVolume, currentIntervalEvents);
      addToBuffer(timestamps, new Date().toISOString());
      currentIntervalEvents = 0;
      lastIntervalTime = now;
    }
  }

  return {
    /**
     * Record a poll duration
     * @param {number} durationMs - Time taken for poll in milliseconds
     */
    recordPollDuration(durationMs) {
      lastPollDuration = durationMs;
      totalPolls++;
      addToBuffer(pollDurations, durationMs);
      maybeRotateInterval();
    },

    /**
     * Record a state change event
     * @param {number} changeCount - Number of changes in this update
     */
    recordStateChange(changeCount) {
      currentIntervalEvents += changeCount;
      totalEvents += changeCount;
      maybeRotateInterval();
    },

    /**
     * Update agent activity counts
     * @param {Object} hooks - Map of agent name to hook status
     */
    updateAgentActivity(hooks) {
      agentActivity.active = 0;
      agentActivity.hooked = 0;
      agentActivity.idle = 0;
      agentActivity.error = 0;

      for (const hook of Object.values(hooks)) {
        if (hook.status === 'error') {
          agentActivity.error++;
        } else if (hook.status === 'active') {
          agentActivity.active++;
        } else if (hook.beadId) {
          agentActivity.hooked++;
        } else {
          agentActivity.idle++;
        }
      }
    },

    /**
     * Get current metrics snapshot
     * @returns {Object} Current metrics
     */
    getMetrics() {
      maybeRotateInterval();

      // Calculate averages
      const avgPollDuration = pollDurations.length > 0
        ? Math.round(pollDurations.reduce((a, b) => a + b, 0) / pollDurations.length)
        : 0;

      // Calculate update frequency (events per minute over last 5 intervals)
      const recentEvents = eventVolume.slice(-5);
      const updateFrequency = recentEvents.length > 0
        ? Math.round(recentEvents.reduce((a, b) => a + b, 0) / recentEvents.length * 10) / 10
        : 0;

      return {
        // Real-time values
        pollDuration: lastPollDuration,
        avgPollDuration,
        updateFrequency,
        totalPolls,
        totalEvents,

        // Agent activity
        agentActivity: { ...agentActivity },

        // Historical data for graphs
        history: {
          pollDurations: [...pollDurations],
          eventVolume: [...eventVolume],
          timestamps: [...timestamps]
        }
      };
    },

    /**
     * Reset all metrics
     */
    reset() {
      pollDurations.length = 0;
      eventVolume.length = 0;
      timestamps.length = 0;
      currentIntervalEvents = 0;
      lastIntervalTime = Date.now();
      lastPollDuration = 0;
      totalPolls = 0;
      totalEvents = 0;
      agentActivity.active = 0;
      agentActivity.hooked = 0;
      agentActivity.idle = 0;
      agentActivity.error = 0;
    }
  };
}
