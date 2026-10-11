import { Conversation } from '../models/Conversation.js';

/**
 * Middleware: verify that req.user is an active participant of the conversation.
 *
 * Expects :conversationId in req.params.
 * Attaches req.conversation and req.participant to avoid re-fetching in controllers.
 *
 * A participant with leftAt set is treated as removed and is denied access.
 */
export async function requireConversationMember(req, res, next) {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const participant = conversation.participants.find(
      (p) => p.user.toString() === req.user._id.toString() && !p.leftAt
    );

    if (!participant) {
      return res
        .status(403)
        .json({ success: false, message: 'You are not a member of this conversation.' });
    }

    req.conversation = conversation;
    req.participant = participant;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: verify that the participant has admin role in the conversation.
 * Must be used after requireConversationMember.
 */
export function requireGroupAdmin(req, res, next) {
  if (req.participant?.role !== 'admin') {
    return res
      .status(403)
      .json({ success: false, message: 'Only group admins can perform this action.' });
  }
  next();
}
