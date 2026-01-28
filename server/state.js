/**
 * State Manager
 *
 * Manages in-memory state for the gtviz server.
 * Tracks agents, hooks, and notifies subscribers of changes.
 * Maintains a timeline buffer for historical playback.
 */

// Default timeline configuration
const DEFAULT_TIMELINE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const DEFAULT_TIMELINE_PRUNE_INTERVAL_MS = 60 * 1000; // Prune every minute

/**
 * Create a state manager
 * @param {Object} options - Configuration options
 * @param {number} options.timelineMaxAge - Max age of timeline entries in ms (default: 3 hours)
 * @returns {Object} State manager
 */
export function createStateManager(options = {}) {
  const timelineMaxAge = options.timelineMaxAge || DEFAULT_TIMELINE_MAX_AGE_MS;

  const state = {
    agents: {},      // Map of agent name -> agent info
    hooks: {},       // Map of agent name -> hook status
    lastUpdated: null
  };

  // Timeline stores historical state snapshots
  // Each entry: { timestamp: ISO string, hooks: {...}, changes: [...] }
  const timeline = [];

  const subscribers = new Set();

  // Periodically prune old timeline entries
  const pruneInterval = setInterval(() => {
    pruneTimeline();
  }, DEFAULT_TIMELINE_PRUNE_INTERVAL_MS);

  /**
   * Remove timeline entries older than maxAge
   */
  function pruneTimeline() {
    const cutoff = Date.now() - timelineMaxAge;
    while (timeline.length > 0 && new Date(timeline[0].timestamp).getTime() < cutoff) {
      timeline.shift();
    }
  }

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

      // Store snapshot in timeline (even if no changes, for state continuity)
      const snapshot = {
        timestamp: state.lastUpdated,
        hooks: JSON.parse(JSON.stringify(state.hooks)), // Deep copy
        changes: changes.length > 0 ? changes : null
      };
      timeline.push(snapshot);

      // Only notify if there were changes
      if (changes.length > 0) {
        notify('hooks:updated', {
          hooks: state.hooks,
          changes
        });

        // Also notify timeline subscribers
        notify('timeline:updated', {
          entry: snapshot,
          timelineLength: timeline.length
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
     * Get timeline entries within a time range
     * @param {string} startTime - ISO timestamp (optional, defaults to oldest)
     * @param {string} endTime - ISO timestamp (optional, defaults to now)
     * @returns {Array} Timeline entries
     */
    getTimeline(startTime, endTime) {
      let entries = timeline;

      if (startTime) {
        const start = new Date(startTime).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
      }

      if (endTime) {
        const end = new Date(endTime).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
      }

      return entries;
    },

    /**
     * Get timeline summary (start, end, event count)
     * @returns {Object} Timeline metadata
     */
    getTimelineSummary() {
      if (timeline.length === 0) {
        return {
          isEmpty: true,
          startTime: null,
          endTime: null,
          entryCount: 0,
          eventCount: 0
        };
      }

      const eventCount = timeline.filter(e => e.changes && e.changes.length > 0).length;

      return {
        isEmpty: false,
        startTime: timeline[0].timestamp,
        endTime: timeline[timeline.length - 1].timestamp,
        entryCount: timeline.length,
        eventCount
      };
    },

    /**
     * Get state at a specific point in time
     * Returns the most recent snapshot at or before the given time
     * @param {string} timestamp - ISO timestamp
     * @returns {Object|null} State at that time, or null if before timeline start
     */
    getStateAtTime(timestamp) {
      const targetTime = new Date(timestamp).getTime();

      // Find the latest snapshot at or before target time
      let result = null;
      for (const entry of timeline) {
        const entryTime = new Date(entry.timestamp).getTime();
        if (entryTime <= targetTime) {
          result = entry;
        } else {
          break;
        }
      }

      return result;
    },

    /**
     * Get events (state changes) only, for timeline markers
     * @returns {Array} Entries that have changes
     */
    getTimelineEvents() {
      return timeline.filter(e => e.changes && e.changes.length > 0);
    },

    /**
     * Stop the prune interval (for cleanup)
     */
    destroy() {
      clearInterval(pruneInterval);
    }
  };
}
