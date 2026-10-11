import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { updateProfileRules } from '../validation/auth.validation.js';
import { avatarUpload } from '../config/multer.js';
import {
  searchUsers,
  getUserById,
  updateProfile,
  uploadAvatar,
  getNotificationPrefs,
  updateNotificationPrefs,
} from '../controllers/user.controller.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/users/search?q=term
 * Response 200: { users: [] }
 */
router.get('/search', searchUsers);

/**
 * GET /api/v1/users/me
 * Returns the current user's full profile
 */
router.get('/me', (req, res) => res.json({ success: true, user: req.user.toJSON() }));

/**
 * PATCH /api/v1/users/me
 * Body: { displayName?, bio?, username? }
 */
router.patch('/me', updateProfileRules, validate, updateProfile);

/**
 * POST /api/v1/users/me/avatar
 * Multipart form-data: file field 'avatar'
 */
router.post('/me/avatar', avatarUpload.single('avatar'), uploadAvatar);

/**
 * GET  /api/v1/users/me/notification-prefs
 * PATCH /api/v1/users/me/notification-prefs
 */
router.get('/me/notification-prefs', getNotificationPrefs);
router.patch('/me/notification-prefs', updateNotificationPrefs);

/**
 * GET /api/v1/users/:id
 * Returns public profile of any user
 */
router.get('/:id', getUserById);

export default router;
