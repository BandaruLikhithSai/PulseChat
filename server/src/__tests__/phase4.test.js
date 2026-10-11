/**
 * Phase 4 tests — Group chats, reactions, edit/delete, permissions.
 *
 * All DB calls are mocked. No real MongoDB connection needed.
 */
import { jest } from '@jest/globals';

// ── Mocks (must be before any imports that use the models) ────────────────────
const mockUserFindById          = jest.fn();
const mockUserFind              = jest.fn();
const mockConvFind              = jest.fn();
const mockConvFindOne           = jest.fn();
const mockConvCreate            = jest.fn();
const mockConvFindById          = jest.fn();
const mockConvUpdateOne         = jest.fn();
const mockConvFindByIdAndUpdate = jest.fn();
const mockMsgFindOne            = jest.fn();
const mockMsgCreate             = jest.fn();
const mockMsgCountDocuments     = jest.fn();
const mockMsgFindById           = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  User: {
    findById:          mockUserFindById,
    find:              mockUserFind,
    findOne:           jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create:            jest.fn(),
  },
}));

jest.unstable_mockModule('../models/Conversation.js', () => ({
  Conversation: {
    find:              mockConvFind,
    findOne:           mockConvFindOne,
    create:            mockConvCreate,
    findById:          mockConvFindById,
    updateOne:         mockConvUpdateOne,
    findByIdAndUpdate: mockConvFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule('../models/Message.js', () => ({
  Message: {
    find:           jest.fn(),
    findOne:        mockMsgFindOne,
    create:         mockMsgCreate,
    countDocuments: mockMsgCountDocuments,
    findById:       mockMsgFindById,
  },
}));

const request       = (await import('supertest')).default;
const jwt           = (await import('jsonwebtoken')).default;
const { createApp } = await import('../app.js');
const app           = createApp();

// ── Constants ─────────────────────────────────────────────────────────────────
const SECRET   = 'test_jwt_secret_32_chars_minimum';
const ALICE_ID = '507f1f77bcf86cd799439011'; // group admin
const BOB_ID   = '507f1f77bcf86cd799439012'; // group member
const CAROL_ID = '507f1f77bcf86cd799439013'; // group member
const CONV_ID  = '507f1f77bcf86cd799439014';
const MSG_ID   = '507f1f77bcf86cd799439015';

// ── Helpers ───────────────────────────────────────────────────────────────────

function authCookie(userId = ALICE_ID) {
  const tok = jwt.sign({ sub: userId }, SECRET, { expiresIn: '1h' });
  return [`token=${tok}; Path=/; HttpOnly`];
}

function makeUser(id, username = 'user') {
  return {
    _id: id, email: `${username}@test.com`, username,
    displayName: username,
    toJSON() { return { _id: this._id, username, displayName: username }; },
  };
}

/**
 * Make mockUserFindById return the right user for the authenticate middleware.
 * The middleware calls: User.findById(id).select('-passwordHash')
 * So we return an object that is awaitable AND has .select().
 */
function setupAuth(userId = ALICE_ID, username = 'alice') {
  const doc = makeUser(userId, username);
  mockUserFindById.mockImplementation(() =>
    Object.assign(Promise.resolve(doc), {
      select: jest.fn().mockResolvedValue(doc),
    })
  );
}

function makeGroupConv({ adminId = ALICE_ID, memberIds = [BOB_ID, CAROL_ID], removed = {} } = {}) {
  const participants = [
    { user: adminId,  role: 'admin',  leftAt: removed[adminId] ?? null },
    ...memberIds.map((id) => ({ user: id, role: 'member', leftAt: removed[id] ?? null })),
  ];
  return {
    _id: CONV_ID, type: 'group', name: 'Test Group',
    participants,
    lastMessage: null,
    toObject() { return { _id: CONV_ID, type: 'group', name: 'Test Group', participants }; },
  };
}

function makeDirectConv(userA = ALICE_ID, userB = BOB_ID) {
  return {
    _id: CONV_ID, type: 'direct',
    participants: [
      { user: userA, role: 'member', leftAt: null },
      { user: userB, role: 'member', leftAt: null },
    ],
  };
}

function makeMessage({ senderId = ALICE_ID, deleted = false } = {}) {
  const doc = {
    _id: MSG_ID,
    conversation: CONV_ID,
    sender: senderId,
    content: { text: 'Hello', attachments: [] },
    deleted,
    reactions: [],
    editHistory: [],
    edited: false,
    editedAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue({
      _id: MSG_ID, sender: senderId,
      content: { text: 'Hello', attachments: [] },
      deleted, reactions: [], editHistory: [],
    }),
  };
  return doc;
}

// Chainable mock for Conversation.findById used after create (populate chain)
function makeConvChain(value) {
  return Object.assign(Promise.resolve(value), {
    populate: jest.fn().mockReturnThis(),
    // make it thenable so await works
    then: (res, rej) => Promise.resolve(value).then(res, rej),
    catch: (fn)      => Promise.resolve(value).catch(fn),
  });
}

// Default setup before each test
beforeEach(() => {
  jest.clearAllMocks();
  setupAuth(ALICE_ID, 'alice');
  mockMsgCountDocuments.mockResolvedValue(0);
  mockConvFindByIdAndUpdate.mockResolvedValue({});
  mockConvUpdateOne.mockResolvedValue({});

  // Empty conversation list for GET /
  const emptyList = {
    sort:     jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    then: (res, rej) => Promise.resolve([]).then(res, rej),
    catch: (fn)      => Promise.resolve([]).catch(fn),
  };
  mockConvFind.mockReturnValue(emptyList);
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP CREATION
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations — group creation', () => {

  test('201: creates group, creator becomes admin', async () => {
    const members = [makeUser(BOB_ID, 'bob'), makeUser(CAROL_ID, 'carol'), makeUser(ALICE_ID, 'alice')];
    // User.find({ _id: { $in: ... } }).select('_id') — must be chainable
    mockUserFind.mockReturnValue(
      Object.assign(Promise.resolve(members), {
        select: jest.fn().mockResolvedValue(members),
      })
    );

    const conv = makeGroupConv();
    mockConvCreate.mockResolvedValue({ _id: CONV_ID });
    mockConvFindById.mockReturnValue(makeConvChain(conv));

    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie(ALICE_ID))
      .send({ type: 'group', name: 'Test Group', memberIds: [BOB_ID, CAROL_ID] });

    expect(res.status).toBe(201);
    expect(mockConvCreate).toHaveBeenCalled();
    const createArgs = mockConvCreate.mock.calls[0][0];
    expect(createArgs.type).toBe('group');
    expect(createArgs.name).toBe('Test Group');
    // Creator (Alice) must be admin
    const alicePart = createArgs.participants.find(
      (p) => p.user.toString() === ALICE_ID
    );
    expect(alicePart?.role).toBe('admin');
  });

  test('422: group name missing', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie())
      .send({ type: 'group', memberIds: [BOB_ID] });

    expect(res.status).toBe(422);
  });

  test('422: memberIds not an array', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', authCookie())
      .send({ type: 'group', name: 'Test', memberIds: 'invalid' });

    expect(res.status).toBe(422);
  });

  test('401: unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .send({ type: 'group', name: 'Test', memberIds: [BOB_ID] });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP MEMBERSHIP — ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────
describe('Group membership — access control', () => {

  test('403: removed member cannot access conversation', async () => {
    // Alice's leftAt is set — she was removed
    const conv = makeGroupConv({ removed: { [ALICE_ID]: new Date('2024-01-01') } });
    mockConvFindById.mockResolvedValue(conv);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not a member/i);
  });

  test('403: non-member cannot read messages', async () => {
    setupAuth(CAROL_ID, 'carol');
    // Carol is not in this direct conversation
    mockConvFindById.mockResolvedValue(makeDirectConv(ALICE_ID, BOB_ID));

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(CAROL_ID));

    expect(res.status).toBe(403);
  });

  test('403: non-member cannot post messages', async () => {
    setupAuth(CAROL_ID, 'carol');
    mockConvFindById.mockResolvedValue(makeDirectConv(ALICE_ID, BOB_ID));

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages`)
      .set('Cookie', authCookie(CAROL_ID))
      .send({ text: 'Hello' });

    expect(res.status).toBe(403);
  });

  test('404: conversation not found', async () => {
    mockConvFindById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie());

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-ONLY ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe('Admin-only group actions', () => {

  test('403: non-admin cannot add members', async () => {
    setupAuth(BOB_ID, 'bob');
    mockConvFindById.mockResolvedValue(makeGroupConv());

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/members`)
      .set('Cookie', authCookie(BOB_ID))
      .send({ userIds: [CAROL_ID] });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });

  test('403: non-admin cannot update group info', async () => {
    setupAuth(BOB_ID, 'bob');
    mockConvFindById.mockResolvedValue(makeGroupConv());

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}`)
      .set('Cookie', authCookie(BOB_ID))
      .send({ name: 'Hijacked Name' });

    expect(res.status).toBe(403);
  });

  test('403: non-admin cannot change member roles', async () => {
    setupAuth(BOB_ID, 'bob');
    mockConvFindById.mockResolvedValue(makeGroupConv());

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/members/${CAROL_ID}/role`)
      .set('Cookie', authCookie(BOB_ID))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  test('400: last admin cannot leave without transferring role', async () => {
    // Alice is the ONLY admin
    const conv = makeGroupConv({ adminId: ALICE_ID, memberIds: [BOB_ID] });
    mockConvFindById.mockResolvedValue(conv);

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/members/${ALICE_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/admin/i);
  });

  test('400: group-only action on direct conversation', async () => {
    mockConvFindById.mockResolvedValue(makeDirectConv());

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/members`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ userIds: [CAROL_ID] });

    // Alice is 'member' in direct → requireGroupAdmin fires 403
    expect([400, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE EDITING
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH messages/:msgId — edit', () => {

  test('200: user can edit their own message', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: ALICE_ID });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Updated text' });

    expect(res.status).toBe(200);
    expect(msg.save).toHaveBeenCalled();
    expect(msg.editHistory).toHaveLength(1);
    expect(msg.editHistory[0].text).toBe('Hello');
    expect(msg.content.text).toBe('Updated text');
    expect(msg.edited).toBe(true);
  });

  test('403: user cannot edit another user\'s message', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    // Message sent by Bob, Alice tries to edit it
    const msg = makeMessage({ senderId: BOB_ID });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Unauthorized edit' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own/i);
  });

  test('400: cannot edit a deleted message', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: ALICE_ID, deleted: true });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Try editing deleted' });

    expect(res.status).toBe(400);
    expect(msg.save).not.toHaveBeenCalled();
  });

  test('422: empty edit text', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: '' });

    expect(res.status).toBe(422);
  });

  test('404: message not found', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    mockMsgFindById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ text: 'Some text' });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE DELETION
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE messages/:msgId', () => {

  test('200: user can delete their own message', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: ALICE_ID });
    mockMsgFindById.mockResolvedValue(msg);
    mockMsgFindOne.mockResolvedValue(null); // no previous message

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(200);
    expect(msg.save).toHaveBeenCalled();
    expect(msg.deleted).toBe(true);
    expect(msg.content.text).toBe('');
  });

  test('200: admin can delete any member\'s message', async () => {
    // Alice is admin, Carol sent the message
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: CAROL_ID });
    mockMsgFindById.mockResolvedValue(msg);
    mockMsgFindOne.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(200);
    expect(msg.deleted).toBe(true);
  });

  test('403: regular member cannot delete another user\'s message', async () => {
    setupAuth(BOB_ID, 'bob');
    mockConvFindById.mockResolvedValue(makeGroupConv());
    // Message sent by Carol
    const msg = makeMessage({ senderId: CAROL_ID });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(BOB_ID));

    expect(res.status).toBe(403);
    expect(msg.save).not.toHaveBeenCalled();
  });

  test('200: deleting already-deleted message is idempotent', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: ALICE_ID, deleted: true });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(ALICE_ID));

    expect(res.status).toBe(200);
    // save must NOT be called again for an already-deleted message
    expect(msg.save).not.toHaveBeenCalled();
  });

  test('403: non-member cannot delete any message', async () => {
    setupAuth(CAROL_ID, 'carol');
    mockConvFindById.mockResolvedValue(makeDirectConv(ALICE_ID, BOB_ID));

    const res = await request(app)
      .delete(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`)
      .set('Cookie', authCookie(CAROL_ID));

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe('POST messages/:msgId/react', () => {

  test('200: adds emoji reaction', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: BOB_ID });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    expect(msg.save).toHaveBeenCalled();
    expect(msg.reactions).toHaveLength(1);
    expect(msg.reactions[0].emoji).toBe('👍');
    expect(msg.reactions[0].user.toString()).toBe(ALICE_ID);
  });

  test('200: toggles reaction off when same user reacts again with same emoji', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: BOB_ID });
    // Alice already reacted with 👍
    msg.reactions.push({ user: ALICE_ID, emoji: '👍', reactedAt: new Date() });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    // Reaction toggled off — array should be empty
    expect(msg.reactions).toHaveLength(0);
  });

  test('200: different users can react with the same emoji', async () => {
    setupAuth(BOB_ID, 'bob');
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: ALICE_ID });
    // Alice already reacted with 👍, Bob reacts too
    msg.reactions.push({ user: ALICE_ID, emoji: '👍', reactedAt: new Date() });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(BOB_ID))
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    // Both reactions coexist
    expect(msg.reactions).toHaveLength(2);
  });

  test('400: cannot react to a deleted message', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());
    const msg = makeMessage({ senderId: BOB_ID, deleted: true });
    mockMsgFindById.mockResolvedValue(msg);

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({ emoji: '❤️' });

    expect(res.status).toBe(400);
    expect(msg.save).not.toHaveBeenCalled();
  });

  test('422: emoji field missing', async () => {
    mockConvFindById.mockResolvedValue(makeGroupConv());

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(ALICE_ID))
      .send({});

    expect(res.status).toBe(422);
  });

  test('403: non-member cannot react', async () => {
    setupAuth(CAROL_ID, 'carol');
    // Direct conversation between Alice and Bob — Carol is not in it
    mockConvFindById.mockResolvedValue(makeDirectConv(ALICE_ID, BOB_ID));

    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .set('Cookie', authCookie(CAROL_ID))
      .send({ emoji: '👍' });

    expect(res.status).toBe(403);
  });

  test('401: unauthenticated', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/react`)
      .send({ emoji: '👍' });

    expect(res.status).toBe(401);
  });
});
