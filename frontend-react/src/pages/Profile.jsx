import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import ProfileSidebar from '../components/ProfileSidebar';
import '../css/Profile.css';
import { API_URL } from '../context/envConfig';

// --- Environment Variables ---
const NODE_API = API_URL;
const LINE_CLIENT_ID = import.meta.env.VITE_LINE_CLIENT_ID;
const LINE_REDIRECT_URI = import.meta.env.VITE_LINE_REDIRECT_URI;

// --- Helpers ---
const buildHeaders = (token, isJson = true) => {
    const h = isJson ? { 'Content-Type': 'application/json' } : {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
};

const toggle = (setter) => setter((prev) => !prev);

// Common timezone presets — extend as needed
const TIMEZONES = [
    'UTC',
    'Asia/Tokyo',
    'Asia/Bangkok',
    'Asia/Hong_Kong',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles'
];
const Profile = () => {
    const { user, logout, token, setUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Get current section from URL query parameter
    const currentSection = new URLSearchParams(location.search).get('section') || 'general';

    const syncUser = (updates) => {
        if (!setUser) return;
        setUser((prev) => ({ ...prev, ...updates }));
    };

    const refreshProfile = async () => {
        if (!token) return;
        try {
            let res = await fetch(`${NODE_API}/node/users/profile`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                res = await fetch(`${LINE_CLIENT_ID ? import.meta.env.VITE_LINE_API_URL || '' : ''}/profile`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => res);
            }
            if (!res.ok) return;
            const profile = await res.json().catch(() => null);
            if (profile) setUser(profile);
        } catch (e) {
            console.warn('Profile refresh failed', e);
        }
    };

    // --- UPDATED LOGIC USING loginMethod ---
    // We assume user.loginMethod is either 'line' or 'mail' (or 'email')
    const loginMethod = (user?.loginMethod || '').toLowerCase();
    const isLineUser = loginMethod === 'line';
    
    // Password Logic:
    // 1. Password Empty? (null or empty string)
    const isPasswordEmpty = user?.password === null || user?.password === '';
    
    // 2. Has Email?
    const hasEmail = !!user?.email && user.email !== '';

    // Can Change: If you have an email AND the password is NOT empty.
    const canChangePassword = hasEmail && !isPasswordEmpty;

    // Can Add: If you have an email BUT password IS empty.
    const canAddPassword = hasEmail && isPasswordEmpty;

    // --- State ---
    const [editMode, setEditMode] = useState(false);
    const [showPasswordForm, setShowPasswordForm] = useState(false);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        username: user?.username || '',
        email: user?.email || '',
        timeZone: user?.timeZone || user?.timezone || user?.time_zone || ''
    });
    const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const [status, setStatus] = useState({ error: '', success: '' });
    const [loading, setLoading] = useState({ saving: false, avatarUploading: false });

    const avatarUrl = user?.pictureUrl || user?.avatar;
    const resolvedAvatar = avatarUrl?.startsWith('/') ? `${API_URL}${avatarUrl}` : avatarUrl;

    useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);

    useEffect(() => {
        if (!editMode && user) setFormData({
            name: user.name || '',
            username: user.username || '',
            email: user.email || '',
            timeZone: user.timeZone || user.timezone || user.time_zone || ''
        });
    }, [user, editMode]);

    const updateStatus = (error = '', success = '') => setStatus({ error, success });

    const handleInput = (e) => { setFormData((f) => ({ ...f, [e.target.name]: e.target.value })); updateStatus(); };
    const handlePasswordInput = (e) => { setPasswordData((p) => ({ ...p, [e.target.name]: e.target.value })); updateStatus(); };

    // --- Profile Update ---
    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        updateStatus();
        if (!user?.id) return updateStatus('Error: User ID is missing for update.');
        
        setLoading(l => ({ ...l, saving: true }));
        try {
            const res = await fetch(`${NODE_API}/node/users/${user.id}`, {
                method: 'PUT',
                headers: buildHeaders(token),
                body: JSON.stringify(formData)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                if (data.error === "User not found") throw new Error("User session invalid. Please log in again.");
                throw new Error(data.error || 'Update failed');
            }

            updateStatus('', 'Profile updated successfully!');
            setEditMode(false);

            if (data.data || data.user) {
                syncUser(data.data || data.user);
                // Ensure local user object has the updated timeZone immediately
                if (formData.timeZone) syncUser({ timeZone: formData.timeZone });
                await refreshProfile();
            } else {
                // If server didn't return a user object, still update local timeZone
                if (formData.timeZone) syncUser({ timeZone: formData.timeZone });
            }
        } catch (err) {
            updateStatus(err.message || 'Failed to update profile');
        } finally {
            setLoading(l => ({ ...l, saving: false }));
        }
    };

    // --- Avatar Logic ---
    const handleAvatarUpload = async (e) => {
        const file = e?.target?.files?.[0];
        updateStatus();
        if (!file || !token) return;

        setLoading((l) => ({ ...l, avatarUploading: true }));
        try {
            const form = new FormData();
            form.append('avatar', file);

            const res = await fetch(`${NODE_API}/node/users/profile/avatar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to upload avatar');

            const nextUrl = data.pictureUrl || data.avatar || data.url || null;
            if (nextUrl) syncUser({ pictureUrl: nextUrl, avatar: nextUrl });

            updateStatus('', 'Avatar updated successfully');
        } catch (err) {
            updateStatus(err.message);
        } finally {
            setLoading((l) => ({ ...l, avatarUploading: false }));
            if (e?.target) e.target.value = '';
        }
    };

    const handleAvatarDelete = async () => {
        updateStatus();
        if (!token) return;

        setLoading((l) => ({ ...l, avatarUploading: true }));
        try {
            const res = await fetch(`${NODE_API}/node/users/profile/avatar`, {
                method: 'DELETE',
                headers: buildHeaders(token, false),
            });
            if (!res.ok) throw new Error('Failed to delete avatar');

            syncUser({ pictureUrl: null, avatar: null });
            updateStatus('', 'Avatar removed');
        } catch (err) {
            updateStatus(err.message);
        } finally {
            setLoading((l) => ({ ...l, avatarUploading: false }));
        }
    };

    // --- Password Update ---
    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        updateStatus();

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            return updateStatus('New password and confirmation do not match.');
        }
        if (!passwordData.newPassword || passwordData.newPassword.length < 6) {
            return updateStatus('Password must be at least 6 characters.');
        }

        const endpoint = canAddPassword
            ? `${NODE_API}/node/users/add-password`
            : `${NODE_API}/node/users/change-password`;

        const payload = {
            userId: user.id,
            newPassword: passwordData.newPassword,
            ...(canChangePassword && { currentPassword: passwordData.currentPassword })
        };

        setLoading((l) => ({ ...l, saving: true }));
        try {
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: buildHeaders(token),
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to update password');

            updateStatus('', canAddPassword ? 'Password added successfully' : 'Password updated successfully');
            setShowPasswordForm(false);
            
            // If they added a password, update local state (dummy 'set' string) so UI switches to "Change"
            if (canAddPassword) syncUser({ password: 'set' });

            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            updateStatus(err.message);
        } finally {
            setLoading((l) => ({ ...l, saving: false }));
        }
    };

    // --- LINE Integration ---
    const handleLineIntegration = () => {
        if (!LINE_CLIENT_ID || !LINE_REDIRECT_URI) return updateStatus("LINE config missing.");
        const state = `integrate-${user.id}-${Math.random().toString(36).slice(2)}`;
        window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINE_REDIRECT_URI)}&state=${state}&scope=openid%20profile`;
    };

    if (!user) return null;

    return (
        <div className="profile-layout">
            <div className="profile-sidebar-wrapper">
                <ProfileSidebar />
            </div>
            <div className="profile-main-content">
                {currentSection === 'general' && <GeneralSection user={user} formData={formData} setFormData={setFormData} editMode={editMode} setEditMode={setEditMode} status={status} handleUpdateProfile={handleUpdateProfile} handleInput={handleInput} loading={loading} resolvedAvatar={resolvedAvatar} handleAvatarUpload={handleAvatarUpload} handleAvatarDelete={handleAvatarDelete} logout={logout} navigate={navigate} />}
                {currentSection === 'security' && (canChangePassword || canAddPassword) && <SecuritySection user={user} canChangePassword={canChangePassword} canAddPassword={canAddPassword} isLineUser={isLineUser} showPasswordForm={showPasswordForm} setShowPasswordForm={setShowPasswordForm} passwordData={passwordData} handlePasswordInput={handlePasswordInput} handleUpdatePassword={handleUpdatePassword} loading={loading} status={status} />}
                {currentSection === 'connected' && <ConnectedServicesSection isLineUser={isLineUser} handleLineIntegration={handleLineIntegration} />}
                {currentSection === 'notifications' && <NotificationsSection />}
                {currentSection === 'appearance' && <AppearanceSection />}
            </div>
        </div>
    );
};

const FormRow = ({ label, name, value, onChange, type = 'text', disabled, placeholder, options = [] }) => (
    <div className="form-group">
        <label>{label}</label>
        {type === 'select' ? (
            <select name={name} value={value} disabled={disabled} onChange={onChange} className="form-input">
                <option value="">Select timezone</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        ) : (
            <input type={type} name={name} value={value} disabled={disabled} onChange={onChange} placeholder={placeholder} className="form-input" />
        )}
    </div>
);

const PasswordForm = ({ passwordData, onChange, onSubmit, loading, isAdding }) => (
    <form onSubmit={onSubmit} className="profile-form edit-mode">
        {!isAdding && <FormRow label="Current Password" name="currentPassword" type="password" value={passwordData.currentPassword} onChange={onChange} />}
        <FormRow label="New Password" name="newPassword" type="password" value={passwordData.newPassword} onChange={onChange} />
        <FormRow label="Confirm Password" name="confirmPassword" type="password" value={passwordData.confirmPassword} onChange={onChange} />
        <button type="submit" className="btn btn-primary btn-submit" disabled={loading}>{loading ? 'Updating…' : (isAdding ? 'Add Password' : 'Update Password')}</button>
    </form>
);

const GeneralSection = ({ user, formData, setFormData, editMode, setEditMode, status, handleUpdateProfile, handleInput, loading, resolvedAvatar, handleAvatarUpload, handleAvatarDelete, logout, navigate }) => (
    <div className="profile-container">
        <div className="profile-content">
            <div className="profile-header">
                <div className="profile-avatar-section">
                    {resolvedAvatar ? <img src={resolvedAvatar} alt="Profile" className="profile-avatar" /> : <div className="profile-avatar-placeholder">{(user.name || 'U')[0]}</div>}
                    <div className="avatar-actions">
                        <label className="btn btn-outline">
                            {loading.avatarUploading ? 'Uploading…' : 'Upload Avatar'}
                            <input type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
                        </label>
                        {resolvedAvatar && <button className="btn btn-outline" onClick={handleAvatarDelete}>Remove</button>}
                    </div>
                </div>
                <div className="profile-greeting">
                    <h1>{user.name || user.username || 'User'}</h1>
                    <p className="login-method">
                        {(user?.loginMethod || '').toLowerCase() === 'line' ? (
                            <span className="badge badge-line">Logged in with LINE</span>
                        ) : (
                            <span className="badge badge-email">Logged in with Email</span>
                        )}
                    </p>
                </div>
            </div>

            {status.error && <div className="message message-error">{status.error}</div>}
            {status.success && <div className="message message-success">{status.success}</div>}

            <div className="profile-section">
                <div className="section-header">
                    <h2>Profile Information</h2>
                    <button className="btn btn-toggle" onClick={() => setEditMode(!editMode)}>{editMode ? 'Cancel' : 'Edit'}</button>
                </div>
                <form onSubmit={handleUpdateProfile} className={`profile-form ${editMode ? 'edit-mode' : ''}`}>
                    <FormRow label="Full Name" name="name" disabled={!editMode} value={formData.name} onChange={handleInput} />
                    <FormRow label="Username" name="username" disabled={!editMode} value={formData.username} onChange={handleInput} />
                    <FormRow label="Email" name="email" type="email" disabled={!editMode} value={formData.email} onChange={handleInput} placeholder={(user?.loginMethod || '').toLowerCase() === 'line' ? 'Add your email to enable password login' : 'your.email@example.com'} />

                    {editMode ? (
                        <FormRow
                            label="Timezone"
                            name="timeZone"
                            type="select"
                            disabled={!editMode}
                            value={formData.timeZone}
                            onChange={handleInput}
                            options={TIMEZONES}
                        />
                    ) : (
                        <div className="form-group">
                            <label>Timezone</label>
                            <div className="form-input readonly">{user?.timeZone || user?.timezone || formData.timeZone || 'Not set'}</div>
                        </div>
                    )}
                    {editMode && <button type="submit" className="btn btn-primary btn-submit" disabled={loading.saving}>{loading.saving ? 'Saving…' : 'Save Changes'}</button>}
                </form>
            </div>
        </div>
    </div>
);

const SecuritySection = ({ user, canChangePassword, canAddPassword, isLineUser, showPasswordForm, setShowPasswordForm, passwordData, handlePasswordInput, handleUpdatePassword, loading, status }) => (
    <div className="profile-container">
        <div className="profile-content">
            {status.error && <div className="message message-error">{status.error}</div>}
            {status.success && <div className="message message-success">{status.success}</div>}
            
            {(canChangePassword || canAddPassword) && (
                <div className="profile-section">
                    <div className="section-header">
                        <h2>Password Management</h2>
                        <button className="btn btn-toggle" onClick={() => setShowPasswordForm(!showPasswordForm)}>
                            {showPasswordForm ? 'Cancel' : (canAddPassword ? 'Add Password' : 'Change Password')}
                        </button>
                    </div>
                    {showPasswordForm && (
                        <PasswordForm
                            passwordData={passwordData}
                            onChange={handlePasswordInput}
                            onSubmit={handleUpdatePassword}
                            loading={loading.saving}
                            isAdding={canAddPassword}
                        />
                    )}
                </div>
            )}
            
            {!canChangePassword && !canAddPassword && isLineUser && (
                <div className="profile-section">
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Please add an email address in General settings above to set a password.
                    </p>
                </div>
            )}
        </div>
    </div>
);

const ConnectedServicesSection = ({ isLineUser, handleLineIntegration }) => (
    <div className="profile-container">
        <div className="profile-content">
            {!isLineUser && (
                <div className="profile-section">
                    <h2>LINE Integration</h2>
                    <div className="service-card">
                        <div className="service-info"><h3>LINE</h3><p>Connect your LINE account for easier login</p></div>
                        <button className="btn btn-line" onClick={handleLineIntegration}>Connect LINE</button>
                    </div>
                </div>
            )}
            {isLineUser && (
                <div className="profile-section">
                    <p style={{ color: 'var(--text-secondary)' }}>Your account is connected with LINE.</p>
                </div>
            )}
        </div>
    </div>
);

const NotificationsSection = () => (
    <div className="profile-container">
        <div className="profile-content">
            <div className="profile-section">
                <h2>Notifications</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Notification preferences coming soon...</p>
            </div>
        </div>
    </div>
);

const AppearanceSection = () => (
    <div className="profile-container">
        <div className="profile-content">
            <div className="profile-section">
                <h2>Appearance</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Toggle dark mode from the navbar. More appearance options coming soon...</p>
            </div>
        </div>
    </div>
);

export default Profile;