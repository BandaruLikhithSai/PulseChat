import { CallSession } from '../models/CallSession.js';
import { Conversation } from '../models/Conversation.js';

/**
 * WebRTC Call Signaling — Socket.IO handlers.
 *
 * Signal flow (1-to-1 call):
 *   1. Caller emits  call:invite  → server validates membership, creates CallSession,
 *                                    emits call:incoming to callee's personal room
 *   2. Callee emits  call:accept  → server emits call:accepted to caller
 *                                    both sides begin WebRTC negotiation
 *   3. Caller emits  call:offer   → server relays to callee
 *   4. Callee emits  call:answer  → server relays to caller
 *   5. Both emit     call:ice     → server relays ICE candidates
 *   6. Either emits  call:end     → server updates CallSession, broadcasts call:ended
 *   7. Callee emits  call:reject  → server updates CallSession, emits call:rejected
 *
 * Authorization: every event verifies both users are active participants
 * of the conversation before relaying any signal.
 *
 * STUN/TURN: ICE server config is sent to the client on call:accepted so
 * credentials never appear in frontend source code.
 */

function getIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];

  const turnUrl  = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }

  return servers;
}

async function areBothMembers(conversationId, userId1, userId2) {
  const conv = await Conversation.findById(conversationId).select('participants');
  if (!conv) return false;
  const active = conv.participants.filter((p) => !p.leftAt).map((p) => p.user.toString());
  return active.includes(userId1) && active.includes(userId2);
}

