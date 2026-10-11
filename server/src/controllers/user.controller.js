import { v2 as cloudinary } from 'cloudinary';
import { User } from '../models/User.js';
import { success, notFound, badRequest } from '../utils/apiResponse.js';

// ── GET /api/v1/users/search?q=term ──────────────────────────────────────────
export async function searchUsers(req, res, next) {
  try {
    const query = (req.query.q || '').trim();
    if (!query || query.length < 2) {
      return success(res, { users: [] });
    }

    // Search by username prefix or displayName — limit to 20 results
    // Exclude the requesting user from results
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { username: { $regex: `^${escapeRegex(query)}`, $options: 'i' } },
        { displayName: { $regex: escapeRegex(query), $options: 'i' } },
        { email: { $regex: `^${escapeRegex(query)}`, $options: 'i' } },
      ],
    })
      .select('username displayName avatar lastSeen')
      .limit(20);

    return success(res, { users });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/users/:id ─────────────────────────────────────────────────────
export async function getUserById(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select(
      'username displayName avatar bio lastSeen'
    );
    if (!user) return notFound(res, 'User not found.');
    return success(res, { user });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/v1/users/me ────────────────────────────────────────────────────
export async function updateProfile(req, res, next) {
  try {
    const { displayName, bio, username } = req.body;

    // If changing username, check it's not taken
    if (username && username !== req.user.username) {
      const taken = await User.findOne({ username: username.toLowerCase() });
      if (taken) return badRequest(res, 'That username is already taken.');
    }

    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (username !== undefined) updates.username = username.toLowerCase().trim();

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    return success(res, { user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/users/me/avatar ──────────────────────────────────────────────
export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return badRequest(res, 'No file uploaded.');
    }

    // Validate mime type beyond file extension
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(req.file.mimetype)) {
      return badRequest(res, 'Only JPEG, PNG, WebP, and GIF images are allowed.');
    }

    // Delete old avatar from Cloudinary if it exists
    if (req.user.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(req.user.avatarPublicId);
      } catch {
        // Non-fatal — old image might already be gone
      }
    }

    // Upload buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'pulsechat/avatars',
          public_id: `user_${req.user._id}`,
          overwrite: true,
          transformation: [
            { width: 256, height: 256, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        avatar: uploadResult.secure_url,
        avatarPublicId: uploadResult.public_id,
      },
      { new: true }
    );

    return success(res, { user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/users/me/notifications-prefs ─────────────────────────────────
export async function getNotificationPrefs(req, res) {
  return success(res, { prefs: req.user.notificationPrefs });
}

// ── PATCH /api/v1/users/me/notifications-prefs ───────────────────────────────
export async function updateNotificationPrefs(req, res, next) {
  try {
    const { inApp, browser, sound } = req.body;
    const updates = {};
    if (typeof inApp === 'boolean') updates['notificationPrefs.inApp'] = inApp;
    if (typeof browser === 'boolean') updates['notificationPrefs.browser'] = browser;
    if (typeof sound === 'boolean') updates['notificationPrefs.sound'] = sound;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    return success(res, { prefs: user.notificationPrefs });
  } catch (err) {
    next(err);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
