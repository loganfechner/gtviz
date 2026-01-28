/**
 * Tests for gt-poller.js - GT Command Poller
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';

// We'll test the pure functions and mock the async operations
import {
  discoverAgents,
  getAgentHookStatus,
  pollAllAgentHooks,
  createHookPoller
} from './gt-poller.js';

describe('discoverAgents', () => {
  it('returns empty array for non-existent directory', async () => {
    const agents = await discoverAgents('/non/existent/path');

    assert.deepStrictEqual(agents, []);
  });
});

describe('getAgentHookStatus', () => {
  it('returns error status when gt hook command fails', async () => {
    const agent = {
      name: 'test-agent',
      role: 'polecat',
      path: '/non/existent/path'
    };

    const status = await getAgentHookStatus(agent);

    assert.strictEqual(status.agent, 'test-agent');
    assert.strictEqual(status.role, 'polecat');
    assert.strictEqual(status.status, 'error');
    assert.ok(status.error);
    assert.ok(status.lastUpdated);
  });

  it('includes agent name and role in result', async () => {
    const agent = {
      name: 'witness',
      role: 'witness',
      path: '/non/existent/path'
    };

    const status = await getAgentHookStatus(agent);

    assert.strictEqual(status.agent, 'witness');
    assert.strictEqual(status.role, 'witness');
  });

  it('sets lastUpdated to ISO timestamp', async () => {
    const agent = {
      name: 'test-agent',
      role: 'polecat',
      path: '/non/existent/path'
    };

    const before = new Date().toISOString();
    const status = await getAgentHookStatus(agent);

    assert.ok(status.lastUpdated >= before);
    // Verify it's a valid ISO string
    assert.ok(!isNaN(Date.parse(status.lastUpdated)));
  });
});

describe('pollAllAgentHooks', () => {
  it('returns empty object for non-existent rig path', async () => {
    const hooks = await pollAllAgentHooks('/non/existent/path');

    assert.deepStrictEqual(hooks, {});
  });

  it('returns object keyed by agent name', async () => {
    // This will discover no agents in a non-existent path
    const hooks = await pollAllAgentHooks('/tmp/fake-rig');

    assert.strictEqual(typeof hooks, 'object');
    assert.ok(!Array.isArray(hooks));
  });
});

describe('createHookPoller', () => {
  let poller;

  afterEach(() => {
    if (poller) {
      poller.stop();
      poller = null;
    }
  });

  it('returns object with start, stop, and pollNow methods', () => {
    poller = createHookPoller('/fake/path', () => {});

    assert.strictEqual(typeof poller.start, 'function');
    assert.strictEqual(typeof poller.stop, 'function');
    assert.strictEqual(typeof poller.pollNow, 'function');
  });

  it('start begins polling', (t, done) => {
    let callCount = 0;

    poller = createHookPoller('/fake/path', () => {
      callCount++;
      if (callCount >= 1) {
        poller.stop();
        assert.ok(callCount >= 1);
        done();
      }
    }, 50); // Fast interval for testing

    poller.start();
  });

  it('stop prevents further polling', (t, done) => {
    let callCount = 0;

    poller = createHookPoller('/fake/path', () => {
      callCount++;
    }, 50);

    poller.start();

    // Stop after first poll
    setTimeout(() => {
      poller.stop();
      const countAtStop = callCount;

      // Wait to see if more polls happen
      setTimeout(() => {
        assert.strictEqual(callCount, countAtStop, 'no more polls after stop');
        done();
      }, 150);
    }, 75);
  });

  it('start is idempotent (multiple calls do not create multiple intervals)', (t, done) => {
    let callCount = 0;

    poller = createHookPoller('/fake/path', () => {
      callCount++;
    }, 100);

    poller.start();
    poller.start(); // Should not create another interval
    poller.start();

    setTimeout(() => {
      poller.stop();
      // With 100ms interval and ~150ms wait, we expect ~2 calls if single interval
      // If multiple intervals were created, we'd see ~6 calls
      assert.ok(callCount <= 3, `expected <= 3 calls, got ${callCount}`);
      done();
    }, 150);
  });

  it('pollNow returns hook statuses immediately', async () => {
    poller = createHookPoller('/fake/path', () => {});

    const hooks = await poller.pollNow();

    assert.strictEqual(typeof hooks, 'object');
  });

  it('onUpdate callback receives hooks and duration', (t, done) => {
    poller = createHookPoller('/fake/path', (hooks, duration) => {
      poller.stop();

      assert.strictEqual(typeof hooks, 'object');
      assert.strictEqual(typeof duration, 'number');
      assert.ok(duration >= 0);
      done();
    }, 50);

    poller.start();
  });
});
