import React from 'react';

export function IndicatorPanel({ open, showVolume, setShowVolume, showBollinger, setShowBollinger, showSMA, setShowSMA, showRSI, setShowRSI, showVWAP, setShowVWAP }) {
  return (
    <div className={`indicator-panel ${open ? 'open' : ''}`}>
      <label className="indicator-item"><input type="checkbox" checked={showVolume} onChange={() => setShowVolume(!showVolume)} /> <span>Volume</span></label>
      <label className="indicator-item"><input type="checkbox" checked={showBollinger} onChange={() => setShowBollinger(!showBollinger)} /> <span>Bollinger Bands</span></label>
      <label className="indicator-item"><input type="checkbox" checked={showSMA} onChange={() => setShowSMA(!showSMA)} /> <span>SMA (20)</span></label>
      <label className="indicator-item"><input type="checkbox" checked={showRSI} onChange={() => setShowRSI(!showRSI)} /> <span>RSI</span></label>
      <label className="indicator-item"><input type="checkbox" checked={showVWAP} onChange={() => setShowVWAP(!showVWAP)} /> <span>VWAP</span></label>
    </div>
  );
}
