/**
 * Historical Metrics Storage
 *
 * Persists metrics to disk with multi-tier storage:
 * - Raw minute-by-minute data for last 24 hours
 * - Hourly aggregates for last 30 days
 * - Daily aggregates for older data
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const METRICS_FILE = join(DATA_DIR, 'metrics-history.json');

// Retention periods
const RAW_RETENTION_HOURS = 24;      // Keep raw data for 24 hours
const HOURLY_RETENTION_DAYS = 30;    // Keep hourly aggregates for 30 days
const DAILY_RETENTION_DAYS = 365;    // Keep daily aggregates for 1 year

// Save interval (every 5 minutes)
const SAVE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Create historical metrics storage
 * @returns {Object} Historical storage manager
 */
export function createMetricsStorage() {
  // In-memory storage
  let rawMetrics = [];       // Minute-by-minute, last 24 hours
  let hourlyMetrics = [];    // Hourly aggregates, last 30 days
  let dailyMetrics = [];     // Daily aggregates, 1 year

  // Agent efficiency tracking (separate from system metrics)
  let agentEfficiency = {};  // { agentId: { completions: [], hourly: [], daily: [] } }

  let saveTimer = null;
  let isDirty = false;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Load metrics from disk
   */
  function load() {
    if (existsSync(METRICS_FILE)) {
      try {
        const data = JSON.parse(readFileSync(METRICS_FILE, 'utf8'));
        rawMetrics = data.rawMetrics || [];
        hourlyMetrics = data.hourlyMetrics || [];
        dailyMetrics = data.dailyMetrics || [];
        agentEfficiency = data.agentEfficiency || {};

        // Clean up old data on load
        cleanup();
      } catch (err) {
        console.error('[metrics-storage] Failed to load metrics:', err.message);
      }
    }
  }

  /**
   * Save metrics to disk
   */
  function save() {
    if (!isDirty) return;

    try {
      writeFileSync(METRICS_FILE, JSON.stringify({
        rawMetrics,
        hourlyMetrics,
        dailyMetrics,
        agentEfficiency,
        lastUpdated: new Date().toISOString()
      }, null, 2));
      isDirty = false;
    } catch (err) {
      console.error('[metrics-storage] Failed to save metrics:', err.message);
    }
  }

  /**
   * Clean up old data based on retention policies
   */
  function cleanup() {
    const now = Date.now();
    const rawCutoff = now - (RAW_RETENTION_HOURS * 60 * 60 * 1000);
    const hourlyCutoff = now - (HOURLY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const dailyCutoff = now - (DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Filter out old raw metrics
    const rawBefore = rawMetrics.length;
    rawMetrics = rawMetrics.filter(m => new Date(m.timestamp).getTime() > rawCutoff);

    // Aggregate raw metrics older than 1 hour into hourly buckets
    aggregateToHourly();

    // Filter out old hourly metrics
    hourlyMetrics = hourlyMetrics.filter(m => new Date(m.timestamp).getTime() > hourlyCutoff);

    // Aggregate hourly metrics older than 30 days into daily buckets
    aggregateToDaily();

    // Filter out old daily metrics
    dailyMetrics = dailyMetrics.filter(m => new Date(m.timestamp).getTime() > dailyCutoff);

    if (rawBefore !== rawMetrics.length) {
      isDirty = true;
    }
  }

  /**
   * Aggregate raw metrics into hourly buckets
   */
  function aggregateToHourly() {
    if (rawMetrics.length === 0) return;

    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // Group raw metrics by hour
    const hourBuckets = {};
    const toAggregate = rawMetrics.filter(m => new Date(m.timestamp).getTime() < oneHourAgo);

    for (const metric of toAggregate) {
      const hour = new Date(metric.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();

      if (!hourBuckets[key]) {
        hourBuckets[key] = {
          timestamp: key,
          pollDurations: [],
          eventVolumes: [],
          agentCounts: { active: [], hooked: [], idle: [], error: [] }
        };
      }

      hourBuckets[key].pollDurations.push(metric.pollDuration);
      hourBuckets[key].eventVolumes.push(metric.eventVolume);
      if (metric.agentActivity) {
        hourBuckets[key].agentCounts.active.push(metric.agentActivity.active);
        hourBuckets[key].agentCounts.hooked.push(metric.agentActivity.hooked);
        hourBuckets[key].agentCounts.idle.push(metric.agentActivity.idle);
        hourBuckets[key].agentCounts.error.push(metric.agentActivity.error || 0);
      }
    }

    // Convert buckets to aggregated hourly metrics
    for (const [key, bucket] of Object.entries(hourBuckets)) {
      // Check if we already have this hour
      if (hourlyMetrics.some(m => m.timestamp === key)) continue;

      const hourlyMetric = {
        timestamp: key,
        pollDuration: {
          avg: average(bucket.pollDurations),
          min: Math.min(...bucket.pollDurations),
          max: Math.max(...bucket.pollDurations),
          count: bucket.pollDurations.length
        },
        eventVolume: {
          total: sum(bucket.eventVolumes),
          avg: average(bucket.eventVolumes),
          max: Math.max(...bucket.eventVolumes)
        },
        agentActivity: {
          active: { avg: average(bucket.agentCounts.active), max: Math.max(...bucket.agentCounts.active, 0) },
          hooked: { avg: average(bucket.agentCounts.hooked), max: Math.max(...bucket.agentCounts.hooked, 0) },
          idle: { avg: average(bucket.agentCounts.idle), max: Math.max(...bucket.agentCounts.idle, 0) },
          error: { avg: average(bucket.agentCounts.error), max: Math.max(...bucket.agentCounts.error, 0) }
        }
      };

      hourlyMetrics.push(hourlyMetric);
      isDirty = true;
    }

    // Sort hourly metrics by timestamp
    hourlyMetrics.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Aggregate hourly metrics into daily buckets
   */
  function aggregateToDaily() {
    if (hourlyMetrics.length === 0) return;

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Group hourly metrics by day
    const dayBuckets = {};
    const toAggregate = hourlyMetrics.filter(m => new Date(m.timestamp).getTime() < thirtyDaysAgo);

    for (const metric of toAggregate) {
      const day = new Date(metric.timestamp);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!dayBuckets[key]) {
        dayBuckets[key] = {
          date: key,
          pollDurations: [],
          eventVolumes: [],
          agentCounts: { active: [], hooked: [], idle: [], error: [] }
        };
      }

      dayBuckets[key].pollDurations.push(metric.pollDuration.avg);
      dayBuckets[key].eventVolumes.push(metric.eventVolume.total);
      dayBuckets[key].agentCounts.active.push(metric.agentActivity.active.avg);
      dayBuckets[key].agentCounts.hooked.push(metric.agentActivity.hooked.avg);
      dayBuckets[key].agentCounts.idle.push(metric.agentActivity.idle.avg);
      dayBuckets[key].agentCounts.error.push(metric.agentActivity.error.avg);
    }

    // Convert buckets to aggregated daily metrics
    for (const [key, bucket] of Object.entries(dayBuckets)) {
      // Check if we already have this day
      if (dailyMetrics.some(m => m.date === key)) continue;

      const dailyMetric = {
        date: key,
        timestamp: new Date(key).toISOString(),
        pollDuration: {
          avg: average(bucket.pollDurations),
          min: Math.min(...bucket.pollDurations),
          max: Math.max(...bucket.pollDurations)
        },
        eventVolume: {
          total: sum(bucket.eventVolumes),
          avg: average(bucket.eventVolumes)
        },
        agentActivity: {
          active: average(bucket.agentCounts.active),
          hooked: average(bucket.agentCounts.hooked),
          idle: average(bucket.agentCounts.idle),
          error: average(bucket.agentCounts.error)
        }
      };

      dailyMetrics.push(dailyMetric);
      isDirty = true;
    }

    // Sort daily metrics by date
    dailyMetrics.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /**
   * Helper: calculate average
   */
  function average(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  /**
   * Helper: calculate sum
   */
  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  /**
   * Start periodic save timer
   */
  function startAutoSave() {
    if (saveTimer) return;
    saveTimer = setInterval(() => {
      cleanup();
      save();
    }, SAVE_INTERVAL_MS);
  }

  /**
   * Stop periodic save timer
   */
  function stopAutoSave() {
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
  }

  // Load existing data on startup
  load();

  return {
    /**
     * Record a metrics snapshot
     * @param {Object} metrics - Current metrics from collector
     */
    recordMetrics(metrics) {
      const record = {
        timestamp: new Date().toISOString(),
        pollDuration: metrics.pollDuration,
        avgPollDuration: metrics.avgPollDuration,
        eventVolume: metrics.bufferSizes?.currentIntervalEvents || 0,
        totalEvents: metrics.totalEvents,
        totalPolls: metrics.totalPolls,
        successRate: metrics.successRate,
        wsConnections: metrics.wsConnections,
        agentActivity: { ...metrics.agentActivity }
      };

      rawMetrics.push(record);
      isDirty = true;

      // Cleanup periodically (every 100 records)
      if (rawMetrics.length % 100 === 0) {
        cleanup();
      }
    },

    /**
     * Record agent task completion for efficiency tracking
     * @param {string} agentId - Agent identifier
     * @param {Object} completion - Task completion data
     */
    recordAgentCompletion(agentId, completion) {
      if (!agentEfficiency[agentId]) {
        agentEfficiency[agentId] = {
          completions: [],
          hourly: [],
          daily: []
        };
      }

      agentEfficiency[agentId].completions.push({
        timestamp: completion.completedAt || new Date().toISOString(),
        duration: completion.duration,
        beadId: completion.beadId
      });

      // Keep only last 1000 completions per agent
      if (agentEfficiency[agentId].completions.length > 1000) {
        agentEfficiency[agentId].completions.shift();
      }

      isDirty = true;
    },

    /**
     * Query metrics by time range
     * @param {Date|string} start - Start time
     * @param {Date|string} end - End time
     * @param {string} interval - 'minute', 'hour', or 'day'
     * @returns {Array} Metrics in the range
     */
    queryRange(start, end, interval = 'auto') {
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const rangeDuration = endTime - startTime;

      // Auto-select interval based on range duration
      if (interval === 'auto') {
        if (rangeDuration <= 2 * 60 * 60 * 1000) {
          interval = 'minute';  // < 2 hours: minute data
        } else if (rangeDuration <= 7 * 24 * 60 * 60 * 1000) {
          interval = 'hour';    // < 7 days: hourly data
        } else {
          interval = 'day';     // > 7 days: daily data
        }
      }

      let result = [];

      if (interval === 'minute') {
        result = rawMetrics.filter(m => {
          const t = new Date(m.timestamp).getTime();
          return t >= startTime && t <= endTime;
        });
      } else if (interval === 'hour') {
        result = hourlyMetrics.filter(m => {
          const t = new Date(m.timestamp).getTime();
          return t >= startTime && t <= endTime;
        });

        // Also include aggregated raw data for recent hours
        const recentRaw = rawMetrics.filter(m => {
          const t = new Date(m.timestamp).getTime();
          return t >= startTime && t <= endTime;
        });

        // Group recent raw by hour if not already in hourly
        if (recentRaw.length > 0) {
          const hourBuckets = {};
          for (const m of recentRaw) {
            const hour = new Date(m.timestamp);
            hour.setMinutes(0, 0, 0);
            const key = hour.toISOString();

            if (result.some(r => r.timestamp === key)) continue;

            if (!hourBuckets[key]) {
              hourBuckets[key] = { pollDurations: [], eventVolumes: [], agents: [] };
            }
            hourBuckets[key].pollDurations.push(m.pollDuration);
            hourBuckets[key].eventVolumes.push(m.eventVolume);
            hourBuckets[key].agents.push(m.agentActivity);
          }

          for (const [key, bucket] of Object.entries(hourBuckets)) {
            result.push({
              timestamp: key,
              pollDuration: {
                avg: average(bucket.pollDurations),
                min: Math.min(...bucket.pollDurations),
                max: Math.max(...bucket.pollDurations),
                count: bucket.pollDurations.length
              },
              eventVolume: {
                total: sum(bucket.eventVolumes),
                avg: average(bucket.eventVolumes),
                max: Math.max(...bucket.eventVolumes)
              },
              agentActivity: bucket.agents.length > 0 ? {
                active: { avg: average(bucket.agents.map(a => a.active)), max: Math.max(...bucket.agents.map(a => a.active)) },
                hooked: { avg: average(bucket.agents.map(a => a.hooked)), max: Math.max(...bucket.agents.map(a => a.hooked)) },
                idle: { avg: average(bucket.agents.map(a => a.idle)), max: Math.max(...bucket.agents.map(a => a.idle)) },
                error: { avg: average(bucket.agents.map(a => a.error || 0)), max: Math.max(...bucket.agents.map(a => a.error || 0)) }
              } : { active: { avg: 0, max: 0 }, hooked: { avg: 0, max: 0 }, idle: { avg: 0, max: 0 }, error: { avg: 0, max: 0 } }
            });
          }
        }

        result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } else {
        result = dailyMetrics.filter(m => {
          const t = new Date(m.timestamp).getTime();
          return t >= startTime && t <= endTime;
        });
      }

      return result;
    },

    /**
     * Get agent efficiency data for a time range
     * @param {string} agentId - Agent ID (or 'all' for all agents)
     * @param {Date|string} start - Start time
     * @param {Date|string} end - End time
     * @returns {Object} Agent efficiency data
     */
    getAgentEfficiency(agentId, start, end) {
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();

      const agents = agentId === 'all' ? Object.keys(agentEfficiency) : [agentId];
      const result = {};

      for (const aid of agents) {
        if (!agentEfficiency[aid]) continue;

        const completions = agentEfficiency[aid].completions.filter(c => {
          const t = new Date(c.timestamp).getTime();
          return t >= startTime && t <= endTime;
        });

        // Calculate efficiency metrics
        const durations = completions.map(c => c.duration).filter(d => d > 0);
        result[aid] = {
          completionCount: completions.length,
          avgDuration: durations.length > 0 ? average(durations) : 0,
          minDuration: durations.length > 0 ? Math.min(...durations) : 0,
          maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
          completions: completions.slice(-100) // Return last 100 for charting
        };
      }

      return result;
    },

    /**
     * Get summary statistics for a time range
     * @param {Date|string} start - Start time
     * @param {Date|string} end - End time
     * @returns {Object} Summary statistics
     */
    getSummary(start, end) {
      const metrics = this.queryRange(start, end, 'auto');

      if (metrics.length === 0) {
        return {
          period: { start, end },
          metrics: null,
          message: 'No data available for this time range'
        };
      }

      // Detect anomalies using IQR method
      const pollDurations = metrics.map(m =>
        typeof m.pollDuration === 'object' ? m.pollDuration.avg : m.pollDuration
      ).filter(v => v != null);

      const anomalies = detectAnomalies(pollDurations);

      return {
        period: { start, end },
        dataPoints: metrics.length,
        pollDuration: {
          avg: average(pollDurations),
          min: Math.min(...pollDurations),
          max: Math.max(...pollDurations),
          anomalyCount: anomalies.length
        },
        totalEvents: metrics.reduce((sum, m) =>
          sum + (typeof m.eventVolume === 'object' ? m.eventVolume.total : m.eventVolume), 0
        ),
        anomalies: anomalies.map(i => ({
          timestamp: metrics[i].timestamp,
          value: pollDurations[i],
          type: pollDurations[i] > average(pollDurations) ? 'high' : 'low'
        }))
      };
    },

    /**
     * Get raw, hourly, and daily data sizes
     */
    getStorageStats() {
      return {
        raw: rawMetrics.length,
        hourly: hourlyMetrics.length,
        daily: dailyMetrics.length,
        agents: Object.keys(agentEfficiency).length,
        oldestRaw: rawMetrics[0]?.timestamp || null,
        newestRaw: rawMetrics[rawMetrics.length - 1]?.timestamp || null,
        oldestHourly: hourlyMetrics[0]?.timestamp || null,
        oldestDaily: dailyMetrics[0]?.date || null
      };
    },

    /**
     * Force save to disk
     */
    save,

    /**
     * Start auto-save timer
     */
    start() {
      startAutoSave();
    },

    /**
     * Stop and save
     */
    stop() {
      stopAutoSave();
      save();
    }
  };
}

/**
 * Detect anomalies using IQR (Interquartile Range) method
 * @param {Array<number>} data - Array of values
 * @returns {Array<number>} Indices of anomalous values
 */
function detectAnomalies(data) {
  if (data.length < 4) return [];

  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const anomalies = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] < lowerBound || data[i] > upperBound) {
      anomalies.push(i);
    }
  }

  return anomalies;
}

/**
 * Export for anomaly detection in client-side
 */
export { detectAnomalies };
