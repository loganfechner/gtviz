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
    assert.ok('successfulPolls' in metrics, 'has successfulPolls');
    assert.ok('failedPolls' in metrics, 'has failedPolls');
    assert.ok('successRate' in metrics, 'has successRate');
    assert.ok('wsConnections' in metrics, 'has wsConnections');
    assert.ok('totalWsConnections' in metrics, 'has totalWsConnections');
    assert.ok('totalWsMessages' in metrics, 'has totalWsMessages');
    assert.ok('bufferSizes' in metrics, 'has bufferSizes');
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

  it('tracks poll success and failure rates', () => {
    const collector = createMetricsCollector();

    collector.recordPollDuration(100, true);
    collector.recordPollDuration(200, true);
    collector.recordPollDuration(150, false);
    collector.recordPollDuration(120, true);

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.successfulPolls, 3, 'successful polls is 3');
    assert.strictEqual(metrics.failedPolls, 1, 'failed polls is 1');
    assert.strictEqual(metrics.successRate, 75, 'success rate is 75%');
  });

  it('tracks websocket connections and messages', () => {
    const collector = createMetricsCollector();

    collector.recordWsConnection();
    collector.recordWsConnection();
    collector.recordWsMessage();
    collector.recordWsMessage();
    collector.recordWsMessage();
    collector.recordWsDisconnection();

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.wsConnections, 1, 'current ws connections is 1');
    assert.strictEqual(metrics.totalWsConnections, 2, 'total ws connections is 2');
    assert.strictEqual(metrics.totalWsMessages, 3, 'total ws messages is 3');
  });

  it('exposes buffer sizes', () => {
    const collector = createMetricsCollector();

    collector.recordPollDuration(100);
    collector.recordPollDuration(200);
    collector.recordStateChange(5);

    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.bufferSizes.pollDurations, 2, 'poll durations buffer has 2 entries');
    assert.strictEqual(metrics.bufferSizes.currentIntervalEvents, 5, 'current interval has 5 events');
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
    collector.recordPollDuration(50, false);
    collector.recordStateChange(5);
    collector.updateAgentActivity({ agent1: { status: 'active' } });
    collector.recordWsConnection();
    collector.recordWsMessage();

    collector.reset();
    const metrics = collector.getMetrics();

    assert.strictEqual(metrics.pollDuration, 0, 'poll duration reset');
    assert.strictEqual(metrics.totalPolls, 0, 'total polls reset');
    assert.strictEqual(metrics.totalEvents, 0, 'total events reset');
    assert.strictEqual(metrics.agentActivity.active, 0, 'agent activity reset');
    assert.strictEqual(metrics.history.pollDurations.length, 0, 'history reset');
    assert.strictEqual(metrics.successfulPolls, 0, 'successful polls reset');
    assert.strictEqual(metrics.failedPolls, 0, 'failed polls reset');
    assert.strictEqual(metrics.wsConnections, 0, 'ws connections reset');
    assert.strictEqual(metrics.totalWsConnections, 0, 'total ws connections reset');
    assert.strictEqual(metrics.totalWsMessages, 0, 'total ws messages reset');
  });
});
