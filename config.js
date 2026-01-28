/**
 * Centralized configuration for gtviz
 *
 * All configurable values are loaded from environment variables with defaults.
 * Copy .env.example to .env to customize.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse an integer from environment variable with fallback
 */
function parseIntEnv(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Server configuration
  server: {
    port: parseIntEnv(process.env.PORT, 3000),
    rigPath: process.env.RIG_PATH || path.resolve(__dirname, '../..'),
  },

  // Polling intervals (in milliseconds)
  polling: {
    hookInterval: parseIntEnv(process.env.POLL_INTERVAL, 5000),
    metricsInterval: parseIntEnv(process.env.METRICS_BROADCAST_INTERVAL, 5000),
    watchInterval: parseIntEnv(process.env.WATCH_INTERVAL, 2000),
    statusInterval: parseIntEnv(process.env.STATUS_POLL_INTERVAL, 5000),
  },

  // Status API server (src/index.js)
  statusApi: {
    port: parseIntEnv(process.env.STATUS_API_PORT, 3847),
  },

  // Client/Vite configuration
  client: {
    port: parseIntEnv(process.env.VITE_PORT, 5173),
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    wsUrl: process.env.WS_URL || 'ws://localhost:3000',
  },
};

export default config;
