import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithCredentials } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await loginWithCredentials(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLineLogin = () => {
    const clientID = "2008465838";
    const redirectURI = "http://localhost:5173/auth/callback";
    const state = Math.random().toString(36).slice(2);
    const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientID}&redirect_uri=${redirectURI}&state=${state}&scope=profile%20openid`;
    window.location.href = lineUrl;
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Sign In</h1>
        <form onSubmit={submit} className="login-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            required
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" className="btn-primary">Sign In</button>
        </form>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <p style={{ marginTop: 12 }}>
          No account? <Link to="/register">Register</Link>
        </p>

        <hr style={{ width: '80%', margin: '16px auto' }} />

        <button onClick={handleLineLogin} className="btn-line">
          Log in with LINE
        </button>
      </div>
    </div>
  );
}
