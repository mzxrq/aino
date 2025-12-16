import Swal from 'sweetalert2';
import React, { useState, useCallback } from 'react';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import DropdownSelect from '../../components/DropdownSelect/DropdownSelect';
import FlexTable from '../../components/FlexTable/FlexTable';
import GenericModal from '../../components/GenericModal/GenericModal';
import { useAuth } from '../../context/useAuth';

const SELECT_OPTIONS_STATUS = [
  { value: '', label: 'Select status' },
  { value: 'new', label: 'New' },
  { value: 'review', label: 'Review' },
  { value: 'confirm', label: 'Confirm' },
  { value: 'safe', label: 'Safe' },
  { value: 'clear', label: 'Clear' },
];

const modalButtonStyles = {
  primary: { background: 'linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)', color: '#fff', border: 'none' },
  secondary: { background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', color: '#fff', border: 'none' },
  danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
};

const AnomaliesManagementPage = () => {
  const { user } = useAuth();

  const [form, setForm] = useState({ id: null, ticker: '', date: '', value: '', note: '', companyName: '', volume: '', status: 'new' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [rowActions, setRowActions] = useState(null);
  const [noteView, setNoteView] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const cancelEdit = () => {
    setForm({ id: null, ticker: '', date: '', value: '', note: '', companyName: '', volume: '', status: 'new' });
    setEditing(null);
    setModalOpen(false);
  };

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.ticker || !form.ticker.trim()) {
      await Swal.fire({ icon: 'warning', title: 'Required', text: 'Ticker is required', confirmButtonColor: '#00aaff' });
      return;
    }
    try {
      setLoading(true);
      const payload = {
        ticker: form.ticker,
        datetime: form.date,
        close: form.value === '' ? 0 : Number(form.value),
        volume: form.volume === '' || form.volume === undefined ? 0 : Number(form.volume),
        status: form.status || 'new',
        note: form.note || '',
      };
      const res = await fetch(`${API_BASE}/node/anomalies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Created', text: 'Anomaly created successfully.', timer: 1500, confirmButtonColor: '#00aaff' });
      cancelEdit();
    } catch (err) {
      console.error('Create error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Create failed: ' + err.message, confirmButtonColor: '#dc2626' });
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) {
      await Swal.fire({ icon: 'warning', title: 'Error', text: 'Invalid edit target', confirmButtonColor: '#dc2626' });
      return;
    }
    try {
      setLoading(true);
      const targetId = editing._id || editing.id;
      const payload = {
        ticker: form.ticker,
        note: form.note || '',
        status: form.status || 'new',
        updatePerson: user?.username || ''
      };
      const res = await fetch(`${API_BASE}/node/anomalies/${targetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Updated', text: 'Anomaly updated successfully.', timer: 1500, confirmButtonColor: '#00aaff' });
      cancelEdit();
    } catch (err) {
      console.error('Update error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Update failed: ' + err.message, confirmButtonColor: '#dc2626' });
    } finally { setLoading(false); }
  }

  const startEdit = (item) => {
    setForm({
      id: item._id || item.id,
      ticker: item.ticker || '',
      date: item.datetime || item.date || '',
      value: (item.close ?? item.value) || '',
      note: item.note || '',
      companyName: item.companyName || item.name || '',
      volume: item.volume || '',
      status: item.status || 'new'
    });
    setEditing(item);
    setModalOpen(true);
    setTimeout(() => {
      const input = document.querySelector('.modal input[name="ticker"]');
      if (input) input.focus();
    }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: 'Delete', text: 'Are you sure you want to delete this anomaly?', showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, delete' });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/anomalies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: 'Deleted', text: 'Anomaly deleted successfully.', timer: 1500, confirmButtonColor: '#00aaff' });
    } catch (err) {
      console.error('Delete error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete failed: ' + err.message, confirmButtonColor: '#dc2626' });
    }
  }

  function openCreate() {
    const today = new Date();
    const iso = today.toISOString().slice(0,10);
    setForm({ id: null, ticker: '', date: iso, value: '', note: '', companyName: '', volume: '', status: 'new' });
    setEditing(null);
    setModalOpen(true);
    setTimeout(() => {
      const input = document.querySelector('.modal input[name="ticker"]');
      if (input) input.focus();
    }, 120);
  }

  async function save(e) {
    if (editing && (editing._id || editing.id)) {
      await saveEdit(e);
    } else {
      await handleAdd(e);
    }
  }

  function fmtDate(d) { if (!d) return '-'; try { return (''+d).slice(0,10); } catch { return d; } }
  function fmtClose(v) { if (v === null || v === undefined || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return '-'; return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  function fmtVolume(v) { if (v === null || v === undefined || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return '-'; return new Intl.NumberFormat().format(n); }

  const TableRow = useCallback(({ r }) => {
    const rowId = r._id || r.id;
    const isHovered = hovered === rowId;
    return (
      <tr key={rowId} onMouseEnter={() => setHovered(rowId)} onMouseLeave={() => setHovered(null)} onClick={() => openRowActions(r)} style={{ backgroundColor: isHovered ? 'var(--bg-hover)' : 'transparent', transition: 'background-color 0.15s ease', cursor: 'pointer' }}>
        <td className="col-ticker">{r.ticker}</td>
        <td className="company">{r.companyName || r.name || r.company || '-'}</td>
        <td className="col-date">{fmtDate(r.datetime || r.date)}</td>
        <td className="col-number">{fmtClose(r.close ?? r.value)}</td>
        <td className="col-volume col-number">{fmtVolume(r.volume)}</td>
        <td className="col-date"><span className={`badge status-${(r.status || 'new').toLowerCase()}`}>{r.status || 'New'}</span></td>
        <td className="actions-cell"><div className="actions"><button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openRowActions(r); }}>•••</button></div></td>
      </tr>
    );
  }, [hovered]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Anomalies Management</h2>
          <p className="admin-subtitle">Monitor and manage market irregularities.</p>
        </div>
        <div className="admin-actions" />
      </div>

      {!loading && !error && (
        <FlexTable
          columns={[
            { key: 'ticker', label: 'Ticker', sortable: true, width: '120px' },
            { key: 'companyName', label: 'Company', sortable: true, width: '240px' },
            { key: 'date', label: 'Date', sortable: true, width: '120px' },
            { key: 'value', label: 'Close', sortable: true, width: '120px', className: 'center-right' },
            { key: 'volume', label: 'Volume', sortable: true, width: '120px', className: 'center-right' },
            { key: 'status', label: 'Status', sortable: true, width: '120px' },
          ]}
          keyField="_id"
          renderRow={({ row }) => (
            <tr key={row._id || row.id} onMouseEnter={() => setHovered(row._id || row.id)} onMouseLeave={() => setHovered(null)} onClick={() => setRowActions(row)} className={hovered === (row._id || row.id) ? 'row-hover' : ''}>
              <td className="col-ticker">{row.ticker || '-'}</td>
              <td className="company">{row.companyName || '-'}</td>
              <td className="col-date">{fmtDate(row.datetime || row.date)}</td>
              <td className="col-number center-right">{fmtClose(row.close ?? row.value)}</td>
              <td className="col-volume center-right">{fmtVolume(row.volume)}</td>
              <td className="col-status">{row.status ? <span className={`badge status-${String(row.status).toLowerCase()}`}>{row.status}</span> : '-'}</td>
            </tr>
          )}
          emptyText="No anomalies found."
          fetchUrl={`${API_BASE}/node/anomalies`}
          refreshSignal={refreshSignal}
          enablePagination={true}
          showHeader={true}
          showSearch={true}
          onCreate={openCreate}
          createLabel="+ Create New"
        />
      )}

      {/* Create / Edit modal */}
      <GenericModal isOpen={modalOpen} title={editing ? 'Edit Anomaly' : 'Create Anomaly'} onClose={cancelEdit} onSave={save} saveLabel={editing ? 'Save Changes' : 'Create'}>
        <div className="form-grid">
          {editing ? (
            <>
              <label className="form-field"><span>Ticker</span><input className="input-readonly" value={form.ticker} readOnly /></label>
              <label className="form-field"><span>Company</span><input className="input-readonly" value={form.companyName || '-'} readOnly /></label>
              <label className="form-field"><span>Close Price</span><input className="input-readonly" value={fmtClose(form.value)} readOnly /></label>
              <label className="form-field"><span>Volume</span><input className="input-readonly" value={fmtVolume(form.volume)} readOnly /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Date</span><input className="input-readonly" value={fmtDate(form.date)} readOnly /></label>
              <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />
              <label className="form-field"><span>Status</span><DropdownSelect value={form.status || ''} onChange={(v) => setForm((s) => ({ ...s, status: v }))} placeholder="Select status" options={SELECT_OPTIONS_STATUS} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Analyst Note</span><textarea className="textarea" value={form.note || ''} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} placeholder="Add comments about this anomaly..." /></label>
            </>
          ) : (
            <>
              <label className="form-field"><span>Ticker</span><input name="ticker" value={form.ticker} onChange={handleChange} placeholder="E.g. AAPL" /></label>
              <label className="form-field"></label>
              <label className="form-field"><span>Close Price</span><input name="value" type="number" step="0.01" value={form.value} onChange={handleChange} placeholder="Close price" /></label>
              <label className="form-field"><span>Volume</span><input name="volume" type="number" value={form.volume || ''} onChange={handleChange} placeholder="Volume" /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Date</span><input name="date" type="date" value={form.date} onChange={handleChange} /></label>
              <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />
              <label className="form-field"><span>Status</span><DropdownSelect value={form.status || 'new'} onChange={(v) => setForm((s) => ({ ...s, status: v }))} options={SELECT_OPTIONS_STATUS} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Analyst Note</span><textarea name="note" className="textarea" value={form.note || ''} onChange={handleChange} placeholder="Add comments about this anomaly..." /></label>
            </>
          )}
        </div>
      </GenericModal>

      {/* Note viewer modal */}
      <GenericModal isOpen={!!noteView} title={noteView ? `Note: ${noteView.ticker} ${noteView.date ? `on ${fmtDate(noteView.date)}` : ''}` : ''} onClose={() => setNoteView(null)} showClose>
        <div style={{ padding: 24, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {noteView?.note || '(No note provided)'}
          {noteView?.updatePerson && (<div style={{ marginTop: 12, fontSize: 13 }}><em>Last updated by {noteView.updatePerson}</em></div>)}
        </div>
      </GenericModal>

      {/* Row actions modal */}
      <GenericModal isOpen={!!rowActions} title="Actions" onClose={closeRowActions}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={modalButtonStyles.secondary} className="btn btn-small btn-secondary" onClick={() => { setNoteView(rowActions); closeRowActions(); }}>View Note</button>
          <button style={modalButtonStyles.primary} className="btn btn-small btn-primary" onClick={() => { startEdit(rowActions); closeRowActions(); }}>Edit</button>
          <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}>Delete</button>
        </div>
      </GenericModal>
    </main>
  );
};

export default AnomaliesManagementPage;

