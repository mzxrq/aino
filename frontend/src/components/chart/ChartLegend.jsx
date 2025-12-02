import React from 'react';

export function ChartLegend({ ticker, hoverData, lastData, companyName }) {
  // Use hover data if available, otherwise fall back to last data point
  const displayData = hoverData || lastData;
  
  if (!displayData) return null;

  const formatValue = (val) => val?.toFixed?.(2) || 'N/A';
  const formatVolume = (vol) => {
    if (!vol || vol === 'N/A') return 'N/A';
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(vol);
  };

  return (
    <div className="chart-legend">
      <div className="legend-header">
        <span className="legend-ticker">{ticker}</span>
        {companyName && <span className="legend-company">{companyName}</span>}
      </div>
      <div className="legend-data">
        <span>O <strong>{formatValue(displayData.open)}</strong></span>
        <span>H <strong>{formatValue(displayData.high)}</strong></span>
        <span>L <strong>{formatValue(displayData.low)}</strong></span>
        <span>C <strong>{formatValue(displayData.close)}</strong></span>
        {displayData.volume !== undefined && (
          <span>V <strong>{formatVolume(displayData.volume)}</strong></span>
        )}
      </div>
    </div>
  );
}
