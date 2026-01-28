import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createAnomalyDetector, AlertSeverity, AlertType } from './anomaly-detector.js';

describe('createAnomalyDetector', () => {
  let detector;

  beforeEach(() => {
    detector = createAnomalyDetector({
      evaluationIntervalMs: 100,  // Fast evaluation for tests
      alertCooldownMs: 50         // Short cooldown for tests
    });
  });

  afterEach(() => {
    detector.stop();
  });

  describe('initialization', () => {
    it('starts with no alerts', () => {
      assert.deepStrictEqual(detector.getAlerts(), []);
    });

    it('returns default thresholds', () => {
      const thresholds = detector.getThresholds();
      assert.strictEqual(thresholds.pollDurationWarning, 2000);
      assert.strictEqual(thresholds.pollDurationCritical, 5000);
      assert.strictEqual(thresholds.successRateWarning, 90);
      assert.strictEqual(thresholds.successRateCritical, 70);
    });
  });

  describe('processMetrics', () => {
    it('creates warning alert for slow poll duration', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 2500,  // Above warning threshold
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 0 }
      });

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.SLOW_RESPONSE);
      assert.strictEqual(alertReceived.severity, AlertSeverity.WARNING);
    });

    it('creates critical alert for very slow poll duration', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 6000,  // Above critical threshold
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 0 }
      });

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.SLOW_RESPONSE);
      assert.strictEqual(alertReceived.severity, AlertSeverity.CRITICAL);
    });

    it('creates warning alert for low success rate', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 100,
        totalPolls: 10,
        successRate: 85,  // Below warning threshold
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 0 }
      });

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.LOW_SUCCESS_RATE);
      assert.strictEqual(alertReceived.severity, AlertSeverity.WARNING);
    });

    it('creates critical alert for very low success rate', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 100,
        totalPolls: 10,
        successRate: 65,  // Below critical threshold
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 0 }
      });

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.LOW_SUCCESS_RATE);
      assert.strictEqual(alertReceived.severity, AlertSeverity.CRITICAL);
    });

    it('creates alert for agents in error state', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 100,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 2 }
      });

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.AGENT_ERROR);
    });

    it('does not evaluate success rate before minimum polls', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processMetrics({
        avgPollDuration: 100,
        totalPolls: 3,  // Below minimum
        successRate: 50,  // Would be critical, but not enough polls
        agentActivity: { active: 1, hooked: 0, idle: 0, error: 0 }
      });

      assert.strictEqual(alertReceived, null);
    });
  });

  describe('processAgentStatusChange', () => {
    it('creates alert when agent enters error state', async () => {
      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processAgentStatusChange('rig1/agent1', 'error', 'active');

      assert.ok(alertReceived);
      assert.strictEqual(alertReceived.type, AlertType.AGENT_ERROR);
      assert.ok(alertReceived.message.includes('agent1'));
    });

    it('does not create alert when staying in error state', async () => {
      // First trigger to set up cooldown
      detector.processAgentStatusChange('rig1/agent1', 'error', 'active');

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 100));

      let alertReceived = null;
      detector.on('alert', (alert) => {
        alertReceived = alert;
      });

      detector.processAgentStatusChange('rig1/agent1', 'error', 'error');

      assert.strictEqual(alertReceived, null);
    });
  });

  describe('alert management', () => {
    it('acknowledges alert', async () => {
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      const alerts = detector.getAlerts();
      assert.strictEqual(alerts.length, 1);
      assert.strictEqual(alerts[0].acknowledged, false);

      const result = detector.acknowledgeAlert(alerts[0].id);
      assert.strictEqual(result, true);

      const updatedAlerts = detector.getAlerts();
      assert.strictEqual(updatedAlerts[0].acknowledged, true);
      assert.ok(updatedAlerts[0].acknowledgedAt);
    });

    it('resolves alert', async () => {
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      const alerts = detector.getAlerts();
      const result = detector.resolveAlert(alerts[0].id);
      assert.strictEqual(result, true);

      const updatedAlerts = detector.getAlerts();
      assert.strictEqual(updatedAlerts[0].resolved, true);
      assert.ok(updatedAlerts[0].resolvedAt);
    });

    it('dismisses alert', async () => {
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      const alerts = detector.getAlerts();
      const alertId = alerts[0].id;

      const result = detector.dismissAlert(alertId);
      assert.strictEqual(result, true);

      const updatedAlerts = detector.getAlerts();
      assert.strictEqual(updatedAlerts.length, 0);
    });

    it('returns false for non-existent alert', () => {
      assert.strictEqual(detector.acknowledgeAlert('non-existent'), false);
      assert.strictEqual(detector.resolveAlert('non-existent'), false);
      assert.strictEqual(detector.dismissAlert('non-existent'), false);
    });

    it('clears all alerts', async () => {
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      assert.strictEqual(detector.getAlerts().length, 1);

      detector.clearAlerts();

      assert.strictEqual(detector.getAlerts().length, 0);
    });

    it('filters unacknowledged alerts', async () => {
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      const alerts = detector.getAlerts();
      detector.acknowledgeAlert(alerts[0].id);

      assert.strictEqual(detector.getUnacknowledgedAlerts().length, 0);
    });
  });

  describe('threshold updates', () => {
    it('updates thresholds', () => {
      detector.updateThresholds({
        pollDurationWarning: 3000,
        pollDurationCritical: 8000
      });

      const thresholds = detector.getThresholds();
      assert.strictEqual(thresholds.pollDurationWarning, 3000);
      assert.strictEqual(thresholds.pollDurationCritical, 8000);
      // Original values should remain
      assert.strictEqual(thresholds.successRateWarning, 90);
    });
  });

  describe('throttling', () => {
    it('throttles duplicate alerts', async () => {
      let alertCount = 0;
      detector.on('alert', () => {
        alertCount++;
      });

      // First alert should go through
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      assert.strictEqual(alertCount, 1);

      // Second identical alert should be throttled
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      assert.strictEqual(alertCount, 1);

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 100));

      // After cooldown, alert should go through
      detector.processMetrics({
        avgPollDuration: 6000,
        totalPolls: 10,
        successRate: 100,
        agentActivity: { active: 0, hooked: 0, idle: 0, error: 0 }
      });

      assert.strictEqual(alertCount, 2);
    });
  });
});
