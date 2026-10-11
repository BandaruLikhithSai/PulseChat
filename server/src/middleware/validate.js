import { validationResult } from 'express-validator';

/**
 * Run after a chain of express-validator checks.
 * Returns 422 with structured errors if validation failed.
 * Otherwise passes control to the next middleware.
 */
export function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  next();
}
