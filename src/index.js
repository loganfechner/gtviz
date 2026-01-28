#!/usr/bin/env node

/**
 * gtviz - Gas Town Agent Status Visualization
 *
 * Provides real-time agent status detection for Gas Town infrastructure.
 * Can be used as a CLI tool or imported as a module.
 */

import { StatusDetector, AgentStatus, getAllAgentStatus, getAllAgentStatusFlat } from './status-detector.js';
import { createServer } from 'http';
import { POLL_INTERVAL_MS } from './constants.js';

// CLI mode when run directly
const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('gtviz');

/**
 * Print agent status table to console
 */
async function printStatus() {
  const agents = await getAllAgentStatusFlat();

  if (agents.length === 0) {
    console.log('No agents found');
    return;
  }

  // Status symbols and colors
  const statusSymbol = {
    [AgentStatus.RUNNING]: '\x1b[32m●\x1b[0m',  // Green
    [AgentStatus.IDLE]: '\x1b[34m○\x1b[0m',      // Blue
    [AgentStatus.STOPPED]: '\x1b[31m◼\x1b[0m',   // Red
    [AgentStatus.UNKNOWN]: '\x1b[90m?\x1b[0m'    // Gray
  };

  console.log('\nAgent Status:');
  console.log('─'.repeat(50));

  // Group by rig
  const byRig = {};
  for (const agent of agents) {
    if (!byRig[agent.rig]) byRig[agent.rig] = [];
    byRig[agent.rig].push(agent);
  }

  for (const [rig, rigAgents] of Object.entries(byRig)) {
    console.log(`\n${rig}:`);
    for (const agent of rigAgents) {
      const symbol = statusSymbol[agent.status];
      const statusText = agent.status.padEnd(8);
      console.log(`  ${symbol} ${agent.name.padEnd(15)} ${statusText} (${agent.state || 'n/a'})`);
    }
  }

  console.log('\n' + '─'.repeat(50));

  // Summary
  const running = agents.filter(a => a.status === AgentStatus.RUNNING).length;
  const idle = agents.filter(a => a.status === AgentStatus.IDLE).length;
  const stopped = agents.filter(a => a.status === AgentStatus.STOPPED).length;

  console.log(`Total: ${agents.length} agents (${running} running, ${idle} idle, ${stopped} stopped)`);
}

/**
 * Watch mode - continuously print status updates
 */
async function watchStatus() {
  const detector = new StatusDetector({ pollInterval: 2000 });

  console.log('Watching agent status (Ctrl+C to stop)...\n');

  detector.subscribe((status, changes) => {
    if (changes.length > 0) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n[${timestamp}] Status changes:`);
      for (const change of changes) {
        console.log(`  ${change.rig}/${change.name}: ${change.oldStatus || 'new'} → ${change.newStatus}`);
      }
    }
  });

  // Print initial status
  await printStatus();

  detector.start();

  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\nStopping...');
    detector.stop();
    process.exit(0);
  });
}

/**
 * Start HTTP server for status API
 */
function startServer(port = 3847) {
  const detector = new StatusDetector({ pollInterval: POLL_INTERVAL_MS });
  detector.start();

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/status' || req.url === '/') {
      const status = await detector.getStatus();
      res.end(JSON.stringify(status, null, 2));
    } else if (req.url === '/status/flat') {
      const agents = await getAllAgentStatusFlat();
      res.end(JSON.stringify(agents, null, 2));
    } else if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port, () => {
    console.log(`gtviz status server running on http://localhost:${port}`);
    console.log('Endpoints:');
    console.log('  GET /status      - Agent status by rig');
    console.log('  GET /status/flat - All agents as flat array');
    console.log('  GET /health      - Health check');
  });

  return server;
}

/**
 * Output JSON status
 */
async function jsonStatus() {
  const status = await getAllAgentStatus();
  console.log(JSON.stringify(status, null, 2));
}

/**
 * Export completed tasks
 * @param {Object} options - Export options
 */
