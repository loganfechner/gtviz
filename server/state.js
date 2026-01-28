/**
 * State Manager
 *
 * Manages in-memory state for the gtviz server.
 * Tracks rigs, agents, hooks, and notifies subscribers of changes.
 * Supports multi-rig overview with drill-down to individual rigs.
 */

/**
 * Create a state manager
 * @returns {Object} State manager
 */
export function createStateManager() {
  const state = {
    rigs: {},        // Map of rig name -> rig data (agents, summary)
    lastUpdated: null
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
     * Get all rigs
     */
    getRigs() {
      return { ...state.rigs };
    },

    /**
     * Get specific rig data
     * @param {string} rigName - Name of the rig
     */
    getRig(rigName) {
      return state.rigs[rigName] || null;
    },

    /**
     * Update rig data for all rigs
     * @param {Object} rigData - Map of rig name to rig data
     */
    updateRigs(rigData) {
      const changes = [];

      for (const [rigName, newRigData] of Object.entries(rigData)) {
        const previous = state.rigs[rigName];

        // Check for rig-level changes
        if (!previous) {
          changes.push({
            type: 'rig:added',
            rig: rigName,
            data: newRigData
          });
        } else {
          // Check for agent changes within the rig
          for (const [agentName, agentStatus] of Object.entries(newRigData.agents || {})) {
            const prevAgent = previous.agents?.[agentName];

            if (!prevAgent ||
                prevAgent.beadId !== agentStatus.beadId ||
                prevAgent.status !== agentStatus.status) {
              changes.push({
                type: 'agent:updated',
                rig: rigName,
                agent: agentName,
                previous: prevAgent || null,
                current: agentStatus
              });
            }
          }
        }

        state.rigs[rigName] = newRigData;
      }

      // Check for removed rigs
      for (const rigName of Object.keys(state.rigs)) {
        if (!rigData[rigName]) {
          changes.push({
            type: 'rig:removed',
            rig: rigName
          });
          delete state.rigs[rigName];
        }
      }

      state.lastUpdated = new Date().toISOString();

      // Only notify if there were changes
      if (changes.length > 0) {
        notify('rigs:updated', {
          rigs: state.rigs,
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
    }
  };
}
