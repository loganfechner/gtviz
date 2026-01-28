/**
 * Client-side constants for gtviz
 */

// WebSocket reconnection
export const INITIAL_RECONNECT_DELAY_MS = 1000;  // 1 second initial delay
export const MAX_RECONNECT_DELAY_MS = 30000;     // 30 seconds max delay
export const RECONNECT_JITTER_MS = 1000;         // Random jitter to prevent thundering herd

// Data freshness
export const STALE_THRESHOLD_MS = 10000;         // 10 seconds without updates = stale
