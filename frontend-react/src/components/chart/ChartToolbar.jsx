import React from 'react';

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
  toggleFullscreen, isFullscreen
}) {
  function handlePeriodChange(newPeriod) {
    setPeriod(newPeriod);
    const allowed = ALLOWED_INTERVALS[newPeriod] || ['1d'];
    if (!allowed.includes(interval)) setInterval(allowed[0]);
  }

  if (toolbarCollapsed) {
    return (
      <button className="toolbar-fab" onClick={() => setToolbarCollapsed(false)} aria-label="Open toolbar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    );
  }

  return (
    <div className={`chart-toolbar floating`}>      
      <div className="toolbar-group">
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
      {/* Indicators panel removed: users can toggle indicators via legend eye icons */}
      {/* Plotly theme selector removed per user request */}
      <div className="toolbar-group toolbar-actions">
        <button className="toolbar-btn" title="Refresh" onClick={refresh}>↻</button>
        <button className="toolbar-btn" title="Fullscreen" onClick={toggleFullscreen}>{isFullscreen ? '⛶' : '⛶'}</button>
      </div>
      <button className="toolbar-fab small close right" onClick={() => setToolbarCollapsed(true)} aria-label="Collapse toolbar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}