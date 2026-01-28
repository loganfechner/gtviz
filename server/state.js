/**
 * State Manager
 *
 * Manages in-memory state for the gtviz server.
 * Tracks agents, hooks, and notifies subscribers of changes.
 * Records events to enable historical timeline playback.
 */

import { createEventBuffer } from './event-buffer.js';

/**
 * Create a state manager
 * @param {Object} options - Configuration options
 * @param {number} options.bufferMaxAgeMs - Event buffer max age (default: 3 hours)
 * @returns {Object} State manager
 */
export function createStateManager(options = {}) {
  const state = {
    agents: {},      // Map of agent name -> agent info
    hooks: {},       // Map of agent name -> hook status
    lastUpdated: null
  };

  const subscribers = new Set();

  // Event buffer for historical playback
  const eventBuffer = createEventBuffer({
    maxAgeMs: options.bufferMaxAgeMs || 3 * 60 * 60 * 1000 // 3 hours default
  });

  /**
   * Notify all subscribers of state change and record to event buffer
   * @param {string} type - Type of update
   * @param {Object} data - Update data
   */
  const notify = (type, data) => {
    const message = { type, data, timestamp: new Date().toISOString() };

    // Record event to buffer for historical playback
    eventBuffer.addEvent(message);

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

    // Timeline/History methods

    /**
     * Get historical state at a specific time
     * @param {Date|string} time - Target timestamp
     * @returns {Object} Reconstructed state at that time
     */
    getStateAtTime(time) {
      return eventBuffer.getStateAtTime(time);
    },

    /**
     * Get events within a time range
     * @param {Date|string} startTime - Start of range
     * @param {Date|string} endTime - End of range
     * @returns {Array} Events within the range
     */
    getEventsBetween(startTime, endTime) {
      return eventBuffer.getEventsBetween(startTime, endTime);
    },

    /**
     * Get all recorded events
     * @returns {Array} All events in buffer
     */
    getAllEvents() {
      return eventBuffer.getAllEvents();
    },

    /**
     * Get event markers for timeline display
     * @returns {Array} Simplified event list
     */
    getEventMarkers() {
      return eventBuffer.getEventMarkers();
    },

    /**
     * Get timeline bounds
     * @returns {Object} { start, end } timestamps
     */
    getTimelineBounds() {
      return eventBuffer.getTimelineBounds();
    },

    /**
     * Get event buffer statistics
     * @returns {Object} Buffer stats
     */
    getBufferStats() {
      return eventBuffer.getStats();
    },

    /**
     * Record a snapshot event (for initial state or periodic checkpoints)
     */
    recordSnapshot() {
      const snapshot = {
        type: 'snapshot',
        data: { hooks: { ...state.hooks } },
        timestamp: new Date().toISOString()
      };
      eventBuffer.addEvent(snapshot);
    }
  };
}
