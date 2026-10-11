import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { authApi } from '../services/api.js';

/**
 * SocketContext — manages the authenticated Socket.IO connection.
 *
 * Connection lifecycle:
 *  1. When the user is authenticated, fetch the socket token via
 *     GET /api/v1/auth/socket-token (reflects the cookie's JWT as JSON
 *     so the socket handshake can include it).
 *  2. Connect to the server with the token in socket.handshake.auth.
 *  3. The server verifies the token in its middleware before accepting
 *     the connection.
 *  4. On logout (user becomes null), disconnect and clear the socket.
 *
 * Reconnection:
 *  Socket.IO handles automatic reconnection. After reconnecting, the client
 *  re-joins all conversation rooms it was in (handled in useConversation hook).
 */
const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_API_URL || '';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      // Logged out — disconnect any existing socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Already connected for this user
    if (socketRef.current?.connected) return;

    let socket;

    (async () => {
      try {
        // Fetch the socket token (same JWT that's in the cookie)
        const res = await authApi.socketToken();
        const { token } = res.data;

        socket = io(SOCKET_URL, {
          auth: { token },
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[Socket] Connected:', socket.id);
          setConnected(true);
        });

        socket.on('disconnect', (reason) => {
          console.log('[Socket] Disconnected:', reason);
          setConnected(false);
        });

        socket.on('connect_error', (err) => {
          console.error('[Socket] Connection error:', err.message);
          setConnected(false);
        });
      } catch (err) {
        console.error('[Socket] Failed to get socket token:', err.message);
      }
    })();

    return () => {
      // Cleanup only on unmount, not on every re-render
      // The socket persists for the lifetime of the session
    };
  }, [user]);

  const getSocket = useCallback(() => socketRef.current, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, getSocket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
