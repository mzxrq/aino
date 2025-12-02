import React, { useMemo, useRef, useEffect } from 'react';
import Plot from 'react-plotly.js';

export function PlotContainer({ data, layout, showLegend, plotlyTheme, isDarkTheme, onHoverChange }) {
  const plotRef = useRef(null);

  const themed = useMemo(() => {
    let effectiveTheme;
    if (plotlyTheme === 'auto') effectiveTheme = isDarkTheme; else if (plotlyTheme === 'dark') effectiveTheme = true; else effectiveTheme = false;

    const bodyStyle = (typeof window !== 'undefined') ? getComputedStyle(document.body) : null;
    const root = (typeof window !== 'undefined') ? getComputedStyle(document.documentElement) : null;
    const cardBgRaw = (bodyStyle && bodyStyle.getPropertyValue('--card-bg')) || (root && root.getPropertyValue('--card-bg')) || (root && root.getPropertyValue('--bg-secondary')) || (root && root.getPropertyValue('--bg-main')) || '';
    const textRaw = (bodyStyle && bodyStyle.getPropertyValue('--text-primary')) || (root && root.getPropertyValue('--text-primary')) || '';
    const cardBg = cardBgRaw ? cardBgRaw.trim() : null;
    const textColor = textRaw ? textRaw.trim() : (effectiveTheme ? '#E0E0E0' : '#111');
    const plotBgColor = cardBg || (effectiveTheme ? '#071024' : '#ffffff');
    const primaryRaw = (bodyStyle && bodyStyle.getPropertyValue('--primary')) || (root && root.getPropertyValue('--primary')) || (root && root.getPropertyValue('--primary-btn')) || '';
    const rootColor = primaryRaw ? primaryRaw.trim() : (effectiveTheme ? '#00aaff' : '#0b63d6');

    const mappedData = data.map(trace => {
      const t = { ...trace };
      if (t.name && t.name.toLowerCase().includes('close') && !t.line?.color) {
        t.line = { ...t.line, color: rootColor };
      }
      if (t.type === 'bar' && t.name && t.name.toLowerCase().includes('volume')) {
        t.marker = { ...t.marker, color: (effectiveTheme ? 'rgba(100,100,100,0.6)' : 'rgba(30,30,30,0.12)') };
      }
      return t;
    });

    return {
      data: mappedData,
      layout: { ...layout, plot_bgcolor: plotBgColor, paper_bgcolor: plotBgColor, font: { color: textColor }, showlegend: showLegend },
    };
  }, [data, layout, showLegend, plotlyTheme, isDarkTheme]);

  // Resize after mount or layout changes
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
        if (gd && window.Plotly?.Plots?.resize) window.Plotly.Plots.resize(gd);
        window.dispatchEvent(new Event('resize'));
      } catch {}
    }, 140);
    return () => clearTimeout(t);
  }, [themed]);

  return (
    <Plot
      ref={plotRef}
      data={themed.data}
      layout={themed.layout}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler={true}
      config={{ 
        responsive: true, 
        displayModeBar: false
      }}
      onHover={(event) => {
        if (!onHoverChange || !event.points || event.points.length === 0) return;
        const point = event.points[0];
        const xIndex = point.pointIndex;
        
        // Extract OHLCV data from the traces
        const hoverData = { x: point.x };
        
        // Find candlestick or line trace for price data
        const priceTrace = data.find(t => t.type === 'candlestick' || (t.name && t.name.includes('Close')));
        if (priceTrace) {
          if (priceTrace.type === 'candlestick') {
            hoverData.open = priceTrace.open?.[xIndex];
            hoverData.high = priceTrace.high?.[xIndex];
            hoverData.low = priceTrace.low?.[xIndex];
            hoverData.close = priceTrace.close?.[xIndex];
          } else {
            hoverData.close = priceTrace.y?.[xIndex];
          }
        }
        
        // Find volume trace
        const volumeTrace = data.find(t => t.type === 'bar' && t.name && t.name.includes('Volume'));
        if (volumeTrace) {
          hoverData.volume = volumeTrace.y?.[xIndex];
        }
        
        onHoverChange(hoverData);
      }}
      onUnhover={() => {
        if (onHoverChange) onHoverChange(null);
      }}
    />
  );
}
