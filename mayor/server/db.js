/**
 * Database Persistence Layer
 *
 * SQLite storage for events, hooks, beads, and mail.
 * Provides historical trending queries and retention policies.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default database path
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/gtviz.db');

/**
 * Create a database manager
 * @param {Object} options - Configuration options
 * @param {string} options.dbPath - Path to SQLite database file
 * @param {Object} options.retention - Retention policy configuration
 * @returns {Object} Database manager
 */
export function createDatabaseManager(options = {}) {
  const {
    dbPath = DEFAULT_DB_PATH,
    retention = {
      events: 7,      // days to keep events
      hooks: 30,      // days to keep hook snapshots
      beads: 90,      // days to keep bead records
      mail: 30,       // days to keep mail
      metrics: 7      // days to keep metrics
    }
  } = options;

  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  initializeSchema(db);

  /**
   * Initialize database schema
   */
  function initializeSchema(db) {
    db.exec(`
      -- Events table: stores state change events
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        agent TEXT,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Hooks table: stores hook state snapshots
      CREATE TABLE IF NOT EXISTS hooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        status TEXT NOT NULL,
        bead_id TEXT,
        bead_title TEXT,
        molecule_id TEXT,
        autonomous_mode INTEGER DEFAULT 0,
        label TEXT,
        error TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Beads table: stores bead records
      CREATE TABLE IF NOT EXISTS beads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bead_id TEXT NOT NULL,
        title TEXT,
        agent TEXT,
        status TEXT,
        attached_at TEXT,
        completed_at TEXT,
        data TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Mail table: stores mail records
      CREATE TABLE IF NOT EXISTS mail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mail_id TEXT,
        sender TEXT,
        recipient TEXT,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'pending',
        data TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Metrics table: stores historical metrics
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_duration INTEGER,
        event_count INTEGER,
        active_agents INTEGER,
        hooked_agents INTEGER,
        idle_agents INTEGER,
        error_agents INTEGER,
        data TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
      CREATE INDEX IF NOT EXISTS idx_hooks_agent ON hooks(agent);
      CREATE INDEX IF NOT EXISTS idx_hooks_timestamp ON hooks(timestamp);
      CREATE INDEX IF NOT EXISTS idx_beads_bead_id ON beads(bead_id);
      CREATE INDEX IF NOT EXISTS idx_beads_agent ON beads(agent);
      CREATE INDEX IF NOT EXISTS idx_mail_recipient ON mail(recipient);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    `);
  }

  // Prepared statements for common operations
  const statements = {
    // Events
    insertEvent: db.prepare(`
      INSERT INTO events (type, agent, data, timestamp)
      VALUES (?, ?, ?, ?)
    `),
    getEventsByTimeRange: db.prepare(`
      SELECT * FROM events
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    getEventsByAgent: db.prepare(`
      SELECT * FROM events
      WHERE agent = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),

    // Hooks
    insertHook: db.prepare(`
      INSERT INTO hooks (agent, status, bead_id, bead_title, molecule_id, autonomous_mode, label, error, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getHookHistory: db.prepare(`
      SELECT * FROM hooks
      WHERE agent = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    getLatestHooks: db.prepare(`
      SELECT h1.* FROM hooks h1
      INNER JOIN (
        SELECT agent, MAX(timestamp) as max_ts
        FROM hooks
        GROUP BY agent
      ) h2 ON h1.agent = h2.agent AND h1.timestamp = h2.max_ts
    `),

    // Beads
    insertBead: db.prepare(`
      INSERT INTO beads (bead_id, title, agent, status, attached_at, completed_at, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateBeadStatus: db.prepare(`
      UPDATE beads SET status = ?, completed_at = ? WHERE bead_id = ? AND completed_at IS NULL
    `),
    getBeadsByAgent: db.prepare(`
      SELECT * FROM beads
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    getBeadById: db.prepare(`
      SELECT * FROM beads WHERE bead_id = ? ORDER BY timestamp DESC LIMIT 1
    `),

    // Mail
    insertMail: db.prepare(`
      INSERT INTO mail (mail_id, sender, recipient, subject, body, status, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateMailStatus: db.prepare(`
      UPDATE mail SET status = ? WHERE mail_id = ?
    `),
    getMailByRecipient: db.prepare(`
      SELECT * FROM mail
      WHERE recipient = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),

    // Metrics
    insertMetrics: db.prepare(`
      INSERT INTO metrics (poll_duration, event_count, active_agents, hooked_agents, idle_agents, error_agents, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getMetricsByTimeRange: db.prepare(`
      SELECT * FROM metrics
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `),

    // Retention cleanup
    deleteOldEvents: db.prepare(`DELETE FROM events WHERE created_at < datetime('now', ?)`),
    deleteOldHooks: db.prepare(`DELETE FROM hooks WHERE created_at < datetime('now', ?)`),
    deleteOldBeads: db.prepare(`DELETE FROM beads WHERE created_at < datetime('now', ?)`),
    deleteOldMail: db.prepare(`DELETE FROM mail WHERE created_at < datetime('now', ?)`),
    deleteOldMetrics: db.prepare(`DELETE FROM metrics WHERE created_at < datetime('now', ?)`)
  };

  return {
    // ============ Event Operations ============

    /**
     * Record a state change event
     * @param {Object} event - Event data
     */
    recordEvent(event) {
      const { type, agent, data, timestamp } = event;
      statements.insertEvent.run(
        type,
        agent || null,
        typeof data === 'string' ? data : JSON.stringify(data),
        timestamp || new Date().toISOString()
      );
    },

    /**
     * Get events by time range
     * @param {string} startTime - ISO timestamp
     * @param {string} endTime - ISO timestamp
     * @param {number} limit - Max results
     * @returns {Array} Events
     */
    getEvents(startTime, endTime, limit = 1000) {
      return statements.getEventsByTimeRange.all(startTime, endTime, limit).map(row => ({
        ...row,
        data: JSON.parse(row.data)
      }));
    },

    /**
     * Get events for a specific agent
     * @param {string} agent - Agent name
     * @param {string} since - ISO timestamp
     * @param {number} limit - Max results
     * @returns {Array} Events
     */
    getEventsByAgent(agent, since, limit = 100) {
      return statements.getEventsByAgent.all(agent, since, limit).map(row => ({
        ...row,
        data: JSON.parse(row.data)
      }));
    },

    // ============ Hook Operations ============

    /**
     * Record a hook state snapshot
     * @param {Object} hook - Hook status data
     */
    recordHook(hook) {
      const {
        agent,
        status,
        beadId,
        beadTitle,
        moleculeId,
        autonomousMode,
        label,
        error,
        timestamp
      } = hook;

      statements.insertHook.run(
        agent,
        status,
        beadId || null,
        beadTitle || null,
        moleculeId || null,
        autonomousMode ? 1 : 0,
        label || null,
        error || null,
        timestamp || new Date().toISOString()
      );
    },

    /**
     * Bulk record hook snapshots for all agents
     * @param {Object} hooks - Map of agent name to hook status
     * @param {string} timestamp - ISO timestamp
     */
    recordHooksSnapshot(hooks, timestamp = new Date().toISOString()) {
      const insertMany = db.transaction((hooks) => {
        for (const [agent, hook] of Object.entries(hooks)) {
          statements.insertHook.run(
            agent,
            hook.status,
            hook.beadId || null,
            hook.beadTitle || null,
            hook.moleculeId || null,
            hook.autonomousMode ? 1 : 0,
            hook.label || null,
            hook.error || null,
            timestamp
          );
        }
      });
      insertMany(hooks);
    },

    /**
     * Get hook history for an agent
     * @param {string} agent - Agent name
     * @param {string} since - ISO timestamp
     * @param {number} limit - Max results
     * @returns {Array} Hook snapshots
     */
    getHookHistory(agent, since, limit = 100) {
      return statements.getHookHistory.all(agent, since, limit);
    },

    /**
     * Get latest hook status for all agents
     * @returns {Array} Latest hook snapshots
     */
    getLatestHooks() {
      return statements.getLatestHooks.all();
    },

    // ============ Bead Operations ============

    /**
     * Record a bead
     * @param {Object} bead - Bead data
     */
    recordBead(bead) {
      const {
        beadId,
        title,
        agent,
        status,
        attachedAt,
        completedAt,
        data,
        timestamp
      } = bead;

      statements.insertBead.run(
        beadId,
        title || null,
        agent || null,
        status || 'active',
        attachedAt || null,
        completedAt || null,
        typeof data === 'string' ? data : JSON.stringify(data || {}),
        timestamp || new Date().toISOString()
      );
    },

    /**
     * Update bead status
     * @param {string} beadId - Bead ID
     * @param {string} status - New status
     * @param {string} completedAt - Completion timestamp
     */
    updateBeadStatus(beadId, status, completedAt = null) {
      statements.updateBeadStatus.run(status, completedAt, beadId);
    },

    /**
     * Get beads by agent
     * @param {string} agent - Agent name
     * @param {number} limit - Max results
     * @returns {Array} Beads
     */
    getBeadsByAgent(agent, limit = 50) {
      return statements.getBeadsByAgent.all(agent, limit).map(row => ({
        ...row,
        data: row.data ? JSON.parse(row.data) : null
      }));
    },

    /**
     * Get bead by ID
     * @param {string} beadId - Bead ID
     * @returns {Object|null} Bead
     */
    getBeadById(beadId) {
      const row = statements.getBeadById.get(beadId);
      if (row) {
        row.data = row.data ? JSON.parse(row.data) : null;
      }
      return row || null;
    },

    // ============ Mail Operations ============

    /**
     * Record mail
     * @param {Object} mail - Mail data
     */
    recordMail(mail) {
      const {
        mailId,
        sender,
        recipient,
        subject,
        body,
        status,
        data,
        timestamp
      } = mail;

      statements.insertMail.run(
        mailId || null,
        sender || null,
        recipient || null,
        subject || null,
        body || null,
        status || 'pending',
        typeof data === 'string' ? data : JSON.stringify(data || {}),
        timestamp || new Date().toISOString()
      );
    },

    /**
     * Update mail status
     * @param {string} mailId - Mail ID
     * @param {string} status - New status
     */
    updateMailStatus(mailId, status) {
      statements.updateMailStatus.run(status, mailId);
    },

    /**
     * Get mail by recipient
     * @param {string} recipient - Recipient name
     * @param {number} limit - Max results
     * @returns {Array} Mail
     */
    getMailByRecipient(recipient, limit = 50) {
      return statements.getMailByRecipient.all(recipient, limit).map(row => ({
        ...row,
        data: row.data ? JSON.parse(row.data) : null
      }));
    },

    // ============ Metrics Operations ============

    /**
     * Record metrics snapshot
     * @param {Object} metrics - Metrics data
     */
    recordMetrics(metrics) {
      const {
        pollDuration,
        eventCount,
        agentActivity,
        data,
        timestamp
      } = metrics;

      statements.insertMetrics.run(
        pollDuration || 0,
        eventCount || 0,
        agentActivity?.active || 0,
        agentActivity?.hooked || 0,
        agentActivity?.idle || 0,
        agentActivity?.error || 0,
        typeof data === 'string' ? data : JSON.stringify(data || {}),
        timestamp || new Date().toISOString()
      );
    },

    /**
     * Get metrics by time range
     * @param {string} startTime - ISO timestamp
     * @param {string} endTime - ISO timestamp
     * @returns {Array} Metrics
     */
    getMetrics(startTime, endTime) {
      return statements.getMetricsByTimeRange.all(startTime, endTime).map(row => ({
        ...row,
        data: row.data ? JSON.parse(row.data) : null
      }));
    },

    // ============ Trending Queries ============

    /**
     * Get agent activity trends over time
     * @param {string} since - ISO timestamp
     * @param {string} interval - Aggregation interval ('hour', 'day')
     * @returns {Array} Activity trends
     */
    getAgentActivityTrends(since, interval = 'hour') {
      const groupFormat = interval === 'day'
        ? '%Y-%m-%d'
        : '%Y-%m-%d %H:00';

      const sql = `
        SELECT
          strftime('${groupFormat}', timestamp) as period,
          AVG(active_agents) as avg_active,
          AVG(hooked_agents) as avg_hooked,
          AVG(idle_agents) as avg_idle,
          AVG(error_agents) as avg_error,
          COUNT(*) as sample_count
        FROM metrics
        WHERE timestamp >= ?
        GROUP BY period
        ORDER BY period ASC
      `;

      return db.prepare(sql).all(since);
    },

    /**
     * Get event volume trends
     * @param {string} since - ISO timestamp
     * @param {string} interval - Aggregation interval ('hour', 'day')
     * @returns {Array} Event trends
     */
    getEventTrends(since, interval = 'hour') {
      const groupFormat = interval === 'day'
        ? '%Y-%m-%d'
        : '%Y-%m-%d %H:00';

      const sql = `
        SELECT
          strftime('${groupFormat}', timestamp) as period,
          type,
          COUNT(*) as event_count
        FROM events
        WHERE timestamp >= ?
        GROUP BY period, type
        ORDER BY period ASC
      `;

      return db.prepare(sql).all(since);
    },

    /**
     * Get bead completion trends
     * @param {string} since - ISO timestamp
     * @returns {Array} Bead trends
     */
    getBeadTrends(since) {
      const sql = `
        SELECT
          strftime('%Y-%m-%d', timestamp) as period,
          agent,
          COUNT(*) as total_beads,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
        FROM beads
        WHERE timestamp >= ?
        GROUP BY period, agent
        ORDER BY period ASC
      `;

      return db.prepare(sql).all(since);
    },

    /**
     * Get hook status distribution over time
     * @param {string} agent - Agent name (optional, null for all)
     * @param {string} since - ISO timestamp
     * @returns {Array} Status distribution
     */
    getHookStatusDistribution(agent, since) {
      const sql = agent
        ? `
          SELECT
            strftime('%Y-%m-%d %H:00', timestamp) as period,
            status,
            COUNT(*) as count
          FROM hooks
          WHERE agent = ? AND timestamp >= ?
          GROUP BY period, status
          ORDER BY period ASC
        `
        : `
          SELECT
            strftime('%Y-%m-%d %H:00', timestamp) as period,
            status,
            COUNT(*) as count
          FROM hooks
          WHERE timestamp >= ?
          GROUP BY period, status
          ORDER BY period ASC
        `;

      return agent
        ? db.prepare(sql).all(agent, since)
        : db.prepare(sql).all(since);
    },

    // ============ Retention Policy ============

    /**
     * Apply retention policies to clean up old data
     * @returns {Object} Cleanup results
     */
    applyRetention() {
      const results = {};

      results.events = statements.deleteOldEvents.run(`-${retention.events} days`).changes;
      results.hooks = statements.deleteOldHooks.run(`-${retention.hooks} days`).changes;
      results.beads = statements.deleteOldBeads.run(`-${retention.beads} days`).changes;
      results.mail = statements.deleteOldMail.run(`-${retention.mail} days`).changes;
      results.metrics = statements.deleteOldMetrics.run(`-${retention.metrics} days`).changes;

      return results;
    },

    /**
     * Get current retention policy settings
     * @returns {Object} Retention settings
     */
    getRetentionPolicy() {
      return { ...retention };
    },

    // ============ Utility ============

    /**
     * Get database statistics
     * @returns {Object} Stats
     */
    getStats() {
      const tables = ['events', 'hooks', 'beads', 'mail', 'metrics'];
      const stats = {};

      for (const table of tables) {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        stats[table] = row.count;
      }

      // Database file size
      try {
        const dbStats = fs.statSync(dbPath);
        stats.fileSizeBytes = dbStats.size;
        stats.fileSizeMB = Math.round(dbStats.size / 1024 / 1024 * 100) / 100;
      } catch {
        stats.fileSizeBytes = 0;
        stats.fileSizeMB = 0;
      }

      return stats;
    },

    /**
     * Run a raw SQL query (for advanced use)
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Array} Results
     */
    query(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    /**
     * Close the database connection
     */
    close() {
      db.close();
    },

    /**
     * Get the raw database instance
     * @returns {Database} SQLite database
     */
    getDb() {
      return db;
    }
  };
}

// Export default instance factory
export default createDatabaseManager;
