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

// Initialize hook poller
const hookPoller = createHookPoller(RIG_PATH, (hooks) => {
  stateManager.updateHooks(hooks);
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
        const hooks = await hookPoller.pollNow();
        stateManager.updateHooks(hooks);
      } else if (message.type === 'timeline:getState') {
        // Client requests historical state at specific time
        const state = stateManager.getStateAtTime(message.timestamp);
        ws.send(JSON.stringify({
          type: 'timeline:state',
          data: state,
          requestedTime: message.timestamp,
          timestamp: new Date().toISOString()
        }));
      } else if (message.type === 'timeline:getBounds') {
        // Client requests timeline bounds
        ws.send(JSON.stringify({
          type: 'timeline:bounds',
          data: {
            bounds: stateManager.getTimelineBounds(),
            markers: stateManager.getEventMarkers()
          },
          timestamp: new Date().toISOString()
        }));
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
    timestamp: new Date().toISOString()
  });
});

// Timeline API endpoints

// API: Get timeline bounds and event markers
app.get('/api/timeline', (req, res) => {
  res.json({
    bounds: stateManager.getTimelineBounds(),
    markers: stateManager.getEventMarkers(),
    stats: stateManager.getBufferStats(),
    timestamp: new Date().toISOString()
  });
});

// API: Get historical state at specific time
app.get('/api/timeline/state/:timestamp', (req, res) => {
  try {
    const timestamp = decodeURIComponent(req.params.timestamp);
    const state = stateManager.getStateAtTime(timestamp);
    res.json({
      state,
      requestedTime: timestamp,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// API: Get events within time range
app.get('/api/timeline/events', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }
    const events = stateManager.getEventsBetween(start, end);
    res.json({
      events,
      count: events.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// API: Get all events (for initial load)
app.get('/api/timeline/events/all', (req, res) => {
  const events = stateManager.getAllEvents();
  res.json({
    events,
    count: events.length,
    bounds: stateManager.getTimelineBounds(),
    timestamp: new Date().toISOString()
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Start server
server.listen(PORT, async () => {
  console.log(`gtviz server running on http://localhost:${PORT}`);
  console.log(`Monitoring rig: ${RIG_PATH}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`Timeline buffer: 3 hour rolling window`);

  // Start polling
  hookPoller.start();

  // Record initial snapshot after first poll completes
  const initialHooks = await hookPoller.pollNow();
  stateManager.updateHooks(initialHooks);
  stateManager.recordSnapshot();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  hookPoller.stop();
  wss.close();
  server.close();
});
