import React, { useState, useEffect } from 'react';
import { Trans } from '@lingui/react/macro';
import { I18n } from '@lingui/core';
import { useAuth } from '../context/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import ProfileSidebar from '../components/ProfileSidebar';
import '../css/Profile.css';
import { API_URL } from '../context/envConfig';
<<<<<<< HEAD
import { DateTime } from 'luxon';
import { i18n } from '@lingui/core';

// --- Environment Variables ---
const NODE_API = API_URL;
const LINE_CLIENT_ID = import.meta.env.VITE_LINE_CLIENT_ID;
const LINE_REDIRECT_URI = import.meta.env.VITE_LINE_REDIRECT_URI;
const VITE_LINE_API_URL = import.meta.env.VITE_LINE_PY_URL || '';

// --- Helpers ---
const _buildHeaders = (token, isJson = true) => {
    const h = isJson ? { 'Content-Type': 'application/json' } : {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
};

// Backwards-compatible alias used elsewhere in this file
const buildHeaders = _buildHeaders;

const _toggle = (setter) => setter((prev) => !prev);

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
            const payload = await res.json().catch(() => null);
            if (!payload) return;
            // Normalize API responses: some endpoints return { success, data: { user } }
            // while others may return the user object directly. Prefer inner user when present.
            const profileObj = (payload.data && payload.data.user) || payload.data || payload.user || payload;
            setUser(profileObj);
        } catch (e) {
            console.warn('Profile refresh failed', e);
        }
    };

    // Listen for external requests to refresh the profile once
    useEffect(() => {
        const handler = () => { refreshProfile(); };
        window.addEventListener('profile:refresh', handler);
        return () => window.removeEventListener('profile:refresh', handler);
    }, [token]);

    // --- UPDATED LOGIC USING loginMethod ---
    // We assume user.loginMethod is either 'line' or 'mail' (or 'email')
    const loginMethod = (user?.loginMethod || '').toLowerCase();
    const isLineUser = user?.hasLineid;
    
    // Password Logic:
    // 1. Password Empty? (null or empty string)
    const isHasPassword = user?.hasPassword;
    
    // 2. Has Email?
    const hasEmail = !!user?.email && user.email !== '';

    // Can Change: If you have an email AND the password is NOT empty.
    const canChangePassword = hasEmail && isHasPassword;

    // Can Add: If you have an email BUT password IS empty.
    const canAddPassword = hasEmail && !isHasPassword;

    console.log({ loginMethod, isLineUser, isHasPassword, hasEmail, canChangePassword, canAddPassword });

    // --- State ---
    const [editMode, setEditMode] = useState(false);
    const [showPasswordForm, setShowPasswordForm] = useState(false);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        username: user?.username || '',
        email: user?.email || '',
        timeZone: user?.timeZone || user?.timezone || user?.time_zone || '',
        sendOption: user?.sentOption || (user?.hasLineid ? 'both' : 'mail')
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
            const res = await fetch(`${NODE_API}/node/users/profile`, {
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
            form.append('file', file);

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
                method: 'PATCH',
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

const GeneralSection = ({ user, formData, _setFormData, editMode, setEditMode, status, handleUpdateProfile, handleInput, loading, resolvedAvatar, handleAvatarUpload, handleAvatarDelete, _logout, _navigate }) => (
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
                    <h2><Trans>Profile Information</Trans></h2>
                    <button className="btn btn-toggle" onClick={() => setEditMode(!editMode)}><Trans>{editMode ? 'Cancel' : 'Edit'}</Trans></button>
                </div>
                <form onSubmit={handleUpdateProfile} className={`profile-form ${editMode ? 'edit-mode' : ''}`}>
                    <FormRow label={<Trans>Full Name</Trans>} name="name" disabled={!editMode} value={formData.name} onChange={handleInput} />
                    <FormRow label={<Trans>Username</Trans>} name="username" disabled={!editMode} value={formData.username} onChange={handleInput} />
                    <FormRow label={<Trans>Email</Trans>} name="email" type="email" disabled={!editMode} value={formData.email} onChange={handleInput} placeholder={(user?.loginMethod || '').toLowerCase() === 'line' ? 'Add your email to enable password login' : 'your.email@example.com'} />

                    {editMode ? (
                        <>
                        <FormRow
                            label={<Trans>Timezone</Trans>}
                            name="timeZone"
                            type="select"
                            disabled={!editMode}
                            value={formData.timeZone}
                            onChange={handleInput}
                            options={TIMEZONES}
                        />
                        <div className="form-group">
                            <label>Send Option</label>
                            <select className="form-input" name="sendOption" value={formData.sendOption || ''} onChange={handleInput}>
                                <option value="mail">Email only</option>
                                <option value="line" disabled={!(user?.hasLineid || user?.lineid)}>LINE only{!(user?.hasLineid || user?.lineid) ? ' (connect LINE to enable)' : ''}</option>
                                <option value="both" disabled={!((user?.hasLineid || user?.lineid) && !!user?.email)}>{(user?.hasLineid || user?.lineid) && user?.email ? 'Both (Email + LINE)' : 'Both (requires Email + LINE)'}</option>
                            </select>
                        </div>
                        </>
                    ) : (
                        <div className="form-group">
                            <label><Trans>Timezone</Trans></label>
                            <div className="form-input readonly">{user?.timeZone || user?.timezone || formData.timeZone || 'Not set'}</div>
                            <label style={{ marginTop: 8 }}><Trans>Send Option</Trans></label>
                            <div className="form-input readonly">{(user && (user.sentOption || formData.sendOption)) || (user?.hasLineid ? 'both' : 'mail')}</div>
                        </div>
                    )}
                    {editMode && <button type="submit" className="btn btn-primary btn-submit" disabled={loading.saving}><Trans>{loading.saving ? 'Saving…' : 'Save Changes'}</Trans></button>}
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
                        <h2><Trans>Password Management</Trans></h2>
                        <button className="btn btn-toggle" onClick={() => setShowPasswordForm(!showPasswordForm)}>
                            <Trans>{showPasswordForm ? 'Cancel' : (canAddPassword ? 'Add Password' : 'Change Password')}</Trans>
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
                    <h2><Trans>LINE Integration</Trans></h2>
                    <div className="service-card">
                        <div className="service-info"><h3><Trans>LINE</Trans></h3><p><Trans>Connect your LINE account for easier login</Trans></p></div>
                        <button className="btn btn-line" onClick={handleLineIntegration}><Trans>Connect LINE</Trans></button>
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

const NotificationsSection = () => {
    const { token, user } = useAuth();
    const [jobId, setJobId] = useState('');
    const [time, setTime] = useState('09:00');
    const [repeat, setRepeat] = useState('daily');
    const [customDays, setCustomDays] = useState([]);
    const [rangeDays, setRangeDays] = useState('');
    
    const [statusMsg, setStatusMsg] = useState('');
    const [loadingCron, setLoadingCron] = useState(false);
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const toggleCustomDay = (d) => {
        setCustomDays((prev) => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
    };

    const resolveUserTimezone = () => user?.timeZone || user?.timezone || 'UTC';

    const buildCron = async () => {
        // time is HH:MM
        const [hh, mm] = (time || '09:00').split(':');
        const baseMinute = parseInt(mm || '0', 10);
        const baseHour = parseInt(hh || '0', 10);

        // Convert selected local time to UTC so cron fires at the intended user time
        let minute = baseMinute;
        let hour = baseHour;
        const tz = resolveUserTimezone();
        try {
            // Dynamically import luxon only when building cron expressions
            const mod = await import('luxon');
            const DateTime = mod.DateTime;
            const local = DateTime.fromObject({ hour: baseHour, minute: baseMinute }, { zone: tz || 'UTC' });
            if (local.isValid) {
                const utc = local.toUTC();
                minute = utc.minute;
                hour = utc.hour;
            }
        } catch (err) {
            minute = baseMinute;
            hour = baseHour;
        }
        let dow = '*';
        if (repeat === 'daily') dow = '*';
        else if (repeat === 'weekdays') dow = 'mon-fri';
        else if (repeat === 'weekends') dow = 'sat,sun';
        else if (repeat === 'custom') {
            dow = customDays.length ? customDays.join(',') : '*';
        }
        // cron: minute hour day month day_of_week
        return `${minute} ${hour} * * ${dow}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatusMsg('');
        if (!user || !user.id) return setStatusMsg('User not available');

        const cronExpression = await buildCron();

        setLoadingCron(true);
        try {
            const payload = {
                user_id: user.id,
                job_id: jobId || `cron-${user.id}-${Date.now()}`,
                cron_expression: cronExpression
            };
            // include send option (mail | line | both) sourced from profile/user
            payload.send_option = user?.sentOption || (user?.hasLineid ? 'both' : 'mail');
            // include range_days when provided and valid
            const rd = parseInt(rangeDays, 10);
            if (!Number.isNaN(rd) && rd > 0) payload.range_days = rd;

            const res = await fetch(`${VITE_LINE_API_URL}/py/cron/schedule`, {
                method: 'POST',
                headers: _buildHeaders(token),
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.error || (data.message) || 'Failed to schedule job');

            setStatusMsg('Scheduled successfully');
            setJobId('');
            // notify parent to reload profile/section once
            try { window.dispatchEvent(new Event('profile:refresh')); } catch(e) { /* noop */ }
            // refresh jobs list and wait so UI updates immediately
            try { await fetchJobs(); } catch (e) { /* noop */ }
        } catch (err) {
            setStatusMsg(err.message || 'Error scheduling job');
        } finally {
            setLoadingCron(false);
        }
    };

    const cronPreview = buildCron();

    const fetchJobs = async () => {
        if (!token || !user?.id) return;
        setLoadingJobs(true);
        try {
            const res = await fetch(`${VITE_LINE_API_URL}/py/cron/jobs?user_id=${encodeURIComponent(user.id)}`, {
                method: 'GET',
                headers: _buildHeaders(token)
            });
            const data = await res.json().catch(() => []);
            if (!res.ok) throw new Error(data.detail || data.error || 'Failed to fetch jobs');
            setJobs(Array.isArray(data) ? data : (data.jobs || []));
        } catch (err) {
            setStatusMsg(err.message || 'Error fetching jobs');
        } finally {
            setLoadingJobs(false);
        }
    };

    // No-op: send option is stored in `formData.sendOption` and persisted via Profile update

    // Fetch jobs on mount or when user/token changes so existing jobs are shown immediately
    useEffect(() => {
        fetchJobs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, user?.id]);

    const cancelJob = async (id) => {
        if (!id) return;
        setStatusMsg('');
        try {
            const res = await fetch(`${VITE_LINE_API_URL}/py/cron/cancel/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: _buildHeaders(token)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.error || 'Failed to cancel job');
            setStatusMsg('Canceled successfully');
            fetchJobs();
        } catch (err) {
            setStatusMsg(err.message || 'Error cancelling job');
        }
    };

    return (
        <div className="profile-container">
            <div className="profile-content">
                <div className="profile-section">
                    <h2><Trans>Notifications</Trans></h2>
                    <p style={{ color: 'var(--text-secondary)' }}><Trans>Create a scheduled summary — choose day(s) and time, we'll convert to cron.</Trans></p>

                    <form className="profile-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label><Trans>Job ID (optional)</Trans></label>
                            <input className="form-input" value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="daily-summary-<user>" />
                        </div>

                        <div className="form-group">
                            <label><Trans>Time</Trans></label>
                            <input className="form-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                        </div>

                        <div className="form-group">
                            <label><Trans>Repeat</Trans></label>
                            <select className="form-input" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                                <option value="daily"><Trans>Every day</Trans></option>
                                <option value="weekdays"><Trans>Weekdays (Mon–Fri)</Trans></option>
                                <option value="weekends"><Trans>Weekends (Sat, Sun)</Trans></option>
                                <option value="custom"><Trans>Custom days</Trans></option>
                            </select>
                        </div>

                        {repeat === 'custom' && (
                            <div className="form-group">
                                <label><Trans>Days</Trans></label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center' }}>
                                    {DAYS.map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => toggleCustomDay(d)}
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: 6,
                                                border: '1px solid rgba(0,0,0,0.08)',
                                                background: customDays.includes(d) ? 'var(--primary, #007bff)' : 'transparent',
                                                color: customDays.includes(d) ? '#fff' : 'var(--text-secondary, #333)',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {d.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label><Trans>Summary range (days) — optional</Trans></label>
                            <input className="form-input" type="number" min={1} value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} placeholder="e.g. 7" />
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 6 }}><Trans>If set, this overrides default period and controls how many days of data are included in the summary.</Trans></div>
                        </div>

                        {/* Send option moved to Profile Information section */}

                        {/* Cron preview intentionally hidden in schedule UI */}

                        <div className="form-group">
                            <label><Trans>Existing jobs</Trans></label>
                            <div style={{ minHeight: 40 }}>
                                {loadingJobs ? <Trans>Loading…</Trans> : (
                                    jobs.length ? (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                            {jobs.map(j => {
                                                const jid = j.job_id || j.id || j.name || j._id || '';
                                                const expr = j.cron_expression || j.cron || j.trigger || j.schedule || '';
                                                const jobRange = j.range_days || (Array.isArray(j.args) ? j.args[2] : undefined) || (j.kwargs && j.kwargs.range_days) || '';

                                                // Determine next run time (backend provides `next_run_time` when available)
                                                const nextRunRaw = j.next_run_time || j.nextRunTime || j.nextRun || null;

                                                const formatNextRun = (dateStr, tz) => {
                                                    if (!dateStr) return null;
                                                    let d = new Date(dateStr);
                                                    if (isNaN(d.getTime())) {
                                                        const iso = dateStr.replace(' ', 'T');
                                                        d = new Date(iso);
                                                    }
                                                    if (isNaN(d.getTime())) return dateStr;
                                                    try {
                                                        return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz || 'UTC', hour12: false }).format(d);
                                                    } catch (e) {
                                                        return d.toString();
                                                    }
                                                };

                                                const nextRun = formatNextRun(nextRunRaw, user?.timeZone || user?.timezone || 'UTC');

                                                return (
                                                    <li key={jid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                        <div style={{ fontSize: '0.9rem' }}>
                                                            <div style={{ fontWeight: 600 }}>{jid}</div>
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{expr}</div>
                                                            {nextRun ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}><Trans>Next run:</Trans> {nextRun} ({user?.timeZone || user?.timezone || 'UTC'})</div> : null}
                                                            {jobRange ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}><Trans>Range: {String(jobRange)} days</Trans></div> : null}
                                                        </div>
                                                        <div>
                                                            <button type="button" className="btn btn-outline" onClick={() => cancelJob(jid)}><Trans>Cancel</Trans></button>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : <div style={{ color: 'var(--text-secondary)' }}><Trans>No scheduled jobs</Trans></div>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <button className="btn btn-write" type="submit" disabled={loadingCron}>{loadingCron ? <Trans>Scheduling…</Trans> : <Trans>Schedule</Trans>}</button>
                        </div>

                        {statusMsg && <div className="message" style={{ marginTop: 8 }}>{statusMsg}</div>}
                    </form>
                </div>
            </div>
        </div>
    );
};

const AppearanceSection = () => (
    <div className="profile-container">
        <div className="profile-content">
            <div className="profile-section">
                <h2><Trans>Appearance</Trans></h2>
                <p style={{ color: 'var(--text-secondary)' }}><Trans>Toggle dark mode from the navbar.</Trans></p>
            </div>
        </div>
    </div>
);

export default Profile;