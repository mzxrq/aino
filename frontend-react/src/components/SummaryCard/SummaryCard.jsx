import React from 'react';
import './SummaryCard.css';

export default function SummaryCard({ label, value, prev, periodThis, periodPrev, periodLabel, weekThis, weekPrev, prevWeek, theme = 'theme-light', className = '' }) {
  const cls = `summary-card ${theme} ${className}`.trim();

  const formatPct = (a, b) => {
    const na = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const A = na(a);
    const B = na(b);
    const denom = Math.abs(B) === 0 ? 1 : Math.abs(B);
    const pct = ((A - B) / denom) * 100;
    return `${Math.abs(pct).toFixed(1)}%`;
  };

  const renderIndicator = () => {
    // Prefer period-based indicator (periodThis/periodPrev), then fall back to weekThis/weekPrev, then prev snapshot
    const aVal = (periodThis !== undefined && periodPrev !== undefined) ? Number(periodThis)
      : (weekThis !== undefined && weekPrev !== undefined) ? Number(weekThis) : null;
    const bVal = (periodThis !== undefined && periodPrev !== undefined) ? Number(periodPrev)
      : (weekThis !== undefined && weekPrev !== undefined) ? Number(weekPrev) : null;

    // Determine values to compare. Prefer period, then week, then snapshot, else fallback to zero.
    let a = null;
    let b = null;
    if (aVal !== null && bVal !== null) {
      a = aVal; b = bVal;
    } else if (prev !== undefined && prev !== null) {
      a = Number(value) || 0; b = Number(prev) || 0;
    } else {
      a = Number(value) || 0; b = 0; // no history -> show zero baseline
    }

    // Ensure numeric values
    a = Number.isFinite(a) ? a : (Number(value) || 0);
    b = Number.isFinite(b) ? b : (Number(prev) || 0);

    const deltaRaw = a - b;
    const delta = Math.round(deltaRaw);
    const pctText = formatPct(a, b);
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
    const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
    const title = `Change vs previous: ${delta} (${pctText})`;
    return (
      <span
        className={`summary-indicator ${cls}`}
        title={title}
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {arrow} {deltaText} ({pctText})
      </span>
    );
  };
  // bottom summary line removed per request

  const formatValue = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && v.trim() === '...') return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const abs = Math.abs(n);
    if (abs >= 1000) {
      // show in K format with one decimal when needed (e.g., 1.2K)
      const sign = n < 0 ? '-' : '';
      const k = Math.round((abs / 100) ) / 10; // one decimal precision
      return `${sign}${k}K`;
    }
    try {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      return String(n);
    }
  };

  return (
    <div className={cls}>
      <div className="summary-value">{formatValue(value)}</div>
      <div className="summary-label">{label}</div>
      {renderIndicator()}
    </div>
  );
}
