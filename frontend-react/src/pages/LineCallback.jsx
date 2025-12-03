import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LineCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setToken, login } = useAuth();
  const [status, setStatus] = useState('Processing login...');

  const LINE_BACKEND = import.meta.env.VITE_LINE_PY_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('No code received from LINE.');
      return;
    }

    setStatus('Contacting backend to exchange code...');
    console.debug('Posting code to LINE backend:', LINE_BACKEND + '/auth/line/callback', { code });
    fetch(`${LINE_BACKEND}/auth/line/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(async res => {
        const text = await res.text().catch(() => '');
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
        console.debug('LINE callback response', res.status, data);
        if (!res.ok) {
          const errMsg = data.error || data.raw || 'LINE callback failed';
          throw new Error(errMsg);
        }
        return data;
      })
      .then(async data => {
        // backend should return { user, token }
        const possibleToken = data.token || data.access_token || data.jwt || (data.data && (data.data.token || data.data.jwt));
        if (possibleToken) {
          await setToken(possibleToken);
        } else if (data.user) {
          // Backend returned only a user object (no JWT).
          // Use context login() to persist user to localStorage.
          try {
            login(data.user);
          } catch (err) {
            console.warn('Failed to set user via login fallback', err);
          }
        }
        navigate('/profile');
      })
      .catch(err => {
        console.error(err);
        setStatus('Error: ' + (err.message || err) + ' -- see console for details');
      });
  }, [searchParams, navigate, setToken]);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{status}</h2>
    </div>
  );
};

export default LineCallback;