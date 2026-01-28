import { writable, derived } from 'svelte/store';

export const state = writable({
  rigs: {},
  agents: {},
  beads: {},
  hooks: {},
  mail: []
});

export const events = writable([]);

// Connection status store for UI display
export const connectionStatus = writable({
  connected: false,
  reconnecting: false,
  attempt: 0,
  url: null,
  lastUpdateTime: null,
  hasInitialData: false
});

// Stale data threshold (10 seconds without updates while connected)
const STALE_THRESHOLD = 10000;

// Derived store for stale data detection
export const isStale = derived(
  connectionStatus,
  ($status) => {
    if (!$status.connected || !$status.lastUpdateTime) return false;
    return Date.now() - $status.lastUpdateTime > STALE_THRESHOLD;
  }
);

let ws = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let useFallback = false;

// Exponential backoff configuration
const INITIAL_DELAY = 1000;      // 1 second
const MAX_DELAY = 30000;         // 30 seconds max
const BACKOFF_MULTIPLIER = 2;

function getReconnectDelay() {
  const delay = Math.min(INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, reconnectAttempt), MAX_DELAY);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}

function getWebSocketUrls() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Primary: connect through Vite proxy
  const proxyUrl = `${protocol}//${window.location.host}/ws`;
  // Fallback: direct connection to server (dev mode only)
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
        const now = Date.now();

        if (msg.type === 'state') {
          state.set(msg.data);
          connectionStatus.update(s => ({
            ...s,
            lastUpdateTime: now,
            hasInitialData: true
          }));
        } else if (msg.type === 'event') {
          events.update(e => [msg.event, ...e].slice(0, 100));
          connectionStatus.update(s => ({
            ...s,
            lastUpdateTime: now
          }));

          // Also update mail in state if it's a mail event
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
      // On first error with proxy, try fallback on next attempt
      if (!useFallback && reconnectAttempt === 0) {
        console.log('Proxy connection failed, will try direct connection');
        useFallback = true;
      }
    };
  }

  function scheduleReconnect() {
    const delay = getReconnectDelay();
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt + 1})`);

    // Toggle between proxy and direct every few attempts
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
    url: null,
    lastUpdateTime: null,
    hasInitialData: false
  });
}
