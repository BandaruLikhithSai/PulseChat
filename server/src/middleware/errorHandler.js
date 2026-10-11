/**
 * Centralised Express error handler.
 * Must be registered as the LAST middleware in app.js.
 *
 * In production, stack traces are stripped and generic messages are returned
 * so internal implementation details are never exposed to clients.
 */
export function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Log the full error internally
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res
      .status(409)
      .json({ success: false, message: `${field} is already taken.` });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format.' });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    status < 500
      ? err.message
      : isDev
      ? err.message
      : 'An unexpected error occurred.';

  res.status(status).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
  });
}
