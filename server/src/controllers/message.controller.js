import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { success, badRequest, notFound, forbidden } from '../utils/apiResponse.js';

const PAGE_SIZE = 40;

const MSG_POPULATE = [
  { path: 'sender', select: 'username displayName avatar' },
  {
    path: 'replyTo',
    select: 'content sender deleted',
    populate: { path: 'sender', select: 'username displayName' },
  },
];

// ── GET /api/v1/conversations/:conversationId/messages ────────────────────────
export async function getMessages(req, res, next) {
  try {
    const { conversationId } = req.params;
    const { before, limit } = req.query;
    const pageSize = Math.min(parseInt(limit, 10) || PAGE_SIZE, 100);

    const query = { conversation: conversationId };
    if (before) {
      const cursorMsg = await Message.findById(before).select('createdAt');
      if (cursorMsg) query.createdAt = { $lt: cursorMsg.createdAt };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .populate(MSG_POPULATE);

    // Update lastReadAt for this participant
    await Conversation.updateOne(
      { _id: conversationId, 'participants.user': req.user._id },
      {
        $set: {
          'participants.$.lastReadAt': new Date(),
          'participants.$.lastReadMessage': messages[0]?._id ?? null,
        },
      }
    );

    return success(res, {
      messages,
      hasMore: messages.length === pageSize,
      nextCursor: messages.length === pageSize ? messages[messages.length - 1]._id : null,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/conversations/:conversationId/messages ───────────────────────
export async function sendMessage(req, res, next) {
  try {
    const { conversationId } = req.params;
    const { text, clientMsgId, replyTo } = req.body;

    if (!text?.trim() && !replyTo) return badRequest(res, 'Message text is required.');

    if (clientMsgId) {
      const existing = await Message.findOne({ clientMsgId }).populate(MSG_POPULATE);
      if (existing) return success(res, { message: existing, duplicate: true });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      content: { text: text?.trim() ?? '' },
      clientMsgId: clientMsgId ?? null,
      replyTo: replyTo ?? null,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastActivity: message.createdAt,
    });

    const populated = await message.populate(MSG_POPULATE);
    return success(res, { message: populated });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.clientMsgId) {
      const existing = await Message.findOne({ clientMsgId: req.body.clientMsgId })
        .populate(MSG_POPULATE);
      return success(res, { message: existing, duplicate: true });
    }
    next(err);
  }
}

// ── PATCH /api/v1/conversations/:conversationId/messages/:messageId ───────────
export async function editMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const { text } = req.body;

    if (!text?.trim()) return badRequest(res, 'Message text is required.');
    if (text.length > 4000) return badRequest(res, 'Message too long.');

    const message = await Message.findById(messageId);
    if (!message) return notFound(res, 'Message not found.');
    if (message.deleted) return badRequest(res, 'Cannot edit a deleted message.');
    if (message.sender.toString() !== req.user._id.toString())
      return forbidden(res, 'You can only edit your own messages.');

    // Archive previous version
    message.editHistory.push({ text: message.content.text });
    message.content.text = text.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await message.populate(MSG_POPULATE);
    return success(res, { message: populated });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/v1/conversations/:conversationId/messages/:messageId ──────────
export async function deleteMessage(req, res, next) {
  try {
    const { messageId, conversationId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) return notFound(res, 'Message not found.');
    if (message.deleted) return success(res, { message }); // idempotent

    const isSender = message.sender.toString() === req.user._id.toString();
    const isAdmin = req.participant?.role === 'admin';
    if (!isSender && !isAdmin)
      return forbidden(res, 'You can only delete your own messages.');

    // Soft delete — keep document for reply threads
    message.deleted = true;
    message.deletedAt = new Date();
    message.content.text = '';
    message.content.attachments = [];
    await message.save();

    // If this was the lastMessage, update conversation preview
    const conv = await Conversation.findById(conversationId);
    if (conv?.lastMessage?.toString() === messageId) {
      const prev = await Message.findOne({
        conversation: conversationId,
        deleted: false,
        _id: { $ne: messageId },
      }).sort({ createdAt: -1 });
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: prev?._id ?? null,
      });
    }

    return success(res, { message });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/conversations/:conversationId/messages/:messageId/react ──────
export async function reactToMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji?.trim()) return badRequest(res, 'emoji is required.');
    if (emoji.length > 10) return badRequest(res, 'Invalid emoji.');

    const message = await Message.findById(messageId);
    if (!message) return notFound(res, 'Message not found.');
    if (message.deleted) return badRequest(res, 'Cannot react to a deleted message.');

    // Check if user already reacted with this exact emoji
    const existingIdx = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingIdx !== -1) {
      // Toggle off — remove the reaction
      message.reactions.splice(existingIdx, 1);
    } else {
      // Add reaction — one emoji can appear multiple times from different users,
      // but each (user, emoji) pair is unique
      message.reactions.push({ user: userId, emoji, reactedAt: new Date() });
    }

    await message.save();
    const populated = await message.populate('reactions.user', 'username displayName avatar');
    return success(res, { message: populated });
  } catch (err) {
    next(err);
  }
}
