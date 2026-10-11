import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { registerRules, loginRules } from '../validation/auth.validation.js';
import {
  register,
  login,
  logout,
  me,
} from '../controllers/auth.controller.js';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Body: { email, username, password, displayName? }
 * Response 201: { user }
 */
router.post('/register', authLimiter, registerRules, validate, register);

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Response 200: { user }
 * Sets HTTP-only cookie 'token'
 */
router.post('/login', authLimiter, loginRules, validate, login);

/**
 * POST /api/v1/auth/logout
 * Requires auth. Clears the cookie.
 * Response 200: { message }
 */
router.post('/logout', authenticate, logout);

/**
 * GET /api/v1/auth/me
 * Requires auth. Used on every page load to restore session.
 * Response 200: { user }
 */
router.get('/me', authenticate, me);

/**
 * GET /api/v1/auth/socket-token
 * Requires auth cookie. Returns the JWT so the Socket.IO client can pass it
 * in the handshake auth payload. The token value comes from the cookie — we
 * just reflect it back as JSON so JS can read it (the cookie itself is httpOnly).
 *
 * This endpoint must only be called by the authenticated frontend, never
 * exposed to third parties. It returns the same token that is already in the
 * cookie — no new token is issued.
 */
router.get('/socket-token', authenticate, (req, res) => {
  // Read the token directly from the signed cookie
  const token = req.cookies?.token;
  res.json({ success: true, token });
});

export default router;
