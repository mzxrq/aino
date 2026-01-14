import React, { useState, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { useAuth } from '../../context/useAuth';

export default function AdminNotificationLogsPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user } = useAuth();

  const renderRow = useCallback(({ row }) => {
    const tz = (user && user.timeZone) || undefined;
    const ts = row && (row.createdAt || row.fetched_at || row.sent_at || (row.payload && row.payload.sent_at)) || '';
    let timeStr = '-';
    if (ts) {
      try { timeStr = formatToUserTZSlash(ts, tz); } catch { timeStr = String(ts); }
    }
    const subject = (row && row.payload && (row.payload.subject || row.payload.title)) || row.subject || row.type || '-';
    return (
      <tr key={row._id || row.id}>
        <td className="col-date">{row._id || '-'}</td>
        <td className="company">{subject}</td>
        <td className="col-date">{timeStr}</td>
      </tr>
    );
  }, [user]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2>Notification Logs</h2>
          <p className="admin-subtitle">Logs of sent notifications (emails/LINE).</p>
        </div>
        <div className="admin-actions">
        <button className="btn btn-danger" onClick={async () => {
          const r = await Swal.fire({ icon: 'warning', title: 'Delete All Notification Logs', html: '<strong>This will permanently delete ALL notification logs.</strong><br/>This action cannot be undone. Are you sure?', showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, delete all' });
          if (!r.isConfirmed) return;
          try {
            const res = await fetch(`${API_BASE}/node/admin/delete_all?collection=notification_logs`, { method: 'DELETE' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Delete all failed');
            setRefreshSignal((s) => s + 1);
            await Swal.fire({ icon: 'success', title: 'Deleted', text: 'All notification logs deleted.', timer: 1200 });
          } catch (err) {
            console.error('Delete all notification logs error', err);
            await Swal.fire({ icon: 'error', title: 'Error', text: 'Delete all failed: ' + err.message });
          }
        }}>Delete All</button>
        </div>
      </div>

      <FlexTable
        columns={[
          { key: '_id', label: 'ID', width: '220px' },
          { key: 'subject', label: 'Subject / Type', width: '1fr' },
          { key: 'sent_at', label: 'Sent At', width: '220px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText="No notification logs found."
        fetchUrl={`${API_BASE}/node/notification_logs`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
      />
    </main>
  );
}
