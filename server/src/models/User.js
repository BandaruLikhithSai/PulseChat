import mongoose from 'mongoose';

const notificationPrefsSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    browser: { type: Boolean, default: false },
    sound: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_.-]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      // Never returned to the client — use .select('-passwordHash') in queries
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    avatar: {
      type: String, // Cloudinary secure URL
      default: null,
    },
    avatarPublicId: {
      type: String, // Cloudinary public_id for deletion
      default: null,
    },
    bio: {
      type: String,
      maxlength: 200,
      default: '',
    },
    // 'online' is managed by Socket.IO presence, not stored permanently.
    // lastSeen is updated on disconnect.
    lastSeen: {
      type: Date,
      default: null,
    },
    notificationPrefs: {
      type: notificationPrefsSchema,
      default: () => ({}),
    },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Exclude passwordHash from toJSON / toObject by default
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.avatarPublicId;
        return ret;
      },
    },
  }
);

// Text index for user search
userSchema.index({ username: 'text', displayName: 'text', email: 'text' });

export const User = mongoose.model('User', userSchema);
