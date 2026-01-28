import { writable, derived } from 'svelte/store';
import {
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  RECONNECT_JITTER_MS,
  STALE_THRESHOLD_MS
} from './constants.js';

export const state = writable({
  rigs: {},
  agents: {},
  beads: {},
  hooks: {},
  mail: [],
  errors: [],
  alerts: []
});

export const events = writable([]);

// Separate errors store for UI components that only care about errors
export const errors = writable([]);

// Alerts store for tracking active alerts
export const alerts = writable([]);

// Rules store for alerting configuration
export const rules = writable([]);

// Connection status store for UI display
export const connectionStatus = writable({
  connected: false,
  reconnecting: false,
  attempt: 0,
  url: null,
  lastUpdateTime: null,
  hasInitialData: false
});

// Derived store for stale data detection
export const isStale = derived(
  connectionStatus,
  ($status) => {
    if (!$status.connected || !$status.lastUpdateTime) return false;
    return Date.now() - $status.lastUpdateTime > STALE_THRESHOLD_MS;
  }
);

let ws = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let useFallback = false;

// Exponential backoff configuration
const BACKOFF_MULTIPLIER = 2;

function getReconnectDelay() {
  const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, reconnectAttempt), MAX_RECONNECT_DELAY_MS);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * RECONNECT_JITTER_MS;
}

function getWebSocketUrls() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Primary: connect through Vite proxy
  const proxyUrl = `${protocol}//${window.location.host}/ws`;
  // Fallback: direct connection to server (dev mode only)
  const serverPort = import.meta.env.VITE_SERVER_PORT || 3001;
  const directUrl = `ws://localhost:${serverPort}/ws`;
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
          // Sync errors store with state
          if (msg.data.errors) {
            errors.set(msg.data.errors);
          }
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
          // Update errors in state if it's an error event
          if (msg.event.type === 'error') {
            state.update(s => ({
              ...s,
              errors: [msg.event, ...(s.errors || [])].slice(0, 50)
            }));
            errors.update(e => [msg.event, ...e].slice(0, 50));
          }
        } else if (msg.type === 'error') {
          // Direct error message from server
          errors.update(e => [msg.error, ...e].slice(0, 50));
          state.update(s => ({
            ...s,
            errors: [msg.error, ...(s.errors || [])].slice(0, 50)
          }));
          connectionStatus.update(s => ({
            ...s,
            lastUpdateTime: now
          }));
        } else if (msg.type === 'metrics') {
          state.update(s => ({
            ...s,
            metrics: msg.data
          }));
          connectionStatus.update(s => ({
            ...s,
            lastUpdateTime: now
          }));
        } else if (msg.type === 'alert') {
          // New alert received
          alerts.update(a => [msg.alert, ...a].slice(0, 100));
          state.update(s => ({
            ...s,
            alerts: [msg.alert, ...(s.alerts || [])].slice(0, 100)
          }));
          connectionStatus.update(s => ({
            ...s,
            lastUpdateTime: now
          }));
        } else if (msg.type === 'alertUpdated') {
          // Alert was acknowledged or resolved
          alerts.update(a => a.map(alert =>
            alert.id === msg.alert.id ? msg.alert : alert
          ));
          state.update(s => ({
            ...s,
            alerts: (s.alerts || []).map(alert =>
              alert.id === msg.alert.id ? msg.alert : alert
            )
          }));
        } else if (msg.type === 'alertDismissed') {
          // Alert was dismissed
          alerts.update(a => a.filter(alert => alert.id !== msg.alertId));
          state.update(s => ({
            ...s,
            alerts: (s.alerts || []).filter(alert => alert.id !== msg.alertId)
          }));
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

// Fetch alert rules from API
export async function fetchRules() {
  try {
    const response = await fetch('/api/rules');
    if (response.ok) {
      const data = await response.json();
      rules.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to fetch rules:', err);
  }
  return [];
}

// Fetch alert history from API
export async function fetchAlerts() {
  try {
    const response = await fetch('/api/alerts');
    if (response.ok) {
      const data = await response.json();
      alerts.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to fetch alerts:', err);
  }
  return [];
}
