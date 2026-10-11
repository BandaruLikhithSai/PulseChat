import rateLimit from 'express-rate-limit';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 min
const max = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const authMax = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);

// Skip rate limiting entirely in tests
const skip = () => process.env.NODE_ENV === 'test';

/**
 * General API rate limiter — 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs,
  max,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

/**
 * Strict limiter for auth endpoints — 10 requests per 15 minutes per IP.
 * Limits brute-force login and registration abuse.
 */
export const authLimiter = rateLimit({
  windowMs,
  max: authMax,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts. Please try again later.' },
});