async function exportTasks(options = {}) {
  const port = process.env.GTVIZ_PORT || 3001;
  const params = new URLSearchParams();

  if (options.format) params.set('format', options.format);
  if (options.rig) params.set('rig', options.rig);
  if (options.agent) params.set('agent', options.agent);
  if (options.since) params.set('since', options.since);
  if (options.until) params.set('until', options.until);
  if (options.limit) params.set('limit', options.limit);

  const url = `http://localhost:${port}/api/tasks/export?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      console.error('Export failed:', error.error || response.statusText);
      process.exit(1);
    }

    const data = await response.text();
    console.log(data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: gtviz server is not running');
      console.error(`Start it with: npm run server (port ${port})`);
      process.exit(1);
    }
    console.error('Export failed:', err.message);
    process.exit(1);
  }
}

/**
 * List completed tasks
 */
async function listCompletedTasks(options = {}) {
  const port = process.env.GTVIZ_PORT || 3001;
  const params = new URLSearchParams();

  if (options.rig) params.set('rig', options.rig);
  if (options.agent) params.set('agent', options.agent);
  if (options.limit) params.set('limit', options.limit);

  const url = `http://localhost:${port}/api/tasks/completions?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to fetch tasks:', error.error || response.statusText);
      process.exit(1);
    }

    const { count, tasks } = await response.json();

    if (count === 0) {
      console.log('No completed tasks found');
      return;
    }

    console.log(`\nCompleted Tasks (${count}):`);
    console.log('─'.repeat(80));

    for (const task of tasks) {
      const duration = task.duration
        ? `${Math.round(task.duration / 1000)}s`
        : 'n/a';
      const date = new Date(task.completedAt).toLocaleString();
      console.log(`  ${task.beadId.padEnd(12)} ${task.title.slice(0, 40).padEnd(42)} ${task.agent.padEnd(12)} ${duration.padStart(8)}`);
      console.log(`  ${''.padEnd(12)} ${date}`);
    }

    console.log('─'.repeat(80));
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: gtviz server is not running');
      console.error(`Start it with: npm run server (port ${port})`);
      process.exit(1);
    }
    console.error('Failed to fetch tasks:', err.message);
    process.exit(1);
  }
}

/**
 * Create and optionally start a replay job
 * @param {string[]} taskIds - Bead IDs to replay
 * @param {Object} options - Replay options
 */
async function replayTasks(taskIds, options = {}) {
  const port = process.env.GTVIZ_PORT || 3001;

  if (!taskIds || taskIds.length === 0) {
    console.error('Error: No task IDs provided');
    console.error('Usage: gtviz replay <bead-id1> [bead-id2] ... [--start]');
    process.exit(1);
  }

  const createUrl = `http://localhost:${port}/api/tasks/replay`;

  try {
    // Create the replay job
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskIds,
        name: options.name || `CLI replay: ${taskIds.length} task(s)`,
        options: {
          createNewBeads: options.createBeads !== false,
          sequential: options.parallel !== true
        }
      })
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      console.error('Failed to create replay job:', error.error || createResponse.statusText);
      process.exit(1);
    }

    const job = await createResponse.json();
    console.log(`\nReplay job created: ${job.id}`);
    console.log(`  Tasks: ${job.tasks.length}`);
    console.log(`  Status: ${job.status}`);

    // Start if requested
    if (options.start) {
      console.log('\nStarting replay job...');
      const startUrl = `http://localhost:${port}/api/tasks/replay/${job.id}/start`;
      const startResponse = await fetch(startUrl, { method: 'POST' });

      if (!startResponse.ok) {
        const error = await startResponse.json();
        console.error('Failed to start job:', error.error || startResponse.statusText);
        process.exit(1);
      }

      const startedJob = await startResponse.json();
      console.log(`  Status: ${startedJob.status}`);

      // Show task results
      console.log('\nTask Results:');
      for (const task of startedJob.tasks) {
        const icon = task.status === 'completed' ? '✓' :
                     task.status === 'failed' ? '✗' :
                     task.status === 'skipped' ? '⊘' : '○';
        console.log(`  ${icon} ${task.beadId}: ${task.status}`);
        if (task.replayBeadId) {
          console.log(`    → Replay bead: ${task.replayBeadId}`);
        }
        if (task.error) {
          console.log(`    → Error: ${task.error}`);
        }
      }
    } else {
      console.log(`\nTo start: gtviz replay-start ${job.id}`);
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: gtviz server is not running');
      console.error(`Start it with: npm run server (port ${port})`);
      process.exit(1);
    }
    console.error('Replay failed:', err.message);
    process.exit(1);
  }
}

/**
 * Start a pending replay job
 * @param {string} jobId - Job ID to start
 */
async function startReplayJob(jobId) {
  const port = process.env.GTVIZ_PORT || 3001;

  if (!jobId) {
    console.error('Error: No job ID provided');
    console.error('Usage: gtviz replay-start <job-id>');
    process.exit(1);
  }

  const url = `http://localhost:${port}/api/tasks/replay/${jobId}/start`;

  try {
    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to start job:', error.error || response.statusText);
      process.exit(1);
    }

    const job = await response.json();
    console.log(`\nReplay job ${job.id}:`);
    console.log(`  Status: ${job.status}`);

    // Show task results
    console.log('\nTask Results:');
    for (const task of job.tasks) {
      const icon = task.status === 'completed' ? '✓' :
                   task.status === 'failed' ? '✗' :
                   task.status === 'skipped' ? '⊘' : '○';
      console.log(`  ${icon} ${task.beadId}: ${task.status}`);
      if (task.replayBeadId) {
        console.log(`    → Replay bead: ${task.replayBeadId}`);
      }
      if (task.error) {
        console.log(`    → Error: ${task.error}`);
      }
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: gtviz server is not running');
      process.exit(1);
    }
    console.error('Start failed:', err.message);
    process.exit(1);
  }
}

