import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { Notification } from '../models/Notification.js';

/**
 * Socket.IO message + reaction + edit/delete handlers.
 *
 * Server → room events:
 *   message:new          { message }
 *   message:updated      { message }
 *   message:deleted      { messageId, conversationId }
 *   message:typing       { conversationId, userId, typing }
 *   message:read_receipt { conversationId, userId, lastReadAt }
 *   conversation:updated { conversationId, lastMessage, lastActivity }
 *   notification:new     { notification }   → sent to user:<recipientId> room
 */

const MSG_POPULATE = [
  { path: 'sender', select: 'username displayName avatar' },
  {
    path: 'replyTo',
    select: 'content sender deleted',
    populate: { path: 'sender', select: 'username displayName' },
  },
];

async function isMember(conversationId, userId) {
  const conv = await Conversation.findById(conversationId).select('participants');
  if (!conv) return null;
  const p = conv.participants.find((p) => p.user.toString() === userId && !p.leftAt);
  return p ? { conv, participant: p } : null;
}

/** Push a notification to every participant who is NOT the sender */
async function notifyParticipants(io, message, conversation, sender) {
  try {
    const recipients = conversation.participants.filter(
      (p) => p.user.toString() !== sender._id.toString() && !p.leftAt
    );
    const preview = message.content?.text?.slice(0, 80) ||
      (message.content?.attachments?.length ? '📎 Sent an attachment' : '');

    for (const p of recipients) {
      const recipientId = p.user.toString();
      const notif = await Notification.create({
        recipient:    recipientId,
        type:         'message',
        conversation: conversation._id,
        message:      message._id,
        actor:        sender._id,
        preview:      `${sender.displayName || sender.username}: ${preview}`,
      });
      // Real-time push — only to user's personal room
      io.to(`user:${recipientId}`).emit('notification:new', { notification: notif });
    }
  } catch {
    // Non-fatal — notification failure must not block message delivery
  }
}

