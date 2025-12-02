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

  return (
    <div className={`chart-toolbar floating ${toolbarCollapsed ? 'collapsed' : ''}`}>
      <button className="toolbar-collapse-toggle" onClick={() => setToolbarCollapsed(s => !s)} aria-label="Toggle toolbar">{toolbarCollapsed ? '▸' : '▾'}</button>
      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="range-select">Range:</label>
        <select id="range-select" className="toolbar-select" value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
          {['1d','5d','1mo','6mo','ytd','1y','5y'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
      </div>
      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="interval-select">Interval:</label>
        <select id="interval-select" className="toolbar-select" value={interval} onChange={(e) => setInterval(e.target.value)}>
          {(ALLOWED_INTERVALS[period] || ['1d']).map(i => <option key={i} value={i}>{i.toUpperCase()}</option>)}
        </select>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">Type:</span>
        <button className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')} disabled={forcedLineMode} title={forcedLineMode ? 'Candlesticks unavailable for intraday' : ''} style={{ opacity: forcedLineMode ? 0.3 : 1, cursor: forcedLineMode ? 'not-allowed' : 'pointer' }}>Candles</button>
        <button className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
      </div>
      <div className="toolbar-group">
        <button id="indicators-toggle" className={`toolbar-btn ${indicatorsOpen ? 'active' : ''}`} onClick={() => setIndicatorsOpen(!indicatorsOpen)}>Indicators ▾</button>
      </div>
      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="plotly-theme-select">Plotly Theme:</label>
        <select id="plotly-theme-select" className="toolbar-select" value={plotlyTheme} onChange={(e) => setPlotlyTheme(e.target.value)}>
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="toolbar-group">
        <button className={`toolbar-btn ${sidebarOverlay ? 'active' : ''}`} title="Toggle sidebar overlay" onClick={() => setSidebarOverlay(s => !s)}>{sidebarOverlay ? 'Overlay On' : 'Overlay Off'}</button>
        <button className="toolbar-btn" title="Refresh" onClick={refresh}>Refresh</button>
        <button className={`toolbar-btn ${showLegend ? 'active' : ''}`} title="Toggle legend" onClick={() => setShowLegend(s => !s)}>{showLegend ? 'Legend On' : 'Legend Off'}</button>
        <button className="toolbar-btn" title="Fullscreen" onClick={toggleFullscreen}>{isFullscreen ? 'Exit FS' : 'Fullscreen'}</button>
      </div>
    </div>
  );
}
