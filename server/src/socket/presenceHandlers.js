import { User } from '../models/User.js';

/**
 * Presence tracking.
 *
 * On connect:
 *  1. The new socket joins the personal room `user:<userId>`.
 *  2. We emit `presence:online` to all OTHER connected clients.
 *  3. We emit `presence:init` back to the NEW socket with the current online set,
 *     so it can initialise its presence map without waiting for events.
 *
 * On disconnect:
 *  1. We check if ANY other socket for this user is still connected.
 *  2. Only when the last socket disconnects do we emit `presence:offline`
 *     and update `lastSeen` in MongoDB.
 *
 * Multi-tab / multi-device: handled correctly because we check
 * the `user:<userId>` room size rather than the socket count.
 */
export function registerPresenceHandlers(io, socket) {
  const userId = socket.userId;

  // Announce this user is online to everyone else
  socket.broadcast.emit('presence:online', { userId });

  // Tell the newly connected client who is currently online.
  // We collect all unique userIds from currently connected sockets.
  io.fetchSockets().then((sockets) => {
    const onlineIds = [...new Set(sockets.map((s) => s.userId).filter(Boolean))];
    socket.emit('presence:init', { onlineUserIds: onlineIds });
  }).catch(() => {
    // Non-fatal — client will build presence incrementally from events
  });

  socket.on('disconnect', async () => {
    // Check remaining sockets for this user
    const userSockets = await io.in(`user:${userId}`).fetchSockets();
    if (userSockets.length === 0) {
      try {
        await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
      } catch {
        // Best-effort
      }
      socket.broadcast.emit('presence:offline', { userId, lastSeen: new Date() });
    }
  });
}
