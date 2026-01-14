import React, { useState, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { useAuth } from '../../context/useAuth';

export default function AdminActivityLogsPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user, token } = useAuth();

  const renderRow = useCallback(({ row }) => {
    const tz = (user && user.timeZone) || undefined;
    // backend may return grouped items shaped as { id, timestamp, text, raw }
    const lg = row && (row.raw || row) || {};
    const ts = lg && (lg.timestamp || lg.createdAt || lg.time || lg.ts || row.timestamp) || '';
    let timeStr = '-';
    if (ts) {
      try { timeStr = formatToUserTZSlash(ts, tz); } catch { timeStr = String(ts); }
    }
    const actorName = (lg && lg.actor && (lg.actor.name || lg.actor.username)) || lg.userName || lg.user || '-';
    const actionType = lg && (lg.actionType || lg.action || lg.message || lg.type) || '-';
    const collectionName = lg && (lg.collectionName || lg.collection || (lg.meta && lg.meta.collectionName)) || '';
    const actionDisplay = collectionName ? `${actionType} ${collectionName}` : actionType;
    return (
      <tr key={row._id || row.id || lg._id || lg.id}>
        <td className="col-date">{actorName}</td>
        <td className="company">{actionDisplay}</td>
        <td className="col-date">{timeStr}</td>
      </tr>
    );
  }, [user]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Activity Logs</h2>
          <p className="admin-subtitle">Recent user and system activity.</p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={async () => {
            const r = await Swal.fire({ icon: 'warning', title: 'Delete All Activity Logs', html: '<strong>This will permanently delete ALL activity logs.</strong><br/>This action cannot be undone. Are you sure?', showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, delete all' });
            if (!r.isConfirmed) return;
            try {
              const res = await fetch(`${API_BASE}/node/logs/all`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || 'Delete all failed');
              setRefreshSignal(s => s + 1);
              await Swal.fire({ icon: 'success', title: 'Deleted', text: 'All activity logs deleted.', timer: 1200 });
            } catch (err) {
              console.error('Delete all activity logs error', err);
              await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete all failed: ' + err.message });
            }
          }}>Delete All</button>
        </div>
      </div>

      <FlexTable
        columns={[
          { key: 'user', label: 'User', width: '200px' },
          { key: 'action', label: 'Action', width: '1fr' },
          { key: 'createdAt', label: 'Date', width: '220px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText="No activity logs found."
        fetchUrl={`${API_BASE}/node/logs`}
        // allow keyword to match any column/value in the row
        searchFields="any"
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
      />
    </main>
  );
}
