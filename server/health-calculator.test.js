import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  createHealthCalculator,
  calculateLatencyScore,
  calculateUptimeScore,
  calculateErrorRateScore,
  calculateThroughputScore,
  getHealthStatus
} from './health-calculator.js';

describe('calculateLatencyScore', () => {
  it('returns 100 for latency under 100ms', () => {
    assert.strictEqual(calculateLatencyScore(50), 100);
    assert.strictEqual(calculateLatencyScore(100), 100);
  });

  it('returns 80-99 for latency 100-250ms', () => {
    const score = calculateLatencyScore(175);
    assert.ok(score >= 80 && score < 100, `Expected 80-99, got ${score}`);
  });

  it('returns 50-79 for latency 250-500ms', () => {
    const score = calculateLatencyScore(375);
    assert.ok(score >= 50 && score < 80, `Expected 50-79, got ${score}`);
  });

  it('returns 20-49 for latency 500-1000ms', () => {
    const score = calculateLatencyScore(750);
    assert.ok(score >= 20 && score < 50, `Expected 20-49, got ${score}`);
  });

  it('returns low score for high latency', () => {
    const score = calculateLatencyScore(2000);
    assert.ok(score < 20, `Expected <20, got ${score}`);
  });
});

describe('calculateUptimeScore', () => {
  it('returns 75 for no agents', () => {
    assert.strictEqual(calculateUptimeScore({}), 75);
    assert.strictEqual(calculateUptimeScore({ active: 0, hooked: 0, idle: 0, error: 0 }), 75);
  });

  it('returns 100+ for all agents active', () => {
    const score = calculateUptimeScore({ active: 5, hooked: 0, idle: 0, error: 0 });
    assert.ok(score >= 100, `Expected >=100, got ${score}`);
  });

  it('penalizes agents in error state', () => {
    const healthyScore = calculateUptimeScore({ active: 4, hooked: 0, idle: 0, error: 0 });
    const errorScore = calculateUptimeScore({ active: 2, hooked: 0, idle: 0, error: 2 });
    assert.ok(errorScore < healthyScore, `Expected error score ${errorScore} < healthy ${healthyScore}`);
  });

  it('gives bonus for hooked work', () => {
    const idleScore = calculateUptimeScore({ active: 0, hooked: 0, idle: 5, error: 0 });
    const hookedScore = calculateUptimeScore({ active: 0, hooked: 5, idle: 0, error: 0 });
    assert.ok(hookedScore >= idleScore, `Expected hooked ${hookedScore} >= idle ${idleScore}`);
  });
});

describe('calculateErrorRateScore', () => {
  it('returns 100 for perfect success rate', () => {
    assert.strictEqual(calculateErrorRateScore(100), 100);
    assert.strictEqual(calculateErrorRateScore(99.95), 100);
  });

  it('returns 95 for 99% success', () => {
    assert.strictEqual(calculateErrorRateScore(99), 95);
  });

  it('returns lower scores for more failures', () => {
    const score95 = calculateErrorRateScore(95);
    const score90 = calculateErrorRateScore(90);
    const score80 = calculateErrorRateScore(80);
    assert.ok(score95 > score90, `Expected 95% score ${score95} > 90% score ${score90}`);
    assert.ok(score90 > score80, `Expected 90% score ${score90} > 80% score ${score80}`);
  });
});

describe('calculateThroughputScore', () => {
  it('returns good score for healthy throughput', () => {
    const score = calculateThroughputScore(10, [8, 10, 12, 9, 11]);
    assert.ok(score >= 80, `Expected >=80 for stable throughput, got ${score}`);
  });

  it('returns lower score for low throughput', () => {
    const score = calculateThroughputScore(1, [10, 10, 10, 10, 10]);
    assert.ok(score < 80, `Expected <80 for low throughput, got ${score}`);
  });

  it('handles no history gracefully', () => {
    const score = calculateThroughputScore(10, []);
    assert.ok(score >= 0 && score <= 100, `Score should be 0-100, got ${score}`);
  });
});

describe('getHealthStatus', () => {
  it('returns healthy for score >= 80', () => {
    assert.strictEqual(getHealthStatus(80), 'healthy');
    assert.strictEqual(getHealthStatus(100), 'healthy');
  });

  it('returns degraded for score 50-79', () => {
    assert.strictEqual(getHealthStatus(50), 'degraded');
    assert.strictEqual(getHealthStatus(79), 'degraded');
  });

  it('returns critical for score < 50', () => {
    assert.strictEqual(getHealthStatus(49), 'critical');
    assert.strictEqual(getHealthStatus(0), 'critical');
  });
});

describe('createHealthCalculator', () => {
  it('calculates health score from metrics', () => {
    const calc = createHealthCalculator();
    const result = calc.calculate({
      avgPollDuration: 50,
      successRate: 100,
      updateFrequency: 10,
      agentActivity: { active: 5, hooked: 2, idle: 1, error: 0 },
      history: { eventVolume: [8, 10, 12] }
    });

    assert.ok(result.score >= 0 && result.score <= 100, `Score ${result.score} should be 0-100`);
    assert.ok(['healthy', 'degraded', 'critical'].includes(result.status));
    assert.ok(result.components);
    assert.ok(result.timestamp);
  });

  it('tracks history', () => {
    const calc = createHealthCalculator(5);

    // Calculate multiple times
    for (let i = 0; i < 10; i++) {
      calc.calculate({
        avgPollDuration: 50,
        successRate: 100,
        agentActivity: { active: 1 }
      });
    }

    const history = calc.getHistory();
    assert.strictEqual(history.scores.length, 5, 'Should limit to historySize');
    assert.strictEqual(history.timestamps.length, 5);
  });

  it('resets history', () => {
    const calc = createHealthCalculator();
    calc.calculate({ avgPollDuration: 50, successRate: 100 });
    calc.reset();

    const history = calc.getHistory();
    assert.strictEqual(history.scores.length, 0);
  });

  it('handles missing metrics gracefully', () => {
    const calc = createHealthCalculator();
    const result = calc.calculate({});

    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it('handles null metrics', () => {
    const calc = createHealthCalculator();
    const result = calc.calculate(null);

    assert.ok(result.score >= 0 && result.score <= 100);
  });
});
