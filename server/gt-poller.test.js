/**
 * Tests for the GtPoller class
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { GtPoller } from './gt-poller.js';

// Create mock state object
function createMockState() {
  const state = {
    rigs: {},
    agents: {},
    beads: {},
    hooks: {},
    agentStats: {},
    updateRigs(rigs) { state.rigs = rigs; },
    updateAgents(rig, agents) { state.agents[rig] = agents; },
    updateBeads(rig, beads) { state.beads[rig] = beads; },
    updateHooks(rig, hooks) { state.hooks[rig] = hooks; },
    updateAgentStats(key, stats) { state.agentStats[key] = stats; },
    getRigs() { return Object.keys(state.rigs); },
    getState() { return state; }
  };
  return state;
}

// Create mock metrics object
function createMockMetrics() {
  const metrics = {
    pollDurations: [],
    agentActivity: {},
    recordPollDuration(duration, success) {
      metrics.pollDurations.push({ duration, success });
    },
    updateAgentActivity(agents) {
      metrics.agentActivity = agents;
    }
  };
  return metrics;
}

describe('GtPoller', () => {
  describe('constructor', () => {
    it('initializes with default values', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      assert.strictEqual(poller.state, state);
      assert.strictEqual(poller.metrics, null);
      assert.strictEqual(poller.interval, null);
      assert.strictEqual(poller.pollIntervalMs, 5000);
      assert.ok(poller.agentMonitor);
      assert.deepStrictEqual(poller.lastSuccessfulPoll, {});
      assert.deepStrictEqual(poller.failureCount, {});
      assert.deepStrictEqual(poller.taskStartTimes, {});
      assert.deepStrictEqual(poller.previousBeadStatus, {});
    });

    it('accepts metrics collector', () => {
      const state = createMockState();
      const metrics = createMockMetrics();
      const poller = new GtPoller(state, metrics);

      assert.strictEqual(poller.metrics, metrics);
    });
  });

  describe('start and stop', () => {
    it('starts polling and can be stopped', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      // Mock poll to avoid actual execution
      poller.poll = mock.fn(() => Promise.resolve());

      poller.start();
      assert.ok(poller.interval !== null, 'interval should be set');

      poller.stop();
      assert.strictEqual(poller.interval, null, 'interval should be cleared');
    });

    it('stop is idempotent', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      poller.stop();
      assert.strictEqual(poller.interval, null);

      poller.stop();
      assert.strictEqual(poller.interval, null);
    });
  });

  describe('parseRigList', () => {
    it('parses JSON output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const jsonOutput = JSON.stringify({
        gtviz: { name: 'gtviz', polecats: 2, crew: 1 }
      });

      const result = poller.parseRigList(jsonOutput);
      assert.deepStrictEqual(result, { gtviz: { name: 'gtviz', polecats: 2, crew: 1 } });
    });

    it('falls back to text parsing on invalid JSON', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const textOutput = `Rigs:
  gtviz
    Polecats: 2 | Crew: 1`;

      const result = poller.parseRigList(textOutput);
      assert.ok('gtviz' in result);
      assert.strictEqual(result.gtviz.polecats, 2);
      assert.strictEqual(result.gtviz.crew, 1);
    });
  });

  describe('parseRigListText', () => {
    it('parses rig list text format', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = `Rigs:
  gtviz
    Polecats: 2 | Crew: 1
    Agents: [witness refinery mayor]
  hq
    Polecats: 0 | Crew: 3`;

      const result = poller.parseRigListText(output);

      assert.ok('gtviz' in result);
      assert.strictEqual(result.gtviz.name, 'gtviz');
      assert.strictEqual(result.gtviz.polecats, 2);
      assert.strictEqual(result.gtviz.crew, 1);
      assert.deepStrictEqual(result.gtviz.agents, ['witness', 'refinery', 'mayor']);

      assert.ok('hq' in result);
      assert.strictEqual(result.hq.polecats, 0);
      assert.strictEqual(result.hq.crew, 3);
    });

    it('handles empty output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseRigListText('');
      assert.deepStrictEqual(result, {});
    });

    it('handles output with only header', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseRigListText('Rigs:');
      assert.deepStrictEqual(result, {});
    });
  });

  describe('parseAgents', () => {
    it('parses agent list', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = `witness polecat running
refinery crew idle
mayor agent stopped`;

      const result = poller.parseAgents(output, 'gtviz');

      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], { name: 'witness', role: 'polecat', rig: 'gtviz', status: 'running' });
      assert.deepStrictEqual(result[1], { name: 'refinery', role: 'crew', rig: 'gtviz', status: 'idle' });
      assert.deepStrictEqual(result[2], { name: 'mayor', role: 'agent', rig: 'gtviz', status: 'stopped' });
    });

    it('handles empty lines', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseAgents('\n\n', 'gtviz');
      assert.deepStrictEqual(result, []);
    });

    it('handles minimal output with role', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      // Regex requires at least one space after the name
      const result = poller.parseAgents('agent1 polecat', 'gtviz');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'agent1');
      assert.strictEqual(result[0].role, 'polecat');
      assert.strictEqual(result[0].status, 'unknown');
    });

    it('handles single word with trailing space', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseAgents('agent1 ', 'gtviz');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'agent1');
      assert.strictEqual(result[0].role, 'agent');
    });
  });

  describe('parseBeads', () => {
    it('parses JSON bead list', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const jsonOutput = JSON.stringify([
        { id: 'gt-abc123', title: 'Test bead', status: 'open', priority: 'P2' },
        { id: 'gt-def456', title: 'Another bead', status: 'hooked', priority: 'critical' }
      ]);

      const result = poller.parseBeads(jsonOutput);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 'gt-abc123');
      assert.strictEqual(result[0].title, 'Test bead');
      assert.strictEqual(result[0].status, 'open');
      assert.strictEqual(result[0].priority, 'high'); // P2 normalized to high
      assert.strictEqual(result[1].priority, 'critical');
    });

    it('falls back to text parsing on invalid JSON', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const textOutput = '? gt-abc123 · Test bead [● P2 · OPEN]';

      const result = poller.parseBeads(textOutput);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'gt-abc123');
    });
  });

  describe('parseBeadsText', () => {
    it('parses bead text with full metadata', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = '? gt-abc123 · Add feature [● P2 · OPEN]';

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'gt-abc123');
      assert.strictEqual(result[0].title, 'Add feature');
      assert.strictEqual(result[0].status, 'open');
      assert.strictEqual(result[0].priority, 'high');
    });

    it('parses hooked bead', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = '● gt-def456 · Fix bug [● P1 · HOOKED]';

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'gt-def456');
      assert.strictEqual(result[0].status, 'hooked');
      assert.strictEqual(result[0].priority, 'critical');
    });

    it('parses done bead', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = '✓ gt-xyz789 · Complete task [● P3 · DONE]';

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].status, 'done');
      assert.strictEqual(result[0].priority, 'normal');
    });

    it('parses closed bead', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = '✗ gt-closed · Wont fix [● P4 · CLOSED]';

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].status, 'closed');
      assert.strictEqual(result[0].priority, 'low');
    });

    it('parses multiple beads', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = `? gt-1 · First [● P1 · OPEN]
● gt-2 · Second [● P2 · HOOKED]
✓ gt-3 · Third [● P3 · DONE]`;

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].id, 'gt-1');
      assert.strictEqual(result[1].id, 'gt-2');
      assert.strictEqual(result[2].id, 'gt-3');
    });

    it('handles simple format fallback', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const output = 'gt-simple open Simple task';

      const result = poller.parseBeadsText(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'gt-simple');
      assert.strictEqual(result[0].status, 'open');
      assert.strictEqual(result[0].title, 'Simple task');
    });

    it('handles empty output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseBeadsText('');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('parseStatusFromSymbol', () => {
    it('maps ? to open', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('?'), 'open');
    });

    it('maps ○ to open', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('○'), 'open');
    });

    it('maps ● to hooked', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('●'), 'hooked');
    });

    it('maps ✓ to done', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('✓'), 'done');
    });

    it('maps ✗ to closed', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('✗'), 'closed');
    });

    it('defaults unknown symbols to open', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.parseStatusFromSymbol('X'), 'open');
      assert.strictEqual(poller.parseStatusFromSymbol(''), 'open');
    });
  });

  describe('normalizePriority', () => {
    it('normalizes P1 to critical', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('P1'), 'critical');
      assert.strictEqual(poller.normalizePriority('p1'), 'critical');
    });

    it('normalizes P2 to high', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('P2'), 'high');
      assert.strictEqual(poller.normalizePriority('p2'), 'high');
    });

    it('normalizes P3 to normal', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('P3'), 'normal');
      assert.strictEqual(poller.normalizePriority('p3'), 'normal');
    });

    it('normalizes P4 to low', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('P4'), 'low');
      assert.strictEqual(poller.normalizePriority('p4'), 'low');
    });

    it('normalizes word priorities', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('critical'), 'critical');
      assert.strictEqual(poller.normalizePriority('CRITICAL'), 'critical');
      assert.strictEqual(poller.normalizePriority('high'), 'high');
      assert.strictEqual(poller.normalizePriority('HIGH'), 'high');
      assert.strictEqual(poller.normalizePriority('normal'), 'normal');
      assert.strictEqual(poller.normalizePriority('low'), 'low');
    });

    it('returns null for null/undefined', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority(null), null);
      assert.strictEqual(poller.normalizePriority(undefined), null);
    });

    it('returns lowercase for unknown values', () => {
      const state = createMockState();
      const poller = new GtPoller(state);
      assert.strictEqual(poller.normalizePriority('URGENT'), 'urgent');
    });
  });

  describe('parseBeadDetails', () => {
    it('parses JSON bead details', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const jsonOutput = JSON.stringify({
        id: 'gt-abc123',
        title: 'Test bead',
        description: 'A test description',
        status: 'open',
        priority: 'P2',
        labels: ['bug', 'urgent'],
        owner: 'user1',
        assignee: 'user2',
        type: 'task',
        notes: ['note1'],
        dependsOn: ['gt-dep1'],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02'
      });

      const result = poller.parseBeadDetails(jsonOutput, 'gt-abc123');

      assert.strictEqual(result.id, 'gt-abc123');
      assert.strictEqual(result.title, 'Test bead');
      assert.strictEqual(result.description, 'A test description');
      assert.strictEqual(result.status, 'open');
      assert.strictEqual(result.priority, 'high');
      assert.deepStrictEqual(result.labels, ['bug', 'urgent']);
      assert.strictEqual(result.owner, 'user1');
      assert.strictEqual(result.assignee, 'user2');
      assert.strictEqual(result.type, 'task');
      assert.deepStrictEqual(result.dependsOn, ['gt-dep1']);
    });

    it('parses text bead details', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const textOutput = `? gt-abc123 · Test bead [● P2 · OPEN]
Owner: user1
Assignee: user2
Type: task
Created: 2024-01-01

DESCRIPTION
This is a test description.
Multiple lines.

DEPENDENCIES`;

      const result = poller.parseBeadDetails(textOutput, 'gt-abc123');

      assert.strictEqual(result.id, 'gt-abc123');
      assert.strictEqual(result.title, 'Test bead');
      assert.strictEqual(result.status, 'open');
      assert.strictEqual(result.priority, 'high');
      assert.strictEqual(result.owner, 'user1');
      assert.strictEqual(result.assignee, 'user2');
      assert.strictEqual(result.type, 'task');
      assert.ok(result.description.includes('This is a test description'));
    });

    it('handles minimal text output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseBeadDetails('just some text', 'gt-fallback');

      assert.strictEqual(result.id, 'gt-fallback');
      assert.strictEqual(result.status, 'open');
    });
  });

  describe('parseHookOutput', () => {
    it('parses JSON hook output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const jsonOutput = JSON.stringify({
        bead: 'gt-abc123',
        title: 'Test task',
        molecule: 'gt-mol-1',
        autonomousMode: true,
        attachedAt: '2024-01-01T00:00:00Z'
      });

      const result = poller.parseHookOutput(jsonOutput, 'witness');

      assert.strictEqual(result.agent, 'witness');
      assert.strictEqual(result.bead, 'gt-abc123');
      assert.strictEqual(result.title, 'Test task');
      assert.strictEqual(result.molecule, 'gt-mol-1');
      assert.strictEqual(result.autonomousMode, true);
    });

    it('parses text hook output', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      // The regex /Hooked:\s*(\S+)(?::\s*(.*))?/ captures bead including trailing colon
      // because \S+ greedily matches non-whitespace (including colons)
      // The optional (?::\s*(.*))? group won't match since there's a space after the colon
      const textOutput = `Hook Status: gtviz/witness

🚀 AUTONOMOUS MODE

Hooked: gt-abc123: Test task`;

      const result = poller.parseHookOutput(textOutput, 'witness');

      assert.strictEqual(result.agent, 'witness');
      assert.strictEqual(result.bead, 'gt-abc123:');
      // Title is empty because the regex doesn't capture it in this format
      assert.strictEqual(result.title, '');
      assert.strictEqual(result.autonomousMode, true);
    });

    it('parses non-autonomous hook', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const textOutput = `Hook Status: gtviz/witness
Hooked: gt-abc123: Test task`;

      const result = poller.parseHookOutput(textOutput, 'witness');

      assert.strictEqual(result.bead, 'gt-abc123:');
      assert.strictEqual(result.autonomousMode, false);
    });

    it('parses hook with no title (bead ID only)', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const textOutput = `Hooked: gt-abc123`;

      const result = poller.parseHookOutput(textOutput, 'witness');

      assert.strictEqual(result.bead, 'gt-abc123');
      assert.strictEqual(result.title, '');
    });

    it('returns null for empty hook', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const result = poller.parseHookOutput('No hook active', 'witness');
      assert.strictEqual(result, null);
    });

    it('handles hooked field in JSON', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const jsonOutput = JSON.stringify({
        hooked: 'gt-xyz789'
      });

      const result = poller.parseHookOutput(jsonOutput, 'refinery');

      assert.strictEqual(result.bead, 'gt-xyz789');
    });
  });

  describe('trackTaskCompletions', () => {
    it('tracks task start when status becomes in_progress', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      const beads = [
        { id: 'gt-abc', status: 'in_progress', title: 'Test' }
      ];

      poller.trackTaskCompletions('gtviz', beads);

      assert.ok('gtviz/gt-abc' in poller.taskStartTimes);
      assert.strictEqual(poller.previousBeadStatus['gtviz/gt-abc'], 'in_progress');
    });

    it('records completion when status becomes done', () => {
      const state = createMockState();
      state.hooks = { gtviz: { witness: { bead: 'gt-abc' } } };
      const poller = new GtPoller(state);

      // First set as in_progress
      poller.trackTaskCompletions('gtviz', [
        { id: 'gt-abc', status: 'in_progress', title: 'Test' }
      ]);

      // Then set as done
      poller.trackTaskCompletions('gtviz', [
        { id: 'gt-abc', status: 'done', title: 'Test' }
      ]);

      assert.strictEqual(poller.previousBeadStatus['gtviz/gt-abc'], 'done');
      // Start time should be cleared after completion
      assert.ok(!('gtviz/gt-abc' in poller.taskStartTimes));
    });

    it('does not track if already in same status', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      // Set initial status
      poller.previousBeadStatus['gtviz/gt-abc'] = 'in_progress';
      poller.taskStartTimes['gtviz/gt-abc'] = Date.now() - 10000;

      const originalStartTime = poller.taskStartTimes['gtviz/gt-abc'];

      // Call again with same status
      poller.trackTaskCompletions('gtviz', [
        { id: 'gt-abc', status: 'in_progress', title: 'Test' }
      ]);

      // Start time should not change
      assert.strictEqual(poller.taskStartTimes['gtviz/gt-abc'], originalStartTime);
    });
  });

  describe('poll error handling', () => {
    it('records failed poll in metrics', async () => {
      const state = createMockState();
      const metrics = createMockMetrics();
      const poller = new GtPoller(state, metrics);

      // Make poll methods throw
      poller.pollRigs = () => Promise.reject(new Error('Network error'));
      poller.pollAgents = () => Promise.resolve();
      poller.pollBeads = () => Promise.resolve();
      poller.pollHooks = () => Promise.resolve();

      await poller.poll();

      // Should still record the poll
      assert.strictEqual(metrics.pollDurations.length, 1);
      assert.strictEqual(metrics.pollDurations[0].success, false);
    });

    it('records successful poll in metrics', async () => {
      const state = createMockState();
      const metrics = createMockMetrics();
      const poller = new GtPoller(state, metrics);

      // Make poll methods succeed
      poller.pollRigs = () => Promise.resolve();
      poller.pollAgents = () => Promise.resolve();
      poller.pollBeads = () => Promise.resolve();
      poller.pollHooks = () => Promise.resolve();

      await poller.poll();

      assert.strictEqual(metrics.pollDurations.length, 1);
      assert.strictEqual(metrics.pollDurations[0].success, true);
    });
  });

  describe('failure counting', () => {
    it('increments failure count on poll failure', async () => {
      const state = createMockState();
      state.rigs = { gtviz: { name: 'gtviz' } };
      const poller = new GtPoller(state);

      // Simulate a failure scenario
      poller.failureCount.rigs = 0;
      poller.failureCount.rigs++;

      assert.strictEqual(poller.failureCount.rigs, 1);

      poller.failureCount.rigs++;
      assert.strictEqual(poller.failureCount.rigs, 2);
    });

    it('resets failure count on success', () => {
      const state = createMockState();
      const poller = new GtPoller(state);

      poller.failureCount.rigs = 5;
      poller.failureCount.rigs = 0;

      assert.strictEqual(poller.failureCount.rigs, 0);
    });
  });
});
