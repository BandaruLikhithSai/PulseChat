import { useState, useEffect, useCallback } from 'react';
import { conversationApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';

/**
 * useConversations — loads and maintains the conversation list.
 *
 * Listens for conversation:updated events to update lastMessage/lastActivity
 * in real time without refetching the whole list.
 */
export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { getSocket } = useSocket();

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await conversationApi.getAll();
      setConversations(res.data.conversations);
    } catch (err) {
      setError(err.message || 'Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Real-time: update conversation when a new message arrives
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleConvUpdated = ({ conversationId, lastMessage, lastActivity }) => {
      setConversations((prev) =>
        prev
          .map((c) =>
            c._id === conversationId
              ? { ...c, lastMessage, lastActivity }
              : c
          )
          .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      );
    };

    // When a new message arrives for any conversation, bump the unread count
    const handleNewMessage = ({ message }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c._id !== message.conversation) return c;
          // The active conversation (where the user is looking) — don't increment
          // unread. The ChatPage will handle marking as read.
          return { ...c, lastMessage: message, lastActivity: message.createdAt };
        })
      );
    };

    socket.on('conversation:updated', handleConvUpdated);
    socket.on('message:new', handleNewMessage);

    return () => {
      socket.off('conversation:updated', handleConvUpdated);
      socket.off('message:new', handleNewMessage);
    };
  }, [getSocket]);

  const addOrUpdateConversation = useCallback((conv) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c._id === conv._id);
      if (exists) {
        return prev
          .map((c) => (c._id === conv._id ? { ...c, ...conv } : c))
          .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      }
      return [conv, ...prev];
    });
  }, []);

  return { conversations, loading, error, refetch: fetchConversations, addOrUpdateConversation };
}
