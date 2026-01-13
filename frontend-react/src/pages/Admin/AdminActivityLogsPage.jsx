import React, { useState, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import Swal from '../../utils/muiSwal';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { useAuth } from '../../context/useAuth';

export default function AdminActivityLogsPage() {
  const { i18n } = useLingui();
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user } = useAuth();

  const renderRow = useCallback(({ row }) => {
    const tz = (user && user.timeZone) || undefined;
    const ts = row && (row.timestamp || row.createdAt || row.time || row.timestamp || row.ts) || '';
    let timeStr = '-';
    if (ts) {
      try { timeStr = formatToUserTZSlash(ts, tz); } catch { timeStr = String(ts); }
    }

    const actorName = (row && row.actor && (row.actor.name || row.actor.username)) || row.userName || row.user || '-';
    const actionType = row && (row.actionType || row.action || row.message || row.type) || '-';
    const collectionName = row && (row.collectionName || row.collection || (row.meta && row.meta.collectionName)) || '';
    const actionDisplay = collectionName ? `${actionType} ${collectionName}` : actionType;

    return (
      <tr key={row._id || row.id}>
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
          <h2><Trans>Activity Logs</Trans></h2>
          <p className="admin-subtitle"><Trans>Recent user and system activity.</Trans></p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={async () => {
            const r = await Swal.fire({
              icon: 'warning',
              title: i18n._('Delete All Activity Logs'),
              html: i18n._('<strong>This will permanently delete ALL activity logs.</strong><br/>This action cannot be undone. Are you sure?'),
              showCancelButton: true,
              confirmButtonColor: '#dc2626',
              cancelButtonColor: '#6b7280',
              confirmButtonText: i18n._('Yes, delete all'),
            });
            if (!r.isConfirmed) return;
            try {
              const res = await fetch(`${API_BASE}/node/logs/all`, { method: 'DELETE' });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || 'Delete all failed');
              setRefreshSignal(s => s + 1);
              await Swal.fire({ icon: 'success', title: i18n._('Deleted'), text: i18n._('All activity logs deleted.'), timer: 1200 });
            } catch (err) {
              console.error('Delete all activity logs error', err);
              await Swal.fire({ icon: 'error', title: i18n._('Error'), text: i18n._('Delete all failed: ') + err.message });
            }
          }}><Trans>Delete All</Trans></button>
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
        emptyText={i18n._('No activity logs found.')}
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
