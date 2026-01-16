import Swal from '../../utils/muiSwal';
import React, { useState, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { formatToUserTZSlash } from '../../utils/dateUtils';
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
  const { i18n } = useLingui();

  const [form, setForm] = useState({ id: null, ticker: '', date: '', time: '', value: '', note: '', companyName: '', volume: '', status: 'new' });
  const [editing, setEditing] = useState(null);
  const [allowEditReadonly, setAllowEditReadonly] = useState(false);
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
    setForm({ id: null, ticker: '', date: '', time: '', value: '', note: '', companyName: '', volume: '', status: 'new' });
    setEditing(null);
    setModalOpen(false);
  };

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.ticker || !form.ticker.trim()) {
      await Swal.fire({ icon: 'warning', title: i18n._('Required'), text: i18n._('Ticker is required'), confirmButtonColor: '#00aaff' });
      return;
    }
    try {
      setLoading(true);
      // combine date + time (local) into an ISO datetime string
      let datetimeIso = null;
      if (form.date) {
        const timePart = form.time && String(form.time).trim() ? String(form.time).trim() : '00:00';
        const local = new Date(`${form.date}T${timePart}:00`);
        datetimeIso = local.toISOString();
      }
      const payload = {
        ticker: form.ticker,
        datetime: datetimeIso,
        close: form.value === '' ? 0 : Number(form.value),
        volume: form.volume === '' || form.volume === undefined ? 0 : Number(form.volume),
        status: form.status || 'new',
        note: form.note || '',
      };
      const res = await fetch(`${API_BASE}/node/anomalies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Create failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Created'), text: i18n._('Anomaly created successfully.'), timer: 1500, confirmButtonColor: '#00aaff' });
      cancelEdit();
    } catch (err) {
      console.error('Create error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Create failed: ') + err.message, confirmButtonColor: '#dc2626' });
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) {
      await Swal.fire({ icon: 'warning', title: i18n._('Error'), text: i18n._('Invalid edit target'), confirmButtonColor: '#dc2626' });
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
      if (allowEditReadonly) {
        if (form.date) {
          const timePart = form.time && String(form.time).trim() ? String(form.time).trim() : '00:00';
          const local = new Date(`${form.date}T${timePart}:00`);
          payload.datetime = local.toISOString();
        }
        if (form.value !== undefined) payload.close = form.value === '' ? 0 : Number(form.value);
        if (form.volume !== undefined) payload.volume = form.volume === '' ? 0 : Number(form.volume);
        if (form.companyName) payload.companyName = form.companyName;
        if (form.ticker) payload.ticker = form.ticker;
      }
      const res = await fetch(`${API_BASE}/node/anomalies/${targetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Update failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Updated'), text: i18n._('Anomaly updated successfully.'), timer: 1500, confirmButtonColor: '#00aaff' });
      cancelEdit();
    } catch (err) {
      console.error('Update error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Update failed: ') + err.message, confirmButtonColor: '#dc2626' });
    } finally { setLoading(false); }
  }

  const startEdit = (item) => {
    // parse datetime into local date and time for editing
    const dtRaw = item.datetime || item.date || '';
    let dateOnly = '';
    let timeOnly = '';
    if (dtRaw) {
      try {
        const d = new Date(dtRaw);
        const pad = (n) => String(n).padStart(2, '0');
        dateOnly = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        timeOnly = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch (err) {
        dateOnly = String(dtRaw).slice(0, 10);
      }
    }
    setForm({
      id: item._id || item.id,
      ticker: item.ticker || '',
      date: dateOnly || '',
      time: timeOnly || '',
      value: (item.close ?? item.value) || '',
      note: item.note || '',
      companyName: item.companyName || item.name || '',
      volume: item.volume || '',
      status: item.status || 'new'
    });
    setEditing(item);
    setAllowEditReadonly(false);
    setModalOpen(true);
    setTimeout(() => {
      const input = document.querySelector('.modal input[name="ticker"]');
      if (input) input.focus();
    }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: i18n._('Delete'), text: i18n._('Are you sure you want to delete this anomaly?'), showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: i18n._('Yes, delete') });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/anomalies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Deleted'), text: i18n._('Anomaly deleted successfully.'), timer: 1500, confirmButtonColor: '#00aaff' });
    } catch (err) {
      console.error('Delete error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Delete failed: ') + err.message, confirmButtonColor: '#dc2626' });
    }
  }

  // Delete all anomalies
  async function handleDeleteAll() {
    const result = await Swal.fire({
      icon: 'warning',
      title: i18n._('Delete All Anomalies'),
      html: i18n._('<strong>This will permanently delete ALL anomalies.</strong><br/>This action cannot be undone. Are you sure?'),
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: i18n._('Yes, delete all')
    });
    if (!result.isConfirmed) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/node/admin/delete_all?collection=anomalies`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Delete all failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Deleted'), text: i18n._('All anomalies have been deleted.'), timer: 1500, confirmButtonColor: '#00aaff' });
    } catch (err) {
      console.error('Delete all error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Delete all failed: ') + err.message, confirmButtonColor: '#dc2626' });
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    const today = new Date();
    const iso = today.toISOString().slice(0,10);
    const hhmm = today.toTimeString().slice(0,5);
    setForm({ id: null, ticker: '', date: iso, time: hhmm, value: '', note: '', companyName: '', volume: '', status: 'new' });
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

  function fmtDate(d) {
    if (!d) return '-';
    try {
      const raw = String(d).trim();
      const tz = (user && user.timeZone) || undefined;
      // If input is date-only (YYYY-MM-DD or YYYY/MM/DD) show only the date part
      if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(raw)) {
        const s = formatToUserTZSlash(raw, tz);
        return ('' + s).split(' ')[0] || s;
      }
      // otherwise show full user-timezone datetime
      return formatToUserTZSlash(raw, tz);
    } catch {
      return String(d);
    }
  }
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
          <h2><Trans>Anomalies Management</Trans></h2>
          <p className="admin-subtitle"><Trans>Monitor and manage market irregularities.</Trans></p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={handleDeleteAll}><Trans>Delete All</Trans></button>
        </div>
      </div>

      {!loading && !error && (
        <FlexTable
          columns={[
            { key: 'ticker', label: i18n._('Ticker'), sortable: true, width: '120px' },
              { key: 'companyName', label: i18n._('Company'), sortable: true, width: '240px' },
              { key: 'date', label: i18n._('Date'), sortable: true, width: '120px' },
              { key: 'value', label: i18n._('Close'), sortable: true, width: '120px', className: 'center-right' },
              { key: 'volume', label: i18n._('Volume'), sortable: true, width: '120px', className: 'center-right' },
              { key: 'status', label: i18n._('Status'), sortable: true, width: '120px' },
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
          emptyText={i18n._('No anomalies found.')}
          fetchUrl={`${API_BASE}/node/anomalies`}
          refreshSignal={refreshSignal}
          enablePagination={true}
          showHeader={true}
          showSearch={true}
          onCreate={openCreate}
          createLabel={i18n._('+ Create New')}
        />
      )}

      {/* Create / Edit modal */}
      <GenericModal isOpen={modalOpen} title={editing ? i18n._('Edit Anomaly') : i18n._('Create Anomaly')} onClose={cancelEdit} onSave={save} saveLabel={editing ? i18n._('Save Changes') : i18n._('Create')}>
        <div className="form-grid">
          {editing ? (
            <>
              <label className="form-field" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={allowEditReadonly} onChange={(e) => setAllowEditReadonly(e.target.checked)} />
                <span style={{ marginLeft: 6 }}><Trans>Allow editing readonly fields</Trans></span>
              </label>
              <label className="form-field"><span><Trans>Ticker</Trans></span><input className="input-readonly" value={form.ticker} readOnly /></label>
              <label className="form-field"><span><Trans>Company</Trans></span>{allowEditReadonly ? <input name="companyName" value={form.companyName || ''} onChange={handleChange} /> : <input className="input-readonly" value={form.companyName || '-'} readOnly />}</label>
              <label className="form-field"><span><Trans>Close Price</Trans></span>{allowEditReadonly ? <input name="value" type="number" step="0.01" value={form.value} onChange={handleChange} /> : <input className="input-readonly" value={fmtClose(form.value)} readOnly />}</label>
              <label className="form-field"><span><Trans>Volume</Trans></span>{allowEditReadonly ? <input name="volume" type="number" value={form.volume || ''} onChange={handleChange} /> : <input className="input-readonly" value={fmtVolume(form.volume)} readOnly />}</label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span><Trans>Date</Trans></span>{allowEditReadonly ? (<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="date" type="date" value={form.date} onChange={handleChange} /><input name="time" type="time" value={form.time || ''} onChange={handleChange} /></div>) : <input className="input-readonly" value={fmtDate(form.date)} readOnly />}</label>
              <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />
              <label className="form-field"><span><Trans>Status</Trans></span><DropdownSelect value={form.status || ''} onChange={(v) => setForm((s) => ({ ...s, status: v }))} placeholder={i18n._('Select status')} options={SELECT_OPTIONS_STATUS} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span><Trans>Analyst Note</Trans></span><textarea className="textarea" value={form.note || ''} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} placeholder={i18n._('Add comments about this anomaly...')} /></label>
            </>
          ) : (
            <>
              <label className="form-field"><span><Trans>Ticker</Trans></span><input name="ticker" value={form.ticker} onChange={handleChange} placeholder={i18n._('E.g. AAPL')} /></label>
              <label className="form-field"></label>
              <label className="form-field"><span><Trans>Close Price</Trans></span><input name="value" type="number" step="0.01" value={form.value} onChange={handleChange} placeholder={i18n._('Close price')} /></label>
              <label className="form-field"><span><Trans>Volume</Trans></span><input name="volume" type="number" value={form.volume || ''} onChange={handleChange} placeholder={i18n._('Volume')} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span><Trans>Date</Trans></span><input name="date" type="date" value={form.date} onChange={handleChange} /></label>
              <label className="form-field"><span><Trans>Time</Trans></span><input name="time" type="time" value={form.time} onChange={handleChange} /></label>
              <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />
              <label className="form-field"><span><Trans>Status</Trans></span><DropdownSelect value={form.status || 'new'} onChange={(v) => setForm((s) => ({ ...s, status: v }))} options={SELECT_OPTIONS_STATUS} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span><Trans>Analyst Note</Trans></span><textarea name="note" className="textarea" value={form.note || ''} onChange={handleChange} placeholder={i18n._('Add comments about this anomaly...')} /></label>
            </>
          )}
        </div>
      </GenericModal>

      {/* Note viewer modal */}
      <GenericModal isOpen={!!noteView} title={noteView ? `Note: ${noteView.ticker} ${noteView.date ? `on ${fmtDate(noteView.date)}` : ''}` : ''} onClose={() => setNoteView(null)} showClose>
        <div style={{ padding: 24, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {noteView?.note || i18n._('(No note provided)')}
          {noteView?.updatePerson && (<div style={{ marginTop: 12, fontSize: 13 }}><em><Trans>Last updated by</Trans> {noteView.updatePerson}</em></div>)}
        </div>
      </GenericModal>

      {/* Row actions modal */}
      <GenericModal isOpen={!!rowActions} title="Actions" onClose={closeRowActions}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={modalButtonStyles.secondary} className="btn btn-small btn-secondary" onClick={() => { setNoteView(rowActions); closeRowActions(); }}><Trans>View Note</Trans></button>
          <button style={modalButtonStyles.primary} className="btn btn-small btn-primary" onClick={() => { startEdit(rowActions); closeRowActions(); }}><Trans>Edit</Trans></button>
          <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}><Trans>Delete</Trans></button>
        </div>
      </GenericModal>
    </main>
  );
};

export default AnomaliesManagementPage;

