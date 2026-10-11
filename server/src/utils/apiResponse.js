/**
 * Helpers for consistent JSON responses across all controllers.
 */

export function success(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export function created(res, data = {}) {
  return success(res, data, 201);
}

export function notFound(res, message = 'Resource not found.') {
  return res.status(404).json({ success: false, message });
}

export function forbidden(res, message = 'Forbidden.') {
  return res.status(403).json({ success: false, message });
}

export function badRequest(res, message = 'Bad request.') {
  return res.status(400).json({ success: false, message });
}
