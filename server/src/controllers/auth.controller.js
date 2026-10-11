import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, attachAuthCookie, clearAuthCookie } from '../services/token.service.js';
import { success, created, badRequest } from '../utils/apiResponse.js';

const SALT_ROUNDS = 12;

// ── POST /api/v1/auth/register ────────────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { email, username, password, displayName } = req.body;

    // Check for duplicates explicitly so we can return clear messages
    const [emailExists, usernameExists] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ username }),
    ]);

    if (emailExists) {
      return badRequest(res, 'An account with that email already exists.');
    }
    if (usernameExists) {
      return badRequest(res, 'That username is already taken.');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      email,
      username: username.toLowerCase(),
      passwordHash,
      displayName: displayName || username,
    });

    const token = signToken(user._id);
    attachAuthCookie(res, token);

    return created(res, { user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Always fetch with passwordHash for comparison
    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      // Don't reveal whether the email exists
      return badRequest(res, 'Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return badRequest(res, 'Invalid email or password.');
    }

    const token = signToken(user._id);
    attachAuthCookie(res, token);

    return success(res, { user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
export async function logout(req, res) {
  clearAuthCookie(res);
  return success(res, { message: 'Logged out.' });
}

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────
// Used on every page load to restore the session from the cookie
export async function me(req, res) {
  // req.user already attached by authenticate middleware
  return success(res, { user: req.user.toJSON() });
}
