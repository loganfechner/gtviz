/**
 * Tests for the Metrics Collector
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMetricsCollector } from './metrics.js';

describe('createMetricsCollector', () => {
  it('returns metrics object with expected fields', () => {
    const collector = createMetricsCollector();
    const metrics = collector.getMetrics();

    assert.ok('pollDuration' in metrics, 'has pollDuration');
    assert.ok('avgPollDuration' in metrics, 'has avgPollDuration');
    assert.ok('updateFrequency' in metrics, 'has updateFrequency');
    assert.ok('totalPolls' in metrics, 'has totalPolls');
    assert.ok('totalEvents' in metrics, 'has totalEvents');
    assert.ok('agentActivity' in metrics, 'has agentActivity');
    assert.ok('history' in metrics, 'has history');
  });

  it('records poll durations', () => {
    const collector = createMetricsCollector();

    collector.recordPollDuration(100);
    collector.recordPollDuration(200);
    collector.recordPollDuration(150);

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.pollDuration, 150, 'last poll duration is 150');
    assert.strictEqual(metrics.avgPollDuration, 150, 'avg poll duration is 150');
    assert.strictEqual(metrics.totalPolls, 3, 'total polls is 3');
    assert.strictEqual(metrics.history.pollDurations.length, 3, 'history has 3 entries');
  });

  it('records state changes', () => {
    const collector = createMetricsCollector();

    collector.recordStateChange(5);
    collector.recordStateChange(3);

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.totalEvents, 8, 'total events is 8');
  });

  it('updates agent activity counts', () => {
    const collector = createMetricsCollector();

    const hooks = {
      agent1: { status: 'active', beadId: 'gt-123' },
      agent2: { status: 'idle', beadId: null },
      agent3: { status: 'error', beadId: null },
      agent4: { status: 'hooked', beadId: 'gt-456' }
    };

    collector.updateAgentActivity(hooks);
    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.agentActivity.active, 1, 'active count is 1');
    assert.strictEqual(metrics.agentActivity.hooked, 1, 'hooked count is 1');
    assert.strictEqual(metrics.agentActivity.idle, 1, 'idle count is 1');
    assert.strictEqual(metrics.agentActivity.error, 1, 'error count is 1');
  });

  it('respects history size limit', () => {
    const collector = createMetricsCollector(5); // Only keep 5 entries

    for (let i = 0; i < 10; i++) {
      collector.recordPollDuration(i * 10);
    }

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.history.pollDurations.length, 5, 'history limited to 5');
    assert.strictEqual(metrics.history.pollDurations[0], 50, 'oldest entry is 50');
    assert.strictEqual(metrics.history.pollDurations[4], 90, 'newest entry is 90');
  });

  it('resets all metrics', () => {
    const collector = createMetricsCollector();

    collector.recordPollDuration(100);
    collector.recordStateChange(5);
    collector.updateAgentActivity({ agent1: { status: 'active' } });

    collector.reset();
    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.pollDuration, 0, 'poll duration reset');
    assert.strictEqual(metrics.totalPolls, 0, 'total polls reset');
    assert.strictEqual(metrics.totalEvents, 0, 'total events reset');
    assert.strictEqual(metrics.agentActivity.active, 0, 'agent activity reset');
    assert.strictEqual(metrics.history.pollDurations.length, 0, 'history reset');
  });
});
