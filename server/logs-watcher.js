/**
 * Log File Watcher
 *
 * Watches Gas Town log files and streams new entries to the state manager.
 * Supports tailing multiple log files across all rigs.
 *
 * @module logs-watcher
 */

import chokidar from 'chokidar';
import { readFileSync, statSync } from 'fs';
import logger from './logger.js';

/**
 * @typedef {import('./types.js').LogEntry} LogEntry
 * @typedef {import('./types.js').LogLevel} LogLevel
 * @typedef {import('./types.js').LogType} LogType
 * @typedef {import('./state.js').StateManager} StateManager
 */

/**
 * LogsWatcher - Watches and tails Gas Town log files
 */
export class LogsWatcher {
  /**
   * Create a new LogsWatcher
   * @param {StateManager} state - State manager instance
   */
  constructor(state) {
    /** @type {StateManager} */
    this.state = state;
    /** @type {import('chokidar').FSWatcher[]} */
    this.watchers = [];
    /** @type {string} */
    this.gtDir = process.env.GT_DIR || `${process.env.HOME}/gt`;
    /** @type {Object<string, number>} */
    this.filePositions = {};
  }

  /**
   * Start watching log files
   */
  start() {
    const patterns = [
      `${this.gtDir}/*/town.log`,
      `${this.gtDir}/*/daemon.log`,
      `${this.gtDir}/*/mayor/*.log`,
      `${this.gtDir}/*/witness/*.log`,
      `${this.gtDir}/*/refinery/*.log`,
      `${this.gtDir}/*/polecats/*/*.log`,
      `${this.gtDir}/*/crew/*/*.log`
    ];

    const watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      followSymlinks: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 25
      }
    });

    watcher.on('add', path => this.handleNewFile(path));
    watcher.on('change', path => this.tailFile(path));

    this.watchers.push(watcher);
    logger.info('logs-watcher', 'Log file watcher started');
  }

  /**
   * Stop watching log files
   */
  stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  /**
   * Handle a new log file being added
   * @param {string} filePath - Path to the new log file
   */
  handleNewFile(filePath) {
    try {
      const stats = statSync(filePath);
      // Start at end of file for existing files (only tail new content)
      this.filePositions[filePath] = stats.size;

      // Read last 50 lines for initial context
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const recentLines = lines.slice(-50);

      for (const line of recentLines) {
        const parsed = this.parseLine(line, filePath);
        if (parsed) {
          this.state.addLog(parsed);
        }
      }
    } catch (err) {
      logger.warn('logs-watcher', 'Error reading new log file', { path: filePath, error: err.message });
    }
  }

  /**
   * Tail new content from a log file
   * @param {string} filePath - Path to the log file
   */
  tailFile(filePath) {
    try {
      const stats = statSync(filePath);
      const currentSize = stats.size;
      const lastPosition = this.filePositions[filePath] || 0;

      if (currentSize <= lastPosition) {
        // File was truncated, reset position
        this.filePositions[filePath] = 0;
        return;
      }

      // Read new content from last position
      const content = readFileSync(filePath, 'utf-8');
      const newContent = content.slice(lastPosition);
      const lines = newContent.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const parsed = this.parseLine(line, filePath);
        if (parsed) {
          this.state.addLog(parsed);
        }
      }

      this.filePositions[filePath] = currentSize;
    } catch (err) {
      logger.warn('logs-watcher', 'Error tailing log file', { path: filePath, error: err.message });
    }
  }

  /**
   * Parse a log line into a structured entry
   * @param {string} line - Raw log line
   * @param {string} filePath - Source file path
   * @returns {LogEntry|null} Parsed log entry or null if empty
   */
  parseLine(line, filePath) {
    const logInfo = this.extractLogInfo(filePath);

    // Try to parse structured log format: [timestamp] [level] message
    const structuredMatch = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+)$/);
    if (structuredMatch) {
      return {
        timestamp: structuredMatch[1],
        level: structuredMatch[2].toLowerCase(),
        message: structuredMatch[3],
        ...logInfo
      };
    }

    // Try timestamp prefix: 2024-01-01T12:00:00Z message
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(.+)$/);
    if (timestampMatch) {
      return {
        timestamp: timestampMatch[1],
        level: this.inferLevel(timestampMatch[2]),
        message: timestampMatch[2],
        ...logInfo
      };
    }

    // Plain line
    return {
      timestamp: new Date().toISOString(),
      level: this.inferLevel(line),
      message: line,
      ...logInfo
    };
  }

  /**
   * Extract rig/agent/logType info from file path
   * @param {string} filePath - Full path to log file
   * @returns {{rig: string, agent: string|null, logType: LogType, source: string}} Log source info
   */
  extractLogInfo(filePath) {
    const parts = filePath.replace(this.gtDir + '/', '').split('/');
    const rig = parts[0];
    /** @type {string|null} */
    let agent = null;
    /** @type {LogType} */
    let logType = 'unknown';

    const filename = parts[parts.length - 1];

    if (filename === 'town.log') {
      logType = 'town';
    } else if (filename === 'daemon.log') {
      logType = 'daemon';
    } else {
      logType = filename.replace('.log', '');
    }

    // Extract agent from path
    if (parts.length >= 2) {
      if (parts[1] === 'polecats' || parts[1] === 'crew') {
        agent = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : parts[1];
      } else if (['mayor', 'witness', 'refinery'].includes(parts[1])) {
        agent = parts[1];
      }
    }

    return { rig, agent, logType, source: filePath };
  }

  /**
   * Infer log level from message content
   * @param {string} message - Log message
   * @returns {LogLevel} Inferred log level
   */
  inferLevel(message) {
    const lower = message.toLowerCase();
    if (lower.includes('error') || lower.includes('fail')) return 'error';
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('debug')) return 'debug';
    return 'info';
  }
}
