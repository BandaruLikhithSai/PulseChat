import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { initCloudinary } from './config/cloudinary.js';
import { initSocket } from './socket/index.js';

const PORT = process.env.PORT || 5000;

async function start() {
  // Connect to MongoDB Atlas before accepting requests
  await connectDB();

  // Initialise Cloudinary (non-fatal if credentials are absent in dev)
  initCloudinary();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Attach Socket.IO to the same HTTP server
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(
      `[Server] PulseChat API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`
    );
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received — shutting down gracefully.');
    httpServer.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
