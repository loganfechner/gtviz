import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  AgentStatus,
  StatusDetector,
  getAllAgentStatus,
  getAllAgentStatusFlat,
  listSessions,
  listPolecats,
  getPolecatStatus,
  getRigAgentStatus
} from '../src/status-detector.js';

describe('AgentStatus enum', () => {
  test('has expected values', () => {
    assert.strictEqual(AgentStatus.RUNNING, 'running');
    assert.strictEqual(AgentStatus.IDLE, 'idle');
    assert.strictEqual(AgentStatus.STOPPED, 'stopped');
    assert.strictEqual(AgentStatus.UNKNOWN, 'unknown');
  });
});

describe('listSessions', () => {
  test('returns array', () => {
    const sessions = listSessions();
    assert.ok(Array.isArray(sessions));
  });

  test('sessions have expected fields', () => {
    const sessions = listSessions();
    if (sessions.length > 0) {
      const session = sessions[0];
      assert.ok('rig' in session);
      assert.ok('polecat' in session);
      assert.ok('session_id' in session);
      assert.ok('running' in session);
    }
  });
});

describe('getAllAgentStatus', () => {
  test('returns object keyed by rig', async () => {
    const status = await getAllAgentStatus();
    assert.ok(typeof status === 'object');
  });

  test('each rig has array of agents', async () => {
    const status = await getAllAgentStatus();
    for (const [rig, agents] of Object.entries(status)) {
      assert.ok(Array.isArray(agents), `${rig} should have array of agents`);
    }
  });

  test('agents have expected fields', async () => {
    const status = await getAllAgentStatus();
    for (const agents of Object.values(status)) {
      for (const agent of agents) {
        assert.ok('rig' in agent);
        assert.ok('name' in agent);
        assert.ok('status' in agent);
        assert.ok('sessionRunning' in agent);
        assert.ok('hasWork' in agent);
        assert.ok(['running', 'idle', 'stopped', 'unknown'].includes(agent.status));
      }
    }
  });
});

describe('getAllAgentStatusFlat', () => {
  test('returns flat array', async () => {
    const agents = await getAllAgentStatusFlat();
    assert.ok(Array.isArray(agents));
  });
});

describe('StatusDetector', () => {
  test('can be instantiated', () => {
    const detector = new StatusDetector();
    assert.ok(detector instanceof StatusDetector);
  });

  test('getStatus returns current status', async () => {
    const detector = new StatusDetector();
    const status = await detector.getStatus();
    assert.ok(typeof status === 'object');
  });

  test('subscribe returns unsubscribe function', () => {
    const detector = new StatusDetector();
    const unsub = detector.subscribe(() => {});
    assert.ok(typeof unsub === 'function');
    unsub();
  });

  test('can start and stop polling', async () => {
    const detector = new StatusDetector({ pollInterval: 100 });
    detector.start();
    assert.strictEqual(detector.polling, true);
    detector.stop();
    assert.strictEqual(detector.polling, false);
  });
});

describe('input validation', () => {
  test('listPolecats rejects invalid rig names', () => {
    // Shell injection attempts should return empty array
    assert.deepStrictEqual(listPolecats('rig; rm -rf /'), []);
    assert.deepStrictEqual(listPolecats('$(whoami)'), []);
    assert.deepStrictEqual(listPolecats('rig`id`'), []);
    assert.deepStrictEqual(listPolecats(''), []);
    assert.deepStrictEqual(listPolecats(null), []);
    assert.deepStrictEqual(listPolecats(undefined), []);
  });

  test('getPolecatStatus rejects invalid names', () => {
    assert.strictEqual(getPolecatStatus('rig; rm -rf /', 'polecat'), null);
    assert.strictEqual(getPolecatStatus('rig', 'polecat$(id)'), null);
    assert.strictEqual(getPolecatStatus('', 'polecat'), null);
    assert.strictEqual(getPolecatStatus('rig', ''), null);
  });

  test('getRigAgentStatus rejects invalid rig names', () => {
    assert.deepStrictEqual(getRigAgentStatus('rig; rm -rf /'), []);
    assert.deepStrictEqual(getRigAgentStatus('$(whoami)'), []);
    assert.deepStrictEqual(getRigAgentStatus(''), []);
  });

  test('valid names are accepted', () => {
    // These should not throw - actual results depend on gt CLI
    assert.ok(Array.isArray(listPolecats('valid-rig_123')));
    assert.ok(Array.isArray(getRigAgentStatus('valid-rig_123')));
  });
});
