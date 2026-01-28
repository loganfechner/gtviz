/**
 * Task Replay Manager
 *
 * Manages batch export of completed tasks and replay job orchestration.
 * Enables workflow automation and testing scenarios by allowing re-execution
 * of completed tasks.
 */

import { EventEmitter } from 'events';
import { execSync, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import logger from './logger.js';

/**
 * @typedef {Object} CompletedTask
 * @property {string} beadId - Original bead ID
 * @property {string} title - Task title
 * @property {string} agent - Agent that completed the task
 * @property {string} rig - Rig where task was completed
 * @property {string} completedAt - ISO timestamp of completion
 * @property {number|null} duration - Duration in milliseconds
 * @property {string|null} description - Task description (if available)
 * @property {string|null} type - Task type (task, bug, feature, etc.)
 * @property {string|null} priority - Task priority
 */

/**
 * @typedef {Object} ReplayTask
 * @property {string} beadId - Original bead ID
 * @property {string} title - Task title
 * @property {string} originalAgent - Agent that originally completed this
 * @property {string|null} targetAgent - Target agent for replay (null = auto-assign)
 * @property {'pending'|'queued'|'running'|'completed'|'failed'|'skipped'} status
 * @property {string|null} replayBeadId - New bead ID created for replay
 * @property {string|null} error - Error message if failed
 * @property {string|null} startedAt - ISO timestamp when started
 * @property {string|null} completedAt - ISO timestamp when completed
 */

/**
 * @typedef {Object} ReplayJob
 * @property {string} id - Unique job ID
 * @property {string} name - Job name/description
 * @property {ReplayTask[]} tasks - Tasks to replay
 * @property {'pending'|'running'|'completed'|'failed'|'cancelled'} status
 * @property {string} createdAt - ISO timestamp
 * @property {string|null} startedAt - ISO timestamp when started
 * @property {string|null} completedAt - ISO timestamp when completed
 * @property {Object} options - Replay options
 * @property {boolean} options.createNewBeads - Whether to create new beads for replay
 * @property {boolean} options.sequential - Run tasks sequentially vs parallel
 * @property {string|null} options.targetRig - Target rig for replay (null = same rig)
 */

/**
 * Generate a unique job ID
 * @returns {string}
 */
function generateJobId() {
  return `replay-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

/**
 * TaskReplayManager - Handles batch task export and replay operations
 */
export class TaskReplayManager extends EventEmitter {
  constructor(state) {
    super();
    this.state = state;
    /** @type {Map<string, ReplayJob>} */
    this.jobs = new Map();
    /** @type {Map<string, CompletedTask>} */
    this.taskCache = new Map();
    this.maxJobs = 100; // Keep last 100 jobs
  }

  /**
   * Get all completed tasks from agent stats
   * @param {Object} options - Filter options
   * @param {string} [options.rig] - Filter by rig
   * @param {string} [options.agent] - Filter by agent
   * @param {string} [options.since] - ISO timestamp, only tasks after this
   * @param {string} [options.until] - ISO timestamp, only tasks before this
   * @param {number} [options.limit] - Maximum number of tasks
   * @returns {CompletedTask[]}
   */
  getCompletedTasks(options = {}) {
    const { rig, agent, since, until, limit } = options;
    const currentState = this.state.getState();
    const completedTasks = [];

    // Iterate through agent stats to collect completions
    for (const [agentKey, stats] of Object.entries(currentState.agentStats || {})) {
      // agentKey format: "rig/agentName"
      const [agentRig, agentName] = agentKey.split('/');

      // Apply rig filter
      if (rig && agentRig !== rig) continue;

      // Apply agent filter
      if (agent && agentName !== agent) continue;

      for (const completion of stats.completions || []) {
        const task = {
          beadId: completion.beadId,
          title: completion.title,
          agent: agentName,
          rig: agentRig,
          completedAt: completion.completedAt,
          duration: completion.duration,
          description: null,
          type: null,
          priority: null
        };

        // Try to enrich with bead data if available
        const rigBeads = currentState.beads[agentRig] || [];
        const bead = rigBeads.find(b => b.id === completion.beadId);
        if (bead) {
          task.description = bead.description || null;
          task.type = bead.type || null;
          task.priority = bead.priority || null;
        }

        // Apply time filters
        if (since && new Date(task.completedAt) < new Date(since)) continue;
        if (until && new Date(task.completedAt) > new Date(until)) continue;

        completedTasks.push(task);
      }
    }

    // Sort by completion time (newest first)
    completedTasks.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    // Apply limit
    if (limit && limit > 0) {
      return completedTasks.slice(0, limit);
    }

    return completedTasks;
  }

  /**
   * Export completed tasks as a batch
   * @param {Object} options - Export options
   * @param {'json'|'csv'} [options.format='json'] - Export format
   * @param {string} [options.rig] - Filter by rig
   * @param {string} [options.agent] - Filter by agent
   * @param {string} [options.since] - ISO timestamp
   * @param {string} [options.until] - ISO timestamp
   * @param {number} [options.limit] - Maximum tasks
   * @returns {{ data: string, contentType: string, filename: string }}
   */
  exportTasks(options = {}) {
    const { format = 'json', ...filterOptions } = options;
    const tasks = this.getCompletedTasks(filterOptions);
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const headers = [
        'beadId', 'title', 'agent', 'rig', 'completedAt',
        'duration', 'type', 'priority', 'description'
      ];

      const escapeCSV = (val) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = tasks.map(t =>
        headers.map(h => escapeCSV(t[h])).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');

      return {
        data: csv,
        contentType: 'text/csv',
        filename: `completed-tasks-${timestamp}.csv`
      };
    }

    // JSON format (default)
    return {
      data: JSON.stringify({
        exportedAt: new Date().toISOString(),
        count: tasks.length,
        filters: filterOptions,
        tasks
      }, null, 2),
      contentType: 'application/json',
      filename: `completed-tasks-${timestamp}.json`
    };
  }

  /**
   * Create a replay job for selected tasks
   * @param {Object} params
   * @param {string[]} params.taskIds - Bead IDs to replay
   * @param {string} [params.name] - Job name
   * @param {Object} [params.options] - Replay options
   * @param {boolean} [params.options.createNewBeads=true] - Create new beads for replay
   * @param {boolean} [params.options.sequential=true] - Run sequentially
   * @param {string} [params.options.targetRig] - Target rig (null = same rig)
   * @param {string} [params.options.targetAgent] - Target agent (null = auto)
   * @returns {ReplayJob}
   */
  createReplayJob(params) {
    const { taskIds, name, options = {} } = params;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error('taskIds must be a non-empty array');
    }

    // Get task details from completed tasks
    const allCompleted = this.getCompletedTasks({});
    const taskMap = new Map(allCompleted.map(t => [t.beadId, t]));

    const replayTasks = taskIds.map(beadId => {
      const original = taskMap.get(beadId);
      if (!original) {
        return {
          beadId,
          title: `Unknown task: ${beadId}`,
          originalAgent: 'unknown',
          targetAgent: options.targetAgent || null,
          status: 'skipped',
          replayBeadId: null,
          error: 'Original task not found in completion history',
          startedAt: null,
          completedAt: null
        };
      }

      return {
        beadId: original.beadId,
        title: original.title,
        originalAgent: original.agent,
        targetAgent: options.targetAgent || null,
        status: 'pending',
        replayBeadId: null,
        error: null,
        startedAt: null,
        completedAt: null
      };
    });

    const job = {
      id: generateJobId(),
      name: name || `Replay ${taskIds.length} task(s)`,
      tasks: replayTasks,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      options: {
        createNewBeads: options.createNewBeads !== false,
        sequential: options.sequential !== false,
        targetRig: options.targetRig || null,
        targetAgent: options.targetAgent || null
      }
    };

    // Store the job
    this.jobs.set(job.id, job);
    this._pruneOldJobs();

    logger.info('task-replay', 'Created replay job', {
      jobId: job.id,
      taskCount: taskIds.length
    });

    this.emit('jobCreated', job);
    return job;
  }

  /**
   * Start a replay job
   * @param {string} jobId
   * @returns {ReplayJob}
   */
  async startReplayJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'pending') {
      throw new Error(`Job cannot be started: status is ${job.status}`);
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.emit('jobStarted', job);

    try {
      if (job.options.sequential) {
        await this._runSequential(job);
      } else {
        await this._runParallel(job);
      }

      // Determine final status
      const allCompleted = job.tasks.every(t =>
        t.status === 'completed' || t.status === 'skipped'
      );
      const anyFailed = job.tasks.some(t => t.status === 'failed');

      job.status = anyFailed ? 'failed' : (allCompleted ? 'completed' : 'failed');
      job.completedAt = new Date().toISOString();

      logger.info('task-replay', 'Replay job finished', {
        jobId,
        status: job.status,
        completed: job.tasks.filter(t => t.status === 'completed').length,
        failed: job.tasks.filter(t => t.status === 'failed').length,
        skipped: job.tasks.filter(t => t.status === 'skipped').length
      });

      this.emit('jobCompleted', job);
    } catch (err) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      logger.error('task-replay', 'Replay job failed', { jobId, error: err.message });
      this.emit('jobFailed', job, err);
    }

    return job;
  }

  /**
   * Run tasks sequentially
   * @param {ReplayJob} job
   * @private
   */
  async _runSequential(job) {
    for (const task of job.tasks) {
      if (task.status === 'skipped') continue;
      await this._executeTask(job, task);
    }
  }

  /**
   * Run tasks in parallel
   * @param {ReplayJob} job
   * @private
   */
  async _runParallel(job) {
    const promises = job.tasks
      .filter(t => t.status !== 'skipped')
      .map(task => this._executeTask(job, task));
    await Promise.all(promises);
  }

  /**
   * Execute a single replay task
   * @param {ReplayJob} job
   * @param {ReplayTask} task
   * @private
   */
  async _executeTask(job, task) {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.emit('taskStarted', job, task);

    try {
      if (job.options.createNewBeads) {
        // Create a new bead for replay
        const newBeadId = await this._createReplayBead(job, task);
        task.replayBeadId = newBeadId;
      }

      // Note: Actual task execution happens when an agent picks up the bead
      // We just mark it as queued/completed from our perspective
      task.status = 'completed';
      task.completedAt = new Date().toISOString();

      logger.info('task-replay', 'Task replay queued', {
        jobId: job.id,
        originalBeadId: task.beadId,
        replayBeadId: task.replayBeadId
      });

      this.emit('taskCompleted', job, task);
    } catch (err) {
      task.status = 'failed';
      task.error = err.message;
      task.completedAt = new Date().toISOString();

      logger.error('task-replay', 'Task replay failed', {
        jobId: job.id,
        beadId: task.beadId,
        error: err.message
      });

      this.emit('taskFailed', job, task, err);
    }
  }

  /**
   * Create a new bead for replay
   * @param {ReplayJob} job
   * @param {ReplayTask} task
   * @returns {Promise<string>} New bead ID
   * @private
   */
  async _createReplayBead(job, task) {
    const title = `[REPLAY] ${task.title}`;
    const description = `Replay of original task: ${task.beadId}\n` +
      `Original agent: ${task.originalAgent}\n` +
      `Replay job: ${job.id}`;

    try {
      // Use bd create to create a new bead
      const cmd = `bd create --title "${title.replace(/"/g, '\\"')}" --type task -d "${description.replace(/"/g, '\\"')}"`;
      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 30000
      });

      // Parse the bead ID from output
      // Expected format: "✓ Created issue: gt-xyz123"
      const match = output.match(/Created issue:\s*(\S+)/);
      if (match) {
        return match[1];
      }

      throw new Error('Could not parse bead ID from bd create output');
    } catch (err) {
      throw new Error(`Failed to create replay bead: ${err.message}`);
    }
  }

  /**
   * Cancel a pending or running job
   * @param {string} jobId
   * @returns {ReplayJob}
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new Error(`Job cannot be cancelled: status is ${job.status}`);
    }

    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();

    // Mark pending tasks as skipped
    for (const task of job.tasks) {
      if (task.status === 'pending') {
        task.status = 'skipped';
        task.error = 'Job cancelled';
      }
    }

    logger.info('task-replay', 'Replay job cancelled', { jobId });
    this.emit('jobCancelled', job);
    return job;
  }

  /**
   * Get a replay job by ID
   * @param {string} jobId
   * @returns {ReplayJob|null}
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all replay jobs
   * @param {Object} options
   * @param {'pending'|'running'|'completed'|'failed'|'cancelled'} [options.status]
   * @param {number} [options.limit]
   * @returns {ReplayJob[]}
   */
  getJobs(options = {}) {
    let jobs = Array.from(this.jobs.values());

    if (options.status) {
      jobs = jobs.filter(j => j.status === options.status);
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (options.limit && options.limit > 0) {
      jobs = jobs.slice(0, options.limit);
    }

    return jobs;
  }

  /**
   * Prune old jobs to stay within limit
   * @private
   */
  _pruneOldJobs() {
    if (this.jobs.size <= this.maxJobs) return;

    const jobs = Array.from(this.jobs.entries())
      .sort((a, b) =>
        new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime()
      );

    const toRemove = jobs.slice(0, jobs.length - this.maxJobs);
    for (const [id] of toRemove) {
      this.jobs.delete(id);
    }
  }

  /**
   * Get summary statistics for replay jobs
   * @returns {Object}
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    const taskCounts = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      pending: 0
    };

    for (const job of jobs) {
      for (const task of job.tasks) {
        taskCounts.total++;
        if (task.status === 'completed') taskCounts.completed++;
        else if (task.status === 'failed') taskCounts.failed++;
        else if (task.status === 'skipped') taskCounts.skipped++;
        else taskCounts.pending++;
      }
    }

    return {
      jobs: {
        total: jobs.length,
        pending: jobs.filter(j => j.status === 'pending').length,
        running: jobs.filter(j => j.status === 'running').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        cancelled: jobs.filter(j => j.status === 'cancelled').length
      },
      tasks: taskCounts
    };
  }
}

/**
 * Create a new TaskReplayManager instance
 * @param {Object} state - StateManager instance
 * @returns {TaskReplayManager}
 */
export function createTaskReplayManager(state) {
  return new TaskReplayManager(state);
}
