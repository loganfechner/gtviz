/**
 * Server-side constants for gtviz
 */

// Metrics collection
export const METRICS_HISTORY_SIZE = 60;      // Number of data points to retain (1 hour at 1/min)
export const METRICS_INTERVAL_MS = 60000;    // 1 minute intervals for historical data

// Polling intervals
export const POLL_INTERVAL_MS = 5000;        // How often to poll for state changes
export const METRICS_BROADCAST_MS = 5000;    // How often to broadcast metrics to clients

// Timeouts
export const COMMAND_TIMEOUT_MS = 5000;      // Timeout for shell commands
export const LONG_COMMAND_TIMEOUT_MS = 10000; // Timeout for longer operations

// Activity detection
export const IDLE_THRESHOLD_MS = 60000;      // Consider idle if no activity for 60 seconds
