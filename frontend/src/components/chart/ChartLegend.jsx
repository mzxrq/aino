import React, { useRef, useState } from 'react';

export function ChartLegend({ ticker, hoverData, lastData, companyName, dock = 'right', position, onPositionChange }) {
  // Show hover data if present; else last candle
  const displayData = hoverData || lastData;
  if (!displayData) return null;

  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);

  const formatValue = (val) => (typeof val === 'number' ? val.toFixed(2) : (val?.toFixed?.(2) || 'N/A'));
  const formatVolume = (vol) => {
    if (!vol || vol === 'N/A') return 'N/A';
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(vol);
  };

  const style = position ? { top: position.top, left: position.left, right: 'auto' } : undefined;
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

  return (
    <div className={classes.join(' ')} style={style} onMouseDown={onMouseDown}>
      <div className="legend-header">
        <span className="legend-ticker">{ticker}</span>
        {companyName && <span className="legend-company">{companyName}</span>}
      </div>
      {/* Price line: show Close and Volume to avoid confusion in line mode */}
      <div className="legend-data">
        <span>C <strong>{formatValue(displayData.close)}</strong></span>
        {displayData.volume !== undefined && (
          <span>V <strong>{formatVolume(displayData.volume)}</strong></span>
        )}
      </div>
      {/* Indicators line: VWAP / SMA20 / RSI when available */}
      {(hoverData?.vwap !== undefined || hoverData?.sma !== undefined || hoverData?.rsi !== undefined) && (
        <div className="legend-indicators">
          {hoverData?.vwap !== undefined && <span>VWAP <strong>{formatValue(hoverData.vwap)}</strong></span>}
          {hoverData?.sma !== undefined && <span>SMA20 <strong>{formatValue(hoverData.sma)}</strong></span>}
          {hoverData?.rsi !== undefined && <span>RSI <strong>{formatValue(hoverData.rsi)}</strong></span>}
        </div>
      )}
    </div>
  );
}
