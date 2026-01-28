/**
 * Session manager for tracking connected users
 * Enables real-time collaboration indicators
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

// Predefined colors for user cursors/indicators
const USER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

/**
 * Generate a short unique session ID
 * @returns {string} 8-character hex string
 */
function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a default username from session ID
 * @param {string} sessionId
 * @returns {string}
 */
function generateDefaultUsername(sessionId) {
  return `User-${sessionId.slice(0, 4)}`;
}

/**
 * Assign a color based on session order
 * @param {number} index
 * @returns {string}
 */
function assignColor(index) {
  return USER_COLORS[index % USER_COLORS.length];
}

export class SessionManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    /** @type {Map<WebSocket, string>} WebSocket to sessionId mapping */
    this.wsToSession = new Map();
    this.colorIndex = 0;
  }

  /**
   * Create a new session for a WebSocket connection
   * @param {WebSocket} ws
   * @param {string} [username] Optional username from query params
   * @returns {Session}
   */
  createSession(ws, username) {
    const sessionId = generateSessionId();
    const session = {
      id: sessionId,
      username: username || generateDefaultUsername(sessionId),
      color: assignColor(this.colorIndex++),
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      currentView: {
        rig: null,
        agent: null,
        tab: null
      }
    };

    this.sessions.set(sessionId, session);
    this.wsToSession.set(ws, sessionId);

    this.emit('userJoined', session);
    return session;
  }

  /**
   * Remove a session when WebSocket disconnects
   * @param {WebSocket} ws
   * @returns {Session|null}
   */
  removeSession(ws) {
    const sessionId = this.wsToSession.get(ws);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    this.wsToSession.delete(ws);

    if (session) {
      this.emit('userLeft', session);
    }
    return session;
  }

  /**
   * Get session by WebSocket
   * @param {WebSocket} ws
   * @returns {Session|null}
   */
  getSessionByWs(ws) {
    const sessionId = this.wsToSession.get(ws);
    return sessionId ? this.sessions.get(sessionId) : null;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {Session|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update user's current view
   * @param {WebSocket} ws
   * @param {object} view - { rig, agent, tab }
   * @returns {Session|null}
   */
  updateView(ws, view) {
    const session = this.getSessionByWs(ws);
    if (!session) return null;

    const oldView = { ...session.currentView };
    session.currentView = {
      rig: view.rig ?? session.currentView.rig,
      agent: view.agent ?? session.currentView.agent,
      tab: view.tab ?? session.currentView.tab
    };
    session.lastActivity = new Date().toISOString();

    // Only emit if view actually changed
    if (JSON.stringify(oldView) !== JSON.stringify(session.currentView)) {
      this.emit('viewChanged', session);
    }
    return session;
  }

  /**
   * Update username
   * @param {WebSocket} ws
   * @param {string} username
   * @returns {Session|null}
   */
  setUsername(ws, username) {
    const session = this.getSessionByWs(ws);
    if (!session) return null;

    session.username = username;
    session.lastActivity = new Date().toISOString();
    this.emit('usernameChanged', session);
    return session;
  }

  /**
   * Get all active sessions
   * @returns {Session[]}
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get users viewing a specific agent
   * @param {string} rig
   * @param {string} agent
   * @returns {Session[]}
   */
  getUsersViewingAgent(rig, agent) {
    return this.getAllSessions().filter(
      s => s.currentView.rig === rig && s.currentView.agent === agent
    );
  }

  /**
   * Get number of connected users
   * @returns {number}
   */
  getUserCount() {
    return this.sessions.size;
  }

  /**
   * Get presence summary for broadcasting
   * @returns {PresenceSummary}
   */
  getPresenceSummary() {
    const sessions = this.getAllSessions();
    return {
      users: sessions.map(s => ({
        id: s.id,
        username: s.username,
        color: s.color,
        currentView: s.currentView,
        lastActivity: s.lastActivity
      })),
      count: sessions.length
    };
  }
}

/**
 * @typedef {object} Session
 * @property {string} id - Unique session identifier
 * @property {string} username - Display name
 * @property {string} color - Assigned color for indicators
 * @property {string} connectedAt - ISO timestamp
 * @property {string} lastActivity - ISO timestamp of last activity
 * @property {object} currentView - What the user is viewing
 * @property {string|null} currentView.rig
 * @property {string|null} currentView.agent
 * @property {string|null} currentView.tab
 */

/**
 * @typedef {object} PresenceSummary
 * @property {object[]} users - Array of user presence info
 * @property {number} count - Total connected users
 */
