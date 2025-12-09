import React, { useEffect, useState } from 'react';
import { API_URL, LINE_API } from './envConfig';
import { AuthContext } from './contextBase';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('user')) || null;
      if (!raw) return null;
      // Normalize to ensure we expose a Mongo ObjectId string as `id`
      const id = raw._id || raw.id || raw.userId || (raw.user && (raw.user._id || raw.user.id));
      return { ...raw, id };
    } catch { return null; }
  });
  const [token, setTokenState] = useState(() => localStorage.getItem('token') || null);

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);

  // Try to restore session on app load if token exists
  useEffect(() => {
    async function restore() {
      const t = localStorage.getItem('token');
      // If we have a token, try to fetch a fresh profile from backend.
      if (t) {
        try {
          // Try JS backend first (email/password login)
          let res = await fetch(`${API_URL}/auth/profile`, {
            headers: { Authorization: `Bearer ${t}` }
          });
          
          // If JS backend fails, try LINE backend
          if (!res.ok) {
            res = await fetch(`${LINE_API}/profile`, {
              headers: { Authorization: `Bearer ${t}` }
            });
          }
          
          if (!res.ok) {
            // Token invalid -> clear both
            setTokenState(null);
            setUser(null);
            return;
          }
          const profile = await res.json();
          // Normalize profile to ensure `id` contains MongoDB ObjectId string
          const normalizedId = profile._id || profile.id || profile.userId || (profile.user && (profile.user._id || profile.user.id));
          const normalized = { ...profile, id: normalizedId };
          setTokenState(t);
          setUser(normalized);
          return;
        } catch (err) {
          console.error('Session restore failed', err);
        }
      }

      // No token: try to restore user object previously saved by loginWithCredentials
      try {
        const u = localStorage.getItem('user');
        if (u) {
          const parsed = JSON.parse(u);
          const id = parsed._id || parsed.id || parsed.userId || (parsed.user && (parsed.user._id || parsed.user.id));
          setUser({ ...parsed, id });
        }
      } catch (err) {
        console.error('Failed to restore user from localStorage', err);
      }
    }
    restore();
  }, []);

  const login = (userData) => setUser(userData);

  const logout = () => {
    setUser(null);
    setTokenState(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    // Return a flag so caller can decide where to redirect
    return true;
  };

  // Save token and immediately fetch /profile to populate user
  const setToken = async (tkn) => {
    if (!tkn) {
      logout();
      return;
    }
    setTokenState(tkn);
    localStorage.setItem('token', tkn);
    try {
      // Try JS backend first (email/password login)
      let res = await fetch(`${API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      
      // If JS backend fails, try LINE backend
      if (!res.ok) {
        res = await fetch(`${LINE_API}/profile`, {
          headers: { Authorization: `Bearer ${tkn}` }
        });
      }
      
      if (!res.ok) {
        console.error('Failed to fetch user after token set');
        logout();
        return;
      }
      const profile = await res.json();
      const normalizedId = profile._id || profile.id || profile.userId || (profile.user && (profile.user._id || profile.user.id));
      setUser({ ...profile, id: normalizedId });
    } catch (err) {
      console.error(err);
      logout();
    }
  };

  const loginWithCredentials = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Login failed');

      // If backend returns a token, prefer using it (will fetch profile).
      if (data.token) {
        await setToken(data.token);
        return { user: data.user, token: data.token };
      }

      // Fallback: JS backend returns only a user object (no JWT).
      if (data.user) {
        const id = data.user._id || data.user.id || data.user.userId;
        setUser({ ...data.user, id });
        return data.user;
      }
      return data;
    } catch (err) {
      // Normalize error message for UI
      throw new Error(err.message || 'Network error during login');
    }
  };

  const registerWithCredentials = async (email, password, name, username) => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, username })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Register failed');

      // If backend returns a token, use it.
      if (data.token) {
        await setToken(data.token);
        return { user: data.user, token: data.token };
      }

      if (data.user) {
        const id = data.user._id || data.user.id || data.user.userId;
        setUser({ ...data.user, id });
        return data.user;
      }
      return data;
    } catch (err) {
      throw new Error(err.message || 'Network error during register');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      // Convenience boolean for components that check login state
      isLoggedIn: Boolean(user || token),
      login,
      logout,
      setToken,
      loginWithCredentials,
      registerWithCredentials
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Note: `useAuth` lives in `src/context/useAuth.js` to keep this module
// exporting only the provider component (compatible with fast-refresh rules).

