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
        const tokenVal = src.token || src.accessToken || src.access_token || src.jwt || src.authToken || null;

        return { ...src, id: id ? String(id) : undefined, createdAt, lastLogin, timeZone: src.timeZone, role: src.role , hasPassword: src.setPassword, token: tokenVal ? String(tokenVal) : undefined , hasLineid : src.hasLineid ? true : false, sentOption: src.sentOption || 'undefined' };
    };

    // Helpers to unwrap backend response shapes like { success, data: <user> } or { user, token }
    const getUserFromResponse = (json) => {
        if (!json) return null;
        if (json.data && typeof json.data === 'object') return json.data;
        if (json.user) return json.user;
        return json;
    };

    const getTokenFromResponse = (json) => {
        if (!json) return null;
        const keys = ['token', 'accessToken', 'access_token', 'jwt', 'authToken'];
        const findIn = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            for (const k of keys) if (obj[k]) return obj[k];
            return null;
        };

        // check common top-level locations
        let t = findIn(json) || findIn(json.data) || findIn(json.user) || (json.data && findIn(json.data.user));
        return t || null;
    };

    const [user, setUser] = useState(() => {
        try {
            const raw = JSON.parse(localStorage.getItem('user')) || null;
            if (!raw) return null;
            return normalizeUser(raw);
        } catch { return null; }
    });
    const [token, setTokenState] = useState(() => {
        try {
            const t = localStorage.getItem('token');
            if (t) return t;
            const u = localStorage.getItem('user');
            if (!u) return null;
            const parsed = JSON.parse(u);
            const tok = parsed && (parsed.token || parsed.accessToken || parsed.access_token || parsed.jwt || parsed.authToken || null);
            return tok ? String(tok) : null;
        } catch { return null; }
    });

    // Sync state to localStorage
    useEffect(() => {
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
        } else localStorage.removeItem('user');
    }, [user]);

    useEffect(() => {
        if (token) localStorage.setItem('token', token);
        else localStorage.removeItem('token');
    }, [token]);

    const login = (userData) => {
        const normalized = normalizeUser(userData);
        setUser(normalized);
        if (normalized && normalized.token) {
            setTokenState(String(normalized.token));
        }
    };

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

            // 2. If JS backend fails, try Python backend through gateway
            if (!res.ok) {
                console.warn('JS profile fetch failed, trying Python backend...');
                res = await fetch(`${API_URL}/py/profile`, {
                    headers: { Authorization: `Bearer ${tkn}` }
                });
            }

            if (!res.ok) {
                console.error('Failed to fetch user profile from all backends after token set.');
                logout();
                return;
            }

            const json = await res.json();
            const profile = getUserFromResponse(json);
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
                    // Use setToken to consolidate logic: it saves token state and fetches profile
                    await setToken(t);
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
                    const parsedTok = parsed && (parsed.token || parsed.accessToken || parsed.access_token || parsed.jwt || parsed.authToken || null);
                    if (parsedTok) setTokenState(String(parsedTok));
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
            let data = {};
            try { data = await res.json(); } catch { data = {}; }

            if (!res.ok) {
                // Surface backend error message when available
                const errMsg = data && data.error ? data.error : res.statusText || 'Login failed';
                console.error('Login failed:', res.status, errMsg);
                throw new Error(errMsg);
            }

            // Unwrap possible response shapes
            const tokenResp = getTokenFromResponse(data);
            const userResp = getUserFromResponse(data);

            if (tokenResp) {
                await setToken(tokenResp);
                return { user: userResp, token: tokenResp };
            }

            if (userResp) {
                setUser(normalizeUser(userResp));
                return userResp;
            }

            return data;
        } catch (err) {
            console.error('loginWithCredentials error:', err);
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

            const tokenResp = getTokenFromResponse(data);
            const userResp = getUserFromResponse(data);

            // If backend returned a token in the JSON body, use it
            if (tokenResp) {
                await setToken(tokenResp);
                return { user: userResp, token: tokenResp };
            }

            // Sometimes the token is returned in response headers (Authorization or x-auth-token)
            try {
                const authHeader = res.headers.get && (res.headers.get('authorization') || res.headers.get('x-auth-token'));
                if (authHeader) {
                    const m = String(authHeader).match(/Bearer\s+(.+)/i);
                    const headerToken = m ? m[1] : authHeader;
                    if (headerToken) {
                        await setToken(headerToken);
                        return { user: userResp, token: headerToken };
                    }
                }
            } catch (_) { /* ignore header parsing errors */ }

            // If server returned only a user object (no token), attempt to auto-login using provided credentials
            if (userResp) {
                try {
                    const loginResult = await loginWithCredentials(email, password);
                    if (loginResult && loginResult.token) return loginResult;
                } catch (e) {
                    // Auto-login failed; fall back to returning the user object without token
                }

                setUser(normalizeUser(userResp));
                return userResp;
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
            isAdmin: Boolean(user && user.role === 'admin'),
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