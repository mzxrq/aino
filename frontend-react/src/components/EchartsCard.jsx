import React, { useMemo } from 'react';
import ReactEcharts from 'echarts-for-react';
import { DateTime } from 'luxon';

/**
 * EchartsCard: Lightweight, interactive chart card using Apache ECharts
 * Renders candlestick/line chart with volume, VWAP, anomaly markers, and Bollinger Bands
 */

// City-based timezone labels mapped to IANA identifiers (mirror from Chart.jsx)
const CITY_TZ_MAP = {
  UTC: 'UTC',
  'New York': 'America/New_York',
  Chicago: 'America/Chicago',
  Denver: 'America/Denver',
  'Los Angeles': 'America/Los_Angeles',
  Anchorage: 'America/Anchorage',
  'São Paulo': 'America/Sao_Paulo',
  'Mexico City': 'America/Mexico_City',
  Toronto: 'America/Toronto',
  London: 'Europe/London',
  Paris: 'Europe/Paris',
  Berlin: 'Europe/Berlin',
  Rome: 'Europe/Rome',
  Madrid: 'Europe/Madrid',
  Amsterdam: 'Europe/Amsterdam',
  Brussels: 'Europe/Brussels',
  Zurich: 'Europe/Zurich',
  Vienna: 'Europe/Vienna',
  Stockholm: 'Europe/Stockholm',
  Copenhagen: 'Europe/Copenhagen',
  Oslo: 'Europe/Oslo',
  Helsinki: 'Europe/Helsinki',
  Athens: 'Europe/Athens',
  Istanbul: 'Europe/Istanbul',
  Moscow: 'Europe/Moscow',
  Warsaw: 'Europe/Warsaw',
  Prague: 'Europe/Prague',
  Tokyo: 'Asia/Tokyo',
  Seoul: 'Asia/Seoul',
  Shanghai: 'Asia/Shanghai',
  'Hong Kong': 'Asia/Hong_Kong',
  Singapore: 'Asia/Singapore',
  Bangkok: 'Asia/Bangkok',
  Jakarta: 'Asia/Jakarta',
  Manila: 'Asia/Manila',
  Taipei: 'Asia/Taipei',
  'Kuala Lumpur': 'Asia/Kuala_Lumpur',
  Dubai: 'Asia/Dubai',
  Karachi: 'Asia/Karachi',
  Tashkent: 'Asia/Tashkent',
  Almaty: 'Asia/Almaty',
  Sydney: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Brisbane: 'Australia/Brisbane',
  Perth: 'Australia/Perth',
  Auckland: 'Pacific/Auckland',
  Fiji: 'Pacific/Fiji',
  Honolulu: 'Pacific/Honolulu',
  Cairo: 'Africa/Cairo',
  Johannesburg: 'Africa/Johannesburg',
  Lagos: 'Africa/Lagos',
  Nairobi: 'Africa/Nairobi'
};

// Helper: convert city name to IANA identifier
function toIana(tz) {
  return CITY_TZ_MAP[tz] || tz || 'UTC';
}

// Helper: parse ISO string and convert to target timezone
function parseToTimezone(isoString, timezone) {
  try {
    const iana = toIana(timezone);
    // Parse ISO string in UTC first, then convert to target timezone
    const dt = DateTime.fromISO(isoString, { zone: 'UTC' });
    return dt.isValid ? dt.setZone(iana) : null;
  } catch {
    return null;
  }
}

