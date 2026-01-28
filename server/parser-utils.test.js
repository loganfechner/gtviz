/**
 * Tests for parser-utils.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  parseStatusFromSymbol,
  normalizePriority,
  parseBeadHeader,
  parseHookOutput,
  toPollerHookFormat,
  parseMetadataField,
  parseDependency
} from './parser-utils.js';

test('parseStatusFromSymbol converts symbols correctly', () => {
  assert.strictEqual(parseStatusFromSymbol('?'), 'open');
  assert.strictEqual(parseStatusFromSymbol('○'), 'open');
  assert.strictEqual(parseStatusFromSymbol('●'), 'hooked');
  assert.strictEqual(parseStatusFromSymbol('✓'), 'done');
  assert.strictEqual(parseStatusFromSymbol('✗'), 'closed');
  assert.strictEqual(parseStatusFromSymbol('x'), 'open'); // unknown defaults to open
});

test('normalizePriority normalizes priority strings', () => {
  assert.strictEqual(normalizePriority('P1'), 'critical');
  assert.strictEqual(normalizePriority('p1'), 'critical');
  assert.strictEqual(normalizePriority('critical'), 'critical');
  assert.strictEqual(normalizePriority('P2'), 'high');
  assert.strictEqual(normalizePriority('high'), 'high');
  assert.strictEqual(normalizePriority('P3'), 'normal');
  assert.strictEqual(normalizePriority('normal'), 'normal');
  assert.strictEqual(normalizePriority('P4'), 'low');
  assert.strictEqual(normalizePriority('low'), 'low');
  assert.strictEqual(normalizePriority(null), null);
  assert.strictEqual(normalizePriority(''), null);
});

test('parseBeadHeader parses full header with metadata', () => {
  const line = '? gt-abc123 · Add feature [● P2 · HOOKED]';
  const result = parseBeadHeader(line);

  assert.strictEqual(result.id, 'gt-abc123');
  assert.strictEqual(result.title, 'Add feature');
  assert.strictEqual(result.status, 'hooked');
  assert.strictEqual(result.priority, 'high');
});

test('parseBeadHeader parses header without metadata', () => {
  const line = '○ gt-xyz · Simple title';
  const result = parseBeadHeader(line);

  assert.strictEqual(result.id, 'gt-xyz');
  assert.strictEqual(result.title, 'Simple title');
  assert.strictEqual(result.status, 'open');
  assert.strictEqual(result.priority, null);
});

test('parseBeadHeader handles done status', () => {
  const line = '✓ gt-done · Completed task [● P3 · DONE]';
  const result = parseBeadHeader(line);

  assert.strictEqual(result.id, 'gt-done');
  assert.strictEqual(result.status, 'done');
  assert.strictEqual(result.priority, 'normal');
});

test('parseBeadHeader returns null for non-header lines', () => {
  assert.strictEqual(parseBeadHeader('Not a header'), null);
  assert.strictEqual(parseBeadHeader('  Owner: someone'), null);
  assert.strictEqual(parseBeadHeader(''), null);
});

test('parseHookOutput parses complete hook output', () => {
  const output = `🪝 Hook Status: gtviz/polecats/rictus
Role: polecat

🚀 AUTONOMOUS MODE - Work on hook triggers immediate execution

🪝 Hooked: gt-z0n: P1: Parse and display hook status
🧬 Molecule: gt-wisp-by4:
   Attached: 2026-01-28T02:28:36Z`;

  const result = parseHookOutput(output);

  assert.strictEqual(result.agentPath, 'gtviz/polecats/rictus');
  assert.strictEqual(result.role, 'polecat');
  assert.strictEqual(result.autonomousMode, true);
  assert.deepStrictEqual(result.hooked, {
    id: 'gt-z0n',
    title: 'P1: Parse and display hook status'
  });
  assert.strictEqual(result.molecule.id, 'gt-wisp-by4');
  assert.strictEqual(result.molecule.attachedAt, '2026-01-28T02:28:36Z');
});

test('parseHookOutput handles empty output', () => {
  const result = parseHookOutput('');
  assert.strictEqual(result.agentPath, null);
  assert.strictEqual(result.hooked, null);
});

test('parseHookOutput handles null', () => {
  const result = parseHookOutput(null);
  assert.strictEqual(result.agentPath, null);
  assert.strictEqual(result.hooked, null);
});

test('toPollerHookFormat converts to poller format', () => {
  const hookData = {
    agentPath: 'gtviz/polecats/rictus',
    role: 'polecat',
    autonomousMode: true,
    hooked: { id: 'gt-abc', title: 'Some task' },
    molecule: { id: 'gt-mol', attachedAt: '2026-01-28T00:00:00Z' }
  };

  const result = toPollerHookFormat(hookData, 'rictus');

  assert.strictEqual(result.agent, 'rictus');
  assert.strictEqual(result.bead, 'gt-abc');
  assert.strictEqual(result.title, 'Some task');
  assert.strictEqual(result.molecule, 'gt-mol');
  assert.strictEqual(result.autonomousMode, true);
  assert.strictEqual(result.attachedAt, '2026-01-28T00:00:00Z');
});

test('toPollerHookFormat returns null when no hooked bead', () => {
  const hookData = {
    agentPath: 'gtviz/witness',
    role: 'witness',
    autonomousMode: false,
    hooked: null,
    molecule: null
  };

  const result = toPollerHookFormat(hookData, 'witness');
  assert.strictEqual(result, null);
});

test('parseMetadataField parses owner field', () => {
  const result = parseMetadataField('Owner: mayor');
  assert.deepStrictEqual(result, { field: 'owner', value: 'mayor' });
});

test('parseMetadataField parses assignee field', () => {
  const result = parseMetadataField('Assignee: gtviz/polecats/toast');
  assert.deepStrictEqual(result, { field: 'assignee', value: 'gtviz/polecats/toast' });
});

test('parseMetadataField parses type field', () => {
  const result = parseMetadataField('Type: bug');
  assert.deepStrictEqual(result, { field: 'type', value: 'bug' });
});

test('parseMetadataField parses date fields', () => {
  const created = parseMetadataField('Created: 2026-01-28');
  assert.deepStrictEqual(created, { field: 'createdAt', value: '2026-01-28' });

  const updated = parseMetadataField('Updated: 2026-01-28');
  assert.deepStrictEqual(updated, { field: 'updatedAt', value: '2026-01-28' });
});

test('parseMetadataField returns null for non-metadata lines', () => {
  assert.strictEqual(parseMetadataField('Not a field'), null);
  assert.strictEqual(parseMetadataField('DESCRIPTION'), null);
  assert.strictEqual(parseMetadataField('  → ○ gt-dep: Dependency'), null);
});

test('parseDependency extracts dependency ID', () => {
  assert.strictEqual(parseDependency('  → ○ gt-dep123: Some dependency'), 'gt-dep123');
  assert.strictEqual(parseDependency('  → ● gt-hooked: Hooked dep'), 'gt-hooked');
});

test('parseDependency returns null for non-dependency lines', () => {
  assert.strictEqual(parseDependency('Owner: someone'), null);
  assert.strictEqual(parseDependency('Not a dependency'), null);
  assert.strictEqual(parseDependency(''), null);
});
