import mongoose from 'mongoose';

const callParticipantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    // Tracks whether this participant accepted, rejected, or missed the call
    status: {
      type: String,
      enum: ['ringing', 'joined', 'rejected', 'missed', 'left'],
      default: 'ringing',
    },
  },
  { _id: false }
);

const callSessionSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    initiator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: { type: [callParticipantSchema], default: [] },
    type: {
      type: String,
      enum: ['audio', 'video'],
      required: true,
    },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'missed', 'rejected', 'failed'],
      default: 'ringing',
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    // Duration in seconds — calculated when call ends
    duration: { type: Number, default: null },
  },
  { timestamps: true }
);

callSessionSchema.index({ conversation: 1, createdAt: -1 });
callSessionSchema.index({ initiator: 1 });

export const CallSession = mongoose.model('CallSession', callSessionSchema);
