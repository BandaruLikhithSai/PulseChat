import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { success, created, notFound, badRequest, forbidden } from '../utils/apiResponse.js';

// ── Shared populate helper ────────────────────────────────────────────────────
function populateConversation(query) {
  return query
    .populate({ path: 'participants.user', select: 'username displayName avatar lastSeen' })
    .populate({
      path: 'lastMessage',
      select: 'content sender createdAt deleted',
      populate: { path: 'sender', select: 'username displayName' },
    });
}

// ── GET /api/v1/conversations ─────────────────────────────────────────────────
export async function getConversations(req, res, next) {
  try {
    const userId = req.user._id;

    const conversations = await populateConversation(
      Conversation.find({
        participants: { $elemMatch: { user: userId, leftAt: null } },
      }).sort({ lastActivity: -1 })
    );

    const withUnread = await Promise.all(
      conversations.map(async (conv) => {
        const participant = conv.participants.find(
          (p) => p.user._id.toString() === userId.toString()
        );
        const lastReadAt = participant?.lastReadAt;
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: userId },
          ...(lastReadAt ? { createdAt: { $gt: lastReadAt } } : {}),
          deleted: false,
        });
        return { ...conv.toObject(), unreadCount };
      })
    );

    return success(res, { conversations: withUnread });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/conversations ────────────────────────────────────────────────
