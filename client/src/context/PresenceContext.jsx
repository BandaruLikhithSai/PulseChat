import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { useSocket } from './SocketContext.jsx';
import { useAuth } from './AuthContext.jsx';

/**
 * PresenceContext — tracks which users are currently online.
 *
 * State: a Set of userId strings.
 * Updated by:
 *   presence:init    — initial list on socket connect
 *   presence:online  — a user connected
 *   presence:offline — a user's last socket disconnected
 */
const PresenceContext = createContext(null);

function reducer(state, action) {
  const next = new Set(state);
  switch (action.type) {
    case 'INIT':
      return new Set(action.ids);
    case 'ONLINE':
      next.add(action.userId);
      return next;
    case 'OFFLINE':
      next.delete(action.userId);
      return next;
    default:
      return state;
  }
}

export function PresenceProvider({ children }) {
  const { user } = useAuth();
  const { getSocket } = useSocket();
  const [onlineUsers, dispatch] = useReducer(reducer, new Set());

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onInit = ({ onlineUserIds }) =>
      dispatch({ type: 'INIT', ids: onlineUserIds });
    const onOnline = ({ userId }) =>
      dispatch({ type: 'ONLINE', userId });
    const onOffline = ({ userId }) =>
      dispatch({ type: 'OFFLINE', userId });

    socket.on('presence:init', onInit);
    socket.on('presence:online', onOnline);
    socket.on('presence:offline', onOffline);

    return () => {
      socket.off('presence:init', onInit);
      socket.off('presence:online', onOnline);
      socket.off('presence:offline', onOffline);
    };
  }, [getSocket]);

  // Always consider the current user online (they're looking at the screen)
  const isOnline = useCallback(
    (userId) => {
      if (!userId) return false;
      if (userId === user?._id) return true;
      return onlineUsers.has(userId.toString());
    },
    [onlineUsers, user?._id]
  );

  return (
    <PresenceContext.Provider value={{ onlineUsers, isOnline }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used inside PresenceProvider');
  return ctx;
}
