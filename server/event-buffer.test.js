import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createEventBuffer } from './event-buffer.js';

describe('createEventBuffer', () => {
  test('can be created with default options', () => {
    const buffer = createEventBuffer();
    assert.ok(buffer);
    assert.strictEqual(typeof buffer.addEvent, 'function');
    assert.strictEqual(typeof buffer.getAllEvents, 'function');
  });

  test('can be created with custom options', () => {
    const buffer = createEventBuffer({
      maxAgeMs: 1000,
      maxEvents: 10
    });
    assert.ok(buffer);
  });
});

// Use very long maxAge for tests with old timestamps
const TEST_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

describe('addEvent', () => {
  test('adds event to buffer', () => {
    const buffer = createEventBuffer();
    buffer.addEvent({ type: 'test', data: 'hello' });
    const events = buffer.getAllEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'test');
  });

  test('auto-generates timestamp if missing', () => {
    const buffer = createEventBuffer();
    buffer.addEvent({ type: 'test' });
    const events = buffer.getAllEvents();
    assert.ok(events[0].timestamp);
  });

  test('preserves provided timestamp', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    const timestamp = '2026-01-01T12:00:00.000Z';
    buffer.addEvent({ type: 'test', timestamp });
    const events = buffer.getAllEvents();
    assert.strictEqual(events[0].timestamp, timestamp);
  });

  test('maintains sorted order', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });
    buffer.addEvent({ type: 'c', timestamp: '2026-01-01T14:00:00.000Z' });
    buffer.addEvent({ type: 'b', timestamp: '2026-01-01T13:00:00.000Z' }); // Out of order

    const events = buffer.getAllEvents();
    assert.strictEqual(events[0].type, 'a');
    assert.strictEqual(events[1].type, 'b');
    assert.strictEqual(events[2].type, 'c');
  });

  test('enforces maxEvents limit', () => {
    const buffer = createEventBuffer({ maxEvents: 3 });
    for (let i = 0; i < 5; i++) {
      buffer.addEvent({ type: `event-${i}`, timestamp: new Date(Date.now() + i * 1000).toISOString() });
    }
    const events = buffer.getAllEvents();
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'event-2'); // Oldest kept
    assert.strictEqual(events[2].type, 'event-4'); // Newest
  });
});

describe('getEventsBetween', () => {
  test('returns events within time range', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });
    buffer.addEvent({ type: 'b', timestamp: '2026-01-01T13:00:00.000Z' });
    buffer.addEvent({ type: 'c', timestamp: '2026-01-01T14:00:00.000Z' });

    const events = buffer.getEventsBetween(
      '2026-01-01T12:30:00.000Z',
      '2026-01-01T13:30:00.000Z'
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'b');
  });

  test('includes boundary events', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });
    buffer.addEvent({ type: 'b', timestamp: '2026-01-01T13:00:00.000Z' });

    const events = buffer.getEventsBetween(
      '2026-01-01T12:00:00.000Z',
      '2026-01-01T13:00:00.000Z'
    );
    assert.strictEqual(events.length, 2);
  });

  test('returns empty array for no matching events', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });

    const events = buffer.getEventsBetween(
      '2026-01-01T14:00:00.000Z',
      '2026-01-01T15:00:00.000Z'
    );
    assert.strictEqual(events.length, 0);
  });
});

describe('getEventAtTime', () => {
  test('returns most recent event at or before time', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });
    buffer.addEvent({ type: 'b', timestamp: '2026-01-01T13:00:00.000Z' });

    const event = buffer.getEventAtTime('2026-01-01T12:30:00.000Z');
    assert.strictEqual(event.type, 'a');
  });

  test('returns null for time before all events', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });

    const event = buffer.getEventAtTime('2026-01-01T11:00:00.000Z');
    assert.strictEqual(event, null);
  });
});

describe('getStateAtTime', () => {
  test('reconstructs state from events', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({
      type: 'hooks:updated',
      data: { hooks: { agent1: { status: 'idle' } } },
      timestamp: '2026-01-01T12:00:00.000Z'
    });
    buffer.addEvent({
      type: 'hooks:updated',
      data: { hooks: { agent1: { status: 'active' } } },
      timestamp: '2026-01-01T13:00:00.000Z'
    });

    const state = buffer.getStateAtTime('2026-01-01T12:30:00.000Z');
    assert.strictEqual(state.hooks.agent1.status, 'idle');

    const state2 = buffer.getStateAtTime('2026-01-01T13:30:00.000Z');
    assert.strictEqual(state2.hooks.agent1.status, 'active');
  });

  test('handles snapshot events', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({
      type: 'snapshot',
      data: { hooks: { agent1: { status: 'snapshot-state' } } },
      timestamp: '2026-01-01T12:00:00.000Z'
    });

    const state = buffer.getStateAtTime('2026-01-01T12:30:00.000Z');
    assert.strictEqual(state.hooks.agent1.status, 'snapshot-state');
  });

  test('sets isReplay flag', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({
      type: 'hooks:updated',
      data: { hooks: {} },
      timestamp: '2026-01-01T12:00:00.000Z'
    });

    const state = buffer.getStateAtTime('2026-01-01T12:30:00.000Z');
    assert.strictEqual(state.isReplay, true);
  });
});

describe('getEventMarkers', () => {
  test('returns simplified marker list', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({
      type: 'hooks:updated',
      data: { changes: [{ agent: 'test' }] },
      timestamp: '2026-01-01T12:00:00.000Z'
    });

    const markers = buffer.getEventMarkers();
    assert.strictEqual(markers.length, 1);
    assert.ok(markers[0].timestamp);
    assert.strictEqual(markers[0].type, 'hooks:updated');
    assert.strictEqual(markers[0].hasChanges, true);
  });
});

describe('getTimelineBounds', () => {
  test('returns start and end timestamps', () => {
    const buffer = createEventBuffer({ maxAgeMs: TEST_MAX_AGE });
    buffer.addEvent({ type: 'a', timestamp: '2026-01-01T12:00:00.000Z' });
    buffer.addEvent({ type: 'b', timestamp: '2026-01-01T14:00:00.000Z' });

    const bounds = buffer.getTimelineBounds();
    assert.strictEqual(bounds.start, '2026-01-01T12:00:00.000Z');
    assert.strictEqual(bounds.end, '2026-01-01T14:00:00.000Z');
  });

  test('handles empty buffer', () => {
    const buffer = createEventBuffer();
    const bounds = buffer.getTimelineBounds();
    assert.ok(bounds.start);
    assert.ok(bounds.end);
  });
});

describe('getStats', () => {
  test('returns buffer statistics', () => {
    const buffer = createEventBuffer({ maxEvents: 100, maxAgeMs: 1000 });
    buffer.addEvent({ type: 'test' });

    const stats = buffer.getStats();
    assert.strictEqual(stats.eventCount, 1);
    assert.strictEqual(stats.maxEvents, 100);
    assert.strictEqual(stats.maxAgeMs, 1000);
  });
});

describe('clear', () => {
  test('removes all events', () => {
    const buffer = createEventBuffer();
    buffer.addEvent({ type: 'a' });
    buffer.addEvent({ type: 'b' });
    assert.strictEqual(buffer.getAllEvents().length, 2);

    buffer.clear();
    assert.strictEqual(buffer.getAllEvents().length, 0);
  });
});
