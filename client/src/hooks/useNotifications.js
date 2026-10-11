import { useState, useEffect, useCallback } from 'react';
import { notificationApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * useNotifications — loads and maintains the notification list.
 *
 * - Fetches on mount.
 * - Listens for notification:new socket events.
 * - Provides markRead, markAllRead, remove helpers.
 * - Requests browser notification permission and shows browser notifications
 *   when the tab is hidden (user's prefs permitting).
 */
export function useNotifications() {
  const { user } = useAuth();
  const { getSocket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    notificationApi
      .getAll()
      .then((res) => {
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // ── Real-time: incoming notifications ─────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handle = ({ notification }) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((n) => n + 1);

      // Browser notification when tab is hidden
      if (
        document.hidden &&
        user?.notificationPrefs?.browser !== false &&
        Notification.permission === 'granted'
      ) {
        new Notification('PulseChat', {
          body: notification.preview,
          icon: '/favicon.svg',
          tag: notification._id,
        });
      }
    };

    socket.on('notification:new', handle);
    return () => socket.off('notification:new', handle);
  }, [getSocket, user]);

  // ── Mark one read ─────────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    await notificationApi.markRead(id).catch(() => {});
  }, []);

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await notificationApi.markAllRead().catch(() => {});
  }, []);

  // ── Remove ────────────────────────────────────────────────────────────────
  const remove = useCallback(async (id) => {
    setNotifications((prev) => {
      const n = prev.find((x) => x._id === id);
      if (n && !n.read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((x) => x._id !== id);
    });
    await notificationApi.delete(id).catch(() => {});
  }, []);

  // ── Request browser permission ────────────────────────────────────────────
  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'not-supported';
    if (Notification.permission === 'granted') return 'granted';
    const result = await Notification.requestPermission();
    return result;
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    remove,
    requestBrowserPermission,
  };
}
