import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  getNotifications,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} from '../controllers/notification.controller.js';

const router = Router();
router.use(authenticate);

/** GET    /api/v1/notifications              — list + unread count */
router.get('/', getNotifications);

/** PATCH  /api/v1/notifications/read-all    — mark all read (before /:id to avoid conflict) */
router.patch('/read-all', markAllRead);

/** PATCH  /api/v1/notifications/:id/read   — mark one read */
router.patch('/:id/read', markNotificationRead);

/** DELETE /api/v1/notifications/:id        — delete one */
router.delete('/:id', deleteNotification);

export default router;
