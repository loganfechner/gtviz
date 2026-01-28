/**
 * State Manager
 *
 * Manages in-memory state for the gtviz server.
 * Tracks rigs, agents, hooks, and notifies subscribers of changes.
 */

/**
 * Create a state manager
 * @returns {Object} State manager
 */
export function createStateManager() {
  const state = {
    agents: {},      // Map of agent name -> agent info (legacy single-rig)
    hooks: {},       // Map of agent name -> hook status (legacy single-rig)
    rigs: {},        // Map of rig name -> { name, path, agents, summary }
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
     * Update rig status for all rigs
     * @param {Object} rigs - Map of rig name to rig data
     */
    updateRigs(rigs) {
      const changes = [];

      for (const [rigName, rigData] of Object.entries(rigs)) {
        const previousRig = state.rigs[rigName];

        // Check for agent changes within the rig
        for (const [agentName, hookStatus] of Object.entries(rigData.agents)) {
          const previousAgent = previousRig?.agents?.[agentName];

          if (!previousAgent ||
              previousAgent.beadId !== hookStatus.beadId ||
              previousAgent.status !== hookStatus.status) {
            changes.push({
              rig: rigName,
              agent: agentName,
              previous: previousAgent || null,
              current: hookStatus
            });
          }
        }

        state.rigs[rigName] = rigData;
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
     * Get all rigs
     */
    getRigs() {
      return { ...state.rigs };
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
