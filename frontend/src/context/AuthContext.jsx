import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';       // JS backend (email/password)
const LINE_API = import.meta.env.VITE_LINE_PY_URL || API_URL || 'http://localhost:5000'; // Python LINE backend

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) || null; } catch { return null; }
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
      if (!t) return;
      try {
        const res = await fetch(`${LINE_API}/users/me`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        if (!res.ok) {
          setTokenState(null);
          setUser(null);
          return;
        }
        const profile = await res.json();
        setTokenState(t);
        setUser(profile);
      } catch (err) {
        console.error('Session restore failed', err);
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
  };

  // Save token and immediately fetch /users/me to populate user
  const setToken = async (tkn) => {
    if (!tkn) {
      logout();
      return;
    }
    setTokenState(tkn);
    localStorage.setItem('token', tkn);
    try {
      const res = await fetch(`${LINE_API}/users/me`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      if (!res.ok) {
        console.error('Failed to fetch user after token set');
        return;
      }
      const profile = await res.json();
      setUser(profile);
    } catch (err) {
      console.error(err);
    }
  };

  const loginWithCredentials = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    // JS backend returns user object (no JWT). Use setUser.
    setUser(data.user);
    return data.user;
  };

  const registerWithCredentials = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Register failed');
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
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

export const useAuth = () => useContext(AuthContext);