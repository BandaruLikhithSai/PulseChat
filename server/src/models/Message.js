import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true }, // Cloudinary public_id
    type: { type: String, enum: ['image', 'video', 'audio', 'document'], required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true }, // bytes
    mimeType: { type: String },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 10 },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const editHistorySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      text: { type: String, maxlength: 4000, default: '' },
      attachments: { type: [attachmentSchema], default: [] },
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reactions: { type: [reactionSchema], default: [] },
    deliveredTo: { type: [receiptSchema], default: [] },
    readBy: { type: [receiptSchema], default: [] },
    // Edit tracking
    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editHistory: { type: [editHistorySchema], default: [] },
    // Soft delete — we keep the document so threads/replies stay intact
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    /**
     * Client-generated idempotency key (UUID v4).
     * Prevents duplicate messages when a client retries after a network failure.
     * The client must generate this before sending and resend the same value on retry.
     */
    clientMsgId: {
      type: String,
      default: null,
      // Uniqueness is enforced by the schema.index() call below
    },
  },
  { timestamps: true }
);

// Primary access pattern: fetch messages in a conversation ordered by time
messageSchema.index({ conversation: 1, createdAt: -1 });
// Idempotency — prevent duplicate inserts
messageSchema.index({ clientMsgId: 1 }, { unique: true, sparse: true });
// Full-text search within a conversation
messageSchema.index({ 'content.text': 'text' });

export const Message = mongoose.model('Message', messageSchema);
