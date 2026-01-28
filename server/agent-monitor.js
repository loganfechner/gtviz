/**
 * Agent Monitor
 *
 * Centralized monitoring for agent health and status.
 * Tracks connectivity, response times, and error patterns.
 */

/**
 * Create an agent monitor instance
 * @returns {Object} Agent monitor interface
 */
export function createAgentMonitor() {
  // Agent statistics
  const agentStats = new Map();

  // Event subscribers
  const subscribers = new Set();

  /**
   * Get or create stats for an agent
   * @param {string} agentName - Agent name
   * @returns {Object} Agent stats object
   */
  function getOrCreateStats(agentName) {
    if (!agentStats.has(agentName)) {
      agentStats.set(agentName, {
        name: agentName,
        totalPolls: 0,
        successfulPolls: 0,
        failedPolls: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        avgResponseTimeMs: 0,
        lastResponseTimeMs: null,
        lastSuccess: null,
        lastFailure: null,
        lastError: null,
        errorCounts: {},
        status: 'unknown'
      });
    }
    return agentStats.get(agentName);
  }

  /**
   * Calculate agent status based on stats
   * @param {Object} stats - Agent stats
   * @returns {string} Status: 'healthy', 'degraded', 'unreachable', 'unknown'
   */
  function calculateStatus(stats) {
    if (stats.totalPolls === 0) return 'unknown';
    if (stats.consecutiveFailures >= 5) return 'unreachable';
    if (stats.consecutiveFailures >= 2) return 'degraded';
    if (stats.consecutiveSuccesses >= 2) return 'healthy';
    if (stats.successfulPolls > stats.failedPolls) return 'healthy';
    return 'degraded';
  }

  /**
   * Emit event to subscribers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  function emit(event, data) {
    const message = { event, data, timestamp: new Date().toISOString() };
    subscribers.forEach(callback => {
      try {
        callback(message);
      } catch (err) {
        console.error('[agent-monitor] Subscriber error:', err.message);
      }
    });
  }

  return {
    /**
     * Record a successful poll for an agent
     * @param {string} agentName - Agent name
     * @param {number} responseTimeMs - Response time in milliseconds
     */
    recordSuccess(agentName, responseTimeMs) {
      const stats = getOrCreateStats(agentName);
      const previousStatus = stats.status;

      stats.totalPolls++;
      stats.successfulPolls++;
      stats.consecutiveSuccesses++;
      stats.consecutiveFailures = 0;
      stats.lastSuccess = new Date().toISOString();
      stats.lastResponseTimeMs = responseTimeMs;

      // Update rolling average response time
      const alpha = 0.3; // Smoothing factor
      stats.avgResponseTimeMs = stats.avgResponseTimeMs === 0
        ? responseTimeMs
        : stats.avgResponseTimeMs * (1 - alpha) + responseTimeMs * alpha;

      stats.status = calculateStatus(stats);

      // Emit recovery event if transitioning from unhealthy
      if (previousStatus !== 'healthy' && stats.status === 'healthy') {
        emit('agent:recovered', { agent: agentName, stats: { ...stats } });
      }
    },

    /**
     * Record a failed poll for an agent
     * @param {string} agentName - Agent name
     * @param {string} errorCategory - Error category
     * @param {string} errorMessage - Error message
     */
    recordFailure(agentName, errorCategory, errorMessage) {
      const stats = getOrCreateStats(agentName);
      const previousStatus = stats.status;

      stats.totalPolls++;
      stats.failedPolls++;
      stats.consecutiveFailures++;
      stats.consecutiveSuccesses = 0;
      stats.lastFailure = new Date().toISOString();
      stats.lastError = errorMessage;

      // Track error counts by category
      stats.errorCounts[errorCategory] = (stats.errorCounts[errorCategory] || 0) + 1;

      stats.status = calculateStatus(stats);

      // Emit degradation events
      if (previousStatus === 'healthy' && stats.status === 'degraded') {
        emit('agent:degraded', { agent: agentName, stats: { ...stats } });
      } else if (stats.status === 'unreachable' && previousStatus !== 'unreachable') {
        emit('agent:unreachable', { agent: agentName, stats: { ...stats } });
      }
    },

    /**
     * Get stats for a specific agent
     * @param {string} agentName - Agent name
     * @returns {Object|null} Agent stats or null
     */
    getAgentStats(agentName) {
      const stats = agentStats.get(agentName);
      return stats ? { ...stats } : null;
    },

    /**
     * Get stats for all agents
     * @returns {Object} Map of agent name to stats
     */
    getAllStats() {
      const result = {};
      for (const [name, stats] of agentStats) {
        result[name] = { ...stats };
      }
      return result;
    },

    /**
     * Get summary of agent health
     * @returns {Object} Health summary
     */
    getHealthSummary() {
      const agents = Array.from(agentStats.values());
      return {
        total: agents.length,
        healthy: agents.filter(a => a.status === 'healthy').length,
        degraded: agents.filter(a => a.status === 'degraded').length,
        unreachable: agents.filter(a => a.status === 'unreachable').length,
        unknown: agents.filter(a => a.status === 'unknown').length,
        avgResponseTimeMs: agents.length > 0
          ? Math.round(agents.reduce((sum, a) => sum + a.avgResponseTimeMs, 0) / agents.length)
          : 0
      };
    },

    /**
     * Reset stats for an agent
     * @param {string} agentName - Agent name
     */
    resetAgent(agentName) {
      agentStats.delete(agentName);
      console.log(`[agent-monitor] Reset stats for: ${agentName}`);
    },

    /**
     * Reset all agent stats
     */
    resetAll() {
      agentStats.clear();
      console.log('[agent-monitor] Reset all agent stats');
    },

    /**
     * Subscribe to monitor events
     * @param {Function} callback - Event callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }
  };
}
