import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authenticate.js';
import { requireConversationMember, requireGroupAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  getConversations,
  createOrGetConversation,
  getConversation,
  addMembers,
  removeMember,
  updateMemberRole,
  updateGroup,
} from '../controllers/conversation.controller.js';
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
} from '../controllers/message.controller.js';

const router = Router();
router.use(authenticate);

// ── Conversation collection ───────────────────────────────────────────────────

/** GET /api/v1/conversations */
router.get('/', getConversations);

/** POST /api/v1/conversations */
router.post(
  '/',
  [
    body('type').isIn(['direct', 'group']).withMessage("type must be 'direct' or 'group'."),
    body('userId')
      .if(body('type').equals('direct'))
      .notEmpty().withMessage('userId is required for a direct conversation.'),
    body('name')
      .if(body('type').equals('group'))
      .notEmpty().withMessage('name is required for a group.')
      .isLength({ max: 100 }).withMessage('Group name max 100 characters.'),
    body('memberIds')
      .if(body('type').equals('group'))
      .isArray().withMessage('memberIds must be an array.'),
  ],
  validate,
  createOrGetConversation
);

// ── Single conversation ───────────────────────────────────────────────────────

/** GET /api/v1/conversations/:conversationId */
router.get('/:conversationId', requireConversationMember, getConversation);

/** PATCH /api/v1/conversations/:conversationId — admin: update group info */
router.patch(
  '/:conversationId',
  requireConversationMember,
  requireGroupAdmin,
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  updateGroup
);

// ── Member management ─────────────────────────────────────────────────────────

/** POST /api/v1/conversations/:conversationId/members — admin: add members */
router.post(
  '/:conversationId/members',
  requireConversationMember,
  requireGroupAdmin,
  [body('userIds').isArray({ min: 1 }).withMessage('userIds must be a non-empty array.')],
  validate,
  addMembers
);

/** DELETE /api/v1/conversations/:conversationId/members/:userId — leave or admin remove */
router.delete('/:conversationId/members/:userId', requireConversationMember, removeMember);

/** PATCH /api/v1/conversations/:conversationId/members/:userId/role — admin: promote/demote */
router.patch(
  '/:conversationId/members/:userId/role',
  requireConversationMember,
  requireGroupAdmin,
  [body('role').isIn(['admin', 'member']).withMessage("role must be 'admin' or 'member'.")],
  validate,
  updateMemberRole
);

// ── Messages ──────────────────────────────────────────────────────────────────

/** GET /api/v1/conversations/:conversationId/messages */
router.get('/:conversationId/messages', requireConversationMember, getMessages);

/** POST /api/v1/conversations/:conversationId/messages */
router.post(
  '/:conversationId/messages',
  requireConversationMember,
  [
    body('text')
      .optional()
      .isString()
      .isLength({ max: 4000 }).withMessage('Message cannot exceed 4000 characters.'),
    body('clientMsgId').optional().isUUID().withMessage('clientMsgId must be a valid UUID.'),
  ],
  validate,
  sendMessage
);

/** PATCH /api/v1/conversations/:conversationId/messages/:messageId */
router.patch(
  '/:conversationId/messages/:messageId',
  requireConversationMember,
  [body('text').notEmpty().isLength({ max: 4000 })],
  validate,
  editMessage
);

/** DELETE /api/v1/conversations/:conversationId/messages/:messageId */
router.delete('/:conversationId/messages/:messageId', requireConversationMember, deleteMessage);

/** POST /api/v1/conversations/:conversationId/messages/:messageId/react */
router.post(
  '/:conversationId/messages/:messageId/react',
  requireConversationMember,
  [body('emoji').notEmpty().withMessage('emoji is required.')],
  validate,
  reactToMessage
);

export default router;
