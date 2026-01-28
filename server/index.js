import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';
import { createMetricsCollector } from './metrics.js';
import { LogsWatcher } from './logs-watcher.js';
import logger from './logger.js';
import { METRICS_HISTORY_SIZE, METRICS_BROADCAST_MS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const metrics = createMetricsCollector(METRICS_HISTORY_SIZE);
const gtPoller = new GtPoller(state, metrics);
const fileWatcher = new FileWatcher(state);
const logsWatcher = new LogsWatcher(state);

// Track intervals for cleanup
let metricsInterval = null;
let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * Saves state, closes watchers, and terminates cleanly
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.info('shutdown', 'Shutdown already in progress');
    return;
  }
  isShuttingDown = true;

  logger.info('shutdown', `Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('shutdown', 'HTTP server closed');
  });

  // Stop polling and watchers
  gtPoller.stop();
  logger.info('shutdown', 'GtPoller stopped');

  fileWatcher.stop();
  logger.info('shutdown', 'FileWatcher stopped');

  logsWatcher.stop();
  logger.info('shutdown', 'LogsWatcher stopped');

  // Clear metrics broadcast interval
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    logger.info('shutdown', 'Metrics interval cleared');
  }

  // Close all WebSocket connections gracefully
  const closePromises = [];
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'shutdown', message: 'Server shutting down' }));
      closePromises.push(new Promise(resolve => {
        client.close(1001, 'Server shutting down');
        client.on('close', resolve);
        setTimeout(resolve, 1000); // Don't wait more than 1s per client
      }));
    }
  });

  if (closePromises.length > 0) {
    await Promise.all(closePromises);
    logger.info('shutdown', `Closed ${closePromises.length} WebSocket connections`);
  }

  // Close WebSocket server
  wss.close(() => {
    logger.info('shutdown', 'WebSocket server closed');
  });

  // Save state to disk
  const saved = state.saveState();
  if (saved) {
    logger.info('shutdown', 'State persisted to disk', { path: StateManager.getStatePath() });
  } else {
    logger.warn('shutdown', 'Failed to persist state');
  }

  logger.info('shutdown', 'Graceful shutdown complete');
  process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Broadcast state changes to all connected clients
state.on('update', (data) => {
  const message = JSON.stringify({ type: 'state', data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

// Broadcast events (mail, logs, errors) to all clients
state.on('event', (event) => {
  const message = JSON.stringify({ type: 'event', event });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

// Broadcast error events to all clients
state.on('error', (error) => {
  const message = JSON.stringify({ type: 'error', error });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

wss.on('connection', (ws) => {
  logger.info('websocket', 'Client connected');
  metrics.recordWsConnection();

  // Send current state on connect
  ws.send(JSON.stringify({ type: 'state', data: state.getState() }));

  ws.on('message', () => {
    metrics.recordWsMessage();
  });

  ws.on('close', () => {
    logger.info('websocket', 'Client disconnected');
    metrics.recordWsDisconnection();
  });
});

// Broadcast metrics periodically
metricsInterval = setInterval(() => {
  const metricsData = metrics.getMetrics();
  state.updateMetrics(metricsData);
  const message = JSON.stringify({ type: 'metrics', data: metricsData });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}, METRICS_BROADCAST_MS);

// REST API for initial data
app.get('/api/state', (req, res) => {
  res.json(state.getState());
});

app.get('/api/rigs', (req, res) => {
  res.json(state.getRigs());
});

// Export events as JSON or CSV
app.get('/api/events/export', (req, res) => {
  const { format = 'json', rig, type, search } = req.query;
  const currentState = state.getState();

  // Combine events and mail into a single list
  let allEvents = [
    ...currentState.events,
    ...currentState.mail.map(m => ({ type: 'mail', ...m }))
  ];

  // Sort by timestamp (newest first)
  allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply filters
  if (rig) {
    allEvents = allEvents.filter(e => !e.source || e.source === rig);
  }

  if (type && type !== 'all') {
    allEvents = allEvents.filter(e => e.type === type);
  }

  if (search) {
    const searchLower = search.toLowerCase();
    allEvents = allEvents.filter(e => {
      const content = (e.content || '').toLowerCase();
      const preview = (e.preview || '').toLowerCase();
      const message = (e.message || '').toLowerCase();
      const action = (e.action || '').toLowerCase();
      const from = (e.from || '').toLowerCase();
      const to = (e.to || '').toLowerCase();
      const subject = (e.subject || '').toLowerCase();
      return content.includes(searchLower) ||
             preview.includes(searchLower) ||
             message.includes(searchLower) ||
             action.includes(searchLower) ||
             from.includes(searchLower) ||
             to.includes(searchLower) ||
             subject.includes(searchLower);
    });
  }

  if (format === 'csv') {
    // Generate CSV
    const headers = ['timestamp', 'type', 'source', 'from', 'to', 'subject', 'message', 'action', 'preview'];
    const escapeCSV = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = allEvents.map(e => headers.map(h => escapeCSV(e[h])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="events-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } else {
    // JSON format
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="events-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(allEvents);
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDistPath));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(clientDistPath, 'index.html'));
    }
  });
}

const PORT = process.env.PORT || 3001;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('server', `Port ${PORT} is already in use`, { port: PORT, error: err.code });
    logger.info('server', `Try: kill $(lsof -ti:${PORT}) or use PORT=3002 npm run server`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  // Restore state from disk if available
  const restored = state.loadState();
  if (restored) {
    logger.info('server', 'State restored from disk', { path: StateManager.getStatePath() });
  }

  logger.info('server', 'gtviz server started', { port: PORT, url: `http://localhost:${PORT}` });
  gtPoller.start();
  fileWatcher.start();
  logsWatcher.start();
});
