import React, { useState, useCallback, useContext } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
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
  secondary: { background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', color: '#fff', border: 'none' },
  danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
};

export default function AdminMarketlistsPage() {
  const { i18n } = useLingui();
  const [form, setForm] = useState({ _id: null, country: '', ticker: '', companyName: '', primaryExchange: '', sectorGroup: '', status: 'inactive' });
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rowActions, setRowActions] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const openCreate = () => {
    setForm({ _id: null, country: '', ticker: '', companyName: '', primaryExchange: '', sectorGroup: '', status: 'inactive' });
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
      sectorGroup: item.sectorGroup || '',
      status: item.status || 'inactive',
      assetType: item.assetType || ''
    });
    setModalOpen(true);
    setTimeout(() => { const input = document.querySelector('.modal input[name="ticker"]'); if (input) input.focus(); }, 120);
  };

  const closeRowActions = () => setRowActions(null);
  const openRowActions = (r) => setRowActions(r);

  async function handleAdd(e) {
    e?.preventDefault();
    if (!form.ticker || !form.ticker.trim()) { await Swal.fire({ icon: 'warning', title: i18n._('Required'), text: i18n._('Ticker is required') }); return; }
    try {
      setLoading(true);
      const payload = { country: form.country || '', ticker: form.ticker.toUpperCase(), companyName: form.companyName || '', primaryExchange: form.primaryExchange || '', sectorGroup: form.sectorGroup || '', status: form.status || 'inactive', assetType: form.assetType || '' };
      const res = await fetch(`${API_BASE}/node/marketlists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Create failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Created'), timer: 1200 });
      setModalOpen(false);
    } catch (err) {
      console.error('Create error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Create failed: ') + err.message });
    } finally { setLoading(false); }
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !(editing._id || editing.id)) { await Swal.fire({ icon: 'warning', title: i18n._('Error'), text: i18n._('Invalid edit target') }); return; }
    try {
      setLoading(true);
      const id = editing._id || editing.id;
      const payload = { country: form.country || '', ticker: form.ticker.toUpperCase(), companyName: form.companyName || '', primaryExchange: form.primaryExchange || '', sectorGroup: form.sectorGroup || '', status: form.status || 'inactive', assetType: form.assetType || '' };
      const res = await fetch(`${API_BASE}/node/marketlists/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Update failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Updated'), timer: 1200 });
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Update error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Update failed: ') + err.message });
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({ icon: 'warning', title: i18n._('Delete'), text: i18n._('Delete marketlist {id}?', { id }), showCancelButton: true, confirmButtonText: i18n._('Delete') });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_BASE}/node/marketlists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || i18n._('Delete failed'));
      setRefreshSignal((s) => s + 1);
      await Swal.fire({ icon: 'success', title: i18n._('Deleted'), timer: 1200 });
    } catch (err) {
      console.error('Delete error', err);
      await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Delete failed: ') + err.message });
    }
  }

  async function save(e) {
    if (editing && (editing._id || editing.id)) await saveEdit(e); else await handleAdd(e);
  }

  const { user } = useContext(AuthContext) || {};
  const formatDate = (d) => {
    if (!d) return '-';
    try {
      return formatToUserTZSlash(d, (user && user.timeZone) || undefined) || String(d);
    } catch (e) {
      try { return String(d); } catch { return '-'; }
    }
  };

  const renderRow = useCallback(({ row }) => (
    <tr key={row._id || row.id} onClick={() => openRowActions(row)} style={{ cursor: 'pointer' }}>
      <td className="col-ticker">{row.ticker || '-'}</td>
      <td className="company">{row.companyName || '-'}</td>
      <td className="col-asset">{row.assetType || '-'}</td>
      <td className="col-date">{row.primaryExchange || '-'}</td>
      <td className="col-date">{row.sectorGroup || '-'}</td>
      <td className="col-status">{row.country || '-'}</td>
      <td className="col-status">{row.status || '-'}</td>
      <td className="col-date">{formatDate(row.updatedAt || row.updated_at || row.updated)}</td>
      <td className="col-date">{formatDate(row.createdAt || row.created_at || row.created)}</td>
    </tr>
  ), []);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2><Trans>Marketlists Management</Trans></h2>
          <p className="admin-subtitle"><Trans>Manage market instruments and metadata.</Trans></p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={async () => {
            const r = await Swal.fire({
              icon: 'warning',
              title: i18n._('Delete All Marketlists'),
              html: i18n._('<strong>This will permanently delete ALL marketlists.</strong><br/>This action cannot be undone. Are you sure?'),
              showCancelButton: true,
              confirmButtonColor: '#dc2626',
              cancelButtonColor: '#6b7280',
              confirmButtonText: i18n._('Yes, delete all'),
            });
            if (!r.isConfirmed) return;
            try {
              setLoading(true);
              const res = await fetch(`${API_BASE}/node/admin/delete_all?collection=marketlists`, { method: 'DELETE' });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || i18n._('Delete all failed'));
              setRefreshSignal((s) => s + 1);
              await Swal.fire({ icon: 'success', title: i18n._('Deleted'), text: i18n._('All marketlists deleted.'), timer: 1500 });
            } catch (err) {
              console.error('Delete all marketlists error', err);
              await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Delete all failed: ') + err.message });
            } finally { setLoading(false); }
          }}><Trans>Delete All</Trans></button>
        </div>
      </div>

      <FlexTable
        columns={[
          { key: 'ticker', label: i18n._('Ticker'), sortable: true, width: '120px' },
          { key: 'companyName', label: i18n._('Company'), sortable: true, width: '240px' },
          { key: 'primaryExchange', label: i18n._('Primary Exchange'), sortable: true, width: '160px' },
          { key: 'sectorGroup', label: i18n._('Sector'), sortable: true, width: '220px' },
          { key: 'country', label: i18n._('Country'), sortable: true, width: '120px' },
          { key: 'status', label: i18n._('Status'), sortable: true, width: '120px' },
          { key: 'updatedAt', label: i18n._('Updated At'), sortable: true, width: '200px' },
          { key: 'createdAt', label: i18n._('Created At'), sortable: true, width: '200px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText={i18n._('No marketlists found.')}
        fetchUrl={`${API_BASE}/node/marketlists`}
        searchFields={['ticker','companyName','assetType']}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
        onCreate={openCreate}
        createLabel={i18n._('+ Create')}
      />

      <GenericModal isOpen={modalOpen} title={editing ? i18n._('Edit Marketlist') : i18n._('Create Marketlist')} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={save} saveLabel={editing ? i18n._('Save') : i18n._('Create')}>
        <div className="form-grid">
          <label className="form-field"><span><Trans>Ticker</Trans></span><input name="ticker" value={form.ticker} onChange={(e) => setForm((s) => ({ ...s, ticker: e.target.value }))} placeholder={i18n._('AAPL')} /></label>
          <label className="form-field"><span><Trans>Company</Trans></span><input name="companyName" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} placeholder={i18n._('Company Name')} /></label>
          <label className="form-field"><span><Trans>Country</Trans></span><input name="country" value={form.country} onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))} placeholder={i18n._('US')} /></label>
          <label className="form-field"><span><Trans>Primary Exchange</Trans></span><input name="primaryExchange" value={form.primaryExchange} onChange={(e) => setForm((s) => ({ ...s, primaryExchange: e.target.value }))} placeholder={i18n._('NASDAQ')} /></label>
          <label className="form-field"><span><Trans>Sector Group</Trans></span><input name="sectorGroup" value={form.sectorGroup} onChange={(e) => setForm((s) => ({ ...s, sectorGroup: e.target.value }))} placeholder={i18n._('Sector')} /></label>
          <label className="form-field"><span><Trans>Status</Trans></span>
            <select name="status" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
              <option value="active"><Trans>Active</Trans></option>
              <option value="inactive"><Trans>Inactive</Trans></option>
            </select>
          </label>
          <label className="form-field"><span><Trans>Asset Type</Trans></span><input name="assetType" value={form.assetType} onChange={(e) => setForm((s) => ({ ...s, assetType: e.target.value }))} placeholder={i18n._('Equity / ETF / Crypto')} /></label>
        </div>
      </GenericModal>

      <GenericModal isOpen={!!rowActions} title={i18n._('Actions')} onClose={closeRowActions}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={modalButtonStyles.secondary} className="btn btn-small btn-secondary" onClick={() => { setModalOpen(true); startEdit(rowActions); closeRowActions(); }}><Trans>Edit</Trans></button>
          <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}><Trans>Delete</Trans></button>
        </div>
      </GenericModal>
    </main>
  );
}
