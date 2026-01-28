/**
 * Structured logger for gtviz server
 * Provides consistent logging with severity, component, and timestamp
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, component, message, data = {}) {
  if (LOG_LEVELS[level] < currentLevel) return;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    component,
    message,
    ...data
  };

  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${component}]`;

  if (level === 'error') {
    console.error(`${prefix} ${message}`, Object.keys(data).length ? data : '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`, Object.keys(data).length ? data : '');
  } else {
    console.log(`${prefix} ${message}`, Object.keys(data).length ? data : '');
  }

  return entry;
}

export const logger = {
  debug: (component, message, data) => log('debug', component, message, data),
  info: (component, message, data) => log('info', component, message, data),
  warn: (component, message, data) => log('warn', component, message, data),
  error: (component, message, data) => log('error', component, message, data),
};

export default logger;
