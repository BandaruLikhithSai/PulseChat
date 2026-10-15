/**
 * CORS configuration.
 *
 * CLIENT_ORIGIN can be a comma-separated list:
 *   http://localhost:5173,https://pulsechat.vercel.app
 *
 * In production sameSite must be 'none' so the Vercel frontend
 * (different origin) can send cookies to the Render backend.
 */
export function buildCorsOptions() {
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      // Allow requests with no Origin header (Render health-check, curl, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow any *.onrender.com domain (frontend deployed on Render)
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }

      // Also allow any *.vercel.app preview URL
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
