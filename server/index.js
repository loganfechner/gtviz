import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';
import { createMetricsCollector } from './metrics.js';
import { LogsWatcher } from './logs-watcher.js';
import { createAnomalyDetector } from './anomaly-detector.js';
import logger from './logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const metrics = createMetricsCollector(60);
const anomalyDetector = createAnomalyDetector({
  evaluationIntervalMs: 5000,
  alertCooldownMs: 60000
});
const gtPoller = new GtPoller(state, metrics);
const fileWatcher = new FileWatcher(state);
const logsWatcher = new LogsWatcher(state);

// Connect anomaly detector to state
anomalyDetector.on('alert', (alert) => {
  state.addAlert(alert);
  // Broadcast alert to all clients
  const message = JSON.stringify({ type: 'alert', alert });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

anomalyDetector.on('alertUpdated', (alert) => {
  state.updateAlert(alert.id, alert);
  const message = JSON.stringify({ type: 'alertUpdated', alert });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

anomalyDetector.on('alertDismissed', (alert) => {
  state.removeAlert(alert.id);
  const message = JSON.stringify({ type: 'alertDismissed', alertId: alert.id });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

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

// Broadcast metrics every 5 seconds and feed to anomaly detector
setInterval(() => {
  const metricsData = metrics.getMetrics();
  state.updateMetrics(metricsData);
  anomalyDetector.processMetrics(metricsData);
  const message = JSON.stringify({ type: 'metrics', data: metricsData });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}, 5000);

// Feed log events to anomaly detector
state.on('event', (event) => {
  if (event.type === 'log' && event.level === 'error') {
    anomalyDetector.processLogEntry(event);
  }
});

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

// Alert management API
app.get('/api/alerts', (req, res) => {
  res.json(anomalyDetector.getAlerts());
});

app.post('/api/alerts/:id/acknowledge', express.json(), (req, res) => {
  const success = anomalyDetector.acknowledgeAlert(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/resolve', express.json(), (req, res) => {
  const success = anomalyDetector.resolveAlert(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.delete('/api/alerts/:id', (req, res) => {
  const success = anomalyDetector.dismissAlert(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.get('/api/alerts/thresholds', (req, res) => {
  res.json(anomalyDetector.getThresholds());
});

app.put('/api/alerts/thresholds', express.json(), (req, res) => {
  anomalyDetector.updateThresholds(req.body);
  res.json(anomalyDetector.getThresholds());
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
  anomalyDetector.start();
});
