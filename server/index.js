import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';
import { createMetricsCollector } from './metrics.js';
import { createHealthCalculator } from './health-calculator.js';
import { createMetricsStorage } from './metrics-storage.js';
import { LogsWatcher } from './logs-watcher.js';
import { createAnomalyDetector } from './anomaly-detector.js';
import { AlertingEngine } from './alerting-engine.js';
import { RulesStore } from './rules-store.js';
import logger from './logger.js';
import { METRICS_HISTORY_SIZE, METRICS_BROADCAST_MS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const metrics = createMetricsCollector(METRICS_HISTORY_SIZE);
const healthCalculator = createHealthCalculator(METRICS_HISTORY_SIZE);
const metricsStorage = createMetricsStorage();
const anomalyDetector = createAnomalyDetector({
  evaluationIntervalMs: 5000,
  alertCooldownMs: 60000
});
const gtPoller = new GtPoller(state, metrics);
const fileWatcher = new FileWatcher(state);
const logsWatcher = new LogsWatcher(state);
const rulesStore = new RulesStore();
const alertingEngine = new AlertingEngine(state, rulesStore);

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

// Start metrics persistence
metricsStorage.start();

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

// Broadcast alerts from alerting engine to all clients
alertingEngine.on('alert', (alert) => {
  const message = JSON.stringify({ type: 'alert', alert });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
});

// Broadcast error pattern updates to all clients
state.on('errorPatterns', (errorPatterns) => {
  const message = JSON.stringify({ type: 'errorPatterns', data: errorPatterns });
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

// Broadcast metrics, health score, and feed to anomaly detector
let metricsRecordCounter = 0;
metricsInterval = setInterval(() => {
  const metricsData = metrics.getMetrics();
  const healthScore = healthCalculator.calculate(metricsData);
  const healthHistory = healthCalculator.getHistory();

  // Add health data to metrics
  metricsData.health = {
    ...healthScore,
    history: healthHistory
  };

  state.updateMetrics(metricsData);
  anomalyDetector.processMetrics(metricsData);
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
}, METRICS_BROADCAST_MS);

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

app.get('/api/error-patterns', (req, res) => {
  res.json(state.getErrorPatterns());
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

// Alert management API (anomaly detector)
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

// Get alert history from alerting engine
app.get('/api/alerts/history', (req, res) => {
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

server.listen(PORT, async () => {
  // Restore state from disk if available
  const restored = state.loadState();
  if (restored) {
    logger.info('server', 'State restored from disk', { path: StateManager.getStatePath() });
  }

  logger.info('server', 'gtviz server started', { port: PORT, url: `http://localhost:${PORT}` });
  await alertingEngine.initialize();
  gtPoller.start();
  fileWatcher.start();
  logsWatcher.start();
  anomalyDetector.start();
});
