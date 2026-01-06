import React, { useState, useCallback, useContext } from 'react';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import GenericModal from '../../components/GenericModal/GenericModal';
import DropdownSelect from '../../components/DropdownSelect/DropdownSelect';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { AuthContext } from '../../context/contextBase';

function DebugCacheFetch({ refreshSignal }) {
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/node/cache`);
        const status = res.status;
        const txt = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(txt); } catch (_) { parsed = txt; }
        console.debug('[DebugCacheFetch] status=', status, 'body=', parsed);
      } catch (err) {
        console.error('[DebugCacheFetch] fetch error', err);
      }
    })();
    return () => { mounted = false; };
  }, [refreshSignal]);
  return null;
}

const AdminCachePage = () => {
  const [loading, setLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [rowActions, setRowActions] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewPayload, setViewPayload] = useState(null);
  const [form, setForm] = useState({ _id: '', ticker: '', period: '', interval: '', fetched_at: '', payload: '' });

  const parseKey = (key) => {
    if (!key) return { ticker: '-', period: '-', interval: '-' };
    const k = stringifyId(key);
    const parts = k.split('::');
    // common patterns: chart::TICKER::PERIOD::INTERVAL or chart::TICKER::INTERVAL::PERIOD
    const ticker = parts[1] || key;
    const p2 = parts[2] || '';
    const p3 = parts[3] || '';
    return { ticker, period: p2 || '-', interval: p3 || '-' };
  };

  // Normalize possible ObjectId or other object shapes into a hex/string id
  const stringifyId = (raw) => {
    if (raw === null || raw === undefined) return '';
    // If already string
    if (typeof raw === 'string') return raw;
    // If has $oid (common in some serializations)
    if (raw && typeof raw === 'object') {
      if (typeof raw.$oid === 'string') return raw.$oid;
      if (typeof raw.id === 'string') return raw.id;
      if (typeof raw.toHexString === 'function') {
        try { return raw.toHexString(); } catch (e) { /* ignore */ }
      }
      // toString may return useful hex
      try {
        const s = String(raw);
        const m = s.match(/([0-9a-fA-F]{24})/);
        if (m) return m[1];
      } catch (e) { /* ignore */ }
    }
    // Fallback to JSON string
    try { return JSON.stringify(raw); } catch { return String(raw); }
  };

  const openCreate = () => {
    setForm({ _id: '', ticker: '', period: '', interval: '', fetched_at: new Date().toISOString(), payload: '' });
    setEditItem(null);
    setModalOpen(true);
  };

  const startEdit = (item) => {
    setEditItem(item);
    // parse key into parts for editable inputs
    const idKey = (item && (item._id || item.id));
    const idStr = idKey && idKey.toString ? idKey.toString() : String(idKey || '');
    const parts = idStr.split('::');
    const ticker = parts[1] || '';
    const period = parts[2] || '';
    const interval = parts[3] || '';
    setForm({ _id: item._id, ticker, period, interval, fetched_at: item.fetched_at || '', payload: JSON.stringify(item.payload || {}, null, 2) });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
  };

  async function handleSave(e) {
    e?.preventDefault();
    try {
      setLoading(true);
      const payloadObj = form.payload ? JSON.parse(form.payload) : {};
      if (editItem && (editItem._id || editItem.id)) {
        // edit flow: if key changed, create new then delete old; otherwise just update
        const oldId = editItem._id || editItem.id;
        const newId = `chart::${(form.ticker || '').toString().toUpperCase()}::${form.period}::${form.interval}`;
        if (newId === oldId) {
          const res = await fetch(`${API_BASE}/node/cache/${encodeURIComponent(oldId)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fetched_at: form.fetched_at, payload: payloadObj })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Update failed');
          await Swal.fire({ icon: 'success', title: 'Updated', timer: 1200 });
        } else {
          // create new record
          const createBody = { _id: newId, fetched_at: form.fetched_at || new Date().toISOString(), payload: payloadObj };
          const resCreate = await fetch(`${API_BASE}/node/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createBody) });
          const dataCreate = await resCreate.json();
          if (!resCreate.ok) throw new Error(dataCreate.error || 'Create (on key change) failed');
          // delete old
          const resDel = await fetch(`${API_BASE}/node/cache/${encodeURIComponent(oldId)}`, { method: 'DELETE' });
          const dataDel = await resDel.json();
          if (!resDel.ok) {
            // created new but failed to remove old — warn but continue
            console.warn('Failed to delete old cache key', dataDel);
            await Swal.fire({ icon: 'warning', title: 'Created', text: 'Created new entry but failed to delete old key.' });
          } else {
            await Swal.fire({ icon: 'success', title: 'Updated', timer: 1200 });
          }
        }
      } else {
        // create flow: require ticker/period/interval and build _id
        if (!form.ticker || !form.period || !form.interval) { await Swal.fire({ icon: 'warning', title: 'Missing fields', text: 'Ticker, period and interval are required' }); return; }
        const builtId = `chart::${(form.ticker || '').toString().toUpperCase()}::${form.period}::${form.interval}`;
        const createBody = { _id: builtId, fetched_at: form.fetched_at || new Date().toISOString(), payload: payloadObj };
        const res = await fetch(`${API_BASE}/node/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createBody) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed');
        await Swal.fire({ icon: 'success', title: 'Created', timer: 1200 });
      }
      setRefreshSignal(s => s + 1);
      closeModal();
    } catch (err) {
      console.error('Save error', err);
      await Swal.fire({ icon: 'error', title: 'Error', text: err.message || String(err) });
    } finally { setLoading(false); }
  }

    async function handleDelete(item) {
      const id = item && (item._id || item.id) ? (item._id || item.id) : String(item || '');
      const ok = await Swal.fire({ icon: 'warning', title: 'Delete', text: `Delete cache ${id}?`, showCancelButton: true, confirmButtonText: 'Delete' });
      if (!ok.isConfirmed) return;
      try {
        const res = await fetch(`${API_BASE}/node/cache/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        await Swal.fire({ icon: 'success', title: 'Deleted', timer: 1000 });
        setRefreshSignal(s => s + 1);
      } catch (err) {
        console.error('Delete error', err);
        await Swal.fire({ icon: 'error', title: 'Error', text: err.message || String(err) });
      }
    }

  const { user } = useContext(AuthContext) || {};

  const renderRow = useCallback(({ row }) => {
    const idKey = (row && (row._id || row.id));
    const idStr = idKey && idKey.toString ? idKey.toString() : String(idKey || '');
    const parsed = parseKey(idStr);
    return (
      <tr key={idStr} onClick={() => setRowActions(row)}>
        <td className="col-ticker">{parsed.ticker}</td>
        <td className="col-date">{parsed.period}</td>
        <td className="col-number center-right">{parsed.interval}</td>
        <td className="col-date">{row.fetched_at ? formatToUserTZSlash(row.fetched_at, (user && user.timeZone) || undefined) : '-'}</td>
      </tr>
    );
  }, []);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Cache Management</h2>
          <p className="admin-subtitle">Manage cached chart payloads (chart::ticker::period::interval).</p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-primary" onClick={openCreate}>+ Create Cache</button>
          <button className="btn btn-danger" onClick={async () => {
            const r = await Swal.fire({ icon: 'warning', title: 'Delete All Cache', html: '<strong>This will permanently delete ALL cache entries.</strong><br/>This action cannot be undone. Are you sure?', showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, delete all' });
            if (!r.isConfirmed) return;
            try {
              const res = await fetch(`${API_BASE}/node/admin/delete_all?collection=cache`, { method: 'DELETE' });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || 'Delete all failed');
              setRefreshSignal(s => s + 1);
              await Swal.fire({ icon: 'success', title: 'Deleted', text: 'All cache entries deleted.', timer: 1200 });
            } catch (err) {
              console.error('Delete all cache error', err);
              await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete all failed: ' + err.message });
            }
          }}>Delete All</button>
        </div>
      </div>
      {/* Debug: log raw cache endpoint response to help diagnose display issues */}
      <DebugCacheFetch refreshSignal={refreshSignal} />

      <FlexTable
        columns={[
          { key: 'ticker', label: 'Ticker', sortable: true, width: '120px' },
          { key: 'period', label: 'Period', sortable: true, width: '120px' },
          { key: 'interval', label: 'Interval', sortable: true, width: '120px', className: 'center-right' },
          { key: 'fetched_at', label: 'Fetched At', sortable: true, width: '180px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        transformRow={(row) => {
          try {
            const parts = String(row._id || row.id || '').split('::');
            const ticker = parts[1] || '';
            const period = parts[2] || '';
            const interval = parts[3] || '';
            return { ...row, ticker, period, interval, companyName: ticker };
          } catch (e) {
            return row;
          }
        }}
        emptyText="No cache entries found."
        fetchUrl={`${API_BASE}/node/cache`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
      />

      {/* View Payload modal */}
      <GenericModal isOpen={!!viewPayload} title={viewPayload ? `Payload: ${viewPayload._id || viewPayload.id}` : ''} onClose={() => setViewPayload(null)} showClose>
        <div style={{ padding: 18 }}>
          <pre style={{ maxHeight: '50vh', overflow: 'auto', background: 'var(--bg-main)', padding: 12, borderRadius: 8 }}>{viewPayload ? JSON.stringify(viewPayload.payload || viewPayload, null, 2) : ''}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-small btn-primary" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(viewPayload?.payload || viewPayload || {}, null, 2)); Swal.fire({ icon: 'success', title: 'Copied' }); }}>Copy</button>

          </div>
        </div>
      </GenericModal>

      {/* Create / Edit modal */}
      <GenericModal isOpen={modalOpen} title={editItem ? `Edit Cache ${editItem._id}` : 'Create Cache'} onClose={closeModal} onSave={handleSave} saveLabel={editItem ? 'Save' : 'Create'}>
        <div className="form-grid">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '1 / -1' }}>
            <label className="form-field" style={{ flex: 1 }}><span>Ticker</span><input name="ticker" value={form.ticker} onChange={(e) => setForm(s => ({ ...s, ticker: e.target.value.toUpperCase() }))} placeholder="AAPL" /></label>
            <label className="form-field" style={{ flex: 1 }}><span>Period</span><input name="period" value={form.period} onChange={(e) => setForm(s => ({ ...s, period: e.target.value }))} placeholder="1d" /></label>
            <label className="form-field" style={{ flex: 1 }}><span>Interval</span><input name="interval" value={form.interval} onChange={(e) => setForm(s => ({ ...s, interval: e.target.value }))} placeholder="1m" /></label>
          </div>

          <label className="form-field"><span>Fetched At</span><input name="fetched_at" value={form.fetched_at} onChange={(e) => setForm(s => ({ ...s, fetched_at: e.target.value }))} placeholder="ISO date" /></label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Payload (JSON)</span><textarea value={form.payload} onChange={(e) => setForm(s => ({ ...s, payload: e.target.value }))} style={{ minHeight: 200 }} placeholder='{ "dates": [...], "open": [...] }' /></label>
        </div>
      </GenericModal>

      {/* Row actions modal (contextual) */}
      <GenericModal isOpen={!!rowActions} title="Actions" onClose={() => setRowActions(null)}>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-small btn-secondary" onClick={() => { setViewPayload(rowActions); setRowActions(null); }}>View Payload</button>
          <button className="btn btn-small btn-primary" onClick={() => { startEdit(rowActions); setRowActions(null); }}>Edit</button>
          <button className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions); setRowActions(null); }}>Delete</button>
        </div>
      </GenericModal>
    </main>
  );
};

export default AdminCachePage;
