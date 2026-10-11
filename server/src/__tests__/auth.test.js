/**
 * Auth endpoint tests.
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking.
 * No real database is needed — User model calls are intercepted.
 *
 * Run from server/:  npm test
 */
import { jest } from '@jest/globals';

// ── Mocks must be set up before any import that transitively imports the module
const mockFindOne      = jest.fn();
const mockCreate       = jest.fn();
const mockFindById     = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  User: {
    findOne:            mockFindOne,
    findById:           mockFindById,
    create:             mockCreate,
    findByIdAndUpdate:  jest.fn(),
  },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const request      = (await import('supertest')).default;
const { createApp } = await import('../app.js');
const app           = createApp();

// ── Test data ─────────────────────────────────────────────────────────────────
const VALID_REG = {
  email:       'alice@example.com',
  username:    'alice',
  password:    'Password1',
  displayName: 'Alice',
};

function fakeUser(overrides = {}) {
  return {
    _id:          '507f1f77bcf86cd799439011',
    email:        'alice@example.com',
    username:     'alice',
    displayName:  'Alice',
    passwordHash: '$2b$12$fakehashvalue',
    toJSON() {
      const { passwordHash: _, ...rest } = this;
      return rest;
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no user exists. Handles both plain calls and .select() chaining.
  const nullWithSelect = { select: jest.fn().mockResolvedValue(null) };
  mockFindOne.mockResolvedValue(null);
  mockFindOne.mockReturnValue({ ...nullWithSelect, then: (r) => r(null) });
  // Make it work as both a promise AND a chainable query
  mockFindOne.mockImplementation(() => {
    const result = Object.assign(Promise.resolve(null), {
      select: jest.fn().mockResolvedValue(null),
    });
    return result;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────────────────────
describe('404 handler', () => {
  test('returns 404 for unknown endpoints', async () => {
    // Use a path that is not under any mounted router prefix
    const res = await request(app).get('/totally-unknown-path-xyz');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register — input validation (no DB needed)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register — validation', () => {
  test('422 when email is missing', async () => {
    const { email: _, ...body } = VALID_REG;
    const res = await request(app).post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(422);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  test('422 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  test('422 for username shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, username: 'ab' });
    expect(res.status).toBe(422);
  });

  test('422 for username with spaces', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, username: 'alice smith' });
    expect(res.status).toBe(422);
  });

  test('422 for password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, password: 'Pass1' });
    expect(res.status).toBe(422);
  });

  test('422 for password with no uppercase letter', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, password: 'password1' });
    expect(res.status).toBe(422);
  });

  test('422 for password with no digit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...VALID_REG, password: 'PasswordOnly' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register — business logic
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register — business logic', () => {
  test('201, sets HttpOnly cookie, and hides passwordHash on success', async () => {
    mockCreate.mockResolvedValue(fakeUser());

    const res = await request(app).post('/api/v1/auth/register').send(VALID_REG);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies = res.headers['set-cookie'] ?? [];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  test('400 when email is already registered', async () => {
    // email check returns a user (chained .select() not needed for register's findOne)
    const existingUser = fakeUser();
    mockFindOne.mockImplementation(() =>
      Object.assign(Promise.resolve(existingUser), {
        select: jest.fn().mockResolvedValue(existingUser),
      })
    );

    const res = await request(app).post('/api/v1/auth/register').send(VALID_REG);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  test('400 when username is already taken', async () => {
    const existingUser = fakeUser();
    let callCount = 0;
    mockFindOne.mockImplementation(() => {
      callCount++;
      const val = callCount === 1 ? null : existingUser;
      return Object.assign(Promise.resolve(val), {
        select: jest.fn().mockResolvedValue(val),
      });
    });

    const res = await request(app).post('/api/v1/auth/register').send(VALID_REG);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login — validation
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login — validation', () => {
  test('422 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Password1' });
    expect(res.status).toBe(422);
  });

  test('422 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login — business logic
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login — business logic', () => {
  test('400 with ambiguous message for non-existent user (prevents enumeration)', async () => {
    // findOne returns a mock with a .select() that returns null
    mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' });

    expect(res.status).toBe(400);
    // IMPORTANT: message must be the same whether the email doesn't exist
    // or the password is wrong — prevents user enumeration attacks
    expect(res.body.message).toBe('Invalid email or password.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me — authentication
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  test('401 with no auth cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users/search — requires auth
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/users/search', () => {
  test('401 without authentication', async () => {
    const res = await request(app).get('/api/v1/users/search?q=alice');
    expect(res.status).toBe(401);
  });
});