export function registerMessageHandlers(io, socket) {
  const uid = socket.userId;

  // ── conversation:join ─────────────────────────────────────────────────────
  socket.on('conversation:join', async (payload, ack) => {
    try {
      const { conversationId } = payload ?? {};
      if (!conversationId) return ack?.({ error: 'conversationId is required.' });
      const membership = await isMember(conversationId, uid);
      if (!membership) return ack?.({ error: 'Not a member of this conversation.' });
      socket.join(`conv:${conversationId}`);
      ack?.({ joined: true });
    } catch (err) {
      console.error('[Socket] conversation:join error:', err.message);
      ack?.({ error: 'Failed to join.' });
    }
  });

  // ── conversation:leave ────────────────────────────────────────────────────
  socket.on('conversation:leave', ({ conversationId } = {}) => {
    if (conversationId) socket.leave(`conv:${conversationId}`);
  });

  // ── message:send ─────────────────────────────────────────────────────────
  socket.on('message:send', async (payload, ack) => {
    try {
      const { conversationId, text, clientMsgId, replyTo } = payload ?? {};
      if (!conversationId) return ack?.({ error: 'conversationId is required.' });
      if (!text?.trim() && !replyTo) return ack?.({ error: 'Message text is required.' });
      if (text && text.length > 4000) return ack?.({ error: 'Message too long.' });

      const membership = await isMember(conversationId, uid);
      if (!membership) return ack?.({ error: 'Not a member of this conversation.' });

      if (clientMsgId) {
        const existing = await Message.findOne({ clientMsgId }).populate(MSG_POPULATE);
        if (existing) return ack?.({ message: existing, duplicate: true });
      }

      const message = await Message.create({
        conversation: conversationId,
        sender: uid,
        content: { text: text?.trim() ?? '' },
        clientMsgId: clientMsgId ?? null,
        replyTo: replyTo ?? null,
      });

      // Reload conversation for notification delivery (need all participants)
      const conv = await Conversation.findByIdAndUpdate(
        conversationId,
        { lastMessage: message._id, lastActivity: message.createdAt },
        { new: true }
      );

      const populated = await message.populate(MSG_POPULATE);
      const roomName = `conv:${conversationId}`;
      if (!socket.rooms.has(roomName)) socket.join(roomName);

      io.to(roomName).emit('message:new', { message: populated });
      io.to(roomName).emit('conversation:updated', {
        conversationId, lastMessage: populated, lastActivity: populated.createdAt,
      });
      ack?.({ message: populated });

      // Async notifications — don't await so ACK returns immediately
      if (conv) notifyParticipants(io, populated, conv, socket.user);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.clientMsgId) {
        const existing = await Message.findOne({ clientMsgId: payload?.clientMsgId })
          .populate(MSG_POPULATE);
        return ack?.({ message: existing, duplicate: true });
      }
      console.error('[Socket] message:send error:', err.message);
      ack?.({ error: 'Failed to send message.' });
    }
  });

  // ── message:edit ──────────────────────────────────────────────────────────
  socket.on('message:edit', async (payload, ack) => {
    try {
      const { messageId, conversationId, text } = payload ?? {};
      if (!messageId || !conversationId || !text?.trim())
        return ack?.({ error: 'messageId, conversationId, and text are required.' });

      const membership = await isMember(conversationId, uid);
      if (!membership) return ack?.({ error: 'Not a member.' });

      const message = await Message.findById(messageId);
      if (!message) return ack?.({ error: 'Message not found.' });
      if (message.deleted) return ack?.({ error: 'Cannot edit a deleted message.' });
      if (message.sender.toString() !== uid) return ack?.({ error: 'You can only edit your own messages.' });
      if (message.conversation.toString() !== conversationId) return ack?.({ error: 'Message not in this conversation.' });

      message.editHistory.push({ text: message.content.text });
      message.content.text = text.trim();
      message.edited = true;
      message.editedAt = new Date();
      await message.save();

      const populated = await message.populate(MSG_POPULATE);
      io.to(`conv:${conversationId}`).emit('message:updated', { message: populated });
      ack?.({ message: populated });
    } catch (err) {
      console.error('[Socket] message:edit error:', err.message);
      ack?.({ error: 'Failed to edit message.' });
    }
  });

  // ── message:delete ────────────────────────────────────────────────────────
  socket.on('message:delete', async (payload, ack) => {
    try {
      const { messageId, conversationId } = payload ?? {};
      if (!messageId || !conversationId)
        return ack?.({ error: 'messageId and conversationId are required.' });

      const membership = await isMember(conversationId, uid);
      if (!membership) return ack?.({ error: 'Not a member.' });

      const message = await Message.findById(messageId);
      if (!message) return ack?.({ error: 'Message not found.' });
      if (message.deleted) return ack?.({ ok: true });
      if (message.conversation.toString() !== conversationId)
        return ack?.({ error: 'Message not in this conversation.' });

      const isSender = message.sender.toString() === uid;
      const isAdmin  = membership.participant.role === 'admin';
      if (!isSender && !isAdmin)
        return ack?.({ error: 'You can only delete your own messages.' });

      message.deleted = true;
      message.deletedAt = new Date();
      message.content.text = '';
      message.content.attachments = [];
      await message.save();

      io.to(`conv:${conversationId}`).emit('message:deleted', { messageId, conversationId });
      ack?.({ ok: true });
    } catch (err) {
      console.error('[Socket] message:delete error:', err.message);
      ack?.({ error: 'Failed to delete message.' });
    }
  });

  // ── message:react ─────────────────────────────────────────────────────────
  socket.on('message:react', async (payload, ack) => {
    try {
      const { messageId, conversationId, emoji } = payload ?? {};
      if (!messageId || !conversationId || !emoji)
        return ack?.({ error: 'messageId, conversationId, and emoji are required.' });

      const membership = await isMember(conversationId, uid);
      if (!membership) return ack?.({ error: 'Not a member.' });

      const message = await Message.findById(messageId);
      if (!message) return ack?.({ error: 'Message not found.' });
      if (message.deleted) return ack?.({ error: 'Cannot react to a deleted message.' });
      if (message.conversation.toString() !== conversationId)
        return ack?.({ error: 'Message not in this conversation.' });

      const existingIdx = message.reactions.findIndex(
        (r) => r.user.toString() === uid && r.emoji === emoji
      );
      if (existingIdx !== -1) {
        message.reactions.splice(existingIdx, 1);
      } else {
        message.reactions.push({ user: uid, emoji, reactedAt: new Date() });
      }

      await message.save();
      const populated = await message.populate([
        ...MSG_POPULATE,
        { path: 'reactions.user', select: 'username displayName avatar' },
      ]);

      io.to(`conv:${conversationId}`).emit('message:updated', { message: populated });
      ack?.({ message: populated });
    } catch (err) {
      console.error('[Socket] message:react error:', err.message);
      ack?.({ error: 'Failed to react.' });
    }
  });

  // ── Typing ────────────────────────────────────────────────────────────────
  socket.on('message:typing_start', ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.to(`conv:${conversationId}`).emit('message:typing', {
      conversationId, userId: uid, typing: true,
    });
  });

  socket.on('message:typing_stop', ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.to(`conv:${conversationId}`).emit('message:typing', {
      conversationId, userId: uid, typing: false,
    });
  });

  // ── message:read ──────────────────────────────────────────────────────────
  socket.on('message:read', async ({ conversationId } = {}, ack) => {
    try {
      if (!conversationId) return;
      const now = new Date();
      await Conversation.updateOne(
        { _id: conversationId, 'participants.user': uid },
        { $set: { 'participants.$.lastReadAt': now } }
      );
      socket.to(`conv:${conversationId}`).emit('message:read_receipt', {
        conversationId, userId: uid, lastReadAt: now,
      });
      ack?.({ ok: true });
    } catch (err) {
      console.error('[Socket] message:read error:', err.message);
    }
  });
}
