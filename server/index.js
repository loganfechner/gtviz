import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';
import { createMetricsCollector } from './metrics.js';
import { LogsWatcher } from './logs-watcher.js';
import { AlertingEngine } from './alerting-engine.js';
import { RulesStore } from './rules-store.js';
import logger from './logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const metrics = createMetricsCollector(60);
const gtPoller = new GtPoller(state, metrics);
const fileWatcher = new FileWatcher(state);
const logsWatcher = new LogsWatcher(state);
const rulesStore = new RulesStore();
const alertingEngine = new AlertingEngine(state, rulesStore);

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

// Broadcast alerts to all clients
alertingEngine.on('alert', (alert) => {
  const message = JSON.stringify({ type: 'alert', alert });
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
setInterval(() => {
  const metricsData = metrics.getMetrics();
  state.updateMetrics(metricsData);
  const message = JSON.stringify({ type: 'metrics', data: metricsData });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
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

// Alerting Rules API
app.use(express.json());

// Get all rules
app.get('/api/rules', (req, res) => {
  res.json(alertingEngine.getRules());
});

// Get single rule
app.get('/api/rules/:id', (req, res) => {
  const rule = alertingEngine.getRule(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  res.json(rule);
});

// Create new rule
app.post('/api/rules', async (req, res) => {
  try {
    const rule = await alertingEngine.createRule(req.body);
    res.status(201).json(rule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update rule
app.put('/api/rules/:id', async (req, res) => {
  try {
    const rule = await alertingEngine.updateRule(req.params.id, req.body);
    res.json(rule);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Delete rule
app.delete('/api/rules/:id', async (req, res) => {
  try {
    await alertingEngine.deleteRule(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Toggle rule enabled/disabled
app.post('/api/rules/:id/toggle', async (req, res) => {
  try {
    const rule = await alertingEngine.toggleRule(req.params.id);
    res.json(rule);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Get alert history
app.get('/api/alerts', (req, res) => {
  res.json(alertingEngine.getAlertHistory());
});

// Get rule statistics
app.get('/api/rules/:id/stats', (req, res) => {
  const stats = alertingEngine.getRuleStats(req.params.id);
  res.json(stats);
});

// Test a rule against current state
app.post('/api/rules/test', (req, res) => {
  try {
    const results = alertingEngine.testRule(req.body);
    res.json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

server.listen(PORT, async () => {
  logger.info('server', 'gtviz server started', { port: PORT, url: `http://localhost:${PORT}` });
  await alertingEngine.initialize();
  gtPoller.start();
  fileWatcher.start();
  logsWatcher.start();
});
