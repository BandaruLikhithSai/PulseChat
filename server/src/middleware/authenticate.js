import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Middleware: verify the JWT from the HTTP-only cookie.
 * Attaches req.user (the full Mongoose document minus passwordHash) on success.
 * Returns 401 on missing / invalid / expired token.
 */
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user — ensures disabled / deleted accounts are blocked
    const user = await User.findById(payload.sub).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}
