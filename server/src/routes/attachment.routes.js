import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireConversationMember } from '../middleware/authorize.js';
import { attachmentUpload } from '../config/multer.js';
import { uploadAttachment } from '../controllers/attachment.controller.js';

const router = Router();
router.use(authenticate);

/**
 * POST /api/v1/conversations/:conversationId/attachments
 * Multipart: up to 5 files in field 'files'
 * Optional body field: text (caption)
 * Response: { message } — a Message document with attachments populated
 */
router.post(
  '/conversations/:conversationId/attachments',
  requireConversationMember,
  attachmentUpload.array('files', 5),
  uploadAttachment
);

export default router;
