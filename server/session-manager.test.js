import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let sessionManager;
  let mockWs;

  beforeEach(() => {
    sessionManager = new SessionManager();
    mockWs = { readyState: 1 };
  });

  describe('createSession', () => {
    it('creates a session with default username', () => {
      const session = sessionManager.createSession(mockWs);

      assert.ok(session.id);
      assert.ok(session.username.startsWith('User-'));
      assert.ok(session.color);
      assert.ok(session.connectedAt);
      assert.strictEqual(session.currentView.rig, null);
      assert.strictEqual(session.currentView.agent, null);
    });

    it('creates a session with provided username', () => {
      const session = sessionManager.createSession(mockWs, 'Alice');

      assert.strictEqual(session.username, 'Alice');
    });

    it('emits userJoined event', () => {
      let emittedSession = null;
      sessionManager.on('userJoined', (s) => { emittedSession = s; });

      const session = sessionManager.createSession(mockWs);

      assert.strictEqual(emittedSession, session);
    });

    it('assigns unique colors to sessions', () => {
      const ws1 = { readyState: 1 };
      const ws2 = { readyState: 1 };

      const session1 = sessionManager.createSession(ws1);
      const session2 = sessionManager.createSession(ws2);

      assert.ok(session1.color);
      assert.ok(session2.color);
      assert.notStrictEqual(session1.color, session2.color);
    });
  });

  describe('removeSession', () => {
    it('removes session and emits userLeft event', () => {
      const session = sessionManager.createSession(mockWs);
      let emittedSession = null;
      sessionManager.on('userLeft', (s) => { emittedSession = s; });

      const removed = sessionManager.removeSession(mockWs);

      assert.strictEqual(removed, session);
      assert.strictEqual(emittedSession, session);
      assert.strictEqual(sessionManager.getUserCount(), 0);
    });

    it('returns null for unknown websocket', () => {
      const unknownWs = { readyState: 1 };
      const removed = sessionManager.removeSession(unknownWs);
      assert.strictEqual(removed, null);
    });
  });

  describe('updateView', () => {
    it('updates view and emits viewChanged event', () => {
      const session = sessionManager.createSession(mockWs);
      let emittedSession = null;
      sessionManager.on('viewChanged', (s) => { emittedSession = s; });

      sessionManager.updateView(mockWs, { rig: 'gtviz', agent: 'slit' });

      assert.strictEqual(session.currentView.rig, 'gtviz');
      assert.strictEqual(session.currentView.agent, 'slit');
      assert.strictEqual(emittedSession, session);
    });

    it('does not emit if view unchanged', () => {
      const session = sessionManager.createSession(mockWs);
      sessionManager.updateView(mockWs, { rig: 'gtviz' });

      let emitCount = 0;
      sessionManager.on('viewChanged', () => { emitCount++; });

      sessionManager.updateView(mockWs, { rig: 'gtviz' });

      assert.strictEqual(emitCount, 0);
    });
  });

  describe('setUsername', () => {
    it('updates username and emits usernameChanged event', () => {
      const session = sessionManager.createSession(mockWs);
      let emittedSession = null;
      sessionManager.on('usernameChanged', (s) => { emittedSession = s; });

      sessionManager.setUsername(mockWs, 'Bob');

      assert.strictEqual(session.username, 'Bob');
      assert.strictEqual(emittedSession, session);
    });
  });

  describe('getPresenceSummary', () => {
    it('returns correct presence summary', () => {
      const ws1 = { readyState: 1 };
      const ws2 = { readyState: 1 };
      sessionManager.createSession(ws1, 'Alice');
      sessionManager.createSession(ws2, 'Bob');

      const summary = sessionManager.getPresenceSummary();

      assert.strictEqual(summary.count, 2);
      assert.strictEqual(summary.users.length, 2);
      assert.ok(summary.users.find(u => u.username === 'Alice'));
      assert.ok(summary.users.find(u => u.username === 'Bob'));
    });
  });

  describe('getUsersViewingAgent', () => {
    it('returns users viewing a specific agent', () => {
      const ws1 = { readyState: 1 };
      const ws2 = { readyState: 1 };
      sessionManager.createSession(ws1, 'Alice');
      sessionManager.createSession(ws2, 'Bob');
      sessionManager.updateView(ws1, { rig: 'gtviz', agent: 'slit' });
      sessionManager.updateView(ws2, { rig: 'gtviz', agent: 'refinery' });

      const viewers = sessionManager.getUsersViewingAgent('gtviz', 'slit');

      assert.strictEqual(viewers.length, 1);
      assert.strictEqual(viewers[0].username, 'Alice');
    });
  });
});
