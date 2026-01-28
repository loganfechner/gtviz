/**
 * Load Forecaster - Predictive Load Forecasting for Gas Town
 *
 * ML-based prediction of:
 * - Upcoming agent load spikes
 * - Estimated completion times for queued beads
 * - Capacity planning insights
 * - SLA predictions
 */

import { EventEmitter } from 'events';

// Forecasting constants
const FORECAST_HORIZONS = [5, 15, 30, 60]; // Minutes ahead to predict
const MIN_DATA_POINTS = 10; // Minimum data points needed for forecasting
const SMOOTHING_ALPHA = 0.3; // Exponential smoothing factor
const TREND_WEIGHT = 0.7; // Weight for trend in Holt's method
const CONFIDENCE_LEVEL = 0.95; // 95% confidence interval

/**
 * Create a load forecaster instance
 * @param {Object} options - Configuration options
 * @param {number} [options.forecastIntervalMs=30000] - How often to update forecasts (30s default)
 * @param {number} [options.historyWindowMs=3600000] - History window for analysis (1 hour default)
 * @returns {Object} Load forecaster instance
 */
export function createLoadForecaster(options = {}) {
  const {
    forecastIntervalMs = 30000,
    historyWindowMs = 3600000
  } = options;

  const emitter = new EventEmitter();

  // Internal state
  let forecasts = {
    loadPredictions: [],      // Predicted load at future time points
    queuePredictions: [],     // Predicted queue depth
    completionEstimates: {},  // ETA per bead
    capacityAnalysis: {},     // Per-agent capacity analysis
    spikePredictions: [],     // Predicted spike events
    lastUpdated: null,
    confidence: 0
  };

  let metricsStorage = null;
  let stateManager = null;
  let forecastInterval = null;

  /**
   * Initialize with data sources
   * @param {Object} storage - Metrics storage instance
   * @param {Object} state - State manager instance
   */
  function initialize(storage, state) {
    metricsStorage = storage;
    stateManager = state;
  }

  /**
   * Start periodic forecasting
   */
  function start() {
    if (forecastInterval) return;
    updateForecasts(); // Initial update
    forecastInterval = setInterval(updateForecasts, forecastIntervalMs);
  }

  /**
   * Stop forecasting
   */
  function stop() {
    if (forecastInterval) {
      clearInterval(forecastInterval);
      forecastInterval = null;
    }
  }

  /**
   * Update all forecasts
   */
  function updateForecasts() {
    if (!metricsStorage || !stateManager) return;

    const now = new Date();
    const historyStart = new Date(now.getTime() - historyWindowMs);

    // Get historical data
    const historicalMetrics = metricsStorage.queryRange(historyStart, now, 'minute');
    const currentState = stateManager.getState();

    if (historicalMetrics.length < MIN_DATA_POINTS) {
      forecasts = {
        ...forecasts,
        lastUpdated: now.toISOString(),
        confidence: 0,
        message: `Insufficient data (${historicalMetrics.length}/${MIN_DATA_POINTS} points needed)`
      };
      emitter.emit('update', forecasts);
      return;
    }

    // Extract time series data
    const loadSeries = extractLoadSeries(historicalMetrics);
    const queueSeries = extractQueueSeries(currentState);

    // Generate predictions
    const loadPredictions = predictLoad(loadSeries, FORECAST_HORIZONS);
    const queuePredictions = predictQueueDepth(queueSeries, currentState, FORECAST_HORIZONS);
    const completionEstimates = estimateCompletionTimes(currentState, loadSeries);
    const capacityAnalysis = analyzeCapacity(currentState, loadSeries);
    const spikePredictions = detectUpcomingSpikes(loadPredictions, loadSeries);

    // Calculate overall confidence based on data quality
    const confidence = calculateConfidence(historicalMetrics, loadSeries);

    forecasts = {
      loadPredictions,
      queuePredictions,
      completionEstimates,
      capacityAnalysis,
      spikePredictions,
      lastUpdated: now.toISOString(),
      confidence,
      dataPoints: historicalMetrics.length,
      historyWindow: historyWindowMs
    };

    emitter.emit('update', forecasts);
  }

  /**
   * Extract load time series from historical metrics
   * @param {Array} metrics - Historical metrics
   * @returns {Object} Time series data
   */
  function extractLoadSeries(metrics) {
    const timestamps = [];
    const activeAgents = [];
    const hookedAgents = [];
    const totalLoad = [];

    for (const m of metrics) {
      timestamps.push(new Date(m.timestamp).getTime());

      const activity = m.agentActivity || {};
      const active = activity.active || 0;
      const hooked = activity.hooked || 0;

      activeAgents.push(active);
      hookedAgents.push(hooked);
      totalLoad.push(active + hooked); // Load = active + hooked agents
    }

    return {
      timestamps,
      activeAgents,
      hookedAgents,
      totalLoad,
      length: metrics.length
    };
  }

  /**
   * Extract queue depth from current state
   * @param {Object} state - Current application state
   * @returns {Object} Queue metrics
   */
  function extractQueueSeries(state) {
    let openBeads = 0;
    let hookedBeads = 0;
    let inProgressBeads = 0;

    for (const rigName of Object.keys(state.beads || {})) {
      const beads = state.beads[rigName] || [];
      for (const bead of beads) {
        if (bead.status === 'open') openBeads++;
        else if (bead.status === 'hooked') hookedBeads++;
        else if (bead.status === 'in_progress') inProgressBeads++;
      }
    }

    return {
      open: openBeads,
      hooked: hookedBeads,
      inProgress: inProgressBeads,
      totalQueued: openBeads + hookedBeads + inProgressBeads
    };
  }

  /**
   * Predict future load using Holt's linear exponential smoothing
   * @param {Object} loadSeries - Historical load data
   * @param {Array} horizons - Future time points (minutes)
   * @returns {Array} Predictions for each horizon
   */
  function predictLoad(loadSeries, horizons) {
    const { totalLoad, timestamps } = loadSeries;

    if (totalLoad.length < 2) {
      return horizons.map(h => ({
        horizon: h,
        timestamp: new Date(Date.now() + h * 60000).toISOString(),
        predicted: 0,
        lower: 0,
        upper: 0
      }));
    }

    // Holt's linear exponential smoothing
    const { level, trend, stderr } = holtsSmoothing(totalLoad, SMOOTHING_ALPHA, TREND_WEIGHT);

    // Calculate average interval between data points
    const avgInterval = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);
    const minutesPerPoint = avgInterval / 60000;

    return horizons.map(h => {
      const steps = h / minutesPerPoint;
      const predicted = Math.max(0, level + trend * steps);

      // Confidence interval widens with forecast horizon
      const intervalWidth = stderr * 1.96 * Math.sqrt(1 + steps * 0.1);

      return {
        horizon: h,
        timestamp: new Date(Date.now() + h * 60000).toISOString(),
        predicted: Math.round(predicted * 10) / 10,
        lower: Math.max(0, Math.round((predicted - intervalWidth) * 10) / 10),
        upper: Math.round((predicted + intervalWidth) * 10) / 10
      };
    });
  }

  /**
   * Predict queue depth over time
   * @param {Object} queueSeries - Current queue state
   * @param {Object} state - Full application state
   * @param {Array} horizons - Future time points (minutes)
   * @returns {Array} Queue depth predictions
   */
  function predictQueueDepth(queueSeries, state, horizons) {
    // Calculate average completion rate from agent stats
    const agentStats = state.agentStats || {};
    let totalCompletions = 0;
    let totalDuration = 0;
    let agentCount = 0;

    for (const key of Object.keys(agentStats)) {
      const stats = agentStats[key];
      if (stats.completions && stats.completions.length > 0) {
        totalCompletions += stats.completions.length;
        const durations = stats.completions.filter(c => c.duration).map(c => c.duration);
        if (durations.length > 0) {
          totalDuration += durations.reduce((a, b) => a + b, 0);
        }
        agentCount++;
      }
    }

    // Estimate completion rate (beads per minute)
    const avgDurationMs = totalCompletions > 0 ? totalDuration / totalCompletions : 30 * 60 * 1000;
    const completionRatePerMin = agentCount > 0 ? (60 * 1000 / avgDurationMs) * agentCount : 0;

    return horizons.map(h => {
      // Assume constant arrival rate matching current queue
      const beadsCompleted = Math.round(completionRatePerMin * h);
      const predictedQueue = Math.max(0, queueSeries.totalQueued - beadsCompleted);

      return {
        horizon: h,
        timestamp: new Date(Date.now() + h * 60000).toISOString(),
        currentQueue: queueSeries.totalQueued,
        predicted: predictedQueue,
        completionRate: Math.round(completionRatePerMin * 100) / 100
      };
    });
  }

  /**
   * Estimate completion times for queued beads
   * @param {Object} state - Current application state
   * @param {Object} loadSeries - Historical load data
   * @returns {Object} ETA estimates per bead
   */
  function estimateCompletionTimes(state, loadSeries) {
    const estimates = {};
    const agentStats = state.agentStats || {};

    // Calculate average duration across all agents
    let allDurations = [];
    for (const key of Object.keys(agentStats)) {
      const stats = agentStats[key];
      if (stats.completions) {
        const durations = stats.completions.filter(c => c.duration).map(c => c.duration);
        allDurations = allDurations.concat(durations);
      }
    }

    const avgDurationMs = allDurations.length > 0
      ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
      : 30 * 60 * 1000; // Default 30 min

    // Count active agents
    let activeAgentCount = 0;
    for (const rigName of Object.keys(state.agents || {})) {
      const agents = state.agents[rigName] || [];
      activeAgentCount += agents.filter(a =>
        a.status === 'running' && (a.hasWork || a.currentBead)
      ).length;
    }

    // Build queue order based on hooks
    const queuedBeads = [];
    for (const rigName of Object.keys(state.beads || {})) {
      const beads = state.beads[rigName] || [];
      for (const bead of beads) {
        if (['open', 'hooked', 'in_progress'].includes(bead.status)) {
          queuedBeads.push({
            ...bead,
            rig: rigName,
            position: bead.status === 'in_progress' ? 0 :
                      bead.status === 'hooked' ? 1 : 2
          });
        }
      }
    }

    // Sort by status priority
    queuedBeads.sort((a, b) => a.position - b.position);

    // Estimate completion time based on queue position
    const throughput = activeAgentCount > 0 ? activeAgentCount : 1;
    let accumulatedTime = 0;

    for (let i = 0; i < queuedBeads.length; i++) {
      const bead = queuedBeads[i];
      const queuePosition = Math.floor(i / throughput);

      // For beads in progress, estimate remaining time
      let etaMs;
      if (bead.status === 'in_progress') {
        // Assume 50% completion on average for in-progress beads
        etaMs = avgDurationMs * 0.5;
      } else {
        // Queue position * avg duration + processing time
        etaMs = queuePosition * avgDurationMs + avgDurationMs;
      }

      const eta = new Date(Date.now() + etaMs);

      estimates[bead.id] = {
        beadId: bead.id,
        title: bead.title,
        status: bead.status,
        rig: bead.rig,
        queuePosition: i + 1,
        estimatedCompletionTime: eta.toISOString(),
        estimatedMinutes: Math.round(etaMs / 60000),
        confidence: bead.status === 'in_progress' ? 0.7 : 0.5 - (i * 0.02)
      };
    }

    return estimates;
  }

  /**
   * Analyze capacity for each agent
   * @param {Object} state - Current application state
   * @param {Object} loadSeries - Historical load data
   * @returns {Object} Capacity analysis per agent
   */
  function analyzeCapacity(state, loadSeries) {
    const analysis = {
      summary: {
        totalAgents: 0,
        activeAgents: 0,
        idleAgents: 0,
        utilizationPercent: 0,
        bottlenecks: []
      },
      agents: {}
    };

    const agentStats = state.agentStats || {};

    for (const rigName of Object.keys(state.agents || {})) {
      const agents = state.agents[rigName] || [];

      for (const agent of agents) {
        analysis.summary.totalAgents++;

        const key = `${rigName}/${agent.name}`;
        const stats = agentStats[key] || { completions: [], avgDuration: 0 };

        const isActive = agent.status === 'running' && (agent.hasWork || agent.currentBead);
        const isIdle = agent.status === 'idle' || (agent.status === 'running' && !agent.hasWork);

        if (isActive) analysis.summary.activeAgents++;
        if (isIdle) analysis.summary.idleAgents++;

        // Calculate throughput (completions per hour)
        const recentCompletions = (stats.completions || []).filter(c => {
          const completedAt = new Date(c.completedAt).getTime();
          return completedAt > Date.now() - 3600000; // Last hour
        });

        const throughputPerHour = recentCompletions.length;
        const avgDurationMin = stats.avgDuration ? stats.avgDuration / 60000 : 0;

        // Detect bottleneck: high work time + low throughput
        const isBottleneck = isActive && throughputPerHour < 1 && avgDurationMin > 60;

        if (isBottleneck) {
          analysis.summary.bottlenecks.push({
            agent: agent.name,
            rig: rigName,
            reason: 'Low throughput with high processing time'
          });
        }

        analysis.agents[key] = {
          name: agent.name,
          rig: rigName,
          status: agent.status,
          hasWork: agent.hasWork || false,
          currentBead: agent.currentBead,
          throughputPerHour,
          avgDurationMin: Math.round(avgDurationMin),
          recentCompletions: recentCompletions.length,
          isBottleneck
        };
      }
    }

    // Calculate utilization
    if (analysis.summary.totalAgents > 0) {
      analysis.summary.utilizationPercent = Math.round(
        (analysis.summary.activeAgents / analysis.summary.totalAgents) * 100
      );
    }

    return analysis;
  }

  /**
   * Detect upcoming load spikes
   * @param {Array} loadPredictions - Predicted load values
   * @param {Object} loadSeries - Historical load data
   * @returns {Array} Predicted spike events
   */
  function detectUpcomingSpikes(loadPredictions, loadSeries) {
    const spikes = [];
    const { totalLoad } = loadSeries;

    if (totalLoad.length === 0) return spikes;

    // Calculate baseline (mean + 1.5 * std dev)
    const mean = totalLoad.reduce((a, b) => a + b, 0) / totalLoad.length;
    const variance = totalLoad.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totalLoad.length;
    const stdDev = Math.sqrt(variance);
    const spikeThreshold = mean + 1.5 * stdDev;

    for (const prediction of loadPredictions) {
      if (prediction.predicted > spikeThreshold) {
        spikes.push({
          horizon: prediction.horizon,
          timestamp: prediction.timestamp,
          predictedLoad: prediction.predicted,
          threshold: Math.round(spikeThreshold * 10) / 10,
          severity: prediction.predicted > mean + 2 * stdDev ? 'high' : 'medium',
          recommendation: `Consider scaling or pausing new work ${prediction.horizon} minutes ahead`
        });
      }
    }

    return spikes;
  }

  /**
   * Holt's linear exponential smoothing
   * @param {Array} data - Time series data
   * @param {number} alpha - Level smoothing factor
   * @param {number} beta - Trend smoothing factor
   * @returns {Object} Smoothed level, trend, and standard error
   */
  function holtsSmoothing(data, alpha, beta) {
    if (data.length < 2) {
      return { level: data[0] || 0, trend: 0, stderr: 0 };
    }

    // Initialize
    let level = data[0];
    let trend = data[1] - data[0];
    const errors = [];

    // Update through series
    for (let i = 1; i < data.length; i++) {
      const prevLevel = level;
      const prevTrend = trend;

      // Forecast
      const forecast = prevLevel + prevTrend;
      errors.push(Math.abs(data[i] - forecast));

      // Update
      level = alpha * data[i] + (1 - alpha) * (prevLevel + prevTrend);
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    }

    // Calculate standard error
    const stderr = errors.length > 0
      ? Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)
      : 0;

    return { level, trend, stderr };
  }

  /**
   * Calculate confidence score based on data quality
   * @param {Array} metrics - Historical metrics
   * @param {Object} loadSeries - Extracted load series
   * @returns {number} Confidence score 0-1
   */
  function calculateConfidence(metrics, loadSeries) {
    let confidence = 0;

    // Data quantity factor (0-0.4)
    const quantityScore = Math.min(metrics.length / 60, 1) * 0.4;
    confidence += quantityScore;

    // Data freshness factor (0-0.3)
    if (metrics.length > 0) {
      const lastTimestamp = new Date(metrics[metrics.length - 1].timestamp).getTime();
      const age = Date.now() - lastTimestamp;
      const freshnessScore = Math.max(0, 1 - age / (5 * 60 * 1000)) * 0.3; // 5 min max age
      confidence += freshnessScore;
    }

    // Data consistency factor (0-0.3)
    const { totalLoad } = loadSeries;
    if (totalLoad.length > 1) {
      const mean = totalLoad.reduce((a, b) => a + b, 0) / totalLoad.length;
      const variance = totalLoad.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totalLoad.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // Coefficient of variation
      const consistencyScore = Math.max(0, 1 - cv) * 0.3;
      confidence += consistencyScore;
    }

    return Math.round(confidence * 100) / 100;
  }

  return {
    /**
     * Initialize the forecaster
     */
    initialize,

    /**
     * Start periodic forecasting
     */
    start,

    /**
     * Stop forecasting
     */
    stop,

    /**
     * Force an immediate forecast update
     */
    update: updateForecasts,

    /**
     * Get current forecasts
     * @returns {Object} Current forecast data
     */
    getForecasts() {
      return forecasts;
    },

    /**
     * Get ETA for a specific bead
     * @param {string} beadId - Bead ID
     * @returns {Object|null} ETA estimate or null
     */
    getBeadEta(beadId) {
      return forecasts.completionEstimates[beadId] || null;
    },

    /**
     * Get capacity analysis
     * @returns {Object} Capacity analysis
     */
    getCapacity() {
      return forecasts.capacityAnalysis;
    },

    /**
     * Get predicted spikes
     * @returns {Array} Spike predictions
     */
    getSpikes() {
      return forecasts.spikePredictions;
    },

    /**
     * Subscribe to forecast updates
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
      emitter.on(event, callback);
      return () => emitter.off(event, callback);
    },

    /**
     * Emit events (for EventEmitter compatibility)
     */
    emit: emitter.emit.bind(emitter)
  };
}
