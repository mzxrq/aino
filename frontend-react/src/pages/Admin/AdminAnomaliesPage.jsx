import Swal from 'sweetalert2';
import Sidebar from '../../components/Sidebar';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import DropdownSelect from '../../components/DropdownSelect';
import { useAuth } from '../../context/useAuth';

const AnomaliesManagementPage = () => {
  const [items, setItems] = useState([]);
  const { user } = useAuth();

  const [form, setForm] = useState({ id: null, ticker: '', date: '', value: '', note: '', companyName: '', volume: '', status: 'New'  });
  const [editing, setEditing] = useState(null); // will hold the item object when editing
  const [modalOpen, setModalOpen] = useState(false);
  // filters not used in current UI; remove to avoid stale state
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [noteView, setNoteView] = useState(null);
  const [rowActions, setRowActions] = useState(null); // { _id, ... }
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(null);

const [sortConfig, setSortConfig] = useState({
  key: null,
  direction: 'asc', // 'asc' | 'desc'
});

  // Inline modal button styles to guarantee color across theme cascades
  const modalButtonStyles = {
    primary: { background: 'linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)', color: '#fff', border: 'none' },
    secondary: { background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', color: '#fff', border: 'none' },
    danger: { background: 'linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)', color: '#fff', border: 'none' },
  };

  const searchDebounce = useRef(null);

  function handleSearchChange(e) {
    const v = e.target.value;
    setSearchTerm(v);
    setPage(1);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      loadItems(`?query=${encodeURIComponent(v)}`);
    }, 300);
  }

  useEffect(() => {
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, []);

const SELECT_OPTIONS_STATUS = [
  { value: '', label: 'Select status' },
  { value: 'new', label: 'New' },
  { value: 'review', label: 'Review' },
  { value: 'confirm', label: 'Confirm' },
  { value: 'safe', label: 'Safe' },
  { value: 'clear', label: 'Clear' },
];

function toggleSort(key) {
  setSortConfig((prev) => {
    if (prev.key === key) {
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    }
    return { key, direction: 'asc' };
  });
}

function getSortIcon(key) {
  if (sortConfig.key !== key) return '⇅';
  return sortConfig.direction === 'asc' ? '▲' : '▼';
}

const sortedItems = useMemo(() => {
  if (!sortConfig.key) return items;

  return [...items].sort((a, b) => {
    let v1 = a[sortConfig.key];
    let v2 = b[sortConfig.key];

    if (v1 == null) return 1;
    if (v2 == null) return -1;

    if (typeof v1 === 'number' && typeof v2 === 'number') {
      return sortConfig.direction === 'asc' ? v1 - v2 : v2 - v1;
    }

    return sortConfig.direction === 'asc'
      ? String(v1).localeCompare(String(v2))
      : String(v2).localeCompare(String(v1));
  });
}, [items, sortConfig]);



  function handleChange(e) {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.ticker || !form.date) return;
    try {
      const payload = {
        ticker: form.ticker,
        datetime: form.date,
        close: form.value === '' ? 0 : Number(form.value),
        volume: form.volume === '' || form.volume === undefined ? 0 : Number(form.volume),
        status: form.status || 'new',
        note: form.note || '',
      };

      const res = await fetch(`${API_BASE}/node/anomalies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');

      const a = data.data;
      const mapped = { _id: a._id || a.id, id: a._id || a.id, ticker: a.ticker, date: (a.datetime || a.Datetime || '').slice(0,10), value: a.close, note: a.note };
      setItems((it) => [mapped, ...it]);
      setForm({ id: null, ticker: '', date: '', value: '', note: '' });
      setModalOpen(false);
      
      await Swal.fire({
        icon: 'success',
        title: 'Created',
        text: 'Anomaly created successfully.',
        timer: 1500,
        confirmButtonColor: '#00aaff'
      });
    } catch (err) {
      console.error('Create error', err);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Create failed: ' + err.message,
        confirmButtonColor: '#dc2626'
      });
    }
  }

  function startEdit(item) {
    // map UI row back to edit form
    setForm({ id: item.id || item._id, _id: item._id || item.id, ticker: item.ticker, date: item.date, value: item.value, note: item.note  });
    setEditing(item);
    setModalOpen(true);
  }

  function cancelEdit() {
    setForm({ id: null, ticker: '', date: '', value: '', note: '' });
    setEditing(null);
    setModalOpen(false);
  }

  function openRowActions(item) {
    setRowActions(item);
  }

  function closeRowActions() {
    setRowActions(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      const payload = {
        ticker: form.ticker,
        note: form.note || '',
        status: form.status || 'new',
        updatePerson: user?.username || ''
      };
      const targetId = form._id || form.id;
      const res = await fetch(`${API_BASE}/node/anomalies/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      const a = data.data;
      const mapped = { _id: a._id || a.id, id: a._id || a.id, ticker: a.ticker, date: (a.datetime || a.Datetime || '').slice(0,10), value: a.close, note: a.note };
      setItems((it) => it.map((i) => ((i._id === mapped._id || i.id === mapped.id) ? mapped : i)));
      cancelEdit();
      setModalOpen(false);
      
      await Swal.fire({
        icon: 'success',
        title: 'Updated',
        text: 'Anomaly updated successfully.',
        timer: 1500,
        confirmButtonColor: '#00aaff'
      });
    } catch (err) {
      console.error('Update error', err);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Update failed: ' + err.message,
        confirmButtonColor: '#dc2626'
      });
    }
  }

  async function handleDelete(id) {
    const result = await Swal.fire({
      title: 'Delete',
      text: 'Are you sure you want to delete this anomaly?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete'
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_BASE}/node/anomalies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setItems((it) => it.filter((i) => (i._id !== id && i.id !== id)));
      
      await Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: 'Anomaly deleted successfully.',
        timer: 1500,
        confirmButtonColor: '#00aaff'
      });
    } catch (err) {
      console.error('Delete error', err);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Delete failed: ' + err.message,
        confirmButtonColor: '#dc2626'
      });
    }
  }
  async function loadItems(query = '') {
    setLoading(true);
    setError(null);
    try {
      // attach pagination params; if a query param 'query' is present, fetch full dataset then filter/paginate client-side
      const provided = new URLSearchParams(query ? query.replace(/^\?/, '') : '');
      const rawQuery = provided.get('query');
      const queryTerm = (rawQuery !== null ? rawQuery : (searchTerm || '')).trim();
      let url;
      // If the caller provided an explicit `?query=` (even empty), treat it as "fetch all" then client-side filter.
      const fetchingAllForQuery = rawQuery !== null ? true : !!queryTerm;
      if (fetchingAllForQuery) {
        url = `${API_BASE}/node/anomalies`;
      } else {
        provided.set('limit', String(limit));
        provided.set('skip', String((page - 1) * limit));
        url = `${API_BASE}/node/anomalies?${provided.toString()}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      const list = data.data || data || [];
      // try to read total count from response (common fields: total, totalCount, count)
      const totalCount = data.total || data.totalCount || data.count || data.totalItems || null;
      if (totalCount !== null && totalCount !== undefined) setTotal(Number(totalCount));
      let mapped = (list || []).map((a) => ({ _id: a._id || a.id, id: a._id || a.id, ticker: a.ticker, date: (a.datetime || a.Datetime || '').slice(0,10), value: a.close, note: a.note, companyName: a.companyName, volume: a.volume, status: a.status , updatePerson: a.updatePerson  }));

      // if searching, filter mapped results by ticker or company name (client-side)
      if (fetchingAllForQuery && queryTerm) {
        const qLower = queryTerm.toLowerCase();
        mapped = mapped.filter((row) => {
          const hay = `${row.ticker || ''} ${row.companyName || row.company || row.name || ''} ${row.note || ''}`.toLowerCase();
          return hay.indexOf(qLower) !== -1;
        });
        // update total to filtered count
        setTotal(mapped.length);
        // paginate filtered results
        const startIdx = (page - 1) * limit;
        const pageSlice = mapped.slice(startIdx, startIdx + limit);
        setItems(pageSlice);
      } else {
        setItems(mapped);
      }
      // after refresh, on mobile ensure user sees top of list
      setTimeout(() => {
        const main = document.querySelector('.main-container');
        if (main && typeof main.scrollTo === 'function') main.scrollTo({ top: 0, behavior: 'smooth' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);
    } catch (err) {
      console.error('Load anomalies error', err);
      setError(err.message || 'Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

  // reload when page or limit changes
  useEffect(() => { loadItems(); }, [page, limit]);

  function openCreate() {
    const today = new Date();
    const iso = today.toISOString().slice(0,10);
    setForm({ id: null, ticker: '', date: iso, value: '', note: '', companyName: '', volume: '', status: 'new' });
    setEditing(null);
    setModalOpen(true);
    // focus first input on next tick for mobile keyboard support
    setTimeout(() => {
      const input = document.querySelector('.modal input[name="ticker"]');
      if (input) input.focus();
    }, 120);
  }

  async function save(e) {
    // wrapper: if editing has id -> saveEdit, else handleAdd
    if (editing && (editing._id || editing.id)) {
      await saveEdit(e);
    } else {
      await handleAdd(e);
    }
    // refresh list
    loadItems();
  }

  function fmtDate(d) {
    if (!d) return '-';
    try { return ('' + d).slice(0,10); } catch { return d; }
  }

  function fmtClose(v) {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (Number.isNaN(n)) return '-';
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  function fmtVolume(v) {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (Number.isNaN(n)) return '-';
    return new Intl.NumberFormat().format(n);
  }

  const TableRow = useCallback(function TableRow({ r }) {
    const rowId = r._id || r.id;
    const isHovered = hovered === rowId;
    return (
      <tr
        key={rowId}
        onMouseEnter={() => setHovered(rowId)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => openRowActions(r)}
        style={{
          backgroundColor: isHovered ? "var(--bg-hover)" : "transparent",
          transition: "background-color 0.15s ease",
          cursor: 'pointer'
        }}
      >
        <td className="col-ticker">{r.ticker}</td>
        <td className="company">{r.companyName || r.name || r.company || "-"}</td>
        <td className="col-date">{fmtDate(r.date)}</td>
        <td className="col-number">{fmtClose(r.value)}</td>
        <td className="col-volume col-number">{fmtVolume(r.volume)}</td>
        <td className="col-date">
          <span className={`badge status-${(r.status || 'new').toLowerCase()}`}>
            {r.status || 'New'}
          </span>
        </td>
        <td className="actions-cell">
          <div className="actions">
            <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openRowActions(r); }}>•••</button>
          </div>
        </td>
      </tr>
    );
  }, [hovered]);

  return (
    <div className="anomalies-page">
      {/* Sidebar Section */}
      <div className="sidebar-container">
        <Sidebar />
      </div>

      {/* Main Content Section */}
      <main className="main-container">
        <div className="admin-header">
          <div>
             <h2>Anomalies Management</h2>
             <p className="admin-subtitle">Monitor and manage market irregularities.</p>
          </div>
          <div className="admin-actions">
            <input
              type="search"
              className="search-input"
              placeholder="Search ticker or company"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={(e) => { if (e.key === 'Enter') { if (searchDebounce.current) clearTimeout(searchDebounce.current); loadItems(`?query=${encodeURIComponent(searchTerm)}`); } }}
              aria-label="Search ticker or company"
            />

            <button onClick={openCreate} className="btn">
              + Create New
            </button>
          </div>
        </div>

        {loading && <div className="loading-state">Loading data...</div>}
        {error && <div className="error-state">{error}</div>}

        {!loading && !error && (
          <div className="card-table">
            <div className="table-wrapper">
              <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('ticker')}>Ticker <span className="sort-icon">{getSortIcon('ticker')}</span></th>
                  <th onClick={() => toggleSort('companyName')}>Company<span className="sort-icon">{getSortIcon('companyName')}</span></th>
                  <th onClick={() => toggleSort('date')}>Date <span className="sort-icon">{getSortIcon('date')}</span></th>
                  <th className="center-right" onClick={() => toggleSort('value')}>Close <span className="sort-icon">{getSortIcon('value')}</span></th>
                  <th className="center-right" onClick={() => toggleSort('volume')}>Volume <span className="sort-icon">{getSortIcon('volume')}</span></th>
                  <th className="center-left" onClick={() => toggleSort('status')}>Status <span className="sort-icon">{getSortIcon('status')}</span></th>
                  <th></th>
                </tr>
              </thead>
                <tbody>
                {sortedItems.map((r) => (
                  <TableRow key={r._id || r.id} r={r} />
                ))}
                {items.length === 0 && (
                   <tr><td colSpan="7" style={{textAlign:'center', padding: '32px'}}>No anomalies found.</td></tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination controls */}
        <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <span style={{ margin: '0 8px' }}>Page {page}{total ? ` / ${Math.max(1, Math.ceil(total / limit))}` : ''}</span>
            <button className="btn btn-small" onClick={() => setPage((p) => p + 1)} disabled={total !== null && page >= Math.ceil(total / limit)}>Next</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rows:</label>
            <div style={{ minWidth: 88 }}>
              <DropdownSelect
                value={String(limit)}
                onChange={(v) => { setLimit(Number(v)); setPage(1); }}
                options={[
                  { value: '10', label: '10' },
                  { value: '20', label: '20' },
                  { value: '50', label: '50' },
                  { value: '100', label: '100' },
                ]}
              />
            </div>
            <button className="btn btn-small" onClick={() => { setPage(1); loadItems(); }}>Refresh</button>
          </div>
        </div>

        {/* Modal form */}
        {modalOpen && (
          <div className="modal-overlay" onClick={() => cancelEdit()}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editing ? 'Edit Anomaly' : 'Create Anomaly'}
                </h3>
                <button className="modal-close" onClick={() => cancelEdit()}>×</button>
              </div>

              <div className="form-grid">
                {editing ? (
                  <>
                    <label className="form-field">
                      <span>Ticker</span>
                      <input className="input-readonly" value={form.ticker} readOnly />
                    </label>
                    <label className="form-field">
                      <span>Company</span>
                      <input className="input-readonly" value={form.companyName || '-'} readOnly />
                    </label>
                    <label className="form-field">
                      <span>Close Price</span>
                      <input className="input-readonly" value={fmtClose(form.value)} readOnly />
                    </label>
                    <label className="form-field">
                      <span>Volume</span>
                      <input className="input-readonly" value={fmtVolume(form.volume)} readOnly />
                    </label>
                    <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Date</span>
                      <input className="input-readonly" value={fmtDate(form.date)} readOnly />
                    </label>

                    <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />

                    <label className="form-field">
                      <span>Status</span>
                      <DropdownSelect
                        value={form.status || ''}
                        onChange={(v) => setForm({ ...form, status: v })}
                        placeholder="Select status"
                        options={SELECT_OPTIONS_STATUS}
                      />
                    </label>
                    <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Analyst Note</span>
                      <textarea
                        className="textarea"
                        value={form.note || ''}
                        onChange={(e) => setForm({ ...form, note: e.target.value })}
                        placeholder="Add comments about this anomaly..."
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="form-field">
                      <span>Ticker</span>
                      <input name="ticker" value={form.ticker} onChange={handleChange} placeholder="E.g. AAPL" />
                    </label>
                    <label className="form-field">
                      <span>Company</span>
                      <input name="companyName" value={form.companyName || ''} onChange={handleChange} placeholder="Optional company name" />
                    </label>
                    <label className="form-field">
                      <span>Close Price</span>
                      <div className="number-stepper">
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => setForm((s) => ({ ...s, value: (Math.max(0, (Number(s.value || 0) - 0.01))).toFixed(2) }))}
                          aria-label="Decrease close price"
                        >
                          −
                        </button>
                        <input name="value" type="number" step="0.01" value={form.value} onChange={handleChange} placeholder="Close price" />
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => setForm((s) => ({ ...s, value: (Number(s.value || 0) + 0.01).toFixed(2) }))}
                          aria-label="Increase close price"
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <label className="form-field">
                      <span>Volume</span>
                      <div className="number-stepper">
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => setForm((s) => ({ ...s, volume: String(Math.max(0, (Number(s.volume || 0) - 1))) }))}
                          aria-label="Decrease volume"
                        >
                          −
                        </button>
                        <input name="volume" type="number" value={form.volume || ''} onChange={handleChange} placeholder="Volume" />
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => setForm((s) => ({ ...s, volume: String((Number(s.volume || 0) + 1)) }))}
                          aria-label="Increase volume"
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Date</span>
                      <input name="date" type="date" value={form.date} onChange={handleChange} />
                    </label>

                    <hr style={{ gridColumn: '1 / -1', width: '100%', border: 0, borderTop: '1px solid var(--border-color)', margin: 0 }} />

                    <label className="form-field">
                      <span>Status</span>
                      <DropdownSelect
                        value={form.status || 'new'}
                        onChange={(v) => setForm((s) => ({ ...s, status: v }))}
                        options={SELECT_OPTIONS_STATUS}
                      />
                    </label>
                    <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Analyst Note</span>
                      <textarea
                        name="note"
                        className="textarea"
                        value={form.note || ''}
                        onChange={handleChange}
                        placeholder="Add comments about this anomaly..."
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button onClick={save} className="btn btn-large">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Note viewer popup */}
        {noteView && (
          <div className="modal-overlay" onClick={() => setNoteView(null)}>
            <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  Note: {noteView.ticker} {noteView.date ? `on ${fmtDate(noteView.date)}` : ''}
                </h3>
                <button className="modal-close" onClick={() => setNoteView(null)}>×</button>
              </div>

              <div style={{
                padding: '24px',
                lineHeight: '1.6',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word'
              }}>
                {noteView.note || '(No note provided)'}
                {noteView.updatePerson && (
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-primary)' }}>
                    <em>Last updated by {noteView.updatePerson}</em>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Row actions modal */}
        {rowActions && (
          <div className="modal-overlay" onClick={() => closeRowActions()}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Actions</h3>
                <button className="modal-close" onClick={() => closeRowActions()}>×</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button style={modalButtonStyles.secondary} className="btn btn-small btn-secondary" onClick={() => { setNoteView(rowActions); closeRowActions(); }}>View Note</button>
                <button style={modalButtonStyles.primary} className="btn btn-small btn-primary" onClick={() => { startEdit(rowActions); closeRowActions(); }}>Edit</button>
                <button style={modalButtonStyles.danger} className="btn btn-small btn-danger" onClick={() => { handleDelete(rowActions._id || rowActions.id); closeRowActions(); }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AnomaliesManagementPage;