// Abbreviate large numbers for readability (e.g., 50000000 -> 50M, 653000 -> 653K)
function abbreviateNumber(num) {
  if (num === null || num === undefined) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(0);
}

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
  showLegend = false,
  chartMode = 'lines',
  market = '',
  lastClose = null,
  companyName = ticker,
  isMarketOpen = false,
  height = 300,
  movingAverages,
  parabolicSAR,
  showMA5 = false,
  showMA25 = false,
  showMA75 = false,
  showSAR = false,
  bbSigma = '2sigma'
}) {
  // Build candlestick data: each item is [open, close, low, high]
  const candleData = useMemo(() => {
    if (!open || !close || !low || !high) return [];
    return open.map((o, i) => [o, close[i], low[i], high[i]]);
  }, [open, close, low, high]);

  // Calculate Heiken-Ashi data from candlestick data
  // HA Close = (O + H + L + C) / 4
  // HA Open = (Previous HA Open + Previous HA Close) / 2
  // HA High = max(H, HA Open, HA Close)
  // HA Low = min(L, HA Open, HA Close)
  const heikinAshiData = useMemo(() => {
    if (candleData.length === 0) return [];
    
    const ha = [];
    let prevHAOpen = candleData[0][0];
    let prevHAClose = (candleData[0][0] + candleData[0][3] + candleData[0][2] + candleData[0][1]) / 4;
    
    for (let i = 0; i < candleData.length; i++) {
      const [o, c, l, h] = candleData[i];
      
      // HA Close = (O + H + L + C) / 4
      const haClose = (o + h + l + c) / 4;
      
      // HA Open = (Previous HA Open + Previous HA Close) / 2
      const haOpen = (prevHAOpen + prevHAClose) / 2;
      
      // HA High = max(H, HA Open, HA Close)
      const haHigh = Math.max(h, haOpen, haClose);
      
      // HA Low = min(L, HA Open, HA Close)
      const haLow = Math.min(l, haOpen, haClose);
      
      // Store as [HA Open, HA Close, HA Low, HA High] for candlestick format
      ha.push([haOpen, haClose, haLow, haHigh]);
      
      prevHAOpen = haOpen;
      prevHAClose = haClose;
    }
    
    return ha;
  }, [candleData]);

  // For line mode, use close prices
  const lineData = useMemo(() => close || [], [close]);

  // Volume data: simple bar values
  const volumeData = useMemo(() => {
    if (!volume) return [];
    return volume.map(v => v == null ? 0 : Number(v));
  }, [volume]);

  // VWAP series (line)
  const vwapData = useMemo(() => vwap || [], [vwap]);

  // Bollinger Bands upper and lower (select based on sigma preference)
  const bbUpperData = useMemo(() => {
    if (!bb) return [];
    if (bbSigma === '1_5sigma') return bb.upper_1_5sigma || [];
    return bb.upper || [];
  }, [bb, bbSigma]);
  
  const bbLowerData = useMemo(() => {
    if (!bb) return [];
    if (bbSigma === '1_5sigma') return bb.lower_1_5sigma || [];
    return bb.lower || [];
  }, [bb, bbSigma]);

  // Moving Averages data
  const ma5Data = useMemo(() => movingAverages?.MA5 || [], [movingAverages]);
  const ma25Data = useMemo(() => movingAverages?.MA25 || [], [movingAverages]);
  const ma75Data = useMemo(() => movingAverages?.MA75 || [], [movingAverages]);

  // Parabolic SAR data
  const sarData = useMemo(() => parabolicSAR?.SAR || [], [parabolicSAR]);

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

    // Prepare series array based on chart mode
    const series = [];

    // 1. Main price series based on selected chart mode
    if (chartMode === 'line') {
      series.push({
        name: `${ticker} Close`,
        type: 'line',
        data: lineData,
        smooth: false,
        itemStyle: { color: '#1e88e5' },
        lineStyle: { color: '#1e88e5', width: 2 },
        symbolSize: 0,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'candlestick') {
      series.push({
        name: `${ticker} OHLC`,
        type: 'candlestick',
        data: candleData,
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'ohlc') {
      // OHLC chart - Heiken-Ashi candlestick
      series.push({
        name: `${ticker} Heiken-Ashi`,
        type: 'candlestick',
        data: heikinAshiData,
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'bar') {
      // Bar chart using open prices
      series.push({
        name: `${ticker} Open`,
        type: 'bar',
        data: open || [],
        itemStyle: { color: '#3fa34d' },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'column') {
      // Column chart using close prices
      series.push({
        name: `${ticker} Close`,
        type: 'bar',
        data: close || [],
        itemStyle: { color: 'rgba(44, 193, 127, 0.8)' },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'area') {
      // Area chart using close prices
      series.push({
        name: `${ticker} Close`,
        type: 'line',
        data: lineData,
        smooth: true,
        areaStyle: { color: 'rgba(44, 193, 127, 0.3)' },
        lineStyle: { color: '#2cc17f', width: 2 },
        symbolSize: 0,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (chartMode === 'hlc') {
      // HLC (High-Low-Close) chart - use candlestick as it's most similar
      const hlcData = candleData.map((item, i) => [item[0], item[3], item[2], item[1]]);
      series.push({
        name: `${ticker} HLC`,
        type: 'candlestick',
        data: hlcData,
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else {
      // Default to candlestick
      series.push({
        name: `${ticker} OHLC`,
        type: 'candlestick',
        data: candleData,
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
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
      const bbLabel = bbSigma === '1_5sigma' ? 'BB (1.5σ)' : 'BB (2σ)';
      series.push({
        name: `${bbLabel} Upper`,
        type: 'line',
        data: bbUpperData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0
      });
      series.push({
        name: `${bbLabel} Lower`,
        type: 'line',
        data: bbLowerData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0
      });
      if (bb?.sma && bb.sma.length > 0) {
        series.push({
          name: `${bbLabel} SMA`,
          type: 'line',
          data: bb.sma,
          smooth: false,
          lineStyle: { color: '#d2691e', width: 1, type: 'dashed' },
          symbolSize: 0
        });
      }
    }

    // 5. Moving Averages (individually toggleable)
    if (showMA5 && ma5Data.length > 0) {
      series.push({
        name: 'MA5',
        type: 'line',
        data: ma5Data,
        smooth: false,
        lineStyle: { color: '#2563EB', width: 1.5 },
        symbolSize: 0
      });
    }
    if (showMA25 && ma25Data.length > 0) {
      series.push({
        name: 'MA25',
        type: 'line',
        data: ma25Data,
        smooth: false,
        lineStyle: { color: '#F97316', width: 1.5 },
        symbolSize: 0
      });
    }
    if (showMA75 && ma75Data.length > 0) {
      series.push({
        name: 'MA75',
        type: 'line',
        data: ma75Data,
        smooth: false,
        lineStyle: { color: '#EF4444', width: 1.5 },
        symbolSize: 0
      });
    }

    // 6. Parabolic SAR
    if (showSAR && sarData.length > 0) {
      series.push({
        name: 'SAR',
        type: 'scatter',
        data: sarData.map((val, i) => val ? [i, val] : null).filter(Boolean),
        symbolSize: 4,
        itemStyle: { color: '#10B981' }
      });
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
          const pLower = (period || '').toLowerCase();
          const hideTime = pLower.includes('y');
          let dateStr = '';
          let timeStr = '';
          try {
            const dt = parseToTimezone(rawDate, timezone);
            if (dt) {
              dateStr = dt.toFormat('MM/dd/yyyy');
              timeStr = hideTime ? '' : dt.toFormat('HH:mm:ss');
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
              // Check if it's OHLC candlestick (4 elements) or SAR/line data (2 elements)
              if (param.value.length === 4) {
                // OHLC candlestick: [open, close, low, high]
                const [o, c, l, h] = param.value;
                displayValue = `O: ${o?.toFixed?.(2) || '-'} | C: ${c?.toFixed?.(2) || '-'} | L: ${l?.toFixed?.(2) || '-'} | H: ${h?.toFixed?.(2) || '-'}`;
              } else if (param.value.length === 2) {
                // Line/SAR/other: [xIndex, yValue]
                const [, val] = param.value;
                const num = Number(val);
                if (seriesName === 'Volume') {
                  displayValue = abbreviateNumber(num);
                } else if (!isNaN(num)) {
                  displayValue = num.toFixed(2);
                } else {
                  displayValue = '-';
                }
              } else {
                displayValue = '-';
              }
            } else {
              const num = Number(param.value);
              if (seriesName === 'Volume') {
                displayValue = abbreviateNumber(num);
              } else if (!isNaN(num)) {
                displayValue = num.toFixed(2);
              } else {
                displayValue = '-';
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
      legend: showLegend ? {
        data: series.map(s => s.name),
        top: 10,
        textStyle: { color: '#333' }
      } : { show: false },
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
                const dt = parseToTimezone(value, timezone);
                return dt ? dt.toFormat('LL-dd') : value;
              } catch {
                return value;
              }
            }
            // For intraday, show just time
            try {
              const dt = parseToTimezone(value, timezone);
              return dt ? dt.toFormat('HH:mm') : value;
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
    period,
    ma5Data,
    ma25Data,
    ma75Data,
    sarData,
    showMA5,
    showMA25,
    showMA75,
    showSAR,
    bbSigma
  ]);

  const chartRef = React.useRef(null);

  return (
    <div style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ReactEcharts
        ref={chartRef}
        option={option}
        style={{ width: '100%', height: '100%', flex: 1 }}
        notMerge={true}
        opts={{ renderer: 'canvas', useDirtyRect: true }}
      />
    </div>
  );
}
