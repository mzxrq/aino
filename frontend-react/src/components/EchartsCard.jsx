import React, { useMemo } from 'react';
import ReactEcharts from 'echarts-for-react';
import { DateTime } from 'luxon';

/**
 * EchartsCard: Lightweight, interactive chart card using Apache ECharts
 * Renders candlestick/line chart with volume, VWAP, anomaly markers, and Bollinger Bands
 */
export default function EchartsCard({
  ticker,
  dates,
  open,
  high,
  low,
  close,
  volume,
  vwap,
  bb,
  anomalies,
  timezone,
  period,
  showBB = false,
  showVWAP = false,
  showVolume = true,
  showAnomaly = true,
  chartMode = 'lines',
  market = '',
  lastClose = null,
  companyName = ticker,
  isMarketOpen = false,
  height = 300
}) {
  // Build candlestick data: each item is [open, close, low, high]
  const candleData = useMemo(() => {
    if (!open || !close || !low || !high) return [];
    return open.map((o, i) => [o, close[i], low[i], high[i]]);
  }, [open, close, low, high]);

  // For line mode, use close prices
  const lineData = useMemo(() => close || [], [close]);

  // Volume data: simple bar values
  const volumeData = useMemo(() => {
    if (!volume) return [];
    return volume.map(v => v == null ? 0 : Number(v));
  }, [volume]);

  // VWAP series (line)
  const vwapData = useMemo(() => vwap || [], [vwap]);

  // Bollinger Bands upper and lower
  const bbUpperData = useMemo(() => bb?.upper || [], [bb]);
  const bbLowerData = useMemo(() => bb?.lower || [], [bb]);

  // Anomaly markers: convert to ECharts markPoint format
  // markPoint expects { coord: [xIndex, yValue], itemStyle, symbol, symbolSize, ... }
  const anomalyMarkers = useMemo(() => {
    if (!anomalies || anomalies.length === 0 || !showAnomaly) return [];
    return anomalies.map((a, i) => {
      // If anomalies have an index (from findClosestIndex), use it; otherwise use position
      const xIdx = a.i !== undefined ? a.i : dates.findIndex(d => d === a.date);
      return {
        coord: [xIdx, a.y],
        itemStyle: { color: 'red' },
        symbol: 'triangle',
        symbolSize: 8,
        name: 'Anomaly'
      };
    });
  }, [anomalies, showAnomaly, dates]);

  // Build ECharts option
  const option = useMemo(() => {
    // Guard: if no dates, return empty option
    if (!dates || dates.length === 0) {
      return {
        backgroundColor: 'transparent',
        xAxis: { type: 'category' },
        yAxis: { type: 'value' },
        series: []
      };
    }

    const isLine = chartMode === 'lines';
    
    // Prepare series array
    const series = [];

    // 1. Main price series (candlestick or line)
    if (isLine) {
      series.push({
        name: `${ticker} Close`,
        type: 'line',
        data: lineData,
        smooth: false,
        itemStyle: { color: '#3fa34d' },
        lineStyle: { color: '#3fa34d', width: 2 },
        symbolSize: 0,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else {
      // Candlestick
      series.push({
        name: `${ticker} OHLC`,
        type: 'candlestick',
        data: candleData,
        itemStyle: {
          color: '#26a69a',        // up color
          color0: '#e03b3b',       // down color
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    }

    // 2. Volume bar series (optional, same grid)
    if (showVolume && volumeData.length > 0) {
      series.push({
        name: 'Volume',
        type: 'bar',
        data: volumeData,
        itemStyle: { color: 'rgba(100, 149, 237, 0.2)' }
      });
    }

    // 3. VWAP line
    if (showVWAP && vwapData.length > 0) {
      series.push({
        name: 'VWAP',
        type: 'line',
        data: vwapData,
        smooth: false,
        lineStyle: { color: '#6a5acd', width: 1 },
        symbolSize: 0
      });
    }

    // 4. Bollinger Bands
    if (showBB && bbUpperData.length > 0) {
      series.push({
        name: 'BB Upper',
        type: 'line',
        data: bbUpperData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0
      });
      series.push({
        name: 'BB Lower',
        type: 'line',
        data: bbLowerData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0
      });
      if (bb?.sma && bb.sma.length > 0) {
        series.push({
          name: 'BB SMA',
          type: 'line',
          data: bb.sma,
          smooth: false,
          lineStyle: { color: '#d2691e', width: 1, type: 'dashed' },
          symbolSize: 0
        });
      }
    }

    // Determine if using ordinal (multi-day) or date axis
    const isOrdinal = (period && period.toLowerCase() !== '1d');

    return {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { color: '#333' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { 
          type: 'cross',
          label: {
            backgroundColor: '#6a7985'
          }
        },
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        borderRadius: 12,
        padding: [12, 16],
        textStyle: {
          color: '#333',
          fontSize: 13
        },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.15);',
        formatter: (params) => {
          if (!params || !Array.isArray(params)) return '';
          const p = params[0];
          if (!p) return '';
          
          // Get the raw ISO timestamp
          const rawDate = dates && dates[p.dataIndex] ? dates[p.dataIndex] : p.name;
          
          // Format date and time in user's timezone
          let dateStr = '';
          let timeStr = '';
          try {
            const dt = DateTime.fromISO(rawDate, { zone: timezone || 'UTC' });
            if (dt.isValid) {
              dateStr = dt.toFormat('MMM dd, yyyy');
              timeStr = dt.toFormat('HH:mm:ss');
            } else {
              dateStr = rawDate;
            }
          } catch {
            dateStr = rawDate;
          }
          
          // Build stylish tooltip HTML
          let html = '<div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #2cc17f;">';
          html += `📅 ${dateStr}`;
          if (timeStr) html += ` <span style="color: #666; font-weight: 400;">⏰ ${timeStr}</span>`;
          html += '</div>';
          html += '<div style="border-top: 1px solid #e5e7eb; margin: 8px 0;"></div>';
          
          // Add each series data
          params.forEach((param, idx) => {
            if (param.value === undefined || param.value === null) return;
            
            const seriesColor = param.color || '#666';
            const seriesName = param.seriesName;
            let displayValue = '';
            
            // Handle different value types
            if (Array.isArray(param.value)) {
              // OHLC candlestick: [open, close, low, high]
              const [o, c, l, h] = param.value;
              displayValue = `O: ${o.toFixed(2)} | C: ${c.toFixed(2)} | L: ${l.toFixed(2)} | H: ${h.toFixed(2)}`;
            } else {
              const num = Number(param.value);
              if (seriesName === 'Volume') {
                displayValue = num.toLocaleString(undefined, { maximumFractionDigits: 0 });
              } else {
                displayValue = num.toFixed(2);
              }
            }
            
            html += '<div style="margin: 5px 0; display: flex; align-items: center;">';
            html += `<span style="display: inline-block; width: 10px; height: 10px; background: ${seriesColor}; border-radius: 50%; margin-right: 8px;"></span>`;
            html += `<span style="color: #666; font-size: 12px; margin-right: 8px;">${seriesName}:</span>`;
            html += `<span style="font-weight: 600; color: #333;">${displayValue}</span>`;
            html += '</div>';
          });
          
          return html;
        }
      },
      legend: {
        data: series.map(s => s.name),
        top: 10,
        textStyle: { color: '#333' }
      },
      grid: {
        left: '8%',
        right: '12%',
        top: '20%',
        bottom: isOrdinal ? '10%' : '18%'
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { 
          color: '#666',
          rotate: 45,
          interval: isOrdinal ? Math.max(0, Math.floor((dates.length - 1) / 8)) : (() => {
            // For intraday, show fewer labels to prevent crowding
            const totalPoints = dates ? dates.length : 0;
            if (totalPoints > 100) return Math.floor(totalPoints / 8);
            if (totalPoints > 50) return Math.floor(totalPoints / 6);
            return Math.floor(totalPoints / 4);
          })(),
          formatter: (value) => {
            if (!value) return '';
            // For ordinal (multi-day), show date only
            if (isOrdinal) {
              try {
                const dt = DateTime.fromISO(value, { zone: timezone || 'UTC' });
                return dt.isValid ? dt.toFormat('MMM dd') : value;
              } catch {
                return value;
              }
            }
            // For intraday, show just time
            try {
              const dt = DateTime.fromISO(value, { zone: timezone || 'UTC' });
              return dt.isValid ? dt.toFormat('HH:mm') : value;
            } catch {
              return value;
            }
          }
        },
        splitLine: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          scale: true,
          position: 'left',
          axisLine: { lineStyle: { color: '#ccc' } },
          axisLabel: { color: '#666' },
          splitLine: { show: true, lineStyle: { color: '#eee' } }
        },
        {
          type: 'value',
          scale: true,
          position: 'right',
          axisLine: { lineStyle: { color: '#ccc' } },
          axisLabel: { color: '#666' },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: 0,
          start: 0,
          end: 100,
          textStyle: { color: '#666' }
        },
        {
          type: 'inside',
          xAxisIndex: 0,
          yAxisIndex: [0, 1],
          start: 0,
          end: 100
        }
      ],
      series: series.map((s, i) => {
        // Volume series uses secondary y-axis (index 1)
        if (s.name === 'Volume') {
          return { ...s, yAxisIndex: 1 };
        }
        // All other series use primary y-axis (index 0)
        return { ...s, yAxisIndex: 0 };
      })
    };
  }, [
    ticker,
    dates,
    candleData,
    lineData,
    volumeData,
    vwapData,
    bbUpperData,
    bbLowerData,
    bb,
    showBB,
    showVWAP,
    showVolume,
    chartMode,
    anomalyMarkers,
    period
  ]);

  const chartRef = React.useRef(null);

  return (
    <div style={{ width: '100%', height: `${height}px` }}>
      <ReactEcharts
        ref={chartRef}
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas', useDirtyRect: true }}
      />
    </div>
  );
}
