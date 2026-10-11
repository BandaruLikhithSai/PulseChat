import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../services/api.js';

/**
 * AuthContext — provides authentication state and actions to the entire app.
 *
 * On mount, we call GET /auth/me to restore the session from the HTTP-only
 * cookie. This means the user stays logged in across page refreshes without
 * ever touching localStorage for auth tokens (which would expose them to XSS).
 *
 * Possible states:
 *   loading: true           — session check in progress (show splash)
 *   user: null, loading: false — not authenticated (show /auth)
 *   user: {...}, loading: false — authenticated
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until /me resolves

  // ── Session restoration ─────────────────────────────────────────────────
  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null)) // 401 = not logged in — expected, not an error
      .finally(() => setLoading(false));
  }, []);

  // ── register ────────────────────────────────────────────────────────────
  const register = useCallback(async ({ email, username, password, displayName }) => {
    const res = await authApi.register({ email, username, password, displayName });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // ── login ───────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const res = await authApi.login({ email, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // ── logout ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Server-side cookie clearing failed — clear local state regardless
    }
    setUser(null);
  }, []);

  // ── updateUser ──────────────────────────────────────────────────────────
  // Used after profile edits / avatar upload so the sidebar updates immediately
  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => ({ ...prev, ...updatedUser }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
