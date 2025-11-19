import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LineCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = useState("Processing login...");

  useEffect(() => {
    const code = searchParams.get('code');

    if (code) {
      // --- CALL YOUR BACKEND HERE ---
      // Note: Ensure Anupap has the backend running on port 5000
      fetch('http://127.0.0.1:5000/auth/line/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code })
      })
      .then(res => {
        if (!res.ok) {
          // Handle non-200 responses (e.g., 500, 404)
          throw new Error(`Server responded with status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data.error) {
          // Handle errors returned from the backend API
          setStatus("Login Failed: " + data.error);
        } else {
          // Success! Save user data and token to Context
          // Assuming backend returns: { user: {...}, token: "..." }
          login(data.user, data.token); 
          navigate('/profile'); // Redirect to Profile page
        }
      })
      .catch(err => {
        // Handle network errors (e.g., backend is down)
        console.error(err);
        setStatus("Error connecting to server. Is it running?");
      });
    } else {
      setStatus("No authorization code received from LINE. Please try again.");
    }
    // Added login and navigate to dependency array
  }, [searchParams, navigate, login]);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{status}</h2>
    </div>
  );
};

export default LineCallback;