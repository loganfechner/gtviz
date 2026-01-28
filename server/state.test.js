/**
 * Tests for state.js - State Manager
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createStateManager } from './state.js';

describe('createStateManager', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = createStateManager();
  });

  describe('getState', () => {
    it('returns initial state with empty agents and hooks', () => {
      const state = stateManager.getState();

      assert.deepStrictEqual(state.agents, {});
      assert.deepStrictEqual(state.hooks, {});
      assert.strictEqual(state.lastUpdated, null);
    });

    it('returns a copy of state, not the original', () => {
      const state1 = stateManager.getState();
      const state2 = stateManager.getState();

      assert.notStrictEqual(state1, state2);
    });
  });

  describe('getHooks', () => {
    it('returns empty object initially', () => {
      const hooks = stateManager.getHooks();

      assert.deepStrictEqual(hooks, {});
    });

    it('returns a copy of hooks, not the original', () => {
      stateManager.updateHooks({
        agent1: { status: 'idle', beadId: null }
      });

      const hooks1 = stateManager.getHooks();
      const hooks2 = stateManager.getHooks();

      assert.notStrictEqual(hooks1, hooks2);
    });
  });

  describe('updateHooks', () => {
    it('stores hook status for agents', () => {
      const hookData = {
        agent1: { status: 'active', beadId: 'gt-123' },
        agent2: { status: 'idle', beadId: null }
      };

      stateManager.updateHooks(hookData);
      const hooks = stateManager.getHooks();

      assert.deepStrictEqual(hooks, hookData);
    });

    it('updates lastUpdated timestamp', () => {
      const before = new Date().toISOString();

      stateManager.updateHooks({
        agent1: { status: 'idle', beadId: null }
      });

      const state = stateManager.getState();

      assert.ok(state.lastUpdated >= before);
    });

    it('replaces existing hook data for an agent', () => {
      stateManager.updateHooks({
        agent1: { status: 'idle', beadId: null }
      });

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-456' }
      });

      const hooks = stateManager.getHooks();

      assert.strictEqual(hooks.agent1.status, 'active');
      assert.strictEqual(hooks.agent1.beadId, 'gt-456');
    });
  });

  describe('subscribe', () => {
    it('adds subscriber and returns unsubscribe function', () => {
      const callback = () => {};

      const unsubscribe = stateManager.subscribe(callback);

      assert.strictEqual(typeof unsubscribe, 'function');
      assert.strictEqual(stateManager.getSubscriberCount(), 1);
    });

    it('unsubscribe removes the subscriber', () => {
      const callback = () => {};

      const unsubscribe = stateManager.subscribe(callback);
      assert.strictEqual(stateManager.getSubscriberCount(), 1);

      unsubscribe();
      assert.strictEqual(stateManager.getSubscriberCount(), 0);
    });

    it('allows multiple subscribers', () => {
      stateManager.subscribe(() => {});
      stateManager.subscribe(() => {});
      stateManager.subscribe(() => {});

      assert.strictEqual(stateManager.getSubscriberCount(), 3);
    });
  });

  describe('event emission', () => {
    it('notifies subscribers when hooks change', () => {
      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].type, 'hooks:updated');
      assert.ok(messages[0].timestamp);
    });

    it('includes changes array in notification', () => {
      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      const data = messages[0].data;
      assert.ok(Array.isArray(data.changes));
      assert.strictEqual(data.changes.length, 1);
      assert.strictEqual(data.changes[0].agent, 'agent1');
      assert.strictEqual(data.changes[0].previous, null);
      assert.strictEqual(data.changes[0].current.status, 'active');
    });

    it('does not notify when no changes occur', () => {
      const hookData = {
        agent1: { status: 'active', beadId: 'gt-123' }
      };

      stateManager.updateHooks(hookData);

      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      // Update with same data
      stateManager.updateHooks(hookData);

      assert.strictEqual(messages.length, 0);
    });

    it('detects change in beadId', () => {
      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-456' }
      });

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].data.changes[0].previous.beadId, 'gt-123');
      assert.strictEqual(messages[0].data.changes[0].current.beadId, 'gt-456');
    });

    it('detects change in status', () => {
      stateManager.updateHooks({
        agent1: { status: 'idle', beadId: null }
      });

      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].data.changes[0].previous.status, 'idle');
      assert.strictEqual(messages[0].data.changes[0].current.status, 'active');
    });

    it('handles subscriber errors gracefully', () => {
      const messages = [];

      // First subscriber throws
      stateManager.subscribe(() => {
        throw new Error('Subscriber error');
      });

      // Second subscriber should still be called
      stateManager.subscribe((msg) => messages.push(msg));

      // Should not throw
      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      // Second subscriber received the message
      assert.strictEqual(messages.length, 1);
    });

    it('includes all hooks in notification data', () => {
      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' }
      });

      const messages = [];
      stateManager.subscribe((msg) => messages.push(msg));

      stateManager.updateHooks({
        agent1: { status: 'active', beadId: 'gt-123' },
        agent2: { status: 'idle', beadId: null }
      });

      const data = messages[0].data;
      assert.ok('agent1' in data.hooks);
      assert.ok('agent2' in data.hooks);
    });
  });

  describe('getSubscriberCount', () => {
    it('returns 0 initially', () => {
      assert.strictEqual(stateManager.getSubscriberCount(), 0);
    });

    it('tracks subscriber count accurately', () => {
      const unsub1 = stateManager.subscribe(() => {});
      const unsub2 = stateManager.subscribe(() => {});

      assert.strictEqual(stateManager.getSubscriberCount(), 2);

      unsub1();
      assert.strictEqual(stateManager.getSubscriberCount(), 1);

      unsub2();
      assert.strictEqual(stateManager.getSubscriberCount(), 0);
    });
  });
});
