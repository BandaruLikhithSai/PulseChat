import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    // When set, this participant has left the group (direct convos never set this)
    leftAt: { type: Date, default: null },
    // Track last-read position for unread counts
    lastReadMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    participants: {
      type: [participantSchema],
      validate: {
        validator(arr) {
          return arr.length >= 2;
        },
        message: 'A conversation must have at least 2 participants.',
      },
    },
    // Group-only fields
    name: { type: String, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    avatar: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Cached reference to the most recent message (for sidebar preview)
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Find all conversations a user belongs to, ordered by recent activity
conversationSchema.index({ 'participants.user': 1, lastActivity: -1 });
// Efficiently find a direct conversation between two specific users
conversationSchema.index({ type: 1, 'participants.user': 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
