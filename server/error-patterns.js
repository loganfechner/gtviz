/**
 * Error Pattern Analyzer
 *
 * Clusters similar errors across agents to identify systemic issues vs isolated problems.
 * Uses message similarity and error type extraction to group related errors.
 */

/**
 * Extract the core error type/pattern from a message
 * Normalizes variable parts (IDs, timestamps, paths) to identify similar errors
 */
export function extractErrorPattern(message) {
  if (!message) return 'Unknown error';

  let pattern = message;

  // Normalize file paths
  pattern = pattern.replace(/\/[\w\-./]+/g, '<path>');

  // Normalize IDs (hex, uuid-like, numeric)
  pattern = pattern.replace(/\b[0-9a-f]{8,}\b/gi, '<id>');
  pattern = pattern.replace(/\b[0-9a-f]{4,}-[0-9a-f]{4,}[0-9a-f-]*\b/gi, '<uuid>');
  pattern = pattern.replace(/\b\d{4,}\b/g, '<num>');

  // Normalize timestamps
  pattern = pattern.replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\dZ]*/g, '<timestamp>');
  pattern = pattern.replace(/\d{2}:\d{2}:\d{2}/g, '<time>');

  // Normalize IP addresses
  pattern = pattern.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<ip>');

  // Normalize port numbers
  pattern = pattern.replace(/:\d{4,5}\b/g, ':<port>');

  // Normalize agent/polecat names in common patterns
  pattern = pattern.replace(/polecat[s]?\/[\w-]+/gi, 'polecats/<agent>');
  pattern = pattern.replace(/agent[\s:]+[\w-]+/gi, 'agent <agent>');

  // Trim and normalize whitespace
  pattern = pattern.replace(/\s+/g, ' ').trim();

  // Truncate very long patterns
  if (pattern.length > 200) {
    pattern = pattern.substring(0, 197) + '...';
  }

  return pattern;
}

/**
 * Calculate similarity between two strings using Jaccard index on word tokens
 */
function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Error Pattern Analyzer class
 * Maintains clusters of similar errors and provides analysis methods
 */
export class ErrorPatternAnalyzer {
  constructor(options = {}) {
    this.patterns = new Map();  // patternKey -> PatternCluster
    this.maxPatterns = options.maxPatterns || 100;
    this.maxErrorsPerPattern = options.maxErrorsPerPattern || 50;
    this.similarityThreshold = options.similarityThreshold || 0.7;
  }

  /**
   * Add a log entry to pattern analysis
   * Only processes error and warn level logs
   */
  addLog(log) {
    if (!log || !['error', 'warn'].includes(log.level)) {
      return null;
    }

    const pattern = extractErrorPattern(log.message);
    const patternKey = this.findOrCreatePattern(pattern, log.level);

    const cluster = this.patterns.get(patternKey);
    if (cluster) {
      this.updateCluster(cluster, log);
      return cluster;
    }

    return null;
  }

  /**
   * Find existing pattern that matches or create new one
   */
  findOrCreatePattern(pattern, level) {
    // First check for exact match
    if (this.patterns.has(pattern)) {
      return pattern;
    }

    // Look for similar patterns
    for (const [key, cluster] of this.patterns) {
      if (cluster.level === level && calculateSimilarity(pattern, key) >= this.similarityThreshold) {
        return key;
      }
    }

    // Create new pattern cluster
    if (this.patterns.size >= this.maxPatterns) {
      // Remove oldest/least frequent pattern
      this.prunePatterns();
    }

    this.patterns.set(pattern, {
      pattern,
      level,
      count: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      affectedAgents: new Set(),
      affectedRigs: new Set(),
      recentErrors: [],
      examples: []
    });

    return pattern;
  }

  /**
   * Update cluster with new error instance
   */
  updateCluster(cluster, log) {
    cluster.count++;
    cluster.lastSeen = log.timestamp || new Date().toISOString();

    if (log.agent) {
      cluster.affectedAgents.add(log.agent);
    }
    if (log.rig) {
      cluster.affectedRigs.add(log.rig);
    }

    // Keep recent errors for context
    cluster.recentErrors.unshift({
      timestamp: log.timestamp,
      message: log.message,
      agent: log.agent,
      rig: log.rig,
      source: log.source
    });

    if (cluster.recentErrors.length > this.maxErrorsPerPattern) {
      cluster.recentErrors = cluster.recentErrors.slice(0, this.maxErrorsPerPattern);
    }

    // Keep a few unique examples (original messages)
    if (cluster.examples.length < 3) {
      const exists = cluster.examples.some(e => e.message === log.message);
      if (!exists) {
        cluster.examples.push({
          message: log.message,
          timestamp: log.timestamp
        });
      }
    }
  }

  /**
   * Remove least relevant patterns when at capacity
   */
  prunePatterns() {
    if (this.patterns.size === 0) return;

    // Score patterns: lower = more likely to prune
    const scored = [...this.patterns.entries()].map(([key, cluster]) => {
      const recency = Date.now() - new Date(cluster.lastSeen).getTime();
      const frequency = cluster.count;
      const scope = cluster.affectedAgents.size + cluster.affectedRigs.size;

      // Higher score = more important to keep
      const score = (frequency * 10) + (scope * 5) - (recency / 60000);
      return { key, score };
    });

    // Remove lowest scoring pattern
    scored.sort((a, b) => a.score - b.score);
    if (scored.length > 0) {
      this.patterns.delete(scored[0].key);
    }
  }

  /**
   * Get all patterns as a serializable array
   */
  getPatterns() {
    const patterns = [...this.patterns.values()].map(cluster => ({
      pattern: cluster.pattern,
      level: cluster.level,
      count: cluster.count,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
      affectedAgents: [...cluster.affectedAgents],
      affectedRigs: [...cluster.affectedRigs],
      recentErrors: cluster.recentErrors.slice(0, 10),
      examples: cluster.examples,
      isSystemic: cluster.affectedAgents.size > 1 || cluster.affectedRigs.size > 1
    }));

    // Sort by count (most frequent first), then by recency
    patterns.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastSeen) - new Date(a.lastSeen);
    });

    return patterns;
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const patterns = this.getPatterns();
    const totalErrors = patterns.reduce((sum, p) => sum + p.count, 0);
    const systemicPatterns = patterns.filter(p => p.isSystemic);
    const errorPatterns = patterns.filter(p => p.level === 'error');
    const warnPatterns = patterns.filter(p => p.level === 'warn');

    // Get all unique affected agents
    const allAgents = new Set();
    patterns.forEach(p => p.affectedAgents.forEach(a => allAgents.add(a)));

    return {
      totalPatterns: patterns.length,
      totalErrors,
      systemicCount: systemicPatterns.length,
      isolatedCount: patterns.length - systemicPatterns.length,
      errorCount: errorPatterns.reduce((sum, p) => sum + p.count, 0),
      warnCount: warnPatterns.reduce((sum, p) => sum + p.count, 0),
      affectedAgentsCount: allAgents.size,
      topPatterns: patterns.slice(0, 5)
    };
  }

  /**
   * Clear all patterns
   */
  clear() {
    this.patterns.clear();
  }
}

export default ErrorPatternAnalyzer;
