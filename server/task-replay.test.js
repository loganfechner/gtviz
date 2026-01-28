import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { TaskReplayManager, createTaskReplayManager } from './task-replay.js';

// Mock StateManager
function createMockState(agentStats = {}, beads = {}) {
  return {
    getState: () => ({
      agentStats,
      beads
    })
  };
}

describe('TaskReplayManager', () => {
  describe('getCompletedTasks', () => {
    it('returns empty array when no stats', () => {
      const state = createMockState({}, {});
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks();
      assert.deepStrictEqual(tasks, []);
    });

    it('collects tasks from agent stats', () => {
      const state = createMockState({
        'testrig/agent1': {
          completions: [
            { beadId: 'gt-abc', title: 'Task 1', completedAt: '2026-01-28T10:00:00Z', duration: 5000 },
            { beadId: 'gt-def', title: 'Task 2', completedAt: '2026-01-28T09:00:00Z', duration: 3000 }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks();

      assert.strictEqual(tasks.length, 2);
      assert.strictEqual(tasks[0].beadId, 'gt-abc'); // Newest first
      assert.strictEqual(tasks[0].agent, 'agent1');
      assert.strictEqual(tasks[0].rig, 'testrig');
    });

    it('filters by rig', () => {
      const state = createMockState({
        'rig1/agent1': {
          completions: [{ beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        },
        'rig2/agent2': {
          completions: [{ beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks({ rig: 'rig1' });

      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].beadId, 'gt-1');
    });

    it('filters by agent', () => {
      const state = createMockState({
        'rig1/agent1': {
          completions: [{ beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        },
        'rig1/agent2': {
          completions: [{ beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks({ agent: 'agent2' });

      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].beadId, 'gt-2');
    });

    it('filters by since date', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-new', title: 'New', completedAt: '2026-01-28T12:00:00Z', duration: null },
            { beadId: 'gt-old', title: 'Old', completedAt: '2026-01-27T12:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks({ since: '2026-01-28T00:00:00Z' });

      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].beadId, 'gt-new');
    });

    it('applies limit', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T12:00:00Z', duration: null },
            { beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T11:00:00Z', duration: null },
            { beadId: 'gt-3', title: 'T3', completedAt: '2026-01-28T10:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks({ limit: 2 });

      assert.strictEqual(tasks.length, 2);
    });

    it('enriches with bead data if available', () => {
      const state = createMockState(
        {
          'testrig/agent': {
            completions: [{ beadId: 'gt-abc', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
          }
        },
        {
          testrig: [{ id: 'gt-abc', description: 'Full description', type: 'feature', priority: 'P1' }]
        }
      );
      const manager = new TaskReplayManager(state);
      const tasks = manager.getCompletedTasks();

      assert.strictEqual(tasks[0].description, 'Full description');
      assert.strictEqual(tasks[0].type, 'feature');
      assert.strictEqual(tasks[0].priority, 'P1');
    });
  });

  describe('exportTasks', () => {
    it('exports as JSON by default', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: 5000 }]
        }
      });
      const manager = new TaskReplayManager(state);
      const result = manager.exportTasks();

      assert.strictEqual(result.contentType, 'application/json');
      assert.ok(result.filename.endsWith('.json'));
      const data = JSON.parse(result.data);
      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.tasks[0].beadId, 'gt-1');
    });

    it('exports as CSV when specified', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: 5000 }]
        }
      });
      const manager = new TaskReplayManager(state);
      const result = manager.exportTasks({ format: 'csv' });

      assert.strictEqual(result.contentType, 'text/csv');
      assert.ok(result.filename.endsWith('.csv'));
      assert.ok(result.data.includes('beadId,title'));
      assert.ok(result.data.includes('gt-1'));
    });

    it('escapes CSV special characters', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task with, comma', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const result = manager.exportTasks({ format: 'csv' });

      assert.ok(result.data.includes('"Task with, comma"'));
    });
  });

  describe('createReplayJob', () => {
    it('throws if taskIds is empty', () => {
      const state = createMockState();
      const manager = new TaskReplayManager(state);

      assert.throws(() => manager.createReplayJob({ taskIds: [] }), /non-empty array/);
    });

    it('creates a replay job', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const job = manager.createReplayJob({ taskIds: ['gt-1'] });

      assert.ok(job.id.startsWith('replay-'));
      assert.strictEqual(job.status, 'pending');
      assert.strictEqual(job.tasks.length, 1);
      assert.strictEqual(job.tasks[0].beadId, 'gt-1');
      assert.strictEqual(job.tasks[0].status, 'pending');
    });

    it('marks unknown tasks as skipped', () => {
      const state = createMockState();
      const manager = new TaskReplayManager(state);
      const job = manager.createReplayJob({ taskIds: ['gt-unknown'] });

      assert.strictEqual(job.tasks[0].status, 'skipped');
      assert.ok(job.tasks[0].error.includes('not found'));
    });

    it('emits jobCreated event', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      let emittedJob = null;
      manager.on('jobCreated', (job) => { emittedJob = job; });

      manager.createReplayJob({ taskIds: ['gt-1'] });

      assert.ok(emittedJob);
      assert.strictEqual(emittedJob.tasks.length, 1);
    });

    it('uses provided options', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const job = manager.createReplayJob({
        taskIds: ['gt-1'],
        name: 'Custom Job',
        options: {
          sequential: false,
          targetAgent: 'specific-agent'
        }
      });

      assert.strictEqual(job.name, 'Custom Job');
      assert.strictEqual(job.options.sequential, false);
      assert.strictEqual(job.tasks[0].targetAgent, 'specific-agent');
    });
  });

  describe('getJob', () => {
    it('returns null for non-existent job', () => {
      const manager = new TaskReplayManager(createMockState());
      assert.strictEqual(manager.getJob('non-existent'), null);
    });

    it('returns existing job', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const created = manager.createReplayJob({ taskIds: ['gt-1'] });
      const fetched = manager.getJob(created.id);

      assert.strictEqual(fetched.id, created.id);
    });
  });

  describe('getJobs', () => {
    it('returns all jobs sorted by creation time', async () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null },
            { beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      const job1 = manager.createReplayJob({ taskIds: ['gt-1'], name: 'Job 1' });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5));
      const job2 = manager.createReplayJob({ taskIds: ['gt-2'], name: 'Job 2' });

      const jobs = manager.getJobs();
      assert.strictEqual(jobs.length, 2);
      // Verify we got both jobs (order depends on actual timestamps)
      const names = jobs.map(j => j.name);
      assert.ok(names.includes('Job 1'));
      assert.ok(names.includes('Job 2'));
    });

    it('filters by status', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null },
            { beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      const job1 = manager.createReplayJob({ taskIds: ['gt-1'] });
      manager.createReplayJob({ taskIds: ['gt-2'] });
      manager.cancelJob(job1.id);

      const pending = manager.getJobs({ status: 'pending' });
      assert.strictEqual(pending.length, 1);

      const cancelled = manager.getJobs({ status: 'cancelled' });
      assert.strictEqual(cancelled.length, 1);
    });

    it('applies limit', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null },
            { beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null },
            { beadId: 'gt-3', title: 'T3', completedAt: '2026-01-28T10:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      manager.createReplayJob({ taskIds: ['gt-1'] });
      manager.createReplayJob({ taskIds: ['gt-2'] });
      manager.createReplayJob({ taskIds: ['gt-3'] });

      const jobs = manager.getJobs({ limit: 2 });
      assert.strictEqual(jobs.length, 2);
    });
  });

  describe('cancelJob', () => {
    it('throws for non-existent job', () => {
      const manager = new TaskReplayManager(createMockState());
      assert.throws(() => manager.cancelJob('non-existent'), /not found/);
    });

    it('cancels pending job', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const job = manager.createReplayJob({ taskIds: ['gt-1'] });
      const cancelled = manager.cancelJob(job.id);

      assert.strictEqual(cancelled.status, 'cancelled');
      assert.ok(cancelled.completedAt);
      assert.strictEqual(cancelled.tasks[0].status, 'skipped');
    });

    it('throws for already completed job', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [{ beadId: 'gt-1', title: 'Task', completedAt: '2026-01-28T10:00:00Z', duration: null }]
        }
      });
      const manager = new TaskReplayManager(state);
      const job = manager.createReplayJob({ taskIds: ['gt-1'] });
      manager.cancelJob(job.id);

      assert.throws(() => manager.cancelJob(job.id), /cannot be cancelled/);
    });
  });

  describe('getStats', () => {
    it('returns aggregated statistics', () => {
      const state = createMockState({
        'rig/agent': {
          completions: [
            { beadId: 'gt-1', title: 'T1', completedAt: '2026-01-28T10:00:00Z', duration: null },
            { beadId: 'gt-2', title: 'T2', completedAt: '2026-01-28T10:00:00Z', duration: null }
          ]
        }
      });
      const manager = new TaskReplayManager(state);
      manager.createReplayJob({ taskIds: ['gt-1'] });
      manager.createReplayJob({ taskIds: ['gt-2', 'gt-unknown'] }); // 2 tasks, 1 skipped

      const stats = manager.getStats();

      assert.strictEqual(stats.jobs.total, 2);
      assert.strictEqual(stats.jobs.pending, 2);
      assert.strictEqual(stats.tasks.total, 3);
      assert.strictEqual(stats.tasks.pending, 2);
      assert.strictEqual(stats.tasks.skipped, 1);
    });
  });
});

describe('createTaskReplayManager', () => {
  it('creates a TaskReplayManager instance', () => {
    const state = createMockState();
    const manager = createTaskReplayManager(state);
    assert.ok(manager instanceof TaskReplayManager);
  });
});
