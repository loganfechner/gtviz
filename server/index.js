import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';
import { createMetricsCollector } from './metrics.js';
import { createMetricsStorage } from './metrics-storage.js';
import { LogsWatcher } from './logs-watcher.js';
import logger from './logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const metrics = createMetricsCollector(60);
const metricsStorage = createMetricsStorage();
const gtPoller = new GtPoller(state, metrics);
const fileWatcher = new FileWatcher(state);
const logsWatcher = new LogsWatcher(state);

// Start metrics persistence
metricsStorage.start();

// Broadcast state changes to all connected clients
state.on('update', (data) => {
  const message = JSON.stringify({ type: 'state', data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

// Broadcast events (mail, logs) to all clients
state.on('event', (event) => {
  const message = JSON.stringify({ type: 'event', event });
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

// Broadcast metrics every 5 seconds
let metricsRecordCounter = 0;
setInterval(() => {
  const metricsData = metrics.getMetrics();
  state.updateMetrics(metricsData);
  const message = JSON.stringify({ type: 'metrics', data: metricsData });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });

  // Record to persistent storage every minute (12 * 5 seconds)
  metricsRecordCounter++;
  if (metricsRecordCounter >= 12) {
    metricsStorage.recordMetrics(metricsData);
    metricsRecordCounter = 0;
  }
}, 5000);

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

// Historical metrics API endpoints
app.get('/api/metrics/history', (req, res) => {
  const { start, end, interval = 'auto' } = req.query;

  // Default to last 24 hours if no range specified
  const endTime = end ? new Date(end) : new Date();
  const startTime = start ? new Date(start) : new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

  try {
    const data = metricsStorage.queryRange(startTime, endTime, interval);
    res.json({
      period: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        interval
      },
      data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/summary', (req, res) => {
  const { start, end } = req.query;

  // Default to last 24 hours
  const endTime = end ? new Date(end) : new Date();
  const startTime = start ? new Date(start) : new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

  try {
    const summary = metricsStorage.getSummary(startTime, endTime);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/agents', (req, res) => {
  const { agent = 'all', start, end } = req.query;

  // Default to last 7 days for agent efficiency
  const endTime = end ? new Date(end) : new Date();
  const startTime = start ? new Date(start) : new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const efficiency = metricsStorage.getAgentEfficiency(agent, startTime, endTime);
    res.json({
      period: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      },
      agents: efficiency
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/storage', (req, res) => {
  try {
    const stats = metricsStorage.getStorageStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
  logger.info('server', 'gtviz server started', { port: PORT, url: `http://localhost:${PORT}` });
  gtPoller.start();
  fileWatcher.start();
  logsWatcher.start();
});
