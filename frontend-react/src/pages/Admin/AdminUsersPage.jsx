import React, { useState, useCallback } from 'react';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import { useAuth } from '../../context/useAuth';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import GenericModal from '../../components/GenericModal/GenericModal';
import DropdownSelect from '../../components/DropdownSelect/DropdownSelect';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const modalButtonStyles = {
  primary: { background: 'linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)', color: '#fff', border: 'none' },
  danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
};

export default function AdminUsersPage() {
  const [form, setForm] = useState({ _id: null, email: '', username: '', name: '', role: 'user', password: '', confirm: '' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rowActions, setRowActions] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setForm({ _id: null, email: '', username: '', name: '', role: 'user', password: '', confirm: '' });
    setEditing(null);
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="email"]'); if (input) input.focus(); }, 120);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({ _id: item._id || item.id || null, email: item.email || '', username: item.username || '', name: item.name || '', role: item.role || 'user' });
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="email"]'); if (input) input.focus(); }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.email || !form.email.trim()) { await Swal.fire({ icon: 'warning', title: 'Required', text: 'Email is required' }); return; }
    if (!form.password || form.password.length < 6) { await Swal.fire({ icon: 'warning', title: 'Validation', text: 'Password must be at least 6 characters' }); return; }
    if (form.password !== form.confirm) { await Swal.fire({ icon: 'warning', title: 'Validation', text: 'Passwords do not match' }); return; }
    try {
      setLoading(true);
      const payload = { email: form.email, username: form.username || '', name: form.name || '', role: form.role || 'user', password: form.password };
      const res = await fetch(`${API_BASE}/node/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Created', timer: 1200 });
      setModalOpen(false);
    } catch (err) {
      console.error('Create user error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Create failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) { await Swal.fire({ icon: 'warning', title: 'Error', text: 'Invalid edit target' }); return; }
    try {
      setLoading(true);
      const id = editing._id || editing.id;
      const payload = { email: form.email, username: form.username || '', name: form.name || '', role: form.role || 'user' };
      const res = await fetch(`${API_BASE}/node/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Updated', timer: 1200 });
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Update user error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Update failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: 'Delete', text: `Delete user ${id}?`, showCancelButton: true, confirmButtonText: 'Delete' });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Deleted', timer: 1200 });
    } catch (err) {
      console.error('Delete user error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete failed: ' + err.message });
    }
  }

  async function save(e) { if (editing && (editing._id || editing.id)) await saveEdit(e); else await handleAdd(e); }

  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ password: '', confirm: '' });
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const { token } = useAuth();

  const renderRow = useCallback(({ row }) => (
    <tr key={row._id || row.id} onClick={() => openRowActions(row)} style={{ cursor: 'pointer' }}>
      <td className="col-email">{row.email || '-'}</td>
      <td className="col-username">{row.username || '-'}</td>
      <td className="company">{row.name || '-'}</td>
      <td className="col-status"><span className={`badge ${String(row.role || 'user').toLowerCase() === 'admin' ? 'role-admin' : 'role-user'}`}>{(row.role || 'user')}</span></td>
    </tr>
  ), []);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Users Management</h2>
          <p className="admin-subtitle">Manage application users.</p>
        </div>
        <div className="admin-actions" />
      </div>

      <FlexTable
        columns={[
          { key: 'email', label: 'Email', sortable: true, width: '260px' },
          { key: 'username', label: 'Username', sortable: true, width: '160px' },
          { key: 'name', label: 'Name', sortable: true, width: '220px' },
          { key: 'role', label: 'Role', sortable: true, width: '120px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText="No users found."
        fetchUrl={`${API_BASE}/node/users`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
        onCreate={openCreate}
        createLabel="+ Create"
      />

      <GenericModal isOpen={modalOpen} title={editing ? 'Edit User' : 'Create User'} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={save} saveLabel={editing ? 'Save' : 'Create'}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label className="form-field"><span>Email</span><input name="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} placeholder="user@example.com" /></label>
          <label className="form-field"><span>Username</span><input name="username" value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} placeholder="jdoe" /></label>
          <label className="form-field"><span>Name</span><input name="name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="John Doe" /></label>
          {!editing && (
            <>
              <label className="form-field"><span>Password</span><input name="password" type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} placeholder="At least 6 characters" /></label>
              <label className="form-field"><span>Confirm</span><input name="confirm" type="password" value={form.confirm} onChange={(e) => setForm((s) => ({ ...s, confirm: e.target.value }))} placeholder="Confirm password" /></label>
            </>
          )}
          <label className="form-field"><span>Role</span><DropdownSelect className="select-input" value={form.role} onChange={(v) => setForm((s) => ({ ...s, role: v }))} options={ROLE_OPTIONS} /></label>
        </div>
        {editing && (
          <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setChangePwdOpen(true)}>Change password</button>
          </div>
        )}
      </GenericModal>

      <GenericModal isOpen={changePwdOpen} title="Change Password" onClose={() => { setChangePwdOpen(false); setPwdForm({ password: '', confirm: '' }); }} onSave={async () => {
        if (!editing || !(editing._id || editing.id)) { await Swal.fire({ icon: 'warning', title: 'Error', text: 'No user selected' }); return; }
        if (!pwdForm.password || pwdForm.password.length < 6) { await Swal.fire({ icon: 'warning', title: 'Validation', text: 'Password must be at least 6 characters' }); return; }
        if (pwdForm.password !== pwdForm.confirm) { await Swal.fire({ icon: 'warning', title: 'Validation', text: 'Passwords do not match' }); return; }
          try {
          setChangePwdLoading(true);
          const id = editing._id || editing.id;
          // Admin change password: call admin endpoint with newPassword (include auth)
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`${API_BASE}/node/users/${id}/change-password`, { method: 'PUT', headers, body: JSON.stringify({ newPassword: pwdForm.password }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Change password failed');
          await Swal.fire({ icon: 'success', title: 'Password changed', timer: 1200 });
          setChangePwdOpen(false);
          setPwdForm({ password: '', confirm: '' });
        } catch (err) {
          console.error('Change password error', err);
          await Swal.fire({ icon: 'error', title: 'Error', text: 'Change password failed: ' + err.message });
        } finally { setChangePwdLoading(false); }
      }} saveLabel={changePwdLoading ? 'Changing...' : 'Change'}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
          <label className="form-field"><span>New password</span><input type="password" value={pwdForm.password} onChange={(e) => setPwdForm((s) => ({ ...s, password: e.target.value }))} placeholder="Enter new password" /></label>
          <label className="form-field"><span>Confirm password</span><input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm((s) => ({ ...s, confirm: e.target.value }))} placeholder="Confirm new password" /></label>
        </div>
      </GenericModal>

      <GenericModal isOpen={!!rowActions} title="Actions" onClose={closeRowActions}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={modalButtonStyles.primary} className="btn btn-small btn-primary" onClick={() => { startEdit(rowActions); closeRowActions(); }}>Edit</button>
          <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}>Delete</button>
        </div>
      </GenericModal>
    </main>
  );
}
