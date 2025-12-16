import React, { useEffect, useState, useRef } from 'react';
import './FlexTable.css';

const DEFAULT_LIMITS = [10, 20, 50, 100];

export default function FlexTable({
  columns = [],
  keyField = '_id',
  renderRow,
  emptyText = 'No items.',
  fetchUrl,
  refreshSignal = 0,
  enablePagination = true,
  showHeader = true,
  showSearch = true,
  onCreate,
  createLabel = '+ Create',
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMITS[0]);
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  const lastSignal = useRef(refreshSignal);

  useEffect(() => {
    if (refreshSignal !== lastSignal.current) {
      lastSignal.current = refreshSignal;
      setPage(1);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, sortKey, sortDir]);

  // Debounce search input to avoid firing requests on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function load() {
    if (!fetchUrl) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      // If searching, fetch a larger window and perform client-side filtering
      const searching = (search || '').toString().trim().length > 0;
      if (enablePagination && !searching) {
        params.set('limit', String(limit));
        params.set('skip', String((page - 1) * limit));
      } else if (searching) {
        // fetch more rows to allow client-side filtering; cap to a reasonable max
        params.set('limit', String(2000));
        params.set('skip', '0');
      }
      if (searching) params.set('query', search);
      if (sortKey) {
        // Send both legacy and backend-friendly params. Map common column keys to backend fields.
        const map = {
          date: 'datetime',
          value: 'close',
          companyName: 'companyName',
          volume: 'volume',
          ticker: 'ticker',
          status: 'status',
        };
        const sortBy = map[sortKey] || sortKey;
        params.set('sortBy', sortBy);
        if (sortDir) params.set('sortOrder', sortDir);
        // compatibility: include old keys too
        params.set('sortKey', sortKey);
        if (sortDir) params.set('sortDir', sortDir);
      }
      const url = params.toString() ? `${fetchUrl}?${params.toString()}` : fetchUrl;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      let list = data.data || data || [];
      list = Array.isArray(list) ? list : [];

      // If searching, apply client-side filtering across ticker/companyName/note
      if (searching) {
        const q = String(search).toLowerCase();
        const filtered = list.filter((row) => {
          const hay = `${row.ticker || ''} ${row.companyName || row.company || row.name || ''} ${row.note || ''}`.toLowerCase();
          return hay.indexOf(q) !== -1;
        });
        const totalCount = filtered.length;
        setTotal(totalCount);
        // paginate the filtered results
        const start = (page - 1) * limit;
        const pageSlice = filtered.slice(start, start + limit);
        setRows(pageSlice);
      } else {
        setRows(list);
        const totalCount = data.total || data.totalCount || data.count || data.totalItems || null;
        if (totalCount !== null && totalCount !== undefined) setTotal(Number(totalCount));
        else setTotal(null);
      }
    } catch (err) {
      console.error('FlexTable load error', err);
      setError(err.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      // clear sort
      setSortKey(null);
      setSortDir(null);
    }
    setPage(1);
  }

  function getSortIcon(key) {
    if (sortKey !== key) return '⇅';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  return (
    <div className="flex-table-root">
      <div className="flex-table-toolbar">
        <div className="flex-table-left">
          {showSearch && (
            <input
              type="search"
              className="search-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            />
          )}
        </div>
        <div className="flex-table-right">
          {onCreate && (
            <button className="btn" onClick={onCreate}>{createLabel}</button>
          )}
        </div>
      </div>

      <div className="card-table">
        <div className="table-wrapper">
          <table>
            {/* Use a colgroup so column widths are enforced for both thead and tbody
                (prevents header/body misalignment when the table scrolls). */}
            {columns && columns.length > 0 && (
              <colgroup>
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
            )}
            {showHeader && (
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width || undefined }}
                      className={c.className || undefined}
                      onClick={() => c.sortable ? toggleSort(c.key) : undefined}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{c.label}</span>
                        {c.sortable && <span className="sort-icon">{getSortIcon(c.key)}</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {loading && (
                <tr><td colSpan={columns.length} style={{ padding: 24, textAlign: 'center' }}>Loading...</td></tr>
              )}
              {!loading && error && (
                <tr><td colSpan={columns.length} style={{ padding: 24, textAlign: 'center' }}>{error}</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: 'center' }}>{emptyText}</td></tr>
              )}
              {!loading && !error && rows.map((r) => (
                renderRow ? renderRow({ row: r }) : (
                  <tr key={r[keyField] || r.id}>
                    {columns.map((c) => (
                      <td key={c.key} className={c.className || undefined}>
                        {String(r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {enablePagination && (
        <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <span style={{ margin: '0 8px' }}>Page {page}{total ? ` / ${Math.max(1, Math.ceil(total / limit))}` : ''}</span>
            <button className="btn btn-small" onClick={() => setPage((p) => p + 1)} disabled={total !== null && page >= Math.ceil(total / limit)}>Next</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rows:</label>
            <div style={{ minWidth: 88 }}>
              <select className="rows-select" value={String(limit)} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {DEFAULT_LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <button className="btn btn-small" onClick={() => { setPage(1); load(); }}>Refresh</button>
          </div>
        </div>
      )}

    </div>
  );
}
