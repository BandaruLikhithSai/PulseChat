import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { buildCorsOptions } from '../config/corsOptions.js';
import { registerMessageHandlers } from './messageHandlers.js';
import { registerPresenceHandlers } from './presenceHandlers.js';
import { registerCallHandlers } from './callHandlers.js';

/**
 * Initialise Socket.IO on the HTTP server.
 *
 * Design principles:
 *  - Every connection is authenticated before any event is processed.
 *  - socket.userId and socket.user are set on the socket object after auth.
 *  - Handlers are registered in separate files and receive (io, socket).
 *  - A user can have multiple concurrent connections (multiple tabs/devices).
 *    Presence is tracked per-connection; offline is emitted only when all
 *    connections for that user disconnect.
 */
export function initSocket(httpServer) {
  const corsOptions = buildCorsOptions();

  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      credentials: true,
    },
    // Prevents replay attacks — clients must reconnect after a token change
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: false,
    },
  });

  // ── Authentication middleware ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Token arrives as a handshake auth payload from the client
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required.'));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('-passwordHash');

      if (!user) {
        return next(new Error('User not found.'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid or expired token.'));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.userId} (${socket.id})`);

    // Join a personal room — used for targeted notifications
    socket.join(`user:${socket.userId}`);

    // Register domain-specific handlers
    registerPresenceHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerCallHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.userId} (${socket.id}) — ${reason}`);
    });
  });

  return io;
}
