import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/Auth.css';
import API_BASE from '../config/api';
import Swal from '../utils/muiSwal';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const sendOtp = async () => {
    if (!email) return Swal.fire({ icon: 'warning', title: 'Email required' });
    try {
      const res = await fetch(`${API_BASE}/node/users/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || 'Failed to send OTP');
      await Swal.fire({ icon: 'success', title: 'OTP Sent', text: 'Check your email for the OTP.' });
      setStep(1);
    } catch (err) {
      console.error('Send OTP error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: err.message || String(err) });
    }
  };

  const resetPassword = async () => {
    if (!email || !otp || !newPassword) return Swal.fire({ icon: 'warning', title: 'All fields required' });
    try {
      const res = await fetch(`${API_BASE}/node/users/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp, newPassword }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || 'Reset failed');
      await Swal.fire({ icon: 'success', title: 'Password Reset', text: 'You can now sign in with your new password.' });
      navigate('/login');
    } catch (err) {
      console.error('Reset error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: err.message || String(err) });
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="login-title">Forgot Password</h1>
          <button className="btn btn-ghost" onClick={() => navigate('/login')} style={{ marginLeft: 12 }}>Cancel</button>
        </div>
        {step === 0 ? (
          <div className="login-form">
            <p>Enter the email associated with your account to receive an OTP.</p>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={sendOtp}>Send OTP</button>
            </div>
          </div>
        ) : (
          <div className="login-form">
            <p>Enter the OTP and choose a new password.</p>
            <input type="text" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={resetPassword}>Reset Password</button>
              <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
