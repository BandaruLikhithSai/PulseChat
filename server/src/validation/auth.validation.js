import { body } from 'express-validator';

export const registerRules = [
  body('email')
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('username')
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters.')
    .matches(/^[a-z0-9_.-]+$/).withMessage('Username may only contain lowercase letters, numbers, _, ., -'),

  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),

  body('displayName')
    .optional()
    .trim()
    .isLength({ max: 60 }).withMessage('Display name cannot exceed 60 characters.'),
];

export const loginRules = [
  body('email')
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),
];

export const updateProfileRules = [
  body('displayName')
    .optional()
    .trim()
    .isLength({ max: 60 }).withMessage('Display name cannot exceed 60 characters.'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Bio cannot exceed 200 characters.'),

  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters.')
    .matches(/^[a-z0-9_.-]+$/).withMessage('Username may only contain lowercase letters, numbers, _, ., -'),
];
