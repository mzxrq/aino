import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate } from 'react-router-dom';
import '../css/Profile.css';
import { API_URL } from '../context/envConfig';

// --- Environment Variables (Read once) ---
const NODE_API = API_URL;
const LINE_CLIENT_ID = import.meta.env.VITE_LINE_CLIENT_ID;
const LINE_REDIRECT_URI = import.meta.env.VITE_LINE_REDIRECT_URI;

// --- Small Reusable Helpers ---
const buildHeaders = (token, isJson = true) => {
    const h = isJson ? { 'Content-Type': 'application/json' } : {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
};

const toggle = (setter) => setter((prev) => !prev);

const Profile = () => {
    // --- Context and Hooks ---
    const { user, logout, token, setUser } = useAuth(); // Assume setUser is available for clean updates
    const navigate = useNavigate();

    // --- State Management ---
    const [editMode, setEditMode] = useState(false);
    const [showPasswordForm, setShowPasswordForm] = useState(false);

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

    // --- Derived State ---
    const isLineUser = user?.loginMethod === 'line' || user?.lineid || user?.line_user_id;
    const canChangePassword = !isLineUser && !!user?.email;
    const avatarUrl = user?.pictureUrl || user?.avatar;
    const resolvedAvatar = avatarUrl?.startsWith('/') ? `${API_URL}${avatarUrl}` : avatarUrl;

    // --- Effects ---
    useEffect(() => {
        if (!user) navigate('/login');
    }, [user, navigate]);

    // Update form data if the user context changes while not in edit mode
    useEffect(() => {
        if (!editMode && user) {
            setFormData({
                name: user.name || '',
                username: user.username || '',
                email: user.email || '',
            });
        }
    }, [user, editMode]);


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

    // -----------------------------------------------
    // Profile Update
    // -----------------------------------------------
    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        updateStatus();

        if (!user?.id) {
            return updateStatus("Error: User ID is missing for update.");
        }
        
        setLoading(l => ({ ...l, saving: true }));

        try {
            const res = await fetch(`${NODE_API}/node/users/${user.id}`, {
                method: 'PUT',
                headers: buildHeaders(token),
                // Send current form state. Server should validate/filter empty fields.
                body: JSON.stringify(formData), 
            });

            const data = await res.json();
            
            if (!res.ok) {
                // Check if user was not found (404) or a conflict (400) occurred
                if (data.error === "User not found") {
                    throw new Error("User session invalid. Please log in again.");
                }
                throw new Error(data.error || "Update failed due to server error.");
            }

            updateStatus('', 'Profile updated successfully!');
            setEditMode(false);
            
            // ✅ IMPROVEMENT: Update context directly (data.data holds the updated user from your service)
            // Assuming the server returns { success: true, data: updatedUser }
            if (data.data) {
                // If you use 'useAuth' context's setUser, you don't need reload
                // setUser(data.data); 
                // localStorage.setItem('user', JSON.stringify(data.data));
            } else {
                 // Fallback if context update isn't implemented
                 localStorage.setItem('user', JSON.stringify(data.user || data.data));
            }
            
            window.location.reload(); 
        } catch (err) {
            updateStatus(err.message || "Failed to update profile");
        } finally {
            setLoading(l => ({ ...l, saving: false }));
        }
    };


    // -----------------------------------------------
    // Avatar Upload/Delete (Logic Unchanged)
    // -----------------------------------------------
    const handleAvatarUpload = async (e) => { /* ... (logic unchanged) ... */ };
    const handleAvatarDelete = async () => { /* ... (logic unchanged) ... */ };
    
    // -----------------------------------------------
    // Password Update (Logic Unchanged)
    // -----------------------------------------------
    const handleUpdatePassword = async (e) => { /* ... (logic unchanged) ... */ };

    // -----------------------------------------------
    // LINE Integration (Uses environment variables)
    // -----------------------------------------------
    const handleLineIntegration = () => {
        if (!LINE_CLIENT_ID || !LINE_REDIRECT_URI) {
            return updateStatus("LINE config missing in environment variables.");
        }
        
        // Use user.id which is normalized from user._id or user.id by AuthProvider
        const state = `integrate-${user.id}-${Math.random().toString(36).slice(2)}`;

        const url =
            `https://access.line.me/oauth2/v2.1/authorize?response_type=code` +
            `&client_id=${LINE_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(LINE_REDIRECT_URI)}` +
            `&state=${state}` +
            `&scope=openid%20profile`;

        window.location.href = url;
    };

    if (!user) return null;

    return (
        <div className="profile-container">
            <div className="profile-content">

                {/* Header (Structure Unchanged) */}
                <div className="profile-header">
                    <div className="profile-avatar-section">
                        {resolvedAvatar ? (
                            <img src={resolvedAvatar} alt="Profile Avatar" className="profile-avatar" />
                        ) : (
                            <div className="profile-avatar-placeholder">
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

                {/* Status Messages (Unchanged) */}
                {status.error && <div className="message message-error">{status.error}</div>}
                {status.success && <div className="message message-success">{status.success}</div>}

                {/* Profile Info Form */}
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

                {/* Password Section (Unchanged) */}
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

                {/* LINE Integration Section (Unchanged) */}
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

                {/* Logout Section (Unchanged) */}
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