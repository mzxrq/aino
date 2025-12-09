import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate } from 'react-router-dom';
import '../css/Profile.css';
import { API_URL } from '../context/envConfig';

// Use canonical API_URL from envConfig (provides sensible default)
const NODE_API = API_URL;

// --- Small Reusable Helpers ---
const buildHeaders = (token, isJson = true) => {
  const h = isJson ? { 'Content-Type': 'application/json' } : {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

const toggle = (setter) => setter((prev) => !prev);

const Profile = () => {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  const [editMode, setEditMode] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // REFINEMENT: Simplified formData initialization
  const [formData, setFormData] = useState({
    name: user?.name || '', 
    username: user?.username || '',
    email: user?.email || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [status, setStatus] = useState({ error: '', success: '' });
  const [loading, setLoading] = useState({
    saving: false,
    avatarUploading: false,
  });

  const isLineUser =
    user?.loginMethod === 'line' ||
    user?.lineid ||
    user?.line_user_id;

  const canChangePassword = !isLineUser && !!user?.email;

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const updateStatus = (error = '', success = '') =>
    setStatus({ error, success });

  const handleInput = (e) => {
    setFormData((f) => ({ ...f, [e.target.name]: e.target.value }));
    updateStatus();
  };

  const handlePasswordInput = (e) => {
    setPasswordData((p) => ({ ...p, [e.target.name]: e.target.value }));
    updateStatus();
  };

  const avatarUrl = user?.pictureUrl || user?.avatar;
  const resolvedAvatar = avatarUrl?.startsWith('/')
    ? `${API_URL}${avatarUrl}`
    : avatarUrl;

  // -----------------------------------------------
  // Profile Update
  // -----------------------------------------------
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    updateStatus();
    setLoading(l => ({ ...l, saving: true }));

    try {
      const res = await fetch(`${NODE_API}/node/users/${user.id}`, {
        method: 'PUT',
        // REFINEMENT: Using buildHeaders helper for consistency
        // headers: buildHeaders(token), 
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateStatus('', 'Profile updated successfully!');
      // Assuming 'data.user' contains the updated user object
      localStorage.setItem('user', JSON.stringify(data.user)); 
      setEditMode(false);

      // NOTE: Consider updating the context directly instead of a full reload
      window.location.reload(); 
    } catch (err) {
      updateStatus(err.message || "Failed to update profile");
    } finally {
      setLoading(l => ({ ...l, saving: false }));
    }
  };


  // -----------------------------------------------
  // Avatar Upload/Delete
  // -----------------------------------------------
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    updateStatus();
    setLoading((l) => ({ ...l, avatarUploading: true }));

    try {
      const form = new FormData();
      form.append('avatar', file);

      const res = await fetch(`${NODE_API}/node/users/profile/avatar`, {
        method: 'POST',
        // buildHeaders with isJson=false for FormData
        headers: buildHeaders(token, false), 
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const updated = { ...user, pictureUrl: data.pictureUrl };
      localStorage.setItem('user', JSON.stringify(updated));
      updateStatus('', 'Avatar updated!');
      window.location.reload();
    } catch (err) {
      updateStatus(err.message);
    } finally {
      setLoading((l) => ({ ...l, avatarUploading: false }));
    }
  };

  const handleAvatarDelete = async () => {
    updateStatus();
    setLoading((l) => ({ ...l, avatarUploading: true }));

    try {
      const res = await fetch(`${NODE_API}/node/users/profile/avatar`, {
        method: 'DELETE',
        headers: buildHeaders(token),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to remove avatar');
      }

      const updated = { ...user };
      delete updated.pictureUrl;
      delete updated.avatar;

      localStorage.setItem('user', JSON.stringify(updated));
      updateStatus('', 'Avatar removed');
      window.location.reload();
    } catch (err) {
      updateStatus(err.message);
    } finally {
      setLoading((l) => ({ ...l, avatarUploading: false }));
    }
  };

  // -----------------------------------------------
  // Password Update
  // -----------------------------------------------
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    updateStatus();

    if (passwordData.newPassword !== passwordData.confirmPassword)
      return updateStatus('Passwords do not match');

    if (passwordData.newPassword.length < 6)
      return updateStatus('Password must be at least 6 characters');

    setLoading((l) => ({ ...l, saving: true }));

    try {
      const res = await fetch(`${NODE_API}/node/users/change-password`, {
        method: 'PUT',
        headers: buildHeaders(token),
        body: JSON.stringify({
          // Note: userId is likely redundant if the server uses JWT to identify the user
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateStatus('', 'Password updated!');
      setShowPasswordForm(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      updateStatus(err.message);
    } finally {
      setLoading((l) => ({ ...l, saving: false }));
    }
  };

  // -----------------------------------------------
  // LINE Integration
  // -----------------------------------------------
  const handleLineIntegration = () => {
    const clientId = import.meta.env.VITE_LINE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_LINE_REDIRECT_URI;

    const state = `integrate-${user._id}-${Math.random().toString(36).slice(2)}`;

    const url =
      `https://access.line.me/oauth2/v2.1/authorize?response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=openid%20profile`;

    window.location.href = url;
  };

  if (!user) return null;

  return (
    <div className="profile-container">
      <div className="profile-content">

        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar-section">
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt="Profile Avatar" className="profile-avatar" />
            ) : (
              <div className="profile-avatar-placeholder">
                {/* REFINEMENT: Simplified fallback text */}
                {(user.name || 'U')[0]} 
              </div>
            )}

            <div className="avatar-actions">
              <label className="btn btn-outline">
                {loading.avatarUploading ? 'Uploading…' : 'Upload Avatar'}
                <input type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
              </label>

              {resolvedAvatar && (
                <button
                  className="btn btn-outline"
                  onClick={handleAvatarDelete}
                  disabled={loading.avatarUploading}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="profile-greeting">
            <h1>{user.name || user.username || 'User'}</h1>
            <p className="login-method">
              {isLineUser ? (
                <span className="badge badge-line">Logged in with LINE</span>
              ) : (
                <span className="badge badge-email">Logged in with Email</span>
              )}
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {status.error && <div className="message message-error">{status.error}</div>}
        {status.success && <div className="message message-success">{status.success}</div>}

        {/* Profile Info */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Profile Information</h2>
            <button className="btn btn-toggle" onClick={() => toggle(setEditMode)}>
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          </div>

          <form onSubmit={handleUpdateProfile} className={`profile-form ${editMode ? 'edit-mode' : ''}`}>

            <FormRow
              label="Full Name"
              name="name"
              disabled={!editMode}
              value={formData.name}
              onChange={handleInput}
            />

            <FormRow
              label="Username"
              name="username"
              disabled={!editMode}
              value={formData.username}
              onChange={handleInput}
              placeholder="Set your username"
            />

            <FormRow
              label="Email"
              name="email"
              type="email"
              disabled={!editMode}
              value={formData.email}
              onChange={handleInput}
              placeholder={isLineUser ? 'Add your email' : 'your.email@example.com'}
            />

            {editMode && (
              <button type="submit" className="btn btn-primary btn-submit" disabled={loading.saving}>
                {loading.saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </form>
        </div>

        {/* Password Section */}
        {canChangePassword && (
          <div className="profile-section">
            <div className="section-header">
              <h2>Security</h2>
              <button className="btn btn-toggle" onClick={() => toggle(setShowPasswordForm)}>
                {showPasswordForm ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {showPasswordForm && (
              <PasswordForm
                passwordData={passwordData}
                onChange={handlePasswordInput}
                onSubmit={handleUpdatePassword}
                loading={loading.saving}
              />
            )}
          </div>
        )}

        {/* LINE Integration */}
        {!isLineUser && (
          <div className="profile-section">
            <div className="section-header"><h2>Connected Services</h2></div>
            <div className="service-card">
              <div className="service-info">
                <h3>LINE</h3>
                <p>Connect your LINE account</p>
              </div>
              <button className="btn btn-line" onClick={handleLineIntegration}>
                Connect LINE
              </button>
            </div>
          </div>
        )}

        {/* Logout */}
        <div className="profile-section">
          <div className="section-header"><h2>Account</h2></div>
          <button
            className="btn btn-logout"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------
// Reusable Components (Unchanged)
// ---------------------------------------------------

const FormRow = ({ label, name, value, onChange, type = 'text', disabled, placeholder }) => (
  <div className="form-group">
    <label>{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={placeholder}
      className="form-input"
    />
  </div>
);

const PasswordForm = ({ passwordData, onChange, onSubmit, loading }) => (
  <form onSubmit={onSubmit} className="profile-form edit-mode">
    <FormRow
      label="Current Password"
      name="currentPassword"
      type="password"
      value={passwordData.currentPassword}
      onChange={onChange}
    />

    <FormRow
      label="New Password"
      name="newPassword"
      type="password"
      value={passwordData.newPassword}
      onChange={onChange}
    />

    <FormRow
      label="Confirm Password"
      name="confirmPassword"
      type="password"
      value={passwordData.confirmPassword}
      onChange={onChange}
    />

    <button type="submit" className="btn btn-primary btn-submit" disabled={loading}>
      {loading ? 'Updating…' : 'Update Password'}
    </button>
  </form>
);

export default Profile;