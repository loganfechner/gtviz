import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createStateManager } from './state.js';

describe('StateManager', () => {
  test('can be created', () => {
    const manager = createStateManager();
    assert.ok(manager);
    manager.destroy();
  });

  test('getState returns initial state', () => {
    const manager = createStateManager();
    const state = manager.getState();
    assert.deepStrictEqual(state.hooks, {});
    assert.strictEqual(state.lastUpdated, null);
    manager.destroy();
  });

  test('updateHooks stores hooks', () => {
    const manager = createStateManager();
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });
    const hooks = manager.getHooks();
    assert.ok(hooks.agent1);
    assert.strictEqual(hooks.agent1.status, 'active');
    manager.destroy();
  });

  test('subscribe receives updates', () => {
    const manager = createStateManager();
    const received = [];

    manager.subscribe((message) => {
      received.push(message);
    });

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    assert.ok(received.length >= 1);
    // First message should be hooks:updated
    const hooksUpdate = received.find(m => m.type === 'hooks:updated');
    assert.ok(hooksUpdate, 'Should receive hooks:updated message');
    manager.destroy();
  });

  test('notifies only on changes', () => {
    const manager = createStateManager();
    let callCount = 0;

    manager.subscribe(() => { callCount++; });

    // First update triggers notification
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });
    assert.strictEqual(callCount, 2); // hooks:updated + timeline:updated

    // Same update does not trigger notification
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });
    assert.strictEqual(callCount, 2);

    manager.destroy();
  });
});

describe('Timeline', () => {
  test('getTimelineSummary returns empty for new manager', () => {
    const manager = createStateManager();
    const summary = manager.getTimelineSummary();
    assert.strictEqual(summary.isEmpty, true);
    assert.strictEqual(summary.entryCount, 0);
    manager.destroy();
  });

  test('timeline stores snapshots on update', () => {
    const manager = createStateManager();

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    const summary = manager.getTimelineSummary();
    assert.strictEqual(summary.isEmpty, false);
    assert.strictEqual(summary.entryCount, 1);
    assert.strictEqual(summary.eventCount, 1);
    manager.destroy();
  });

  test('getTimeline returns all entries', () => {
    const manager = createStateManager();

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'idle', beadId: null }
    });

    const entries = manager.getTimeline();
    assert.strictEqual(entries.length, 2);
    manager.destroy();
  });

  test('getStateAtTime returns correct state', async () => {
    const manager = createStateManager();

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    const firstTime = manager.getState().lastUpdated;

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'idle', beadId: null }
    });

    // Get state at first time
    const state = manager.getStateAtTime(firstTime);
    assert.ok(state);
    assert.strictEqual(state.hooks.agent1.status, 'active');
    manager.destroy();
  });

  test('getTimelineEvents returns only entries with changes', () => {
    const manager = createStateManager();

    // First update has changes
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    // Second update with no changes still adds to timeline but not events
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    // Third update has changes
    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'idle', beadId: null }
    });

    const events = manager.getTimelineEvents();
    assert.strictEqual(events.length, 2); // Only 2 events with changes

    const allEntries = manager.getTimeline();
    assert.strictEqual(allEntries.length, 3); // All 3 snapshots stored

    manager.destroy();
  });

  test('getTimeline filters by time range', async () => {
    const manager = createStateManager();

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'active', beadId: 'bead-1' }
    });

    // Get the first entry's timestamp
    const firstTime = manager.getState().lastUpdated;

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 15));

    manager.updateHooks({
      agent1: { agent: 'agent1', status: 'idle', beadId: null }
    });

    const secondTime = manager.getState().lastUpdated;

    // Get only entries after first time (exclusive)
    const afterFirst = new Date(new Date(firstTime).getTime() + 1).toISOString();
    const filtered = manager.getTimeline(afterFirst);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].hooks.agent1.status, 'idle');

    manager.destroy();
  });
});
