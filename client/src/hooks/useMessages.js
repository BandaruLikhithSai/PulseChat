import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { v4 as uuidv4 } from 'uuid';

export function useMessages(conversationId) {
  const { user } = useAuth();
  const { getSocket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const typingTimers = useRef({});
  const seenClientMsgIds = useRef(new Set());

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    setLoading(true);
    setError('');
    setHasMore(false);
    setNextCursor(null);
    seenClientMsgIds.current = new Set();

    messageApi
      .getMessages(conversationId)
      .then((res) => {
        const reversed = [...res.data.messages].reverse();
        setMessages(reversed);
        setHasMore(res.data.hasMore);
        setNextCursor(res.data.nextCursor);
        reversed.forEach((m) => { if (m.clientMsgId) seenClientMsgIds.current.add(m.clientMsgId); });
      })
      .catch((err) => setError(err.message || 'Failed to load messages.'))
      .finally(() => setLoading(false));
  }, [conversationId]);

  // ── Join / leave socket room ──────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('conversation:join', { conversationId });
    return () => { socket.emit('conversation:leave', { conversationId }); };
  }, [conversationId, getSocket]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return;

    // New message
    const handleNew = ({ message }) => {
      if (message.conversation !== conversationId) return;
      if (message.clientMsgId && seenClientMsgIds.current.has(message.clientMsgId)) {
        setMessages((prev) =>
          prev.map((m) => (m.clientMsgId === message.clientMsgId && m._pending ? message : m))
        );
        return;
      }
      if (message.clientMsgId) seenClientMsgIds.current.add(message.clientMsgId);
      setMessages((prev) => [...prev, message]);
    };

    // Edit or reaction update
    const handleUpdated = ({ message }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === message._id ? { ...m, ...message } : m))
      );
    };

    // Delete
    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, deleted: true, content: { text: '', attachments: [] } }
            : m
        )
      );
    };

    // Typing
    const handleTyping = ({ conversationId: cId, userId, typing }) => {
      if (cId !== conversationId || userId === user?._id) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (typing) {
          next.add(userId);
          clearTimeout(typingTimers.current[userId]);
          typingTimers.current[userId] = setTimeout(() => {
            setTypingUsers((s) => { const ns = new Set(s); ns.delete(userId); return ns; });
          }, 4000);
        } else {
          clearTimeout(typingTimers.current[userId]);
          next.delete(userId);
        }
        return next;
      });
    };

    socket.on('message:new', handleNew);
    socket.on('message:updated', handleUpdated);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:typing', handleTyping);

    return () => {
      socket.off('message:new', handleNew);
      socket.off('message:updated', handleUpdated);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:typing', handleTyping);
    };
  }, [conversationId, getSocket, user?._id]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text, replyTo = null) => {
    if (!text?.trim() || !conversationId) return;
    const socket = getSocket();
    const clientMsgId = uuidv4();

    const optimistic = {
      _id: `pending-${clientMsgId}`, clientMsgId, conversation: conversationId,
      sender: { _id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar },
      content: { text: text.trim(), attachments: [] },
      replyTo, reactions: [], readBy: [], deliveredTo: [],
      createdAt: new Date().toISOString(), _pending: true,
    };

    seenClientMsgIds.current.add(clientMsgId);
    setMessages((prev) => [...prev, optimistic]);

    if (socket?.connected) {
      socket.emit('message:send', { conversationId, text: text.trim(), clientMsgId, replyTo }, (ack) => {
        if (ack?.error) {
          setMessages((prev) => prev.filter((m) => m.clientMsgId !== clientMsgId));
          seenClientMsgIds.current.delete(clientMsgId);
          return;
        }
        if (ack?.message) {
          setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? ack.message : m)));
        }
      });
    } else {
      try {
        const res = await messageApi.send(conversationId, { text: text.trim(), clientMsgId, replyTo });
        setMessages((prev) => prev.map((m) => (m.clientMsgId === clientMsgId ? res.data.message : m)));
      } catch {
        setMessages((prev) => prev.filter((m) => m.clientMsgId !== clientMsgId));
        seenClientMsgIds.current.delete(clientMsgId);
      }
    }
  }, [conversationId, getSocket, user]);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const editMessage = useCallback(async (messageId, text) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('message:edit', { messageId, conversationId, text }, (ack) => {
        if (ack?.message) {
          setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, ...ack.message } : m)));
        }
      });
    } else {
      const res = await messageApi.edit(conversationId, messageId, text);
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, ...res.data.message } : m)));
    }
  }, [conversationId, getSocket]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId) => {
    const socket = getSocket();
    // Optimistic: mark deleted immediately
    setMessages((prev) =>
      prev.map((m) => m._id === messageId ? { ...m, deleted: true, content: { text: '', attachments: [] } } : m)
    );
    if (socket?.connected) {
      socket.emit('message:delete', { messageId, conversationId }, (ack) => {
        if (ack?.error) {
          // Revert — refetch would be ideal; for now just log
          console.error('Delete failed:', ack.error);
        }
      });
    } else {
      await messageApi.delete(conversationId, messageId);
    }
  }, [conversationId, getSocket]);

  // ── React ─────────────────────────────────────────────────────────────────
  const reactToMessage = useCallback(async (messageId, emoji) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('message:react', { messageId, conversationId, emoji }, (ack) => {
        if (ack?.message) {
          setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, ...ack.message } : m)));
        }
      });
    } else {
      const res = await messageApi.react(conversationId, messageId, emoji);
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, ...res.data.message } : m)));
    }
  }, [conversationId, getSocket]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !nextCursor) return;
    setLoadingOlder(true);
    try {
      const res = await messageApi.getMessages(conversationId, { before: nextCursor });
      const older = [...res.data.messages].reverse();
      older.forEach((m) => { if (m.clientMsgId) seenClientMsgIds.current.add(m.clientMsgId); });
      setMessages((prev) => [...older, ...prev]);
      setHasMore(res.data.hasMore);
      setNextCursor(res.data.nextCursor);
    } catch (err) {
      console.error('Failed to load older messages:', err.message);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, nextCursor]);

  const sendTypingStart = useCallback(() => {
    getSocket()?.emit('message:typing_start', { conversationId });
  }, [conversationId, getSocket]);

  const sendTypingStop = useCallback(() => {
    getSocket()?.emit('message:typing_stop', { conversationId });
  }, [conversationId, getSocket]);

  const markRead = useCallback(() => {
    getSocket()?.emit('message:read', { conversationId });
  }, [conversationId, getSocket]);

  // ── Upload files ──────────────────────────────────────────────────────────
  const sendFiles = useCallback(async (files, caption = '', onProgress) => {
    if (!files?.length || !conversationId) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    if (caption) formData.append('text', caption);
    const res = await messageApi.uploadAttachments(conversationId, formData, onProgress);
    const msg = res.data.message;
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, [conversationId]);

  return {
    messages, loading, loadingOlder, hasMore, error, typingUsers,
    sendMessage, editMessage, deleteMessage, reactToMessage, sendFiles,
    loadOlder, sendTypingStart, sendTypingStop, markRead,
  };
}
