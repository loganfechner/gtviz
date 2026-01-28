/**
 * GTViz Server
 *
 * Server for Gas Town Visualization with agent task/description display.
 * Provides REST API and WebSocket for real-time agent updates.
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createAgentPoller, pollAllAgents } from './agent-poller.js';
import { ROLE_DESCRIPTIONS } from './role-descriptions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const GT_DIR = process.env.GT_DIR || join(process.env.HOME, 'gt');
const RIG_NAME = process.env.RIG_NAME || 'gtviz';
const RIG_PATH = join(GT_DIR, RIG_NAME);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;

// State
let currentAgents = [];
const clients = new Set();

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, '../client/dist')));

// REST API

/**
 * GET /api/agents
 * Returns all agents with their current status, task, and description
 */
app.get('/api/agents', async (req, res) => {
  try {
    res.json({
      rig: RIG_NAME,
      agents: currentAgents,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/:name
 * Returns a single agent's detailed information
 */
app.get('/api/agents/:name', (req, res) => {
  const agent = currentAgents.find(a => a.name === req.params.name);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(agent);
});

/**
 * GET /api/roles
 * Returns all role descriptions
 */
app.get('/api/roles', (req, res) => {
  res.json(ROLE_DESCRIPTIONS);
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    rig: RIG_NAME,
    agentCount: currentAgents.length,
    connectedClients: clients.size
  });
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  // Send current state on connection
  ws.send(JSON.stringify({
    type: 'initial',
    rig: RIG_NAME,
    agents: currentAgents
  }));

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

/**
 * Broadcast agent updates to all connected clients
 * @param {Array} agents - Updated agent list
 */
function broadcastUpdate(agents) {
  const message = JSON.stringify({
    type: 'update',
    agents: agents,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}

// Start polling
const poller = createAgentPoller(RIG_PATH, (agents) => {
  currentAgents = agents;
  broadcastUpdate(agents);
}, POLL_INTERVAL);

// Start server
server.listen(PORT, () => {
  console.log(`GTViz server running on http://localhost:${PORT}`);
  console.log(`Monitoring rig: ${RIG_NAME} at ${RIG_PATH}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  poller.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  poller.stop();
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});
