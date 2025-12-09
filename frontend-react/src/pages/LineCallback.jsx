import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';


const LINE_BACKEND = import.meta.env.VITE_LINE_PY_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LineCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setToken, login } = useAuth();
  const [status, setStatus] = useState('Processing LINE login...');
 
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // e.g., integrate-<userId>
    if (!code) {
      setStatus('No code received from LINE.');
      return;
    }


    const postCode = async () => {
      setStatus('Contacting backend...');
      try {
        const res = await fetch(`${LINE_BACKEND}/auth/line/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });


        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || 'LINE callback failed');
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
  }, [searchParams, navigate, setToken, login]);


  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{status}</h2>
    </div>
  );
};


export default LineCallback;