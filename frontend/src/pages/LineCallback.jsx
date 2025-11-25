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
    fetch(`${LINE_BACKEND}/auth/line/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'LINE callback failed');
        return data;
      })
      .then(data => {
        // backend should return { user, token }
        if (data.token) {
          setToken(data.token);
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
        setStatus('Error: ' + (err.message || err));
      });
  }, [searchParams, navigate, setToken]);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{status}</h2>
    </div>
  );
};

export default LineCallback;