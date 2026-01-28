import { writable } from 'svelte/store';

export const state = writable({
  rigs: {},
  agents: {},
  beads: {},
  hooks: {},
  mail: []
});

export const events = writable([]);

export const connectionStatus = writable({
  connected: false,
  reconnecting: false,
  attempt: 0,
  url: null
});

let ws = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let useFallback = false;

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const BACKOFF_MULTIPLIER = 2;

function getReconnectDelay() {
  const delay = Math.min(INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, reconnectAttempt), MAX_DELAY);
  return delay + Math.random() * 1000;
}

function getWebSocketUrls() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const proxyUrl = `${protocol}//${window.location.host}/ws`;
  const directUrl = `ws://localhost:3001/ws`;
  return { proxyUrl, directUrl };
}

export function connectWebSocket(onStatusChange) {
  const { proxyUrl, directUrl } = getWebSocketUrls();

  function connect() {
    const wsUrl = useFallback ? directUrl : proxyUrl;
    console.log(`WebSocket connecting to ${wsUrl} (attempt ${reconnectAttempt + 1})`);

    connectionStatus.update(s => ({
      ...s,
      reconnecting: reconnectAttempt > 0,
      attempt: reconnectAttempt + 1,
      url: wsUrl
    }));

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`WebSocket connected to ${wsUrl}`);
      reconnectAttempt = 0;
      onStatusChange?.(true);
      connectionStatus.set({
        connected: true,
        reconnecting: false,
        attempt: 0,
        url: wsUrl
      });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'state') {
          state.set(msg.data);
        } else if (msg.type === 'event') {
          events.update(e => [msg.event, ...e].slice(0, 100));

          if (msg.event.type === 'mail') {
            state.update(s => ({
              ...s,
              mail: [msg.event, ...(s.mail || [])].slice(0, 50)
            }));
          }
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      onStatusChange?.(false);
      connectionStatus.update(s => ({ ...s, connected: false, reconnecting: true }));
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      if (!useFallback && reconnectAttempt === 0) {
        console.log('Proxy connection failed, will try direct connection');
        useFallback = true;
      }
    };
  }

  function scheduleReconnect() {
    const delay = getReconnectDelay();
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt + 1})`);

    if (reconnectAttempt > 0 && reconnectAttempt % 3 === 0) {
      useFallback = !useFallback;
      console.log(`Switching to ${useFallback ? 'direct' : 'proxy'} connection`);
    }

    reconnectAttempt++;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();
}

export function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  useFallback = false;
  connectionStatus.set({
    connected: false,
    reconnecting: false,
    attempt: 0,
    url: null
  });
}
