import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/Auth.css';
import { useAuth } from '../context/useAuth';

export default function Register() {
    const { registerWithCredentials } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await registerWithCredentials(email, password, name, username);
            navigate('/profile');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1 className="login-title">Register</h1>
                <form onSubmit={submit} className="login-form">
                    <input
                        type="text"
                        placeholder="Full name"
                        value={name}
                        required
                        onChange={e => setName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        required
                        onChange={e => setUsername(e.target.value)}
                    />
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
                    <button type="submit" className="btn-primary">Create account</button>
                </form>

                {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>
        </div>
    );
}