import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  try {
    await mongoose.connect(uri);
    console.log(`[DB] Connected to MongoDB: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    // Always exit — if the DB is unreachable the app cannot function
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[DB] Disconnected from MongoDB');
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] Reconnected to MongoDB');
});
