/**
 * Tests for hook-parser.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseHookOutput, getHookSummary } from './hook-parser.js';

test('parseHookOutput parses complete hook output', () => {
  const output = `🪝 Hook Status: gtviz/polecats/rictus
Role: polecat

🚀 AUTONOMOUS MODE - Work on hook triggers immediate execution

🪝 Hooked: gt-z0n: P1: Parse and display hook status per agent
🧬 Molecule: gt-wisp-by4:
   Attached: 2026-01-28T02:28:36Z`;

  const result = parseHookOutput(output);

  assert.strictEqual(result.agentPath, 'gtviz/polecats/rictus');
  assert.strictEqual(result.role, 'polecat');
  assert.strictEqual(result.autonomousMode, true);
  assert.deepStrictEqual(result.hooked, {
    id: 'gt-z0n',
    title: 'P1: Parse and display hook status per agent'
  });
  assert.strictEqual(result.molecule.id, 'gt-wisp-by4');
  assert.strictEqual(result.molecule.attachedAt, '2026-01-28T02:28:36Z');
});

test('parseHookOutput handles empty hook', () => {
  const output = `🪝 Hook Status: gtviz/witness
Role: witness

(no work hooked)`;

  const result = parseHookOutput(output);

  assert.strictEqual(result.agentPath, 'gtviz/witness');
  assert.strictEqual(result.role, 'witness');
  assert.strictEqual(result.autonomousMode, false);
  assert.strictEqual(result.hooked, null);
  assert.strictEqual(result.molecule, null);
});

test('parseHookOutput handles empty string', () => {
  const result = parseHookOutput('');

  assert.strictEqual(result.agentPath, null);
  assert.strictEqual(result.role, null);
  assert.strictEqual(result.hooked, null);
});

test('parseHookOutput handles null input', () => {
  const result = parseHookOutput(null);

  assert.strictEqual(result.agentPath, null);
  assert.strictEqual(result.role, null);
  assert.strictEqual(result.hooked, null);
});

test('getHookSummary returns idle for no hooked work', () => {
  const hookStatus = {
    agentPath: 'gtviz/witness',
    role: 'witness',
    autonomousMode: false,
    hooked: null,
    molecule: null
  };

  const summary = getHookSummary(hookStatus);

  assert.strictEqual(summary.status, 'idle');
  assert.strictEqual(summary.label, 'No work hooked');
  assert.strictEqual(summary.beadId, null);
});

test('getHookSummary returns active for autonomous mode', () => {
  const hookStatus = {
    agentPath: 'gtviz/polecats/rictus',
    role: 'polecat',
    autonomousMode: true,
    hooked: {
      id: 'gt-z0n',
      title: 'P1: Parse and display hook status per agent'
    },
    molecule: {
      id: 'gt-wisp-by4',
      attachedAt: '2026-01-28T02:28:36Z'
    }
  };

  const summary = getHookSummary(hookStatus);

  assert.strictEqual(summary.status, 'active');
  assert.strictEqual(summary.beadId, 'gt-z0n');
  assert.strictEqual(summary.beadTitle, 'P1: Parse and display hook status per agent');
  assert.strictEqual(summary.moleculeId, 'gt-wisp-by4');
});

test('getHookSummary returns hooked for non-autonomous mode', () => {
  const hookStatus = {
    agentPath: 'gtviz/polecats/rictus',
    role: 'polecat',
    autonomousMode: false,
    hooked: {
      id: 'gt-abc',
      title: 'Some task'
    },
    molecule: null
  };

  const summary = getHookSummary(hookStatus);

  assert.strictEqual(summary.status, 'hooked');
  assert.strictEqual(summary.beadId, 'gt-abc');
  assert.strictEqual(summary.moleculeId, null);
});
