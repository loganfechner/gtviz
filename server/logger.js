/**
 * Structured Logger
 *
 * Provides pino-based structured logging for gtviz server.
 * Supports log levels: debug, info, warn, error
 */

import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level,
  base: { service: 'gtviz' }
});

export default logger;