export async function createOrGetConversation(req, res, next) {
  try {
    const { type, userId, name, description, memberIds = [] } = req.body;
    const me = req.user._id;

    // ── Direct conversation ───────────────────────────────────────────────────
    if (type === 'direct') {
      if (!userId) return badRequest(res, 'userId is required for a direct conversation.');
      if (userId.toString() === me.toString())
        return badRequest(res, 'You cannot message yourself.');

      const targetUser = await User.findById(userId).select('_id username displayName');
      if (!targetUser) return notFound(res, 'User not found.');

      const existing = await populateConversation(
        Conversation.findOne({
          type: 'direct',
          $and: [
            { participants: { $elemMatch: { user: me, leftAt: null } } },
            { participants: { $elemMatch: { user: userId, leftAt: null } } },
          ],
        })
      );

      if (existing) return success(res, { conversation: existing, created: false });

      const conv = await Conversation.create({
        type: 'direct',
        participants: [
          { user: me, role: 'member' },
          { user: userId, role: 'member' },
        ],
        createdBy: me,
      });

      const populated = await populateConversation(Conversation.findById(conv._id));
      return created(res, { conversation: populated, created: true });
    }

    // ── Group conversation ────────────────────────────────────────────────────
    if (type === 'group') {
      if (!name?.trim()) return badRequest(res, 'Group name is required.');

      // Deduplicate and validate member IDs
      const uniqueIds = [...new Set([...memberIds.map(String), me.toString()])];
      if (uniqueIds.length < 2) return badRequest(res, 'A group needs at least 2 members.');

      // Verify all supplied members exist
      const members = await User.find({ _id: { $in: uniqueIds } }).select('_id');
      if (members.length !== uniqueIds.length)
        return badRequest(res, 'One or more user IDs are invalid.');

      const participants = uniqueIds.map((uid) => ({
        user: uid,
        role: uid === me.toString() ? 'admin' : 'member',
      }));

      const conv = await Conversation.create({
        type: 'group',
        name: name.trim(),
        description: description?.trim() ?? '',
        participants,
        createdBy: me,
      });

      const populated = await populateConversation(Conversation.findById(conv._id));
      return created(res, { conversation: populated, created: true });
    }

    return badRequest(res, "type must be 'direct' or 'group'.");
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/conversations/:conversationId ─────────────────────────────────
export async function getConversation(req, res, next) {
  try {
    const conv = await populateConversation(
      Conversation.findById(req.conversation._id)
    );
    return success(res, { conversation: conv });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/conversations/:conversationId/members ────────────────────────
// Admin only: add members to a group
export async function addMembers(req, res, next) {
  try {
    const { userIds = [] } = req.body;
    const conv = req.conversation;

    if (conv.type !== 'group') return badRequest(res, 'Only groups have members.');
    if (!userIds.length) return badRequest(res, 'userIds is required.');

    const users = await User.find({ _id: { $in: userIds } }).select('_id');
    if (users.length !== userIds.length)
      return badRequest(res, 'One or more user IDs are invalid.');

    const updates = [];
    for (const uid of userIds.map(String)) {
      const existing = conv.participants.find((p) => p.user.toString() === uid);
      if (!existing) {
        // New member
        await Conversation.updateOne(
          { _id: conv._id },
          { $push: { participants: { user: uid, role: 'member' } } }
        );
        updates.push(uid);
      } else if (existing.leftAt) {
        // Re-add a member who previously left
        await Conversation.updateOne(
          { _id: conv._id, 'participants.user': uid },
          { $set: { 'participants.$.leftAt': null, 'participants.$.joinedAt': new Date() } }
        );
        updates.push(uid);
      }
      // Already an active member — silently skip
    }

    const updated = await populateConversation(Conversation.findById(conv._id));
    return success(res, { conversation: updated, added: updates });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/v1/conversations/:conversationId/members/:userId ──────────────
// Admin removes a member; a member can remove themselves (leave)
export async function removeMember(req, res, next) {
  try {
    const { userId } = req.params;
    const conv = req.conversation;
    const requesterId = req.user._id.toString();

    if (conv.type !== 'group') return badRequest(res, 'Only groups have members.');

    const isSelf = userId === requesterId;
    const isAdmin = req.participant.role === 'admin';

    if (!isSelf && !isAdmin)
      return forbidden(res, 'Only admins can remove other members.');

    // Cannot remove the last admin
    const admins = conv.participants.filter((p) => p.role === 'admin' && !p.leftAt);
    if (isAdmin && admins.length === 1 && userId === requesterId)
      return badRequest(res, 'Transfer admin role before leaving the group.');

    await Conversation.updateOne(
      { _id: conv._id, 'participants.user': userId },
      { $set: { 'participants.$.leftAt': new Date() } }
    );

    const updated = await populateConversation(Conversation.findById(conv._id));
    return success(res, { conversation: updated });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/v1/conversations/:conversationId/members/:userId/role ──────────
// Admin only: promote/demote a member
export async function updateMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const conv = req.conversation;

    if (conv.type !== 'group') return badRequest(res, 'Only groups have roles.');
    if (!['admin', 'member'].includes(role)) return badRequest(res, "role must be 'admin' or 'member'.");

    const target = conv.participants.find((p) => p.user.toString() === userId && !p.leftAt);
    if (!target) return notFound(res, 'Member not found in this group.');

    // Cannot demote the only admin
    if (role === 'member') {
      const admins = conv.participants.filter((p) => p.role === 'admin' && !p.leftAt);
      if (admins.length === 1 && target.role === 'admin')
        return badRequest(res, 'Cannot demote the only admin. Promote another member first.');
    }

    await Conversation.updateOne(
      { _id: conv._id, 'participants.user': userId },
      { $set: { 'participants.$.role': role } }
    );

    const updated = await populateConversation(Conversation.findById(conv._id));
    return success(res, { conversation: updated });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/v1/conversations/:conversationId ───────────────────────────────
// Admin only: update group name/description
export async function updateGroup(req, res, next) {
  try {
    const { name, description } = req.body;
    const conv = req.conversation;

    if (conv.type !== 'group') return badRequest(res, 'Only groups can be updated this way.');

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();

    await Conversation.findByIdAndUpdate(conv._id, updates);
    const updated = await populateConversation(Conversation.findById(conv._id));
    return success(res, { conversation: updated });
  } catch (err) {
    next(err);
  }
}
