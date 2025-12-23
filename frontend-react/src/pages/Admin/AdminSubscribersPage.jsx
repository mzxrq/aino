import React, { useState, useCallback, useEffect, useContext } from 'react';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import GenericModal from '../../components/GenericModal/GenericModal';
import DropdownSelect from '../../components/DropdownSelect/DropdownSelect';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { AuthContext } from '../../context/contextBase';

const modalButtonStyles = {
  primary: { background: 'linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)', color: '#fff', border: 'none' },
  danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
};

export default function AdminSubscribersPage() {
  const [form, setForm] = useState({ _id: null, id: '', tickers: '' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rowActions, setRowActions] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [usersMap, setUsersMap] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/node/users`);
        if (!res.ok) return;
        const body = await res.json();
        if (!mounted) return;
        const list = Array.isArray(body) ? body : (body.data || body.users || []);
        const map = {};
        (list || []).forEach(u => {
          const id = (u._id && (typeof u._id === 'string' ? u._id : u._id.toString())) || u.id || u.userId;
          if (id) map[id] = { username: u.username || '', name: u.name || u.email || '' };
        });
        setUsersMap(map);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const userOptions = Object.keys(usersMap).map((id) => ({ value: id, label: (usersMap[id].name || usersMap[id].username || id) }));

  const openCreate = () => {
    setForm({ _id: null, id: '', tickers: '' });
    setEditing(null);
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="id"]'); if (input) input.focus(); }, 120);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({ _id: item._id || item.id || null, id: item._id || item.id || item.id || '', tickers: Array.isArray(item.tickers) ? item.tickers.join(', ') : (item.tickers || '') });
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="tickers"]'); if (input) input.focus(); }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  function parseTickersInput(s) {
    if (!s) return [];
    return s.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  }

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.id || !form.id.trim()) { await Swal.fire({ icon: 'warning', title: 'Required', text: 'Subscriber id is required' }); return; }
    try {
      setLoading(true);
      const payload = { id: form.id, tickers: parseTickersInput(form.tickers) };
      const res = await fetch(`${API_BASE}/node/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Create failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Created', timer: 1200 });
      setModalOpen(false);
    } catch (err) {
      console.error('Create subscriber error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Create failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) { await Swal.fire({ icon: 'warning', title: 'Error', text: 'Invalid edit target' }); return; }
    try {
      setLoading(true);
      const id = editing._id || editing.id;
      // delete existing subscriber then recreate with new tickers to replace
      const del = await fetch(`${API_BASE}/node/subscribers/${id}`, { method: 'DELETE' });
      const delData = await del.json();
      if (!del.ok) throw new Error(delData.message || delData.error || 'Delete failed during edit');
      const payload = { id: form.id || id, tickers: parseTickersInput(form.tickers) };
      const res = await fetch(`${API_BASE}/node/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Update failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Updated', timer: 1200 });
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Update subscriber error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Update failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: 'Delete', text: `Delete subscriber ${id}?`, showCancelButton: true, confirmButtonText: 'Delete' });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/subscribers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Delete failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Deleted', timer: 1200 });
    } catch (err) {
      console.error('Delete subscriber error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete failed: ' + err.message });
    }
  }

  async function save(e) { if (editing && (editing._id || editing.id)) await saveEdit(e); else await handleAdd(e); }

  const { user } = useContext(AuthContext) || {};
  const formatDate = (d) => {
    if (!d) return '-';
    try {
      return formatToUserTZSlash(d, (user && user.timeZone) || undefined);
    } catch (e) {
      try { return String(d); } catch { return '-'; }
    }
  };

  const renderRow = useCallback(({ row }) => {
    const id = row._id || row.id || row.id;
    const user = usersMap[id] || {};
    return (
      <tr key={id} onClick={() => openRowActions(row)} style={{ cursor: 'pointer' }}>
        <td className="col-username">{user.username || '-'}</td>
        <td className="company">{Array.isArray(row.tickers) ? row.tickers.join(', ') : (row.tickers || '-')}</td>
        <td className="col-number">{Array.isArray(row.tickers) ? row.tickers.length : 0}</td>
        <td className="col-date">{formatDate(row.createdAt || row.created_at || row.created || row.timeCreated)}</td>
        <td className="col-date">{formatDate(row.updatedAt || row.updated_at || row.updated)}</td>
      </tr>
    );
  }, [usersMap]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Subscribers Management</h2>
          <p className="admin-subtitle">Manage subscribers and their ticker lists.</p>
        </div>
        <div className="admin-actions" />
      </div>

      <FlexTable
        columns={[
          { key: 'username', label: 'User', sortable: true, width: '220px' },
          { key: 'tickers', label: 'Tickers', sortable: false, width: '360px' },
          { key: 'count', label: 'Count', sortable: true, width: '80px' },
          { key: 'createdAt', label: 'Created At', sortable: true, width: '200px' },
          { key: 'updatedAt', label: 'Updated At', sortable: true, width: '200px' },
        ]}
        transformRow={(r) => {
          const id = r._id || r.id || '';
          const user = usersMap[id] || {};
          return {
            ...r,
            name: user.name || user.username || '',
            username: user.username || '',
            companyName: `${Array.isArray(r.tickers) ? r.tickers.join(', ') : (r.tickers || '')} ${id}`.trim()
          };
        }}
        keyField="_id"
        renderRow={renderRow}
        emptyText="No subscribers found."
        fetchUrl={`${API_BASE}/node/subscribers`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
        onCreate={openCreate}
        createLabel="+ Create"
      />

      <GenericModal isOpen={modalOpen} title={editing ? 'Edit Subscriber' : 'Create Subscriber'} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={save} saveLabel={editing ? 'Save' : 'Create'}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label className="form-field"><span>Subscriber</span>
            <DropdownSelect
              value={form.id}
              onChange={(v) => setForm((s) => ({ ...s, id: v }))}
              options={userOptions}
              placeholder="Select subscriber"
              searchable={true}
              searchPlaceholder="Search users..."
            />
          </label>
          <label className="form-field"><span>Tickers (comma separated)</span><input name="tickers" value={form.tickers} onChange={(e) => setForm((s) => ({ ...s, tickers: e.target.value }))} placeholder="AAPL, MSFT, GOOGL" /></label>
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
