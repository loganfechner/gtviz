/**
 * Event Buffer
 *
 * Circular buffer for storing historical events with time-based indexing.
 * Used to enable timeline playback of past agent states.
 */

/**
 * Create an event buffer with configurable retention
 * @param {Object} options - Configuration options
 * @param {number} options.maxAgeMs - Maximum age of events in milliseconds (default: 3 hours)
 * @param {number} options.maxEvents - Maximum number of events to store (default: 10000)
 * @returns {Object} Event buffer instance
 */
export function createEventBuffer(options = {}) {
  const maxAgeMs = options.maxAgeMs || 3 * 60 * 60 * 1000; // 3 hours
  const maxEvents = options.maxEvents || 10000;

  // Events stored as array, sorted by timestamp
  const events = [];

  /**
   * Remove events older than maxAge
   */
  const pruneOldEvents = () => {
    const cutoff = Date.now() - maxAgeMs;
    while (events.length > 0 && new Date(events[0].timestamp).getTime() < cutoff) {
      events.shift();
    }
    // Also enforce max events limit
    while (events.length > maxEvents) {
      events.shift();
    }
  };

  /**
   * Binary search to find index of first event at or after given time
   * @param {number} targetTime - Target timestamp in milliseconds
   * @returns {number} Index of first event at or after targetTime
   */
  const findIndexAtTime = (targetTime) => {
    let left = 0;
    let right = events.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const eventTime = new Date(events[mid].timestamp).getTime();
      if (eventTime < targetTime) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  };

  return {
    /**
     * Add an event to the buffer
     * @param {Object} event - Event to add (must have timestamp)
     */
    addEvent(event) {
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      // Insert in sorted order (events should mostly arrive in order)
      const eventTime = new Date(event.timestamp).getTime();
      let insertIndex = events.length;

      // Check if we need to insert before the end (out of order event)
      if (events.length > 0) {
        const lastEventTime = new Date(events[events.length - 1].timestamp).getTime();
        if (eventTime < lastEventTime) {
          insertIndex = findIndexAtTime(eventTime);
        }
      }

      events.splice(insertIndex, 0, event);
      pruneOldEvents();
    },

    /**
     * Get events within a time range
     * @param {Date|string} startTime - Start of range
     * @param {Date|string} endTime - End of range
     * @returns {Array} Events within the range
     */
    getEventsBetween(startTime, endTime) {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();

      const startIndex = findIndexAtTime(start);
      const endIndex = findIndexAtTime(end + 1); // +1 to include events at endTime

      return events.slice(startIndex, endIndex);
    },

    /**
     * Get all events
     * @returns {Array} All events in buffer
     */
    getAllEvents() {
      return [...events];
    },

    /**
     * Get the most recent event at or before a given time
     * @param {Date|string} time - Target time
     * @returns {Object|null} Event at or before the time
     */
    getEventAtTime(time) {
      const targetTime = new Date(time).getTime();
      const index = findIndexAtTime(targetTime + 1) - 1;

      if (index >= 0) {
        return events[index];
      }
      return null;
    },

    /**
     * Reconstruct state at a specific point in time
     * Replays all events from start up to the given time
     * @param {Date|string} time - Target time
     * @returns {Object} Reconstructed state
     */
    getStateAtTime(time) {
      const targetTime = new Date(time).getTime();
      const relevantEvents = this.getEventsBetween(
        new Date(Date.now() - maxAgeMs),
        time
      );

      // Build state from events
      const state = { hooks: {} };

      for (const event of relevantEvents) {
        if (event.type === 'hooks:updated' && event.data?.hooks) {
          // Merge hook updates into state
          state.hooks = { ...state.hooks, ...event.data.hooks };
        } else if (event.type === 'snapshot') {
          // Full state snapshots replace everything
          state.hooks = { ...event.data.hooks };
        }
      }

      return {
        ...state,
        timestamp: new Date(time).toISOString(),
        isReplay: true
      };
    },

    /**
     * Get event markers for timeline display
     * Returns simplified event list with just timestamps and types
     * @returns {Array} Event markers
     */
    getEventMarkers() {
      return events.map(e => ({
        timestamp: e.timestamp,
        type: e.type,
        hasChanges: e.data?.changes?.length > 0
      }));
    },

    /**
     * Get timeline bounds
     * @returns {Object} { start, end } timestamps
     */
    getTimelineBounds() {
      if (events.length === 0) {
        const now = new Date().toISOString();
        return { start: now, end: now };
      }
      return {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      };
    },

    /**
     * Get buffer statistics
     * @returns {Object} Buffer stats
     */
    getStats() {
      return {
        eventCount: events.length,
        maxEvents,
        maxAgeMs,
        oldestEvent: events[0]?.timestamp || null,
        newestEvent: events[events.length - 1]?.timestamp || null
      };
    },

    /**
     * Clear all events
     */
    clear() {
      events.length = 0;
    }
  };
}
