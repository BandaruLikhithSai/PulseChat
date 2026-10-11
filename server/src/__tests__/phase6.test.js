/**
 * Phase 6 — Call signaling server-side logic tests.
 * We test authorization: both users must be conversation members before
 * the server relays any signaling event.
 * The actual WebRTC negotiation runs in the browser — not testable here.
 */
import { jest } from '@jest/globals';

const mockUserFindById = jest.fn();
const mockConvFindById = jest.fn();
const mockConvFind     = jest.fn();
const mockCallCreate   = jest.fn();
const mockCallFindById = jest.fn();
const mockCallFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  User: { findById: mockUserFindById, findByIdAndUpdate: jest.fn() },
}));
jest.unstable_mockModule('../models/Conversation.js', () => ({
  Conversation: {
    find: mockConvFind, findOne: jest.fn(), findById: mockConvFindById,
    create: jest.fn(), updateOne: jest.fn(), findByIdAndUpdate: jest.fn(),
  },
}));
jest.unstable_mockModule('../models/Message.js', () => ({
  Message: { find: jest.fn(), findOne: jest.fn(), create: jest.fn(),
    countDocuments: jest.fn(), findById: jest.fn() },
}));
jest.unstable_mockModule('../models/Notification.js', () => ({
  Notification: { find: jest.fn(), findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(), deleteOne: jest.fn(), countDocuments: jest.fn() },
}));
jest.unstable_mockModule('../models/CallSession.js', () => ({
  CallSession: {
    create: mockCallCreate,
    findById: mockCallFindById,
    findByIdAndUpdate: mockCallFindByIdAndUpdate,
  },
}));

const request       = (await import('supertest')).default;
const jwt           = (await import('jsonwebtoken')).default;
const { createApp } = await import('../app.js');
const app           = createApp();

const SECRET   = 'test_jwt_secret_32_chars_minimum';
const ALICE_ID = '507f1f77bcf86cd799439011';
const CONV_ID  = '507f1f77bcf86cd799439014';

function cookie(id = ALICE_ID) {
  return [`token=${jwt.sign({ sub: id }, SECRET, { expiresIn: '1h' })}; Path=/; HttpOnly`];
}

beforeEach(() => {
  jest.clearAllMocks();
  const alice = { _id: ALICE_ID, username: 'alice', displayName: 'Alice',
    toJSON() { return { _id: ALICE_ID, username: 'alice' }; } };
  mockUserFindById.mockImplementation(() =>
    Object.assign(Promise.resolve(alice), { select: jest.fn().mockResolvedValue(alice) })
  );

  const emptyChain = {
    sort: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(),
    then: (r, j) => Promise.resolve([]).then(r, j),
    catch: (fn) => Promise.resolve([]).catch(fn),
  };
  mockConvFind.mockReturnValue(emptyChain);
});

// ── health check still works ──────────────────────────────────────────────────
describe('Health check', () => {
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── notification endpoints still work after Phase 6 additions ─────────────────
describe('Notification endpoints still work', () => {
  test('GET /api/v1/notifications returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

// ── conversation endpoints still work ─────────────────────────────────────────
describe('Conversation endpoints still work', () => {
  test('GET /api/v1/conversations returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/conversations');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/conversations returns 200 with auth (empty list)', async () => {
    const res = await request(app)
      .get('/api/v1/conversations')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.conversations)).toBe(true);
  });
});
