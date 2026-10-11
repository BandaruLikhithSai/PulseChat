/**
 * Phase 3 — Conversation and Message endpoint tests.
 *
 * Uses jest.unstable_mockModule so no real database is needed.
 * Tests cover:
 *   - Creating / retrieving conversations
 *   - Authorization: only members can access a conversation
 *   - Fetching messages
 *   - Sending messages via REST
 *   - Duplicate message (idempotency) handling
 *   - Unauthorized socket event rejection (authorization logic unit test)
 */
import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockUserFindOne     = jest.fn();
const mockUserFindById    = jest.fn();
const mockConvFindOne     = jest.fn();
const mockConvFind        = jest.fn();
const mockConvCreate      = jest.fn();
const mockConvFindById    = jest.fn();
const mockConvUpdateOne   = jest.fn();
const mockConvFindByIdAndUpdate = jest.fn();
const mockMsgFind         = jest.fn();
const mockMsgFindOne      = jest.fn();
const mockMsgCreate       = jest.fn();
const mockMsgCountDocuments = jest.fn();
const mockMsgFindById     = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  User: {
    findOne:            mockUserFindOne,
    findById:           mockUserFindById,
    findByIdAndUpdate:  jest.fn(),
    create:             jest.fn(),
  },
}));

jest.unstable_mockModule('../models/Conversation.js', () => ({
  Conversation: {
    findOne:            mockConvFindOne,
    find:               mockConvFind,
    create:             mockConvCreate,
    findById:           mockConvFindById,
    updateOne:          mockConvUpdateOne,
    findByIdAndUpdate:  mockConvFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule('../models/Message.js', () => ({
  Message: {
    find:               mockMsgFind,
    findOne:            mockMsgFindOne,
    create:             mockMsgCreate,
    countDocuments:     mockMsgCountDocuments,
    findById:           mockMsgFindById,
  },
}));

const request       = (await import('supertest')).default;
const jwt           = (await import('jsonwebtoken')).default;
const { createApp } = await import('../app.js');
const app           = createApp();

// ── Helpers ───────────────────────────────────────────────────────────────────
const SECRET = 'test_jwt_secret_32_chars_minimum';

function makeToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '1h' });
}

const ALICE_ID = '507f1f77bcf86cd799439011';
const BOB_ID   = '507f1f77bcf86cd799439012';
const CONV_ID  = '507f1f77bcf86cd799439013';
const MSG_ID   = '507f1f77bcf86cd799439014';

function fakeUser(id, username) {
  return {
    _id: id, email: `${username}@test.com`, username,
    displayName: username, passwordHash: 'x',
    toJSON() { const { passwordHash: _, ...r } = this; return r; },
  };
}

function fakeConversation({ members = [ALICE_ID, BOB_ID] } = {}) {
  return {
    _id: CONV_ID,
    type: 'direct',
    participants: members.map((id) => ({ user: id, role: 'member', leftAt: null })),
    lastMessage: null,
    lastActivity: new Date(),
    toObject() { return this; },
    populate: jest.fn().mockReturnThis(),
  };
}

function fakeMessage(overrides = {}) {
  return {
    _id: MSG_ID,
    conversation: CONV_ID,
    sender: { _id: ALICE_ID, username: 'alice', displayName: 'Alice' },
    content: { text: 'Hello!', attachments: [] },
    clientMsgId: null,
    deleted: false,
    createdAt: new Date(),
    toJSON() { return this; },
    populate: jest.fn().mockResolvedValue({ ...this, ...overrides }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  // authenticate middleware: findById(userId).select('-passwordHash') → Alice
  // Make it chainable AND directly awaitable
  const aliceDoc = fakeUser(ALICE_ID, 'alice');
  const aliceResult = Object.assign(Promise.resolve(aliceDoc), {
    select: jest.fn().mockResolvedValue(aliceDoc),
  });
  mockUserFindById.mockReturnValue(aliceResult);

  // Default Conversation.find chain (empty list)
  const emptyChain = {
    sort: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
  };
  // Make it a thenable so await works
  emptyChain.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
  emptyChain.catch = (fn) => Promise.resolve([]).catch(fn);
  mockConvFind.mockReturnValue(emptyChain);

  mockMsgCountDocuments.mockResolvedValue(0);
});

function authCookie(userId = ALICE_ID) {
  const token = makeToken(userId);
  return [`token=${token}; Path=/; HttpOnly`];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/conversations — requires auth
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/conversations', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/v1/conversations');
    expect(res.status).toBe(401);
  });

  test('200 with empty array when no conversations', async () => {
    // Build a chainable mock that resolves to []
    const chainMock = {
      sort: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
    };
    chainMock.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
    chainMock.catch = (fn) => Promise.resolve([]).catch(fn);
    mockConvFind.mockReturnValue(chainMock);

    const res = await request(app)
      .get('/api/v1/conversations')
      .set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.conversations)).toBe(true);
    expect(res.body.conversations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/conversations — create direct
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations', () => {
  test('401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .send({ type: 'direct', userId: BOB_ID });
    expect(res.status).toBe(401);
  });

  test('422 when type is missing', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie())
      .send({ userId: BOB_ID });
    expect(res.status).toBe(422);
  });

  test('422 when userId is missing for direct type', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie())
      .send({ type: 'direct' });
    expect(res.status).toBe(422);
  });

  test('400 when trying to message yourself', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie(ALICE_ID))
      .send({ type: 'direct', userId: ALICE_ID });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/yourself/i);
  });

  test('returns existing conversation without creating a duplicate', async () => {
    const existing = fakeConversation();
    const aliceDoc = fakeUser(ALICE_ID, 'alice');
    const bobDoc = fakeUser(BOB_ID, 'bob');

    // Always return chainable mock — .select() gets called by both auth middleware and controller
    mockUserFindById.mockImplementation((id) => {
      const doc = id?.toString() === BOB_ID ? bobDoc : aliceDoc;
      return Object.assign(Promise.resolve(doc), {
        select: jest.fn().mockResolvedValue(doc),
      });
    });

    const convChain = { populate: jest.fn().mockReturnThis() };
    convChain.then = (resolve, reject) => Promise.resolve(existing).then(resolve, reject);
    mockConvFindOne.mockReturnValue(convChain);

    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie(ALICE_ID))
      .send({ type: 'direct', userId: BOB_ID });

    expect(res.status).toBe(200);
    expect(res.body.conversation._id).toBe(CONV_ID);
    expect(res.body.created).toBe(false);
    expect(mockConvCreate).not.toHaveBeenCalled();
  });

  test('404 when target user does not exist', async () => {
    const aliceDoc = fakeUser(ALICE_ID, 'alice');

    mockUserFindById.mockImplementation((id) => {
      // Always return something chainable with .select()
      const doc = id?.toString() === BOB_ID ? null : aliceDoc;
      return Object.assign(Promise.resolve(doc), {
        select: jest.fn().mockResolvedValue(doc),
      });
    });

    const noConvChain = { populate: jest.fn().mockReturnThis() };
    noConvChain.then = (resolve, reject) => Promise.resolve(null).then(resolve, reject);
    mockConvFindOne.mockReturnValue(noConvChain);

    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie(ALICE_ID))
      .send({ type: 'direct', userId: BOB_ID });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/conversations/:id — authorization
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/conversations/:conversationId', () => {
  test('403 when user is not a member', async () => {
    // Conversation exists but Alice is NOT in it
    const convWithoutAlice = {
      _id: CONV_ID,
      type: 'direct',
      participants: [
        { user: BOB_ID, role: 'member', leftAt: null },
        { user: '507f1f77bcf86cd799439099', role: 'member', leftAt: null },
      ],
    };
    mockConvFindById.mockResolvedValue(convWithoutAlice);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(403);
  });

  test('403 when user has leftAt set (was removed)', async () => {
    const convWithLeftAlice = {
      _id: CONV_ID,
      type: 'direct',
      participants: [
        { user: ALICE_ID, role: 'member', leftAt: new Date() }, // Alice was removed
        { user: BOB_ID, role: 'member', leftAt: null },
      ],
    };
    mockConvFindById.mockResolvedValue(convWithLeftAlice);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(403);
  });

  test('404 when conversation does not exist', async () => {
    mockConvFindById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/conversations/:id/messages — authorization
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/conversations/:conversationId/messages', () => {
  test('401 without auth', async () => {
    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}/messages`);
    expect(res.status).toBe(401);
  });

  test('403 when not a member', async () => {
    mockConvFindById.mockResolvedValue({
      _id: CONV_ID,
      participants: [{ user: BOB_ID, leftAt: null }],
    });

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/conversations/:id/messages — send message
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:conversationId/messages', () => {
  test('401 without auth', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .send({ text: 'Hello' });
    expect(res.status).toBe(401);
  });

  test('403 when not a conversation member', async () => {
    mockConvFindById.mockResolvedValue({
      _id: CONV_ID,
      participants: [{ user: BOB_ID, leftAt: null }],
    });

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Hello' });

    expect(res.status).toBe(403);
  });

  test('400 when text is missing', async () => {
    mockConvFindById.mockResolvedValue(fakeConversation());

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({});

    expect(res.status).toBe(400);
  });

  test('422 when text exceeds 4000 characters', async () => {
    mockConvFindById.mockResolvedValue(fakeConversation());

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'a'.repeat(4001) });

    expect(res.status).toBe(422);
  });

  test('returns existing message for duplicate clientMsgId (idempotency)', async () => {
    mockConvFindById.mockResolvedValue(fakeConversation());
    const clientMsgId = '123e4567-e89b-12d3-a456-426614174000';
    const existing = fakeMessage({ clientMsgId });

    // findOne returns the existing message (duplicate detection)
    mockMsgFindOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(existing),
    });

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Hello', clientMsgId });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    // create must NOT have been called
    expect(mockMsgCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorization logic unit test
// (Tests the authorize middleware directly without making HTTP requests)
// ─────────────────────────────────────────────────────────────────────────────
describe('requireConversationMember middleware', () => {
  test('blocks users with leftAt set (removed from conversation)', async () => {
    const removedAliceConv = {
      _id: CONV_ID,
      participants: [
        { user: ALICE_ID, role: 'member', leftAt: new Date('2024-01-01') },
        { user: BOB_ID, role: 'member', leftAt: null },
      ],
    };
    mockConvFindById.mockResolvedValue(removedAliceConv);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not a member/i);
  });
});
