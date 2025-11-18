import React from 'react';
import './Login.css';

export default function Login() {
  
  const handleLineLogin = () => {
    // --- CONFIGURE THIS ---
    const clientID = "2008465838";
    const redirectURI = "http://localhost:5173/auth/callback";
    const state = "12345abcde"; // A random string for security
    
    const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientID}&redirect_uri=${redirectURI}&state=${state}&scope=profile%20openid`;
    
    // Go to LINE to ask for permission
    window.location.href = lineUrl;
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Sign In</h1>
        <p className="login-subtitle">
          Please sign in with your LINE account to continue
          to the Anomaly Detector.
        </p>
        <button onClick={handleLineLogin} className="btn-line">
          Log in with LINE
        </button>
      </div>
    </div>
  );
}