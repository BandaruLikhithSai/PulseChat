import jwt from 'jsonwebtoken';

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Issue a signed JWT for the given user id.
 * sub = MongoDB _id string.
 */
export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Attach the JWT as a secure HTTP-only cookie on the response.
 *
 * Cookie settings:
 *  httpOnly   — prevents JS access (XSS mitigation)
 *  secure     — only sent over HTTPS (production)
 *  sameSite   — 'lax' works for same-origin navigation; tighten to 'strict' if
 *               the frontend and backend are the exact same origin in production
 *  maxAge     — matches JWT expiry so cookie expires with the token
 */
export function attachAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = parseExpiryToMs(EXPIRES_IN);

  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax', // 'none' required for cross-origin in production
    maxAge,
    path: '/',
  });
}

/**
 * Clear the auth cookie (used on logout).
 */
export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}

/** Convert e.g. '7d' → milliseconds */
function parseExpiryToMs(expiry) {
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = String(expiry).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86_400_000; // default 7d
  return parseInt(match[1], 10) * units[match[2]];
}
