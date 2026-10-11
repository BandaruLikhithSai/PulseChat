import { v2 as cloudinary } from 'cloudinary';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { success, badRequest } from '../utils/apiResponse.js';

const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10);
const MAX_FILE_MB  = parseInt(process.env.MAX_FILE_SIZE_MB  || '25', 10);

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BLOCKED_TYPES = [
  'application/x-msdownload', 'application/x-executable',
  'application/x-sh', 'text/x-shellscript',
  'application/x-bat', 'application/x-msdos-program',
];

/**
 * POST /api/v1/conversations/:conversationId/attachments
 * Upload 1-5 files and create a message containing them.
 * Files are streamed to Cloudinary — never written to disk.
 */
export async function uploadAttachment(req, res, next) {
  try {
    // Guard: clear error if Cloudinary isn't configured
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({
        success: false,
        message:
          'File uploads are not available because Cloudinary is not configured. ' +
          'Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET ' +
          'to your environment variables.',
      });
    }

    const { conversationId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) return badRequest(res, 'No files provided.');

    for (const file of files) {
      if (BLOCKED_TYPES.includes(file.mimetype)) {
        return badRequest(res, `File type not allowed: ${file.originalname}`);
      }
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      const limitBytes = (isImage ? MAX_IMAGE_MB : MAX_FILE_MB) * 1024 * 1024;
      if (file.size > limitBytes) {
        return badRequest(
          res,
          `${file.originalname} exceeds the ${isImage ? MAX_IMAGE_MB : MAX_FILE_MB} MB limit.`
        );
      }
    }

    // Upload all files to Cloudinary in parallel
    const uploaded = await Promise.all(files.map(uploadToCloudinary));

    const attachments = uploaded.map((result, i) => ({
      url:      result.secure_url,
      publicId: result.public_id,
      type:     getAttachmentType(files[i].mimetype),
      name:     files[i].originalname,
      size:     files[i].size,
      mimeType: files[i].mimetype,
    }));

    const text = req.body.text?.trim() ?? '';

    const message = await Message.create({
      conversation: conversationId,
      sender:       req.user._id,
      content:      { text, attachments },
      clientMsgId:  req.body.clientMsgId ?? null,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage:  message._id,
      lastActivity: message.createdAt,
    });

    const populated = await message.populate([
      { path: 'sender', select: 'username displayName avatar' },
    ]);

    // Broadcast to the conversation room via Socket.IO so other members
    // see the attachment in real time (same as a regular text message)
    const io = req.app.get('io');
    if (io) {
      const roomName = `conv:${conversationId}`;
      io.to(roomName).emit('message:new', { message: populated });
      io.to(roomName).emit('conversation:updated', {
        conversationId,
        lastMessage:  populated,
        lastActivity: populated.createdAt,
      });
    }

    return success(res, { message: populated });
  } catch (err) {
    next(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:        'pulsechat/attachments',
        resource_type: isImage ? 'image' : 'raw',
        ...(isImage && {
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        }),
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(file.buffer);
  });
}

function getAttachmentType(mimeType) {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (mimeType.startsWith('video/'))          return 'video';
  if (mimeType.startsWith('audio/'))          return 'audio';
  return 'document';
}
