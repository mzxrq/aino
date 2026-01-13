import React, { useState, useCallback, useEffect } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import API_BASE from '../../config/api';
import GenericModal from '../../components/GenericModal/GenericModal';
import FlexTable from '../../components/FlexTable/FlexTable';
import '../../css/AdminPage.css';
import { formatToUserTZSlash } from '../../utils/dateUtils';
import { useAuth } from '../../context/useAuth';

const PY_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_LINE_PY_URL) || '';

export default function AdminJobsPage() {
  const { i18n } = useLingui();
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { user } = useAuth();

  const renderRow = useCallback(({ row, index }) => {
    const key = row && (row.id || row._id || row.name) || `job-${index}`;
    const tz = (user && user.timeZone) || undefined;
    const nextCandidates = [
      'next_run_time', 'nextRunTime', 'next_run', 'next_run_at', 'nextRunAt', 'next', 'next_run'
    ];
    let nextVal = null;
    for (const k of nextCandidates) {
      if (row && row[k]) { nextVal = row[k]; break; }
    }
    // If scheduler returns an object like { next_run_time: { utc: ..., local: ... } }
    if (nextVal && typeof nextVal === 'object') {
      // try common fields
      nextVal = nextVal.local || nextVal.iso || nextVal.utc || nextVal.toString();
    }
    let nextDisplay = '-';
    if (nextVal) {
      try { nextDisplay = formatToUserTZSlash(nextVal, tz); } catch { nextDisplay = String(nextVal); }
    } else if (row && row.name) {
      nextDisplay = row.name;
    }

    const trigger = (row && (row.trigger && row.trigger.cron)) || row.trigger || row.cron || '-';

    return (
      <tr key={key}>
        <td className="col-date">{key}</td>
        <td className="company">{nextDisplay}</td>
      </tr>
    );
  }, [user]);

  return (
    <main className="main-container">
      <div className="admin-header">
        <div>
          <h2><Trans>Scheduled Jobs</Trans></h2>
          <p className="admin-subtitle"><Trans>Cron jobs managed by the Python scheduler.</Trans></p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-danger" onClick={async () => {
            const r = await window.confirm(i18n._('Delete ALL scheduled jobs? This may be irreversible. Proceed?'));
            if (!r) return;
            try {
              const res = await fetch(`${PY_BASE}/py/cron/clear`, { method: 'POST' });
              if (res.ok) {
                  setRefreshSignal(s => s + 1);
                alert(i18n._('Jobs cleared'));
              } else {
                // fallback to node admin route if Python endpoint missing
                const r2 = await fetch(`${API_BASE}/node/admin/delete_all?collection=cron_jobs`, { method: 'DELETE' });
                if (!r2.ok) throw new Error('Failed to clear jobs');
                alert(i18n._('Jobs cleared via admin route'));
                  setRefreshSignal(s => s + 1);
              }
            } catch (err) {
              console.error('Clear jobs error', err);
              alert(i18n._('Failed to clear jobs: ') + (err.message || String(err)));
            }
          }}><Trans>Delete All</Trans></button>
        </div>
      </div>

      <FlexTable
        columns={[
          { key: 'id', label: i18n._('Job ID'), width: '320px' },
          { key: 'next_run_time', label: i18n._('Next Run'), width: '220px' },
        ]}
        keyField="id"
        renderRow={renderRow}
        fetchUrl={`${PY_BASE}/py/cron/jobs`}
        emptyText={i18n._('No scheduled jobs found.')}
        enablePagination={true}
        showHeader={true}
        showSearch={false}
        refreshSignal={refreshSignal}
      />
    </main>
  );
}
