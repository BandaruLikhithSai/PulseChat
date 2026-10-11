/**
 * Minimal structured logger.
 * In production swap this for a proper library (pino, winston) if needed.
 * Filters are here to prevent accidentally logging sensitive fields.
 */

const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'secret', 'authorization'];

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s)) ? '[REDACTED]' : v,
    ])
  );
}

export const logger = {
  info(...args) {
    console.log('[INFO]', ...args);
  },
  warn(...args) {
    console.warn('[WARN]', ...args);
  },
  error(...args) {
    console.error('[ERROR]', ...args);
  },
  debug(...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG]', ...args);
    }
  },
  sanitize,
};
