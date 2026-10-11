import multer from 'multer';

const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10);
const MAX_FILE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);

// Store files in memory — we stream them directly to Cloudinary
const storage = multer.memoryStorage();

function imageFileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'));
  }
}

function attachmentFileFilter(_req, file, cb) {
  // Block executables; everything else is allowed
  const blocked = [
    'application/x-msdownload',
    'application/x-executable',
    'application/x-sh',
    'text/x-shellscript',
  ];
  if (blocked.includes(file.mimetype)) {
    cb(new Error('That file type is not allowed.'));
  } else {
    cb(null, true);
  }
}

export const avatarUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
});

export const attachmentUpload = multer({
  storage,
  fileFilter: attachmentFileFilter,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 5 },
});
