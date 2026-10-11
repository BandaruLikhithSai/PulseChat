/**
 * Phase 5 tests — Notifications and attachment validation.
 * All DB calls are mocked.
 */
import { jest } from '@jest/globals';

const mockUserFindById   = jest.fn();
const mockNotifFind      = jest.fn();
const mockNotifFindOneAndUpdate = jest.fn();
const mockNotifUpdateMany = jest.fn();
const mockNotifDeleteOne = jest.fn();
const mockNotifCountDocuments = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  User: { findById: mockUserFindById, findByIdAndUpdate: jest.fn() },
}));

jest.unstable_mockModule('../models/Notification.js', () => ({
  Notification: {
    find:             mockNotifFind,
    findOneAndUpdate: mockNotifFindOneAndUpdate,
    updateMany:       mockNotifUpdateMany,
    deleteOne:        mockNotifDeleteOne,
    countDocuments:   mockNotifCountDocuments,
  },
}));

// Stub models not used in these tests
jest.unstable_mockModule('../models/Conversation.js', () => ({
  Conversation: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(),
    create: jest.fn(), updateOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.unstable_mockModule('../models/Message.js', () => ({
  Message: { find: jest.fn(), findOne: jest.fn(), create: jest.fn(),
    countDocuments: jest.fn(), findById: jest.fn() },
}));

const request       = (await import('supertest')).default;
const jwt           = (await import('jsonwebtoken')).default;
const { createApp } = await import('../app.js');
const app           = createApp();

const SECRET   = 'test_jwt_secret_32_chars_minimum';
const USER_ID  = '507f1f77bcf86cd799439011';
const NOTIF_ID = '507f1f77bcf86cd799439020';

function cookie(id = USER_ID) {
  return [`token=${jwt.sign({ sub: id }, SECRET, { expiresIn: '1h' })}; Path=/; HttpOnly`];
}

function userDoc(id = USER_ID) {
  return { _id: id, username: 'alice', displayName: 'Alice',
    toJSON() { return { _id: id, username: 'alice' }; } };
}

beforeEach(() => {
  jest.clearAllMocks();
  const u = userDoc();
  mockUserFindById.mockImplementation(() =>
    Object.assign(Promise.resolve(u), { select: jest.fn().mockResolvedValue(u) })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/notifications
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/notifications', () => {

  test('401 without auth', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  test('200 returns notifications array and unreadCount', async () => {
    const notifs = [{ _id: NOTIF_ID, read: false, preview: 'Alice: hi', createdAt: new Date() }];
    const chain = {
      sort:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      then: (r, j) => Promise.resolve(notifs).then(r, j),
      catch: (fn) => Promise.resolve(notifs).catch(fn),
    };
    mockNotifFind.mockReturnValue(chain);
    mockNotifCountDocuments.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', cookie());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body.unreadCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/notifications/:id/read
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/v1/notifications/:id/read', () => {

  test('401 without auth', async () => {
    const res = await request(app).patch(`/api/v1/notifications/${NOTIF_ID}/read`);
    expect(res.status).toBe(401);
  });

  test('200 marks notification as read', async () => {
    const updated = { _id: NOTIF_ID, read: true, readAt: new Date() };
    mockNotifFindOneAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Cookie', cookie());

    expect(res.status).toBe(200);
    expect(res.body.notification.read).toBe(true);
  });

  test('404 when notification not found or belongs to another user', async () => {
    mockNotifFindOneAndUpdate.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Cookie', cookie());

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/notifications/read-all
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/v1/notifications/read-all', () => {

  test('401 without auth', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
  });

  test('200 marks all notifications read', async () => {
    mockNotifUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Cookie', cookie());

    expect(res.status).toBe(200);
    expect(mockNotifUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: expect.anything(), read: false }),
      expect.anything()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/notifications/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/v1/notifications/:id', () => {

  test('401 without auth', async () => {
    const res = await request(app).delete(`/api/v1/notifications/${NOTIF_ID}`);
    expect(res.status).toBe(401);
  });

  test('200 deletes notification', async () => {
    mockNotifDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app)
      .delete(`/api/v1/notifications/${NOTIF_ID}`)
      .set('Cookie', cookie());

    expect(res.status).toBe(200);
    expect(mockNotifDeleteOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: NOTIF_ID, recipient: expect.anything() })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Attachment upload — validation (blocked file type)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/attachments — validation', () => {

  test('401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/conversations/507f1f77bcf86cd799439014/attachments');
    expect(res.status).toBe(401);
  });
});
