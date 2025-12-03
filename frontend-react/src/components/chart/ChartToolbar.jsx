import React, { useRef, useState, useEffect } from 'react';

const ALLOWED_INTERVALS = {
  '1d': ['1m', '5m', '15m', '30m', '1h'],
  '5d': ['5m', '15m', '30m', '1h', '1d'],
  '1mo': ['30m', '1h', '1d', '1wk'],
  '6mo': ['1d', '1wk', '1mo'],
  'ytd': ['1d', '1wk', '1mo'],
  '1y': ['1d', '1wk', '1mo'],
  '5y': ['1d', '1wk', '1mo']
};

export function ChartToolbar({
  period, setPeriod,
  interval, setInterval,
  chartType, setChartType,
  forcedLineMode,
  indicatorsOpen, setIndicatorsOpen,
  plotlyTheme, setPlotlyTheme,
  sidebarOverlay, setSidebarOverlay,
  refresh,
  showLegend, setShowLegend,
  toolbarCollapsed, setToolbarCollapsed,
  toggleFullscreen, isFullscreen,
  toolbarDock, setToolbarDock, toolbarPos, setToolbarPos
}) {
  function handlePeriodChange(newPeriod) {
    setPeriod(newPeriod);
    const allowed = ALLOWED_INTERVALS[newPeriod] || ['1d'];
    if (!allowed.includes(interval)) setInterval(allowed[0]);
  }

  const toolbarRef = useRef(null);
  const dragStartRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ left: null, top: null });
  const lastPersisted = useRef({ left: null, top: null });

  useEffect(() => {
    // initialize from props
    if (toolbarPos && toolbarPos.left != null && toolbarPos.top != null) {
      setPos({ left: toolbarPos.left, top: toolbarPos.top });
    }
  }, [toolbarPos]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', endDrag);
    };
  }, []);

  // Use Pointer Events for robust, unified drag handling
  function beginDrag(e) {
    if (!toolbarRef.current) return;
    // ignore right-click
    if (e.button === 2) return;
    e.preventDefault();
    setDragging(true);
    const root = toolbarRef.current;
    const rect = root.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    // store pointer offset from element top-left — works for fixed/absolute/static
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    dragStartRef.current = { offsetX, offsetY };
    // attach pointermove/up listeners on the document to track outside the handle
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', endDrag);
    // ensure we capture subsequent pointer events
    if (e.target && e.target.setPointerCapture && e.pointerId) {
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }

  function onMove(e) {
    if (!dragging) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    const ds = dragStartRef.current;
    if (!ds) return;
    const newLeft = Math.round(clientX - ds.offsetX);
    const newTop = Math.round(clientY - ds.offsetY);
    // clamp to viewport edges (basic) to avoid pushing toolbar entirely off-screen
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = toolbarRef.current;
    const bw = el ? el.getBoundingClientRect().width : 320;
    const bh = el ? el.getBoundingClientRect().height : 60;
    const clampedLeft = Math.min(Math.max(8, newLeft), Math.max(8, vw - bw - 8));
    const clampedTop = Math.min(Math.max(8, newTop), Math.max(8, vh - bh - 8));
    setPos({ left: clampedLeft, top: clampedTop });
  }

  function endDrag(e) {
    setDragging(false);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', endDrag);
    // persist
    try { if (setToolbarPos && pos.left != null) setToolbarPos({ left: pos.left, top: pos.top }); } catch (err) {}
    lastPersisted.current = { left: pos.left, top: pos.top };
    if (e && e.target && e.target.releasePointerCapture && e.pointerId) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  }

  // keyboard nudging on drag handle
  function handleDragKey(e) {
    const step = e.shiftKey ? 16 : 8;
    if (e.key === 'Enter') { try { if (setToolbarPos) setToolbarPos(pos.left == null ? null : { left: pos.left, top: pos.top }); } catch(e){}; return; }
    if (e.key === 'Escape') { const lp = lastPersisted.current || { left: null, top: null }; setPos({ left: lp.left, top: lp.top }); try { if (setToolbarPos) setToolbarPos(lp.left == null ? null : { left: lp.left, top: lp.top }); } catch(e){}; return; }
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    setPos(p => {
      const cur = { left: p.left == null ? 120 : p.left, top: p.top == null ? 80 : p.top };
      if (e.key === 'ArrowLeft') cur.left = Math.max(8, cur.left - step);
      if (e.key === 'ArrowRight') cur.left = cur.left + step;
      if (e.key === 'ArrowUp') cur.top = Math.max(8, cur.top - step);
      if (e.key === 'ArrowDown') cur.top = cur.top + step;
      return cur;
    });
  }

  if (toolbarCollapsed) {
    return (
      <button className="toolbar-fab" onClick={() => setToolbarCollapsed(false)} aria-label="Open toolbar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  const classes = ['chart-toolbar','floating'];
  if (sidebarOverlay || toolbarDock === 'float') classes.push('floating-fixed');
  if (dragging) classes.push('dragging');
  const style = {};
  if ((sidebarOverlay || toolbarDock === 'float') && pos.left !== null) {
    style.left = `${pos.left}px`;
    style.top = `${pos.top}px`;
    style.right = 'auto';
  }

  return (
    <div ref={toolbarRef} className={classes.join(' ')} style={style} role="toolbar" aria-label="Chart toolbar">
      <div className="toolbar-group">
        <div className="drag-handle" tabIndex={0} onPointerDown={beginDrag} onTouchStart={beginDrag} onKeyDown={handleDragKey} title="Move toolbar" aria-label="Move toolbar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <g fill="currentColor">
              <circle cx="6" cy="6" r="1.25" />
              <circle cx="12" cy="6" r="1.25" />
              <circle cx="18" cy="6" r="1.25" />
              <circle cx="6" cy="12" r="1.25" />
              <circle cx="12" cy="12" r="1.25" />
              <circle cx="18" cy="12" r="1.25" />
            </g>
          </svg>
        </div>

        <label className="toolbar-label" htmlFor="range-select">Range:</label>
        <select id="range-select" className="toolbar-select md-select" value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
          {['1d','5d','1mo','6mo','ytd','1y','5y'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
      </div>

      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="interval-select">Interval:</label>
        <select id="interval-select" className="toolbar-select md-select" value={interval} onChange={(e) => setInterval(e.target.value)}>
          {(ALLOWED_INTERVALS[period] || ['1d']).map(i => <option key={i} value={i}>{i.toUpperCase()}</option>)}
        </select>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Type:</span>
        <button className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')} disabled={forcedLineMode} title={forcedLineMode ? 'Candlesticks unavailable for intraday' : ''} style={{ opacity: forcedLineMode ? 0.3 : 1, cursor: forcedLineMode ? 'not-allowed' : 'pointer' }}>Candles</button>
        <button className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
        <button className={`toolbar-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')}>Area</button>
      </div>

      <div className="toolbar-group toolbar-actions">
        <button className="toolbar-btn" title="Refresh" onClick={refresh} aria-label="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M21 12a9 9 0 10-3.8 7.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="toolbar-btn" title="Fullscreen" onClick={toggleFullscreen} aria-label="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M4 7V4h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 17v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 17v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0"/>
            <path d="M20 7v-3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0"/>
          </svg>
        </button>
        <button className="toolbar-btn icon-btn" title={toolbarDock === 'float' ? 'Dock toolbar' : 'Float toolbar'} onClick={() => { setToolbarDock(toolbarDock === 'float' ? 'top' : 'float'); }} aria-label="Toggle float">
          {toolbarDock === 'float' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M7 7l-4 0 0-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 17l4 0 0 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 17l-4 0 0 4" stroke="currentColor" strokeWidth="0" opacity="0"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          )}
        </button>
        <button className="toolbar-btn icon-btn" title="Reset toolbar position" onClick={() => { try { if (setToolbarPos) setToolbarPos(null); } catch(e){} }} style={{ marginLeft: 6 }} aria-label="Reset toolbar position">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M21 12a8.9 8.9 0 10-2.6 6.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M21 12v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <button className="toolbar-fab small close right" onClick={() => setToolbarCollapsed(true)} aria-label="Collapse toolbar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}