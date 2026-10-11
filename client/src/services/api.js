import axios from 'axios';

/**
 * Central Axios instance for all API calls.
 *
 * baseURL points to the Vite proxy in dev (/api → http://localhost:5000/api),
 * and to the deployed backend URL in production (set via VITE_API_URL).
 *
 * withCredentials: true — required so HTTP-only cookies (auth token) are
 * sent on every request without any manual token management in JavaScript.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api/v1`
    : '/api/v1',
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Response interceptor ──────────────────────────────────────────────────────
// Normalise errors so every catch block gets a consistent error shape
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Something went wrong.';

    const statusCode = error.response?.status || 0;
    const errors = error.response?.data?.errors || [];

    const normalisedError = new Error(message);
    normalisedError.statusCode = statusCode;
    normalisedError.errors = errors;
    normalisedError.original = error;

    return Promise.reject(normalisedError);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  socketToken: () => api.get('/auth/socket-token'),
};

// ─────────────────────────────────────────────────────────────────────────────
// User endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const userApi = {
  search: (q) => api.get('/users/search', { params: { q } }),
  getById: (id) => api.get(`/users/${id}`),
  updateProfile: (data) => api.patch('/users/me', data),
  uploadAvatar: (formData) =>
    api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getNotificationPrefs: () => api.get('/users/me/notification-prefs'),
  updateNotificationPrefs: (data) => api.patch('/users/me/notification-prefs', data),
};

// ─────────────────────────────────────────────────────────────────────────────
// Conversation endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const conversationApi = {
  getAll: () => api.get('/conversations'),
  getById: (id) => api.get(`/conversations/${id}`),
  createDirect: (userId) => api.post('/conversations', { type: 'direct', userId }),
  createGroup: (data) => api.post('/conversations', { type: 'group', ...data }),
  update: (id, data) => api.patch(`/conversations/${id}`, data),
  addMembers: (id, userIds) => api.post(`/conversations/${id}/members`, { userIds }),
  removeMember: (id, userId) => api.delete(`/conversations/${id}/members/${userId}`),
  updateMemberRole: (id, userId, role) =>
    api.patch(`/conversations/${id}/members/${userId}/role`, { role }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Message endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const messageApi = {
  getMessages: (conversationId, params) =>
    api.get(`/conversations/${conversationId}/messages`, { params }),
  send: (conversationId, data) =>
    api.post(`/conversations/${conversationId}/messages`, data),
  edit: (conversationId, messageId, text) =>
    api.patch(`/conversations/${conversationId}/messages/${messageId}`, { text }),
  delete: (conversationId, messageId) =>
    api.delete(`/conversations/${conversationId}/messages/${messageId}`),
  react: (conversationId, messageId, emoji) =>
    api.post(`/conversations/${conversationId}/messages/${messageId}/react`, { emoji }),
  uploadAttachments: (conversationId, formData, onProgress) =>
    api.post(`/conversations/${conversationId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Notification endpoints
// ─────────────────────────────────────────────────────────────────────────────
export const notificationApi = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
};

export default api;
