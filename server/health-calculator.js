/**
 * Health Score Calculator
 *
 * Calculates a system health score (0-100) combining:
 * - Agent uptime (% of agents running vs total)
 * - Error rate (% of successful polls)
 * - Throughput (events processed per minute)
 * - Latency (poll response time performance)
 *
 * @module health-calculator
 */

/**
 * @typedef {Object} HealthScore
 * @property {number} score - Overall health score (0-100)
 * @property {string} status - 'healthy' | 'degraded' | 'critical'
 * @property {Object} components - Individual component scores
 * @property {number} components.uptime - Agent uptime score (0-100)
 * @property {number} components.errorRate - Error rate score (0-100)
 * @property {number} components.throughput - Throughput score (0-100)
 * @property {number} components.latency - Latency score (0-100)
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} HealthHistory
 * @property {number[]} scores - Historical scores
 * @property {string[]} timestamps - ISO timestamps for each score
 */

/**
 * Calculate latency score based on poll duration
 * Thresholds:
 *   < 100ms = 100 (excellent)
 *   100-250ms = 80-99 (good)
 *   250-500ms = 50-79 (acceptable)
 *   500-1000ms = 20-49 (poor)
 *   > 1000ms = 0-19 (critical)
 *
 * @param {number} avgPollDuration - Average poll duration in ms
 * @returns {number} Score 0-100
 */
function calculateLatencyScore(avgPollDuration) {
  if (avgPollDuration <= 100) return 100;
  if (avgPollDuration <= 250) {
    // Linear interpolation 100 -> 80
    return Math.round(100 - ((avgPollDuration - 100) / 150) * 20);
  }
  if (avgPollDuration <= 500) {
    // Linear interpolation 80 -> 50
    return Math.round(80 - ((avgPollDuration - 250) / 250) * 30);
  }
  if (avgPollDuration <= 1000) {
    // Linear interpolation 50 -> 20
    return Math.round(50 - ((avgPollDuration - 500) / 500) * 30);
  }
  // > 1000ms: 20 -> 0
  return Math.max(0, Math.round(20 - ((avgPollDuration - 1000) / 1000) * 20));
}

/**
 * Calculate uptime score based on agent activity
 *
 * @param {Object} agentActivity - Agent activity counts
 * @param {number} agentActivity.active - Number of active agents
 * @param {number} agentActivity.hooked - Number of hooked agents
 * @param {number} agentActivity.idle - Number of idle agents
 * @param {number} agentActivity.error - Number of agents in error state
 * @returns {number} Score 0-100
 */
function calculateUptimeScore(agentActivity) {
  const { active = 0, hooked = 0, idle = 0, error = 0 } = agentActivity || {};
  const total = active + hooked + idle + error;

  if (total === 0) {
    // No agents - neutral score
    return 75;
  }

  // Running = active + hooked + idle (not in error)
  const running = active + hooked + idle;
  const baseScore = (running / total) * 100;

  // Bonus for having active/hooked work
  const workingRatio = (active + hooked) / total;
  const bonus = workingRatio * 10;

  return Math.min(100, Math.round(baseScore + bonus));
}

/**
 * Calculate error rate score
 *
 * @param {number} successRate - Poll success rate percentage (0-100)
 * @returns {number} Score 0-100
 */
function calculateErrorRateScore(successRate) {
  // Direct mapping - success rate IS the score
  // But weight heavily: 99% success = 95 score, 95% = 75, 90% = 50
  if (successRate >= 99.9) return 100;
  if (successRate >= 99) return 95;
  if (successRate >= 98) return 90;
  if (successRate >= 95) return 75;
  if (successRate >= 90) return 50;
  if (successRate >= 80) return 25;
  return Math.max(0, Math.round(successRate / 4));
}

/**
 * Calculate throughput score based on events per minute
 *
 * @param {number} eventsPerMinute - Average events per minute
 * @param {number[]} history - Historical event volumes
 * @returns {number} Score 0-100
 */
function calculateThroughputScore(eventsPerMinute, history = []) {
  // If no history, use current value directly
  if (history.length === 0) {
    // Assume 10 events/min is healthy baseline
    if (eventsPerMinute >= 10) return 100;
    if (eventsPerMinute >= 5) return 80;
    if (eventsPerMinute >= 1) return 60;
    return 40; // Some activity is happening
  }

  // Calculate average from history
  const avgHistorical = history.reduce((a, b) => a + b, 0) / history.length;

  // If current is within 50% of average, score is good
  if (avgHistorical === 0) {
    // No historical data, any activity is good
    return eventsPerMinute > 0 ? 80 : 60;
  }

  const ratio = eventsPerMinute / avgHistorical;

  // Ratio close to 1.0 = healthy
  // Ratio < 0.5 or > 2.0 = potential issue
  if (ratio >= 0.7 && ratio <= 1.5) return 100;
  if (ratio >= 0.5 && ratio <= 2.0) return 80;
  if (ratio >= 0.3 && ratio <= 3.0) return 60;
  if (ratio >= 0.1) return 40;
  return 20;
}

/**
 * Determine health status from score
 *
 * @param {number} score - Health score 0-100
 * @returns {'healthy' | 'degraded' | 'critical'}
 */
function getHealthStatus(score) {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'degraded';
  return 'critical';
}

/**
 * Create a health calculator with historical tracking
 *
 * @param {number} [historySize=60] - Number of historical scores to retain
 * @returns {Object} Health calculator instance
 */
export function createHealthCalculator(historySize = 60) {
  const scoreHistory = [];
  const timestampHistory = [];

  return {
    /**
     * Calculate health score from metrics
     *
     * @param {Object} metrics - Metrics from createMetricsCollector
     * @returns {HealthScore}
     */
    calculate(metrics) {
      const {
        avgPollDuration = 0,
        successRate = 100,
        updateFrequency = 0,
        agentActivity = {},
        history = {}
      } = metrics || {};

      // Calculate individual component scores
      const components = {
        uptime: calculateUptimeScore(agentActivity),
        errorRate: calculateErrorRateScore(successRate),
        throughput: calculateThroughputScore(updateFrequency, history.eventVolume || []),
        latency: calculateLatencyScore(avgPollDuration)
      };

      // Weighted average for overall score
      // Weights: errorRate (35%), uptime (30%), latency (20%), throughput (15%)
      const score = Math.round(
        components.errorRate * 0.35 +
        components.uptime * 0.30 +
        components.latency * 0.20 +
        components.throughput * 0.15
      );

      const timestamp = new Date().toISOString();

      // Store in history
      scoreHistory.push(score);
      timestampHistory.push(timestamp);
      if (scoreHistory.length > historySize) {
        scoreHistory.shift();
        timestampHistory.shift();
      }

      return {
        score,
        status: getHealthStatus(score),
        components,
        timestamp
      };
    },

    /**
     * Get historical health data
     *
     * @returns {HealthHistory}
     */
    getHistory() {
      return {
        scores: [...scoreHistory],
        timestamps: [...timestampHistory]
      };
    },

    /**
     * Reset history
     */
    reset() {
      scoreHistory.length = 0;
      timestampHistory.length = 0;
    }
  };
}

export {
  calculateLatencyScore,
  calculateUptimeScore,
  calculateErrorRateScore,
  calculateThroughputScore,
  getHealthStatus
};
