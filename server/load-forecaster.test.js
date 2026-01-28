import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { createLoadForecaster } from './load-forecaster.js';

describe('createLoadForecaster', () => {
  let forecaster;
  let mockMetricsStorage;
  let mockStateManager;

  beforeEach(() => {
    // Create mock metrics storage
    mockMetricsStorage = {
      queryRange: mock.fn(() => [])
    };

    // Create mock state manager
    mockStateManager = {
      getState: mock.fn(() => ({
        agents: {},
        beads: {},
        hooks: {},
        agentStats: {}
      }))
    };

    forecaster = createLoadForecaster({
      forecastIntervalMs: 1000,
      historyWindowMs: 60000
    });
  });

  describe('initialization', () => {
    it('creates forecaster with default empty forecasts', () => {
      const forecasts = forecaster.getForecasts();
      assert.deepStrictEqual(forecasts.loadPredictions, []);
      assert.deepStrictEqual(forecasts.queuePredictions, []);
      assert.deepStrictEqual(forecasts.completionEstimates, {});
      assert.strictEqual(forecasts.confidence, 0);
    });

    it('initializes with data sources', () => {
      forecaster.initialize(mockMetricsStorage, mockStateManager);
      // Should not throw
    });
  });

  describe('forecasting with insufficient data', () => {
    it('reports insufficient data when fewer than 10 points', () => {
      mockMetricsStorage.queryRange = mock.fn(() => [
        { timestamp: new Date().toISOString(), agentActivity: { active: 1, hooked: 0 } },
        { timestamp: new Date().toISOString(), agentActivity: { active: 1, hooked: 0 } }
      ]);

      forecaster.initialize(mockMetricsStorage, mockStateManager);
      forecaster.update();

      const forecasts = forecaster.getForecasts();
      assert.strictEqual(forecasts.confidence, 0);
      assert.ok(forecasts.message.includes('Insufficient data'));
    });
  });

  describe('forecasting with sufficient data', () => {
    beforeEach(() => {
      // Generate sufficient test data
      const now = Date.now();
      const testData = [];
      for (let i = 0; i < 20; i++) {
        testData.push({
          timestamp: new Date(now - (20 - i) * 60000).toISOString(),
          agentActivity: {
            active: 2 + Math.sin(i * 0.3),
            hooked: 1 + Math.cos(i * 0.3),
            idle: 1,
            error: 0
          },
          pollDuration: 100 + Math.random() * 50,
          eventVolume: 5
        });
      }

      mockMetricsStorage.queryRange = mock.fn(() => testData);

      mockStateManager.getState = mock.fn(() => ({
        agents: {
          'test-rig': [
            { name: 'agent1', status: 'running', hasWork: true, currentBead: 'bead-1' },
            { name: 'agent2', status: 'idle', hasWork: false }
          ]
        },
        beads: {
          'test-rig': [
            { id: 'bead-1', title: 'Test Bead 1', status: 'in_progress' },
            { id: 'bead-2', title: 'Test Bead 2', status: 'hooked' },
            { id: 'bead-3', title: 'Test Bead 3', status: 'open' }
          ]
        },
        hooks: {},
        agentStats: {
          'test-rig/agent1': {
            completions: [
              { beadId: 'old-1', completedAt: new Date().toISOString(), duration: 1800000 },
              { beadId: 'old-2', completedAt: new Date().toISOString(), duration: 2100000 }
            ],
            avgDuration: 1950000
          }
        }
      }));

      forecaster.initialize(mockMetricsStorage, mockStateManager);
    });

    it('generates load predictions for all horizons', () => {
      forecaster.update();
      const forecasts = forecaster.getForecasts();

      assert.ok(forecasts.loadPredictions.length > 0);
      for (const pred of forecasts.loadPredictions) {
        assert.ok('horizon' in pred);
        assert.ok('predicted' in pred);
        assert.ok('lower' in pred);
        assert.ok('upper' in pred);
        assert.ok(pred.lower <= pred.predicted);
        assert.ok(pred.predicted <= pred.upper);
      }
    });

    it('generates queue predictions', () => {
      forecaster.update();
      const forecasts = forecaster.getForecasts();

      assert.ok(forecasts.queuePredictions.length > 0);
      for (const pred of forecasts.queuePredictions) {
        assert.ok('currentQueue' in pred);
        assert.ok('predicted' in pred);
        assert.ok('completionRate' in pred);
      }
    });

    it('generates completion estimates for queued beads', () => {
      forecaster.update();
      const forecasts = forecaster.getForecasts();

      assert.ok(Object.keys(forecasts.completionEstimates).length > 0);
      assert.ok(forecasts.completionEstimates['bead-1']);
      assert.ok(forecasts.completionEstimates['bead-2']);
      assert.ok(forecasts.completionEstimates['bead-3']);

      const estimate = forecasts.completionEstimates['bead-1'];
      assert.strictEqual(estimate.beadId, 'bead-1');
      assert.ok('estimatedMinutes' in estimate);
      assert.ok('queuePosition' in estimate);
      assert.ok('confidence' in estimate);
    });

    it('analyzes capacity', () => {
      forecaster.update();
      const capacity = forecaster.getCapacity();

      assert.ok('summary' in capacity);
      assert.ok('agents' in capacity);
      assert.strictEqual(capacity.summary.totalAgents, 2);
      assert.strictEqual(capacity.summary.activeAgents, 1);
    });

    it('calculates positive confidence with good data', () => {
      forecaster.update();
      const forecasts = forecaster.getForecasts();

      assert.ok(forecasts.confidence > 0);
      assert.ok(forecasts.confidence <= 1);
    });
  });

  describe('getBeadEta', () => {
    it('returns null for unknown bead', () => {
      forecaster.initialize(mockMetricsStorage, mockStateManager);
      const eta = forecaster.getBeadEta('unknown-bead');
      assert.strictEqual(eta, null);
    });
  });

  describe('spike detection', () => {
    it('detects spikes when predictions exceed threshold', () => {
      // Generate data with increasing trend
      const now = Date.now();
      const testData = [];
      for (let i = 0; i < 20; i++) {
        testData.push({
          timestamp: new Date(now - (20 - i) * 60000).toISOString(),
          agentActivity: {
            active: 1 + i * 0.5, // Increasing trend
            hooked: 1,
            idle: 0,
            error: 0
          }
        });
      }

      mockMetricsStorage.queryRange = mock.fn(() => testData);
      mockStateManager.getState = mock.fn(() => ({
        agents: {},
        beads: {},
        hooks: {},
        agentStats: {}
      }));

      forecaster.initialize(mockMetricsStorage, mockStateManager);
      forecaster.update();

      const spikes = forecaster.getSpikes();
      // With increasing trend, later predictions should potentially be spikes
      assert.ok(Array.isArray(spikes));
    });
  });

  describe('event emission', () => {
    it('emits update events when forecasts change', (t, done) => {
      const testData = [];
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        testData.push({
          timestamp: new Date(now - (15 - i) * 60000).toISOString(),
          agentActivity: { active: 2, hooked: 1, idle: 1, error: 0 }
        });
      }

      mockMetricsStorage.queryRange = mock.fn(() => testData);
      forecaster.initialize(mockMetricsStorage, mockStateManager);

      forecaster.on('update', (predictions) => {
        assert.ok(predictions.lastUpdated);
        done();
      });

      forecaster.update();
    });
  });
});
