/**
 * State Manager
 *
 * Manages in-memory state for the gtviz server.
 * Tracks agents, hooks, and notifies subscribers of changes.
 */

/**
 * Create a state manager
 * @returns {Object} State manager
 */
export function createStateManager() {
  const state = {
    agents: {},      // Map of agent name -> agent info
    hooks: {},       // Map of agent name -> hook status
    lastUpdated: null
  };

  // Performance metrics tracking
  const metrics = {
    pollTimes: [],           // Last N poll durations in ms
    updateTimestamps: [],    // Timestamps of updates (for frequency calc)
    statusChanges: [],       // Recent status change events
    eventVolume: [],         // Event counts per minute bucket
    maxHistorySize: 60       // Keep 60 data points (1 hour at 1/min)
  };

  const subscribers = new Set();

  /**
   * Notify all subscribers of state change
   * @param {string} type - Type of update
   * @param {Object} data - Update data
   */
  const notify = (type, data) => {
    const message = { type, data, timestamp: new Date().toISOString() };
    for (const subscriber of subscribers) {
      try {
        subscriber(message);
      } catch (error) {
        console.error('Subscriber error:', error);
      }
    }
  };

  return {
    /**
     * Get current state snapshot
     */
    getState() {
      return { ...state };
    },

    /**
     * Get all hook statuses
     */
    getHooks() {
      return { ...state.hooks };
    },

    /**
     * Update hook status for all agents
     * @param {Object} hooks - Map of agent name to hook status
     */
    updateHooks(hooks) {
      const changes = [];

      for (const [agentName, hookStatus] of Object.entries(hooks)) {
        const previous = state.hooks[agentName];

        // Check if anything changed
        if (!previous ||
            previous.beadId !== hookStatus.beadId ||
            previous.status !== hookStatus.status) {
          changes.push({
            agent: agentName,
            previous: previous || null,
            current: hookStatus
          });
        }

        state.hooks[agentName] = hookStatus;
      }

      state.lastUpdated = new Date().toISOString();

      // Record the update for metrics
      this.recordUpdate();

      // Record status changes
      for (const change of changes) {
        this.recordStatusChange(change);
      }

      // Only notify if there were changes
      if (changes.length > 0) {
        notify('hooks:updated', {
          hooks: state.hooks,
          changes
        });
      }
    },

    /**
     * Subscribe to state changes
     * @param {Function} callback - Callback for state changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    /**
     * Get subscriber count
     */
    getSubscriberCount() {
      return subscribers.size;
    },

    /**
     * Record a poll duration
     * @param {number} durationMs - Poll duration in milliseconds
     */
    recordPollTime(durationMs) {
      metrics.pollTimes.push({
        duration: durationMs,
        timestamp: Date.now()
      });
      // Keep only last 60 entries
      if (metrics.pollTimes.length > metrics.maxHistorySize) {
        metrics.pollTimes.shift();
      }
    },

    /**
     * Record an update event for frequency tracking
     */
    recordUpdate() {
      const now = Date.now();
      metrics.updateTimestamps.push(now);
      // Keep only last 5 minutes of timestamps
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      metrics.updateTimestamps = metrics.updateTimestamps.filter(t => t > fiveMinutesAgo);

      // Update event volume (per-minute buckets)
      const minuteBucket = Math.floor(now / 60000);
      const lastBucket = metrics.eventVolume[metrics.eventVolume.length - 1];
      if (lastBucket && lastBucket.bucket === minuteBucket) {
        lastBucket.count++;
      } else {
        metrics.eventVolume.push({ bucket: minuteBucket, count: 1, timestamp: now });
        if (metrics.eventVolume.length > metrics.maxHistorySize) {
          metrics.eventVolume.shift();
        }
      }
    },

    /**
     * Record a status change event
     * @param {Object} change - The change object
     */
    recordStatusChange(change) {
      metrics.statusChanges.push({
        ...change,
        timestamp: Date.now()
      });
      // Keep only last 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      metrics.statusChanges = metrics.statusChanges.filter(c => c.timestamp > fiveMinutesAgo);
    },

    /**
     * Get current metrics
     * @returns {Object} Current metrics snapshot
     */
    getMetrics() {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      // Calculate poll time stats
      const recentPolls = metrics.pollTimes.filter(p => p.timestamp > fiveMinutesAgo);
      const pollDurations = recentPolls.map(p => p.duration);
      const avgPollTime = pollDurations.length > 0
        ? Math.round(pollDurations.reduce((a, b) => a + b, 0) / pollDurations.length)
        : 0;
      const lastPollTime = pollDurations.length > 0
        ? pollDurations[pollDurations.length - 1]
        : 0;

      // Calculate update frequency (updates per minute)
      const recentUpdates = metrics.updateTimestamps.filter(t => t > oneMinuteAgo);
      const updatesPerMinute = recentUpdates.length;

      // Calculate status changes per minute
      const recentChanges = metrics.statusChanges.filter(c => c.timestamp > oneMinuteAgo);
      const statusChangesPerMinute = recentChanges.length;

      // Get event volume history (last 60 minutes)
      const volumeHistory = metrics.eventVolume.map(e => ({
        timestamp: e.timestamp,
        count: e.count
      }));

      // Get poll time history for sparkline
      const pollHistory = metrics.pollTimes.map(p => ({
        timestamp: p.timestamp,
        value: p.duration
      }));

      return {
        pollTime: {
          current: lastPollTime,
          average: avgPollTime,
          history: pollHistory
        },
        updateFrequency: {
          perMinute: updatesPerMinute,
          history: volumeHistory
        },
        activityRate: {
          changesPerMinute: statusChangesPerMinute,
          recentChanges: recentChanges.slice(-10) // Last 10 changes
        },
        eventVolume: volumeHistory,
        timestamp: new Date().toISOString()
      };
    }
  };
}
