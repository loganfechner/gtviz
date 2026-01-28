import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { StateManager } from './state.js';
import { FileWatcher } from './watchers.js';
import { GtPoller } from './gt-poller.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const state = new StateManager();
const gtPoller = new GtPoller(state);
const fileWatcher = new FileWatcher(state);

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
  console.log('Client connected');
  // Send current state on connect
  ws.send(JSON.stringify({ type: 'state', data: state.getState() }));

  ws.on('close', () => console.log('Client disconnected'));
});

// REST API for initial data
app.get('/api/state', (req, res) => {
  res.json(state.getState());
});

app.get('/api/rigs', (req, res) => {
  res.json(state.getRigs());
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`gtviz server running on http://localhost:${PORT}`);
  gtPoller.start();
  fileWatcher.start();
});
