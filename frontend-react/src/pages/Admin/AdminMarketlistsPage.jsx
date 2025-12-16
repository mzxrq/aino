import React, { useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import GenericModal from '../../components/GenericModal/GenericModal';
import DropdownSelect from '../../components/DropdownSelect/DropdownSelect';

const modalButtonStyles = {
  primary: { background: 'linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)', color: '#fff', border: 'none' },
  secondary: { background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', color: '#fff', border: 'none' },
  danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
};

export default function AdminMarketlistsPage() {
  const [form, setForm] = useState({ _id: null, country: '', ticker: '', companyName: '', primaryExchange: '', sectorGroup: '' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rowActions, setRowActions] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const openCreate = () => {
    setForm({ _id: null, country: '', ticker: '', companyName: '', primaryExchange: '', sectorGroup: '' });
    setEditing(null);
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="ticker"]'); if (input) input.focus(); }, 120);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      _id: item._id || item.id || null,
      country: item.country || '',
      ticker: item.ticker || '',
      companyName: item.companyName || '',
      primaryExchange: item.primaryExchange || '',
      sectorGroup: item.sectorGroup || ''
    });
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="ticker"]'); if (input) input.focus(); }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.ticker || !form.ticker.trim()) { await Swal.fire({ icon: 'warning', title: 'Required', text: 'Ticker is required' }); return; }
    try {
      setLoading(true);
      const payload = { country: form.country || '', ticker: form.ticker.toUpperCase(), companyName: form.companyName || '', primaryExchange: form.primaryExchange || '', sectorGroup: form.sectorGroup || '' };
      const res = await fetch(`${API_BASE}/node/marketlists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Created', timer: 1200 });
      setModalOpen(false);
    } catch (err) {
      console.error('Create error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Create failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) { await Swal.fire({ icon: 'warning', title: 'Error', text: 'Invalid edit target' }); return; }
    try {
      setLoading(true);
      const id = editing._id || editing.id;
      const payload = { country: form.country || '', ticker: form.ticker.toUpperCase(), companyName: form.companyName || '', primaryExchange: form.primaryExchange || '', sectorGroup: form.sectorGroup || '' };
      const res = await fetch(`${API_BASE}/node/marketlists/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Updated', timer: 1200 });
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Update error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Update failed: ' + err.message });
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: 'Delete', text: `Delete marketlist ${id}?`, showCancelButton: true, confirmButtonText: 'Delete' });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/marketlists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Deleted', timer: 1200 });
    } catch (err) {
      console.error('Delete error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete failed: ' + err.message });
    }
  }

  async function save(e) {
    if (editing && (editing._id || editing.id)) await saveEdit(e); else await handleAdd(e);
  }

  const renderRow = useCallback(({ row }) => (
    <tr key={row._id || row.id} onClick={() => openRowActions(row)} style={{ cursor: 'pointer' }}>
      <td className="col-ticker">{row.ticker || '-'}</td>
      <td className="company">{row.companyName || '-'}</td>
      <td className="col-date">{row.primaryExchange || '-'}</td>
      <td className="col-date">{row.sectorGroup || '-'}</td>
      <td className="col-status">{row.country || '-'}</td>
    </tr>
  ), []);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Marketlists Management</h2>
          <p className="admin-subtitle">Manage market instruments and metadata.</p>
        </div>
        <div className="admin-actions" />
      </div>

      <FlexTable
        columns={[
          { key: 'ticker', label: 'Ticker', sortable: true, width: '120px' },
          { key: 'companyName', label: 'Company', sortable: true, width: '240px' },
          { key: 'primaryExchange', label: 'Primary Exchange', sortable: true, width: '160px' },
          { key: 'sectorGroup', label: 'Sector', sortable: true, width: '220px' },
          { key: 'country', label: 'Country', sortable: true, width: '120px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText="No marketlists found."
        fetchUrl={`${API_BASE}/node/marketlists`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
        onCreate={openCreate}
        createLabel="+ Create"
      />

      <GenericModal isOpen={modalOpen} title={editing ? 'Edit Marketlist' : 'Create Marketlist'} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={save} saveLabel={editing ? 'Save' : 'Create'}>
        <div className="form-grid">
          <label className="form-field"><span>Ticker</span><input name="ticker" value={form.ticker} onChange={(e) => setForm((s) => ({ ...s, ticker: e.target.value }))} placeholder="AAPL" /></label>
          <label className="form-field"><span>Company</span><input name="companyName" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} placeholder="Company Name" /></label>
          <label className="form-field"><span>Country</span><input name="country" value={form.country} onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))} placeholder="US" /></label>
          <label className="form-field"><span>Primary Exchange</span><input name="primaryExchange" value={form.primaryExchange} onChange={(e) => setForm((s) => ({ ...s, primaryExchange: e.target.value }))} placeholder="NASDAQ" /></label>
          <label className="form-field"><span>Sector Group</span><input name="sectorGroup" value={form.sectorGroup} onChange={(e) => setForm((s) => ({ ...s, sectorGroup: e.target.value }))} placeholder="Sector" /></label>
        </div>
      </GenericModal>

      <GenericModal isOpen={!!rowActions} title="Actions" onClose={closeRowActions}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={modalButtonStyles.secondary} className="btn btn-small btn-secondary" onClick={() => { setModalOpen(true); startEdit(rowActions); closeRowActions(); }}>Edit</button>
          <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}>Delete</button>
        </div>
      </GenericModal>
    </main>
  );
}
