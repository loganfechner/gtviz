import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { StateManager } from './state.js';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const GT_DIR = process.env.GT_DIR || join(homedir(), 'gt');
const STATE_DIR = join(GT_DIR, '.gtviz');
const STATE_FILE = join(STATE_DIR, 'state.json');

describe('StateManager persistence', () => {
  let state;

  beforeEach(() => {
    state = new StateManager();
    // Clean up any existing state file
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  });

  afterEach(() => {
    // Clean up test state file
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  });

  it('saveState creates state file', () => {
    state.updateRigs({ rig1: { name: 'rig1' } });
    const saved = state.saveState();
    assert.strictEqual(saved, true);
    assert.strictEqual(existsSync(STATE_FILE), true);
  });

  it('loadState returns false when no state file exists', () => {
    const loaded = state.loadState();
    assert.strictEqual(loaded, false);
  });

  it('loadState restores saved state', () => {
    // Set up initial state
    state.updateRigs({ rig1: { name: 'rig1' } });
    state.addEvent({ type: 'test', message: 'test event' });
    state.addMail({ from: 'test', subject: 'Test mail' });

    // Save state
    state.saveState();

    // Create new StateManager and load
    const state2 = new StateManager();
    const loaded = state2.loadState();

    assert.strictEqual(loaded, true);
    assert.deepStrictEqual(state2.getState().rigs, { rig1: { name: 'rig1' } });
    assert.strictEqual(state2.getState().events.length, 1);
    assert.strictEqual(state2.getState().events[0].type, 'test');
    assert.strictEqual(state2.getState().mail.length, 1);
    assert.strictEqual(state2.getState().mail[0].from, 'test');
  });

  it('loadState restores previousStatus tracking', () => {
    state.updateAgents('rig1', [{ name: 'agent1', status: 'active' }]);
    state.saveState();

    const state2 = new StateManager();
    state2.loadState();

    // previousStatus should be restored
    assert.strictEqual(state2.previousStatus['rig1/agent1'], 'active');
  });

  it('getStatePath returns correct path', () => {
    const path = StateManager.getStatePath();
    assert.strictEqual(path, STATE_FILE);
  });
});
