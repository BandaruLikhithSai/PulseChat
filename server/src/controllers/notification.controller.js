import { Notification } from '../models/Notification.js';
import { success, notFound } from '../utils/apiResponse.js';

// ── GET /api/v1/notifications ─────────────────────────────────────────────────
export async function getNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('actor', 'username displayName avatar')
      .populate('conversation', 'name type')
      .populate({ path: 'message', select: 'content sender', populate: { path: 'sender', select: 'displayName' } });

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      read: false,
    });

    return success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────────
export async function markNotificationRead(req, res, next) {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!notif) return notFound(res, 'Notification not found.');
    return success(res, { notification: notif });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/v1/notifications/read-all ─────────────────────────────────────
export async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    return success(res, { message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/v1/notifications/:id ─────────────────────────────────────────
export async function deleteNotification(req, res, next) {
  try {
    await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
    return success(res, { message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
}

// ── Utility: create a notification and push it via socket ────────────────────
// Called by message handlers when a new message arrives for offline participants.
export async function createMessageNotification({ io, message, conversation, sender }) {
  try {
    const recipientIds = conversation.participants
      .filter((p) => p.user.toString() !== sender._id.toString() && !p.leftAt)
      .map((p) => p.user.toString());

    for (const recipientId of recipientIds) {
      const preview = message.content?.text?.slice(0, 100) ||
        (message.content?.attachments?.length ? '📎 Sent an attachment' : '');

      const notif = await Notification.create({
        recipient:    recipientId,
        type:         'message',
        conversation: conversation._id,
        message:      message._id,
        actor:        sender._id,
        preview:      `${sender.displayName || sender.username}: ${preview}`,
      });

      // Push real-time notification to recipient's personal room
      io.to(`user:${recipientId}`).emit('notification:new', { notification: notif });
    }
  } catch {
    // Best-effort — don't let notification failure block message delivery
  }
}