/**
 * List replay jobs
 */
async function listReplayJobs(options = {}) {
  const port = process.env.GTVIZ_PORT || 3001;
  const params = new URLSearchParams();

  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', options.limit);

  const url = `http://localhost:${port}/api/tasks/replay?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to fetch jobs:', error.error || response.statusText);
      process.exit(1);
    }

    const { count, jobs } = await response.json();

    if (count === 0) {
      console.log('No replay jobs found');
      return;
    }

    console.log(`\nReplay Jobs (${count}):`);
    console.log('─'.repeat(70));

    for (const job of jobs) {
      const icon = job.status === 'completed' ? '✓' :
                   job.status === 'failed' ? '✗' :
                   job.status === 'running' ? '●' :
                   job.status === 'cancelled' ? '⊘' : '○';
      const date = new Date(job.createdAt).toLocaleString();
      const taskCount = job.tasks.length;
      const completed = job.tasks.filter(t => t.status === 'completed').length;

      console.log(`  ${icon} ${job.id}`);
      console.log(`    ${job.name}`);
      console.log(`    Status: ${job.status} | Tasks: ${completed}/${taskCount} | Created: ${date}`);
    }

    console.log('─'.repeat(70));
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('Error: gtviz server is not running');
      process.exit(1);
    }
    console.error('Failed to fetch jobs:', err.message);
    process.exit(1);
  }
}

/**
 * Parse CLI arguments for options
 * @param {string[]} args - Command line arguments
 * @returns {{ positional: string[], options: Object }}
 */
function parseArgs(args) {
  const positional = [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

// CLI handling
if (isMain) {
  const command = process.argv[2];
  const { positional, options } = parseArgs(process.argv.slice(3));

  switch (command) {
    case 'watch':
    case '-w':
      watchStatus();
      break;

    case 'serve':
    case 'server':
    case '-s':
      const port = parseInt(process.argv[3]) || 3847;
      startServer(port);
      break;

    case 'json':
    case '-j':
      jsonStatus();
      break;

    case 'tasks':
    case 'completions':
      listCompletedTasks({
        rig: options.rig || options.r,
        agent: options.agent || options.a,
        limit: options.limit || options.l
      });
      break;

    case 'export':
    case 'export-tasks':
      exportTasks({
        format: options.format || options.f || 'json',
        rig: options.rig || options.r,
        agent: options.agent || options.a,
        since: options.since,
        until: options.until,
        limit: options.limit || options.l
      });
      break;

    case 'replay':
      replayTasks(positional, {
        name: options.name || options.n,
        start: options.start || options.s,
        parallel: options.parallel || options.p,
        createBeads: options['create-beads'] !== 'false'
      });
      break;

    case 'replay-start':
      startReplayJob(positional[0]);
      break;

    case 'replay-jobs':
    case 'jobs':
      listReplayJobs({
        status: options.status,
        limit: options.limit || options.l
      });
      break;

    case 'help':
    case '-h':
    case '--help':
      console.log(`
gtviz - Gas Town Agent Status Visualization

Usage:
  gtviz                   Show current agent status
  gtviz watch             Watch for status changes in real-time
  gtviz serve [port]      Start HTTP server (default port 3847)
  gtviz json              Output status as JSON

Task Export & Replay:
  gtviz tasks             List completed tasks
    --rig, -r <rig>       Filter by rig
    --agent, -a <agent>   Filter by agent
    --limit, -l <n>       Limit results

  gtviz export            Export completed tasks
    --format, -f <fmt>    Export format: json (default) or csv
    --rig, -r <rig>       Filter by rig
    --agent, -a <agent>   Filter by agent
    --since <date>        Tasks completed after this date
    --until <date>        Tasks completed before this date
    --limit, -l <n>       Limit results

  gtviz replay <id1> [id2...]  Create replay job for tasks
    --name, -n <name>     Job name
    --start, -s           Start immediately
    --parallel, -p        Run tasks in parallel

  gtviz replay-start <job-id>  Start a pending replay job
  gtviz replay-jobs            List replay jobs
    --status <status>     Filter by status
    --limit, -l <n>       Limit results

Status Legend:
  ● running (green)  - Agent is actively working
  ○ idle (blue)      - Agent session running, no work
  ◼ stopped (red)    - Agent session not running
`);
      break;

    default:
      printStatus();
  }
}

// Module exports
export {
  StatusDetector,
  AgentStatus,
  getAllAgentStatus,
  getAllAgentStatusFlat,
  startServer
};
