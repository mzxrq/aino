import React, { useRef, useState } from 'react';

export function ChartLegend({ ticker, hoverData, lastData, companyName, dock = 'right', position, onPositionChange, chartType, onToggleTrace, legendOffset = 16, traceList = [] }) {
  // Show hover data if present; else last candle
  const displayData = hoverData || lastData;
  if (!displayData) return null;

  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);

  const formatValue = (val) => (typeof val === 'number' ? val.toFixed(2) : (val?.toFixed?.(2) || 'N/A'));
  const formatVolume = (vol) => {
    if (!vol || vol === 'N/A') return 'N/A';
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 }).format(vol);
  };

  let style = position ? { top: position.top, left: position.left, right: 'auto' } : {};
  // If no explicit position and legendOffset provided, position legend next to sidebar
  if (!position) {
    if (dock === 'left') {
      style.left = `${legendOffset}px`;
      style.right = 'auto';
    } else {
      style.right = `${legendOffset}px`;
      style.left = 'auto';
    }
  }
  const classes = ['chart-legend'];
  if (!position && dock === 'left') classes.push('left');
  if (position) classes.push('draggable');

  function onMouseDown(e) {
    if (!onPositionChange) return;
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, top: position?.top || 16, left: position?.left || (dock === 'left' ? 16 : window.innerWidth - 220) };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp, { once: true });
  }
  function onMouseMove(e) {
    if (!dragging || !onPositionChange) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    onPositionChange({ top: Math.max(8, startRef.current.top + dy), left: Math.max(8, startRef.current.left + dx) });
  }
  function onMouseUp() {
    setDragging(false);
    window.removeEventListener('mousemove', onMouseMove);
  }

  // Mini legend: top-left compact display
  const isCandle = chartType === 'candlestick';
  const val = (key) => (hoverData && hoverData[key] != null) ? hoverData[key] : (lastData && lastData[key] != null ? lastData[key] : null);

  // Helper to detect trace visibility from Plotly graph
  function isTraceVisible(key) {
    try {
      const gd = document.querySelector('.js-plotly-plot');
      if (!gd || !gd.data) return true;
      const keyLower = String(key).toLowerCase();
      // Prefer explicit traceList mapping if provided
      if (traceList && traceList.length) {
        for (let t of traceList) {
          const id = (t.id || '').toString().toLowerCase();
          if (id === keyLower || id.includes(keyLower) || (t.name || '').toString().toLowerCase().includes(keyLower)) {
            const idx = t.index;
            const trace = gd.data[idx];
            if (!trace) return true;
            return !(trace.visible === 'legendonly');
          }
        }
      }
      for (let i = 0; i < gd.data.length; i++) {
        const t = gd.data[i];
        const name = (t.name || '').toString().toLowerCase();
        if (keyLower === 'price') {
          if (t.type === 'candlestick' || name.includes('close') || name.includes('price')) return !(t.visible === 'legendonly');
        }
        if (keyLower === 'volume') {
          if (t.type === 'bar' || name.includes('volume')) return !(t.visible === 'legendonly');
        }
        if (keyLower === 'rsi' && name.includes('rsi')) return !(t.visible === 'legendonly');
        if (keyLower === 'vwap' && name.includes('vwap')) return !(t.visible === 'legendonly');
        if (keyLower === 'bb_upper' && name.includes('upper')) return !(t.visible === 'legendonly');
        if (keyLower === 'bb_lower' && name.includes('lower')) return !(t.visible === 'legendonly');
        if (keyLower === 'bb_sma' && (name.includes('sma') || name.includes('sma (20)'))) return !(t.visible === 'legendonly');
      }
    } catch (e) {}
    return true;
  }

  const mini = (
    <div className="legend-data">
      <div className="legend-row ohlcv">
        <span className="legend-label">O</span>
        <strong className="legend-value">{formatValue(val('open'))}</strong>
        <span className="legend-label">H</span>
        <strong className="legend-value">{formatValue(val('high'))}</strong>
        <span className="legend-label">L</span>
        <strong className="legend-value">{formatValue(val('low'))}</strong>
        <span className="legend-label">C</span>
        <strong className="legend-value">{formatValue(val('close'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('price')} title="Toggle price">
          {isTraceVisible('price') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <span className="legend-label">V</span>
        <strong className="legend-value">{formatVolume(val('volume'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('volume')} title="Toggle volume">
          {isTraceVisible('volume') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        {/* price visibility toggle removed from inline legend; use toolbar/sidebar controls */}
      </div>
    <div className="legend-data">
      <div className="legend-row indicators">
        <span className="legend-label">RSI</span>
        <strong className="legend-value">{formatValue(val('rsi') ?? val('RSI'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('rsi')} title="Toggle RSI">
          {isTraceVisible('rsi') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <span className="legend-label">VWAP</span>
        <strong className="legend-value">{formatValue(val('vwap') ?? val('VWAP'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('vwap')} title="Toggle VWAP">
          {isTraceVisible('vwap') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
      </div>
      <div className="legend-row indicators">
        <span className="legend-label">BBT</span>
        <strong className="legend-value">{formatValue(val('BB_upper'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('bb_upper')} title="Toggle BB Upper">
          {isTraceVisible('bb_upper') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <span className="legend-label">BBL</span>
        <strong className="legend-value">{formatValue(val('BB_lower'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('bb_lower')} title="Toggle BB Lower">
          {isTraceVisible('bb_lower') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <span className="legend-label">BBM</span>
        <strong className="legend-value">{formatValue(val('BB_sma') ?? val('sma'))}</strong>
        <button className="legend-eye" onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleTrace && onToggleTrace('bb_sma')} title="Toggle BB SMA">
          {isTraceVisible('bb_sma') ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7 1.5-2.64 4.12-4.72 7.26-5.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
      </div>
      </div>
    </div>
    );

  return (
    <div className={classes.join(' ')} style={style} onMouseDown={onMouseDown}>
      <div className="legend-header">
        <span className="legend-ticker">{ticker}</span>
        {companyName && <span className="legend-company">{companyName}</span>}
      </div>
      {mini}
    </div>
  );
}