/**
 * gtviz Server
 *
 * Express + WebSocket server for real-time Gas Town visualization.
 * Polls agent hooks and pushes updates to connected clients.
 * Supports multi-rig overview with drill-down to individual rigs.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createHookPoller, discoverRigs, pollAllRigs } from './gt-poller.js';
import { createStateManager } from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const TOWN_PATH = process.env.TOWN_PATH || path.resolve(__dirname, '../../../..');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);

// Initialize Express
const app = express();
const server = createServer(app);

// Initialize WebSocket
const wss = new WebSocketServer({ server });

// Initialize state manager with multi-rig support
const stateManager = createStateManager();

// Initialize multi-rig poller
const hookPoller = createHookPoller(TOWN_PATH, (rigData) => {
  stateManager.updateRigs(rigData);
}, POLL_INTERVAL);

// Subscribe to state changes and broadcast to WebSocket clients
stateManager.subscribe((message) => {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state on connection
  const currentState = stateManager.getState();
  ws.send(JSON.stringify({
    type: 'initial',
    data: currentState,
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'poll:now') {
        // Client requests immediate poll
        const rigData = await hookPoller.pollNow();
        stateManager.updateRigs(rigData);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// REST API endpoints
app.use(express.json());

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../client/dist')));

// API: Get all rigs overview
app.get('/api/rigs', (req, res) => {
  res.json({
    rigs: stateManager.getRigs(),
    timestamp: new Date().toISOString()
  });
});

// API: Get specific rig details
app.get('/api/rigs/:rigName', (req, res) => {
  const rigData = stateManager.getRig(req.params.rigName);
  if (!rigData) {
    return res.status(404).json({ error: 'Rig not found' });
  }
  res.json({
    rig: rigData,
    timestamp: new Date().toISOString()
  });
});

// API: Get agents for a specific rig (legacy hooks endpoint)
app.get('/api/rigs/:rigName/agents', (req, res) => {
  const rigData = stateManager.getRig(req.params.rigName);
  if (!rigData) {
    return res.status(404).json({ error: 'Rig not found' });
  }
  res.json({
    agents: rigData.agents || {},
    timestamp: new Date().toISOString()
  });
});

// API: Get full state
app.get('/api/state', (req, res) => {
  res.json({
    state: stateManager.getState(),
    timestamp: new Date().toISOString()
  });
});

// API: Trigger immediate poll
app.post('/api/poll', async (req, res) => {
  try {
    const rigData = await hookPoller.pollNow();
    stateManager.updateRigs(rigData);
    res.json({
      rigs: stateManager.getRigs(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    townPath: TOWN_PATH,
    pollInterval: POLL_INTERVAL,
    connectedClients: wss.clients.size,
    rigCount: Object.keys(stateManager.getRigs()).length,
    timestamp: new Date().toISOString()
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`gtviz server running on http://localhost:${PORT}`);
  console.log(`Monitoring town: ${TOWN_PATH}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);

  // Start polling
  hookPoller.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  hookPoller.stop();
  wss.close();
  server.close();
});
