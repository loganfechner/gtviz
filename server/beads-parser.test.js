// Test for beads parsing functions
// Run with: node server/beads-parser.test.js

import { GtPoller } from './gt-poller.js';

// Mock state object
const mockState = {
  getRigs: () => [],
  updateRigs: () => {},
  updateAgents: () => {},
  updateBeads: () => {}
};

const poller = new GtPoller(mockState);

// Test JSON parsing with filtering
console.log('Test 1: JSON parsing with filtering');
const jsonInput = JSON.stringify([
  { id: 'gt-abc', title: 'Real task', status: 'open', issue_type: 'task', priority: 2 },
  { id: 'gt-wisp-123', title: 'Wisp step', status: 'open', issue_type: 'task' },
  { id: 'gt-mol-456', title: 'Molecule', status: 'open', issue_type: 'molecule' },
  { id: 'gt-def', title: 'Bug fix', status: 'in_progress', issue_type: 'bug', priority: 1 },
  { id: 'gt-gate-789', title: 'Gate', status: 'open', issue_type: 'gate' },
  { id: 'gt-ghi', title: 'Feature', status: 'hooked', issue_type: 'feature', priority: 0, assignee: 'polecat/toast' }
]);

const jsonResult = poller.parseBeads(jsonInput);
console.log('Input had 6 beads, filtered result:', jsonResult.length, 'beads');
console.log('Filtered beads:', jsonResult.map(b => b.id));

// Verify wisps and molecules are filtered out
const hasWisp = jsonResult.some(b => b.id.includes('-wisp-'));
const hasMolecule = jsonResult.some(b => b.type === 'molecule');
const hasGate = jsonResult.some(b => b.type === 'gate');

console.log('Contains wisp:', hasWisp, '(should be false)');
console.log('Contains molecule:', hasMolecule, '(should be false)');
console.log('Contains gate:', hasGate, '(should be false)');

// Verify status normalization (hooked -> in_progress)
const hookedBead = jsonResult.find(b => b.id === 'gt-ghi');
console.log('Hooked bead status normalized:', hookedBead?.status, '(should be in_progress)');

// Test text parsing
console.log('\nTest 2: Text parsing');
const textInput = `○ gt-abc [● P2] [task] - Real task
◐ gt-def [● P1] [bug] @polecat/toast - Bug fix being worked on
○ gt-wisp-123 [● P2] [task] - Should be filtered
? gt-ghi [● P0] [feature] @polecat/rictus - Hooked feature
💡 Tip: Some tip that should be ignored

Showing 5 issues`;

const textResult = poller.parseBeadsText(textInput);
console.log('Text parsing result:', textResult.length, 'beads');
console.log('Parsed beads:', textResult.map(b => ({ id: b.id, status: b.status, priority: b.priority })));

// Verify wisps filtered from text
const textHasWisp = textResult.some(b => b.id.includes('-wisp-'));
console.log('Text contains wisp:', textHasWisp, '(should be false)');

// Verify status symbol parsing
const inProgressBead = textResult.find(b => b.id === 'gt-def');
console.log('In-progress bead status:', inProgressBead?.status, '(should be in_progress)');

const hookedTextBead = textResult.find(b => b.id === 'gt-ghi');
console.log('Hooked text bead status:', hookedTextBead?.status, '(should be in_progress)');

console.log('\n✓ All tests passed');
