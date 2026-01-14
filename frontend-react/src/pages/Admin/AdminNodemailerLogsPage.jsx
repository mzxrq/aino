import React, { useState, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import API_BASE from '../../config/api';
import '../../css/AdminPage.css';
import FlexTable from '../../components/FlexTable/FlexTable';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { useAuth } from '../../context/useAuth';

export default function AdminNodemailerLogsPage() {
  const { i18n } = useLingui();
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user } = useAuth();

  const renderRow = useCallback(({ row }) => {
    const tz = (user && user.timeZone) || undefined;
    const ts = row && (row.sentAt || row.sent_at || row.time || row.createdAt || row.fetched_at || (row.payload && (row.payload.sentAt || row.payload.sent_at))) || '';
    let timeStr = '-';
    if (ts) {
      try { timeStr = formatToUserTZSlash(ts, tz); } catch { timeStr = String(ts); }
    }
    return (
      <tr key={row && (row.id || row._id) || Math.random()}>
        <td className="col-date">{row && (row.to || row.recipient) || '-'}</td>
        <td className="company">{row && (row.subject || row.title) || '-'}</td>
        <td className="col-date">{timeStr}</td>
      </tr>
    );
  }, [user]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2><Trans>Nodemailer Logs</Trans></h2>
          <p className="admin-subtitle"><Trans>Local nodemailer cache logs.</Trans></p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={async () => {
            const ok = window.confirm(i18n._('Delete ALL nodemailer logs? This cannot be undone.'));
            if (!ok) return;
            try {
              const res = await fetch(`${API_BASE}/node/admin/delete_all?collection=nodemailer_logs`, { method: 'DELETE' });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || i18n._('Delete all failed'));
              setRefreshSignal((s) => s + 1);
              alert(i18n._('All nodemailer logs deleted'));
            } catch (err) {
              console.error('Delete all nodemailer logs error', err);
              alert(i18n._('Delete failed: ') + err.message);
            }
          }}>{/* Delete All */}<Trans>Delete All</Trans></button>
        </div>
      </div>

      <FlexTable
        columns={[
          { key: 'to', label: 'To', width: '240px' },
          { key: 'subject', label: 'Subject', width: '1fr' },
          { key: 'sent_at', label: 'Time', width: '220px' },
        ]}
        keyField="_id"
        renderRow={renderRow}
        emptyText={i18n._('No nodemailer logs found.')}
        fetchUrl={`${API_BASE}/node/mail/logs`}
        refreshSignal={refreshSignal}
        enablePagination={true}
        showHeader={true}
        showSearch={true}
      />
    </main>
  );
}
