/**
 * gtviz Server
 *
 * Express + WebSocket server for real-time Gas Town visualization.
 * Polls agent hooks and pushes updates to connected clients.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHookPoller } from './gt-poller.js';
import { createStateManager } from './state.js';
import { createMetricsCollector } from './metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const RIG_PATH = process.env.RIG_PATH || path.resolve(__dirname, '../../..');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);

// Initialize Express
const app = express();
const server = createServer(app);

// Initialize WebSocket
const wss = new WebSocketServer({ server });

// Initialize state manager
const stateManager = createStateManager();

// Initialize metrics collector
const metricsCollector = createMetricsCollector();

// Initialize hook poller with metrics tracking
const hookPoller = createHookPoller(RIG_PATH, (hooks, pollDuration) => {
  metricsCollector.recordPollDuration(pollDuration);
  metricsCollector.updateAgentActivity(hooks);
  stateManager.updateHooks(hooks);
}, POLL_INTERVAL);

// Track state changes for metrics
stateManager.subscribe((message) => {
  if (message.type === 'hooks:updated' && message.data.changes) {
    metricsCollector.recordStateChange(message.data.changes.length);
  }
});

// Subscribe to state changes and broadcast to WebSocket clients
stateManager.subscribe((message) => {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
});

// Broadcast metrics periodically (every 5 seconds)
const METRICS_BROADCAST_INTERVAL = 5000;
setInterval(() => {
  const metrics = metricsCollector.getMetrics();
  const payload = JSON.stringify({
    type: 'metrics:update',
    data: metrics,
    timestamp: new Date().toISOString()
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}, METRICS_BROADCAST_INTERVAL);

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');
  metricsCollector.recordWsConnection();

  // Send current state on connection
  const currentState = stateManager.getState();
  const currentMetrics = metricsCollector.getMetrics();
  ws.send(JSON.stringify({
    type: 'initial',
    data: { ...currentState, metrics: currentMetrics },
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    metricsCollector.recordWsMessage();
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'poll:now') {
        // Client requests immediate poll
        const hooks = await hookPoller.pollNow();
        stateManager.updateHooks(hooks);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    metricsCollector.recordWsDisconnection();
  });
});

// REST API endpoints
app.use(express.json());

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../client/dist')));

// API: Get current hook status
app.get('/api/hooks', (req, res) => {
  res.json({
    hooks: stateManager.getHooks(),
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
    const hooks = await hookPoller.pollNow();
    stateManager.updateHooks(hooks);
    res.json({
      hooks: stateManager.getHooks(),
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
    rigPath: RIG_PATH,
    pollInterval: POLL_INTERVAL,
    connectedClients: wss.clients.size,
    cache: hookPoller.getCacheStats(),
    timestamp: new Date().toISOString()
  });
});

// API: Get cache statistics
app.get('/api/cache', (req, res) => {
  res.json({
    cache: hookPoller.getCacheStats(),
    timestamp: new Date().toISOString()
  });
});

// API: Invalidate cache
app.post('/api/cache/invalidate', (req, res) => {
  hookPoller.invalidateCache();
  res.json({
    status: 'invalidated',
    cache: hookPoller.getCacheStats(),
    timestamp: new Date().toISOString()
  });
});

// API: Get metrics
app.get('/api/metrics', (req, res) => {
  res.json({
    metrics: metricsCollector.getMetrics(),
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
  console.log(`Monitoring rig: ${RIG_PATH}`);
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
