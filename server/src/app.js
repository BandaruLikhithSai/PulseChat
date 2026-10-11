import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';

import { buildCorsOptions } from './config/corsOptions.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

// ── Route imports (stubs now; filled out each phase) ──────────────────────────
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import attachmentRoutes from './routes/attachment.routes.js';
import notificationRoutes from './routes/notification.routes.js';

export function createApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow Cloudinary CDN images
    })
  );

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.use(cors(buildCorsOptions()));
  app.options('*', cors(buildCorsOptions())); // Pre-flight for all routes

  // ── Request parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // ── NoSQL injection sanitisation ────────────────────────────────────────────
  app.use(mongoSanitize());

  // ── HTTP request logging (development only) ─────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  app.use('/api', apiLimiter);

  // ── Health check (no auth required — used by hosting platforms) ────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API routes ──────────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/messages', messageRoutes);
  // Attachment routes nest under /conversations/:id/attachments
  app.use('/api/v1', attachmentRoutes);
  app.use('/api/v1/notifications', notificationRoutes);

  // ── 404 handler ─────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found.' });
  });

  // ── Centralised error handler (must be last) ────────────────────────────────
  app.use(errorHandler);

  return app;
}
