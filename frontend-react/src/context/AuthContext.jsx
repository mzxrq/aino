import React, { useEffect, useState } from 'react';
import { API_URL, LINE_API } from './envConfig';
import { AuthContext } from './contextBase';

export function AuthProvider({ children }) {
    // Normalize stored/returned user objects so frontend always has `id` and `createdAt` fields
    const normalizeUser = (raw) => {
        if (!raw) return null;
        const src = (raw.user && typeof raw.user === 'object') ? { ...raw, ...raw.user } : raw;
        const id = src._id || src.id || src.userId || src.lineid || src.line_user_id || null;
        const createdRaw = src.createdAt || src.created_at || src.created || null;
        const lastRaw = src.lastLogin || src.last_login || src.last_login_time || null;

        const fmtDate = (v) => {
            if (!v) return undefined;
            if (typeof v === 'string') return v;
            if (v instanceof Date) return v.toISOString();
            try { return new Date(v).toISOString(); } catch { return String(v); }
        };

        const createdAt = fmtDate(createdRaw);
        const lastLogin = fmtDate(lastRaw);

        return { ...src, id: id ? String(id) : undefined, createdAt, lastLogin, timeZone: src.timeZone, role: src.role };
    };

    const [user, setUser] = useState(() => {
        try {
            const raw = JSON.parse(localStorage.getItem('user')) || null;
            if (!raw) return null;
            return normalizeUser(raw);
        } catch { return null; }
    });
    const [token, setTokenState] = useState(() => localStorage.getItem('token') || null);

    // Sync state to localStorage
    useEffect(() => {
        if (user) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
    }, [user]);

    useEffect(() => {
        if (token) localStorage.setItem('token', token);
        else localStorage.removeItem('token');
    }, [token]);

    const login = (userData) => setUser(normalizeUser(userData));

    // Expose a normalized setter so pages can update the cached profile after mutations
    const setUserNormalized = (next) => {
        if (typeof next === 'function') {
            setUser((prev) => normalizeUser(next(prev)));
        } else {
            setUser(normalizeUser(next));
        }
    };

    const logout = () => {
        setUser(null);
        setTokenState(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        return true;
    };

    // Save token and immediately fetch /profile to populate user
    // 🚨 FIX: Must check both backends for valid profile
    const setToken = async (tkn) => {
        if (!tkn) {
            logout();
            return;
        }
        setTokenState(tkn);
        localStorage.setItem('token', tkn);

        try {
            // 1. Try JS backend first (standard email/password)
            let res = await fetch(`${API_URL}/node/users/profile`, {
                headers: { Authorization: `Bearer ${tkn}` }
            });
        
            // 2. If JS backend fails, try LINE backend
            if (!res.ok) {
                console.warn('JS profile fetch failed, trying LINE backend...');
                res = await fetch(`${LINE_API}/profile`, {
                    headers: { Authorization: `Bearer ${tkn}` }
                });
            }
        
            if (!res.ok) {
                console.error('Failed to fetch user profile from all backends after token set.');
                logout();
                return;
            }

            const profile = await res.json();
            setUser(normalizeUser(profile));
        } catch (err) {
            console.error('Error fetching user profile in setToken:', err);
            logout();
        }
    };
    
    // Try to restore session on app load if token exists
    useEffect(() => {
        async function restore() {
            const t = localStorage.getItem('token');
            if (t) {
                try {
                    // 1. Try JS backend first
                    let res = await fetch(`${API_URL}/node/users/profile`, {
                        headers: { Authorization: `Bearer ${t}` }
                    });
                    
                    // 2. If JS backend fails, try LINE backend
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
                    
                    // 🚨 REMOVED: setTokenState(t); as t is already the current state/LS value
                    setUser(normalizeUser(profile));
                    return;

                } catch (err) {
                    console.error('Session restore failed (Network/Fetch error)', err);
                }
            }

            // No token: try to restore user object previously saved by loginWithCredentials
            try {
                const u = localStorage.getItem('user');
                if (u) {
                    const parsed = JSON.parse(u);
                    setUser(normalizeUser(parsed));
                }
            } catch (err) {
                console.error('Failed to restore user from localStorage', err);
            }
        }
        restore();
    }, []);

    const loginWithCredentials = async (email, password) => {
        try {
            const res = await fetch(`${API_URL}/node/users/login`, {
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
                setUser(normalizeUser(data.user));
                return data.user;
            }
            return data;
        } catch (err) {
            throw new Error(err.message || 'Network error during login');
        }
    };

    const registerWithCredentials = async (email, password, name, username) => {
        try {
            const res = await fetch(`${API_URL}/node/users/register`, {
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
                setUser(normalizeUser(data.user));
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
            isLoggedIn: Boolean(user || token),
            login,
            logout,
            setToken,
            setUser: setUserNormalized,
            loginWithCredentials,
            registerWithCredentials
        }}>
            {children}
        </AuthContext.Provider>
    );
}