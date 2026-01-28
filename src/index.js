#!/usr/bin/env node

/**
 * gtviz - Gas Town Agent Status Visualization
 *
 * Provides real-time agent status detection for Gas Town infrastructure.
 * Can be used as a CLI tool or imported as a module.
 */

import { StatusDetector, AgentStatus, getAllAgentStatus, getAllAgentStatusFlat } from './status-detector.js';
import { createServer } from 'http';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'gtviz-cli' }
});

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
  const detector = new StatusDetector({ pollInterval: 5000 });
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

// CLI handling
if (isMain) {
  const command = process.argv[2];

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

    case 'help':
    case '-h':
    case '--help':
      console.log(`
gtviz - Gas Town Agent Status Visualization

Usage:
  gtviz              Show current agent status
  gtviz watch        Watch for status changes in real-time
  gtviz serve [port] Start HTTP server (default port 3847)
  gtviz json         Output status as JSON

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