export function registerCallHandlers(io, socket) {
  const callerId = socket.userId;

  // ── call:invite ───────────────────────────────────────────────────────────
  socket.on('call:invite', async (payload, ack) => {
    try {
      const { conversationId, calleeId, type = 'video' } = payload ?? {};
      if (!conversationId || !calleeId)
        return ack?.({ error: 'conversationId and calleeId are required.' });
      if (!['audio', 'video'].includes(type))
        return ack?.({ error: "type must be 'audio' or 'video'." });

      const ok = await areBothMembers(conversationId, callerId, calleeId);
      if (!ok) return ack?.({ error: 'Both users must be members of this conversation.' });

      // Create a call session record
      const session = await CallSession.create({
        conversation: conversationId,
        initiator: callerId,
        type,
        participants: [
          { user: callerId, status: 'joined' },
          { user: calleeId, status: 'ringing' },
        ],
        status: 'ringing',
      });

      // Notify the callee on their personal room
      io.to(`user:${calleeId}`).emit('call:incoming', {
        sessionId:      session._id,
        conversationId,
        callerId,
        callerName:     socket.user?.displayName || socket.user?.username,
        callerAvatar:   socket.user?.avatar,
        type,
      });

      ack?.({ sessionId: session._id, status: 'ringing' });
    } catch (err) {
      console.error('[Call] call:invite error:', err.message);
      ack?.({ error: 'Failed to start call.' });
    }
  });

  // ── call:accept ───────────────────────────────────────────────────────────
  socket.on('call:accept', async (payload, ack) => {
    try {
      const { sessionId } = payload ?? {};
      if (!sessionId) return ack?.({ error: 'sessionId is required.' });

      const session = await CallSession.findById(sessionId);
      if (!session) return ack?.({ error: 'Call session not found.' });
      if (session.status !== 'ringing')
        return ack?.({ error: 'Call is no longer ringing.' });

      await CallSession.findByIdAndUpdate(sessionId, {
        status: 'active',
        startedAt: new Date(),
        'participants.$[callee].status': 'joined',
      }, {
        arrayFilters: [{ 'callee.user': socket.userId }],
      });

      // Tell the caller the callee accepted + send ICE config
      const iceServers = getIceServers();
      io.to(`user:${session.initiator.toString()}`).emit('call:accepted', {
        sessionId,
        calleeId: socket.userId,
        iceServers,
      });

      ack?.({ ok: true, iceServers });
    } catch (err) {
      console.error('[Call] call:accept error:', err.message);
      ack?.({ error: 'Failed to accept call.' });
    }
  });

  // ── call:reject ───────────────────────────────────────────────────────────
  socket.on('call:reject', async (payload, ack) => {
    try {
      const { sessionId } = payload ?? {};
      if (!sessionId) return ack?.({ error: 'sessionId is required.' });

      const session = await CallSession.findByIdAndUpdate(
        sessionId,
        { status: 'rejected', endedAt: new Date() },
        { new: true }
      );
      if (!session) return ack?.({ error: 'Session not found.' });

      io.to(`user:${session.initiator.toString()}`).emit('call:rejected', { sessionId });
      ack?.({ ok: true });
    } catch (err) {
      console.error('[Call] call:reject error:', err.message);
      ack?.({ error: 'Failed to reject call.' });
    }
  });

  // ── call:offer (WebRTC SDP offer) ─────────────────────────────────────────
  socket.on('call:offer', async (payload, ack) => {
    try {
      const { sessionId, targetId, sdp } = payload ?? {};
      if (!sessionId || !targetId || !sdp)
        return ack?.({ error: 'sessionId, targetId, and sdp are required.' });

      // Verify both are part of the call
      const session = await CallSession.findById(sessionId);
      if (!session) return ack?.({ error: 'Session not found.' });

      const isParticipant = session.participants.some(
        (p) => p.user.toString() === callerId
      );
      if (!isParticipant) return ack?.({ error: 'Not a call participant.' });

      io.to(`user:${targetId}`).emit('call:offer', { sessionId, sdp, fromId: callerId });
      ack?.({ ok: true });
    } catch (err) {
      console.error('[Call] call:offer error:', err.message);
      ack?.({ error: 'Failed to relay offer.' });
    }
  });

  // ── call:answer (WebRTC SDP answer) ──────────────────────────────────────
  socket.on('call:answer', async (payload, ack) => {
    try {
      const { sessionId, targetId, sdp } = payload ?? {};
      if (!sessionId || !targetId || !sdp)
        return ack?.({ error: 'sessionId, targetId, and sdp are required.' });

      const session = await CallSession.findById(sessionId);
      if (!session) return ack?.({ error: 'Session not found.' });

      io.to(`user:${targetId}`).emit('call:answer', { sessionId, sdp, fromId: callerId });
      ack?.({ ok: true });
    } catch (err) {
      console.error('[Call] call:answer error:', err.message);
      ack?.({ error: 'Failed to relay answer.' });
    }
  });

  // ── call:ice (ICE candidate) ──────────────────────────────────────────────
  socket.on('call:ice', (payload) => {
    const { sessionId, targetId, candidate } = payload ?? {};
    if (!targetId || !candidate) return;
    io.to(`user:${targetId}`).emit('call:ice', { sessionId, candidate, fromId: callerId });
  });

  // ── call:end ──────────────────────────────────────────────────────────────
  socket.on('call:end', async (payload) => {
    try {
      const { sessionId } = payload ?? {};
      if (!sessionId) return;

      const session = await CallSession.findById(sessionId);
      if (!session) return;

      const isParticipant = session.participants.some(
        (p) => p.user.toString() === callerId
      );
      if (!isParticipant) return;

      const now = new Date();
      const duration = session.startedAt
        ? Math.floor((now - new Date(session.startedAt)) / 1000)
        : 0;

      await CallSession.findByIdAndUpdate(sessionId, {
        status: 'ended',
        endedAt: now,
        duration,
      });

      // Notify all participants
      session.participants.forEach((p) => {
        const uid = p.user.toString();
        if (uid !== callerId) {
          io.to(`user:${uid}`).emit('call:ended', { sessionId, endedBy: callerId, duration });
        }
      });
    } catch (err) {
      console.error('[Call] call:end error:', err.message);
    }
  });
}
