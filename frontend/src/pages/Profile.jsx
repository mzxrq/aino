import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const NODE_API_URL = "http://localhost:5050";
  const LINE_API = "http://localhost:5000";

  // State management
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    displayName: user?.displayName || user?.name || '',
    username: user?.username || '',
    email: user?.email || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check if user logged in via LINE (no email or email suggests LINE login)
  const isLineUser = !user?.email || user?.email === 'lineuser@example.com';
  const canChangePassword = !isLineUser; // Only email-registered users can change password

  // Redirect if not logged in
  if (!user) {
    React.useEffect(() => {
      navigate('/login');
    }, [navigate]);
    return null;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const userId = user.userId || user.id;
      
      const response = await fetch(`${NODE_API_URL}/auth/update-profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          userId,
          displayName: formData.displayName,
          username: formData.username,
          email: formData.email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
      setEditMode(false);
      // Update localStorage with new user data
      const updatedUser = {
        ...user,
        displayName: formData.displayName,
        name: formData.displayName,
        username: formData.username,
        email: formData.email,
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const userId = user.userId || user.id;

      const response = await fetch(`${NODE_API_URL}/auth/change-password`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          userId,
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setSuccess('Password changed successfully!');
      setShowPasswordForm(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLineIntegration = async () => {
    // Redirect to LINE login
    const clientId = import.meta.env.VITE_LINE_CLIENT_ID || '2008465838';
    const redirectUri = import.meta.env.VITE_LINE_REDIRECT_URI || 'http://localhost:5173/auth/callback';
    const state = `integrate-${user.userId || user.id}`;
    window.location.href = `https://web.line.biz/web-api/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=profile&state=${state}`;
  };

  return (
    <div className="profile-container">
      <div className="profile-content">
        {/* Profile Header */}
        <div className="profile-header">
          <div className="profile-avatar-section">
            {user.pictureUrl ? (
              <img 
                src={user.pictureUrl} 
                alt="Profile" 
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {(user.displayName || user.name || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="profile-greeting">
            <h1>{user.displayName || user.name}</h1>
            <p className="login-method">
              {isLineUser ? (
                <span className="badge badge-line">Logged in with LINE</span>
              ) : (
                <span className="badge badge-email">Logged in with Email</span>
              )}
            </p>
          </div>
        </div>

        {/* Messages */}
        {error && <div className="message message-error">{error}</div>}
        {success && <div className="message message-success">{success}</div>}

        {/* Profile Edit Section */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Profile Information</h2>
            <button
              className="btn btn-toggle"
              onClick={() => {
                setEditMode(!editMode);
                setError('');
                setSuccess('');
              }}
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          </div>

          <form onSubmit={handleUpdateProfile} className={`profile-form ${editMode ? 'edit-mode' : ''}`}>
            <div className="form-group">
              <label htmlFor="displayName">Full Name</label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                disabled={!editMode}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                disabled={!editMode}
                className="form-input"
                placeholder="Set your username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="email-input-wrapper">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!editMode}
                  className="form-input"
                  placeholder={isLineUser ? 'Add your email' : 'your.email@example.com'}
                />
                {isLineUser && formData.email && (
                  <span className="icon-check">✓</span>
                )}
              </div>
              {isLineUser && !formData.email && (
                <p className="helper-text">Add an email to your account to enable additional features</p>
              )}
            </div>

            {editMode && (
              <button 
                type="submit" 
                className="btn btn-primary btn-submit"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </form>
        </div>

        {/* Password Section - Only for email users */}
        {canChangePassword && (
          <div className="profile-section">
            <div className="section-header">
              <h2>Security</h2>
              <button
                className="btn btn-toggle"
                onClick={() => {
                  setShowPasswordForm(!showPasswordForm);
                  setError('');
                  setSuccess('');
                }}
              >
                {showPasswordForm ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {showPasswordForm && (
              <form onSubmit={handleUpdatePassword} className="profile-form edit-mode">
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="form-input"
                    placeholder="At least 6 characters"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="form-input"
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary btn-submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* LINE Integration Section - Only for email users */}
        {!isLineUser && (
          <div className="profile-section">
            <div className="section-header">
              <h2>Connected Services</h2>
            </div>
            <div className="service-card">
              <div className="service-info">
                <h3>LINE</h3>
                <p>Connect your LINE account for easier notifications and login</p>
              </div>
              <button 
                className="btn btn-line"
                onClick={handleLineIntegration}
              >
                Connect LINE
              </button>
            </div>
          </div>
        )}

        {/* Account Actions */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Account</h2>
          </div>
          <button 
            onClick={() => { 
              logout(); 
              navigate('/login'); 
            }}
            className="btn btn-logout"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;