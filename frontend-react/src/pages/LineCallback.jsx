import React, { useEffect, useState, useRef } from 'react'; // 👈 Import useRef
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LINE_API } from '../context/envConfig';

// Use centralized `LINE_API` (falls back to configured LINE Python backend)
const LINE_BACKEND = LINE_API || import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';

const LineCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setToken, login } = useAuth();
  const [status, setStatus] = useState('Processing LINE login...');

  // 🛑 FIX 1: Use a ref flag to track if the exchange has already run
  const hasExecuted = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      setStatus('No code received from LINE.');
      return;
    }
    
    // 🛑 FIX 2: Check the flag before proceeding
    if (hasExecuted.current) {
      return;
    }
    hasExecuted.current = true; // Set flag immediately to prevent re-execution

    const postCode = async () => {
      setStatus('Contacting backend...');
      try {
        const res = await fetch(`${LINE_BACKEND}/auth/line/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });

        if (!res.ok) {
          const status = res.status;
          const errText = await res.text().catch(() => '');
          
          // Improved error handling to clean up and avoid potential infinite loops
          if (status === 400 && errText.includes("invalid authorization code")) {
             throw new Error(`LINE authorization failed. Code rejected by LINE.`);
          }
          throw new Error(`LINE callback failed: ${status} ${errText}`);
        }

        const data = await res.json();

        // Save JWT or fallback to login with user object
        if (data.token) {
          await setToken(data.token);
        } else if (data.user) {
          login(data.user);
        }

        setStatus('Login successful! Redirecting...');
        setTimeout(() => navigate('/profile'), 500);
      } catch (err) {
        console.error(err);
        setStatus('LINE login failed: ' + (err.message || err));
      }
    };

    postCode();
  }, [searchParams, navigate, setToken, login]); // Dependencies are correct

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{status}</h2>
    </div>
  );
};

export default LineCallback;