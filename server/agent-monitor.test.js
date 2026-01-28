import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAgentMonitor } from './agent-monitor.js';

describe('createAgentMonitor', () => {
  it('returns monitor with expected methods', () => {
    const monitor = createAgentMonitor();

    assert.strictEqual(typeof monitor.recordSuccess, 'function');
    assert.strictEqual(typeof monitor.recordFailure, 'function');
    assert.strictEqual(typeof monitor.getAgentStats, 'function');
    assert.strictEqual(typeof monitor.getAllStats, 'function');
    assert.strictEqual(typeof monitor.getHealthSummary, 'function');
    assert.strictEqual(typeof monitor.subscribe, 'function');
  });

  it('tracks successful polls', () => {
    const monitor = createAgentMonitor();

    monitor.recordSuccess('agent1', 100);
    monitor.recordSuccess('agent1', 150);

    const stats = monitor.getAgentStats('agent1');
    assert.strictEqual(stats.totalPolls, 2);
    assert.strictEqual(stats.successfulPolls, 2);
    assert.strictEqual(stats.failedPolls, 0);
    assert.strictEqual(stats.consecutiveSuccesses, 2);
    assert.strictEqual(stats.status, 'healthy');
  });

  it('tracks failed polls', () => {
    const monitor = createAgentMonitor();

    monitor.recordFailure('agent1', 'timeout', 'Command timed out');
    monitor.recordFailure('agent1', 'timeout', 'Command timed out');

    const stats = monitor.getAgentStats('agent1');
    assert.strictEqual(stats.totalPolls, 2);
    assert.strictEqual(stats.failedPolls, 2);
    assert.strictEqual(stats.consecutiveFailures, 2);
    assert.strictEqual(stats.status, 'degraded');
  });

  it('marks agent unreachable after 5 consecutive failures', () => {
    const monitor = createAgentMonitor();

    for (let i = 0; i < 5; i++) {
      monitor.recordFailure('agent1', 'network', 'Connection refused');
    }

    const stats = monitor.getAgentStats('agent1');
    assert.strictEqual(stats.status, 'unreachable');
    assert.strictEqual(stats.consecutiveFailures, 5);
  });

  it('emits events on status changes', () => {
    const monitor = createAgentMonitor();
    const events = [];

    monitor.subscribe((event) => events.push(event));

    // First make agent healthy
    monitor.recordSuccess('agent1', 100);
    monitor.recordSuccess('agent1', 100);

    // Then degrade it
    monitor.recordFailure('agent1', 'timeout', 'Timeout');
    monitor.recordFailure('agent1', 'timeout', 'Timeout');

    const degradedEvent = events.find(e => e.event === 'agent:degraded');
    assert.ok(degradedEvent);
    assert.strictEqual(degradedEvent.data.agent, 'agent1');
  });

  it('emits recovery event when agent recovers', () => {
    const monitor = createAgentMonitor();
    const events = [];

    monitor.subscribe((event) => events.push(event));

    // Make agent fail
    for (let i = 0; i < 3; i++) {
      monitor.recordFailure('agent1', 'timeout', 'Timeout');
    }

    // Then recover
    monitor.recordSuccess('agent1', 100);
    monitor.recordSuccess('agent1', 100);

    const recoveredEvent = events.find(e => e.event === 'agent:recovered');
    assert.ok(recoveredEvent);
    assert.strictEqual(recoveredEvent.data.agent, 'agent1');
  });

  it('provides health summary', () => {
    const monitor = createAgentMonitor();

    // Create mix of agent states
    monitor.recordSuccess('healthy1', 100);
    monitor.recordSuccess('healthy1', 100);

    monitor.recordFailure('degraded1', 'timeout', 'Timeout');
    monitor.recordFailure('degraded1', 'timeout', 'Timeout');

    for (let i = 0; i < 5; i++) {
      monitor.recordFailure('unreachable1', 'network', 'Network error');
    }

    const summary = monitor.getHealthSummary();
    assert.strictEqual(summary.total, 3);
    assert.strictEqual(summary.healthy, 1);
    assert.strictEqual(summary.degraded, 1);
    assert.strictEqual(summary.unreachable, 1);
  });

  it('resets agent stats', () => {
    const monitor = createAgentMonitor();

    monitor.recordSuccess('agent1', 100);
    monitor.recordSuccess('agent1', 100);

    monitor.resetAgent('agent1');

    const stats = monitor.getAgentStats('agent1');
    assert.strictEqual(stats, null);
  });

  it('calculates rolling average response time', () => {
    const monitor = createAgentMonitor();

    monitor.recordSuccess('agent1', 100);
    monitor.recordSuccess('agent1', 200);
    monitor.recordSuccess('agent1', 200);

    const stats = monitor.getAgentStats('agent1');
    // Should be weighted toward recent values
    assert.ok(stats.avgResponseTimeMs > 100);
    assert.ok(stats.avgResponseTimeMs < 200);
  });
});
