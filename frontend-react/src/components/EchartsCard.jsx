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

// Format numbers with thousands separators and fixed decimals
function formatWithCommas(num, decimals = 2) {
  if (num === null || num === undefined) return '-';
  const n = Number(num);
  if (!Number.isFinite(n)) return '-';
  try {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(n);
  } catch {
    const fixed = n.toFixed(decimals);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
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
  onHoverSnapshot = () => {},
  showMA5 = false,
  showMA25 = false,
  showMA75 = false,
  showSAR = false,
  bbSigma = '2sigma'
}) {
  // Normalize chartMode to accept both 'lines' and 'line' (some callers use plural)
  const mode = chartMode === 'lines' ? 'line' : chartMode;
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

  const hlcData = useMemo(() => candleData.map((item) => [item[0], item[3], item[2], item[1]]), [candleData]);

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

  // Detect intraday modes to switch to time axis with breaks
  const isIntraday1D = useMemo(() => (period || '').toLowerCase() === '1d', [period]);
  const isIntraday5D = useMemo(() => (period || '').toLowerCase() === '5d', [period]);
  const useTimeAxis = isIntraday1D || isIntraday5D;

  // Convert ISO strings to timestamps (ms) for time axis usage
  const timestamps = useMemo(() => {
    if (!dates || dates.length === 0) return [];
    return dates.map((d) => {
      const t = new Date(d).getTime();
      return Number.isFinite(t) ? t : null;
    }).filter((t) => t !== null);
  }, [dates]);

  // Infer base interval from median diff to detect breaks (e.g., lunch break, overnight)
  const inferredIntervalMs = useMemo(() => {
    if (timestamps.length < 2) return null;
    const diffs = [];
    for (let i = 1; i < timestamps.length; i++) {
      const diff = timestamps[i] - timestamps[i - 1];
      if (diff > 0) diffs.push(diff);
    }
    if (diffs.length === 0) return null;
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    return diffs.length % 2 === 0 ? (diffs[mid - 1] + diffs[mid]) / 2 : diffs[mid];
  }, [timestamps]);

  // Build axis breaks whenever there is a large gap (gap > 3x base interval)
  const axisBreaks = useMemo(() => {
    if (!useTimeAxis || timestamps.length < 2 || !inferredIntervalMs) return [];
    const breaks = [];
    for (let i = 1; i < timestamps.length; i++) {
      const prev = timestamps[i - 1];
      const curr = timestamps[i];
      const diff = curr - prev;
      if (diff > inferredIntervalMs * 3) {
        const start = prev + inferredIntervalMs;
        const end = curr - inferredIntervalMs;
        if (end > start) {
          breaks.push({ start, end, gap: '1%' });
        }
      }
    }
    return breaks;
  }, [useTimeAxis, timestamps, inferredIntervalMs]);

  // Time-axis aware data for each series
  const timeLineData = useMemo(() => {
    if (!useTimeAxis) return lineData;
    if (!timestamps.length || !lineData?.length) return [];
    return timestamps.map((t, i) => [t, lineData[i]]);
  }, [useTimeAxis, timestamps, lineData]);

  const timeCandleData = useMemo(() => {
    if (!useTimeAxis) return candleData;
    if (!timestamps.length || !candleData?.length) return [];
    return timestamps.map((t, i) => {
      const c = candleData[i] || [];
      return [t, c[0], c[1], c[2], c[3]];
    });
  }, [useTimeAxis, timestamps, candleData]);

  const timeHeikinAshiData = useMemo(() => {
    if (!useTimeAxis) return heikinAshiData;
    if (!timestamps.length || !heikinAshiData?.length) return [];
    return timestamps.map((t, i) => {
      const h = heikinAshiData[i] || [];
      return [t, h[0], h[1], h[2], h[3]];
    });
  }, [useTimeAxis, timestamps, heikinAshiData]);

  const timeHlcData = useMemo(() => {
    if (!useTimeAxis) return hlcData;
    if (!timestamps.length || !hlcData?.length) return [];
    return timestamps.map((t, i) => {
      const h = hlcData[i] || [];
      return [t, h[0], h[1], h[2], h[3]];
    });
  }, [useTimeAxis, timestamps, hlcData]);

  const timeVolumeData = useMemo(() => {
    if (!useTimeAxis) return volumeData;
    if (!timestamps.length || !volumeData?.length) return [];
    return timestamps.map((t, i) => [t, volumeData[i]]);
  }, [useTimeAxis, timestamps, volumeData]);

  // Compute an axis label interval for time axis to avoid overcrowding on multi-day intraday views
  const timeLabelInterval = useMemo(() => {
    if (!useTimeAxis) return undefined;
    // For 5-day intraday data, prefer ~6 labels across the axis to avoid overlap
    if (isIntraday5D) {
      const total = timestamps.length || 0;
      const desired = 6;
      if (total <= desired) return 0; // show all
      // show every Nth tick
      const n = Math.ceil(total / desired);
      return n;
    }
    // For 1D intraday, allow more density but still cap
    if (isIntraday1D) {
      const total = timestamps.length || 0;
      const desired = 8;
      if (total <= desired) return 0;
      return Math.ceil(total / desired);
    }
    return undefined;
  }, [useTimeAxis, isIntraday5D, isIntraday1D, timestamps]);

  const timeVwapData = useMemo(() => {
    if (!useTimeAxis) return vwapData;
    if (!timestamps.length || !vwapData?.length) return [];
    return timestamps.map((t, i) => [t, vwapData[i]]);
  }, [useTimeAxis, timestamps, vwapData]);

  const timeBBUpperData = useMemo(() => {
    if (!useTimeAxis) return bbUpperData;
    if (!timestamps.length || !bbUpperData?.length) return [];
    return timestamps.map((t, i) => [t, bbUpperData[i]]);
  }, [useTimeAxis, timestamps, bbUpperData]);

  const timeBBLowerData = useMemo(() => {
    if (!useTimeAxis) return bbLowerData;
    if (!timestamps.length || !bbLowerData?.length) return [];
    return timestamps.map((t, i) => [t, bbLowerData[i]]);
  }, [useTimeAxis, timestamps, bbLowerData]);

  const timeBBSmaData = useMemo(() => {
    if (!useTimeAxis) return bb?.sma;
    if (!timestamps.length || !bb?.sma?.length) return [];
    return timestamps.map((t, i) => [t, bb.sma[i]]);
  }, [useTimeAxis, timestamps, bb]);

  const timeMA5Data = useMemo(() => {
    if (!useTimeAxis) return ma5Data;
    if (!timestamps.length || !ma5Data?.length) return [];
    return timestamps.map((t, i) => [t, ma5Data[i]]);
  }, [useTimeAxis, timestamps, ma5Data]);

  const timeMA25Data = useMemo(() => {
    if (!useTimeAxis) return ma25Data;
    if (!timestamps.length || !ma25Data?.length) return [];
    return timestamps.map((t, i) => [t, ma25Data[i]]);
  }, [useTimeAxis, timestamps, ma25Data]);

  const timeMA75Data = useMemo(() => {
    if (!useTimeAxis) return ma75Data;
    if (!timestamps.length || !ma75Data?.length) return [];
    return timestamps.map((t, i) => [t, ma75Data[i]]);
  }, [useTimeAxis, timestamps, ma75Data]);

  const timeSARData = useMemo(() => {
    if (!useTimeAxis) return sarData;
    if (!timestamps.length || !sarData?.length) return [];
    return timestamps.map((t, i) => [timestamps[i], sarData[i]]).filter((p) => p[1] != null);
  }, [useTimeAxis, timestamps, sarData]);

  // Anomaly markers: convert to ECharts markPoint format
  // markPoint expects { coord: [xIndex, yValue], itemStyle, symbol, symbolSize, ... }
  const anomalyMarkers = useMemo(() => {
    if (!anomalies || anomalies.length === 0 || !showAnomaly) return [];
    return anomalies.map((a) => {
      // If anomalies have an index (from findClosestIndex), use it; otherwise use position
      const xIdx = a.i !== undefined ? a.i : dates.findIndex((d) => d === a.date);
      const coordX = useTimeAxis ? timestamps[xIdx] : xIdx;
      return {
        coord: [coordX, a.y],
        itemStyle: { color: 'red' },
        symbol: 'triangle',
        symbolSize: 8,
        name: 'Anomaly'
      };
    }).filter((m) => m.coord[0] !== undefined && m.coord[0] !== null);
  }, [anomalies, showAnomaly, dates, useTimeAxis, timestamps]);

  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;

  // Build ECharts option
  const handleTooltipShow = React.useCallback((params) => {
    const arr = Array.isArray(params) ? params.filter(p => p && p.value !== undefined && p.value !== null) : (params ? [params] : []);
    if (!arr.length) {
      setTooltipContent(null);
      setTooltipVisible(false);
      onHoverSnapshot(null);
      return;
    }
    setTooltipContent(arr);
    setTooltipVisible(true);

    // Emit hover snapshot (price + date) for external badges/panels
    const primary = arr[0];
    const rawDate = useTimeAxis
      ? (typeof primary.axisValue === 'number' ? new Date(primary.axisValue).toISOString() : (dates && primary.dataIndex !== undefined ? dates[primary.dataIndex] : primary.name))
      : (dates && primary.dataIndex !== undefined ? dates[primary.dataIndex] : primary.name);

    const priceFromValue = (p) => {
      if (!p) return null;
      const v = p.value;
      if (Array.isArray(v)) {
        if (v.length === 5) return Number(v[2]); // [t, o, c, l, h]
        if (v.length === 4) return Number(v[1]); // [o, c, l, h]
        if (v.length === 2) return Number(v[1]);
        return Number(v[0]);
      }
      return Number(v);
    };

    const price = priceFromValue(primary);
    let formattedDate = rawDate;
    try {
      const dt = parseToTimezone(rawDate, timezone);
      if (dt) formattedDate = dt.toFormat('MM/dd/yyyy HH:mm:ss');
    } catch { /* ignore */ }

    onHoverSnapshot({ price, date: rawDate, label: formattedDate });
  }, [dates, onHoverSnapshot, timezone, useTimeAxis]);

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
    if (mode === 'line') {
      series.push({
        name: `${ticker}`,
        type: 'line',
        data: useTimeAxis ? timeLineData : lineData,
        smooth: false,
        itemStyle: { color: '#53c262ff' },
        lineStyle: { color: '#53c262ff', width: 1.5 },
        symbolSize: 0,
        progressive: 4000,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'candlestick') {
      series.push({
        name: `${ticker}`,
        type: 'candlestick',
        data: useTimeAxis ? timeCandleData : candleData,
        encode: useTimeAxis ? { x: 0, y: [1, 2, 3, 4] } : undefined,
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'hollowcandlestick') {
      series.push({
        name: `${ticker}`,
        type: 'candlestick',
        data: useTimeAxis ? timeCandleData : candleData,
        encode: useTimeAxis ? { x: 0, y: [1, 2, 3, 4] } : undefined,
        itemStyle: {
          color: '#26a699',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'ohlc') {
      // OHLC chart - Heiken-Ashi candlestick
      series.push({
        name: `${ticker}`,
        type: 'candlestick',
        itemStyle: {
          color: '#26a69a',
          color0: '#e03b3b',
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'bar') {
      // Bar chart using open prices
      series.push({
        name: `${ticker} Open`,
        type: 'bar',
        data: open || [],
        itemStyle: { color: '#3fa34d' },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'column') {
      // Column chart using close prices
      series.push({
        name: `${ticker} Close`,
        type: 'bar',
        data: close || [],
        itemStyle: { color: 'rgba(44, 193, 127, 0.8)' },
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'area') {
      // Area chart using close prices
      series.push({
        name: `${ticker}`,
        type: 'line',
        data: useTimeAxis ? timeLineData : lineData,
        smooth: true,
        areaStyle: { color: 'rgba(44, 193, 127, 0.3)' },
        lineStyle: { color: '#2cc17f', width: 2 },
        symbolSize: 0,
        progressive: 4000,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    } else if (mode === 'hlc') {
      // HLC (High-Low-Close) chart - use candlestick as it's most similar
      series.push({
        name: `${ticker}`,
        type: 'line',
        data: useTimeAxis ? timeHlcData : hlcData,
        encode: useTimeAxis ? { x: 0, y: [1, 2, 3, 4] } : undefined,
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
      // series.push({
      //   name: `${ticker} OHLC`,
      //   type: 'candlestick',
      //   data: useTimeAxis ? timeCandleData : candleData,
      //   encode: useTimeAxis ? { x: 0, y: [1, 2, 3, 4] } : undefined,
      //   itemStyle: {
      //     color: '#26a69a',
      //     color0: '#e03b3b',
      //     borderColor: '#26a69a',
      //     borderColor0: '#e03b3b'
      //   },
      //   markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      // });
      // Default to line chart
      series.push({
        name: `${ticker}`,
        type: 'line',
        data: useTimeAxis ? timeLineData : lineData,
        smooth: false,
        itemStyle: { color: '#53c262ff' },
        lineStyle: { color: '#53c262ff', width: 1.5 },
        symbolSize: 0,
        progressive: 4000,
        markPoint: anomalyMarkers.length > 0 ? { data: anomalyMarkers } : undefined
      });
    }

    // 2. Volume bar series (optional, same grid)
    if (showVolume && volumeData.length > 0) {
      series.push({
        name: 'Volume',
        type: 'bar',
        data: useTimeAxis ? timeVolumeData : volumeData,
        itemStyle: { color: 'rgba(100, 149, 237, 0.2)' }
      });
    }

    // 3. VWAP line
    if (showVWAP && vwapData.length > 0) {
      series.push({
        name: 'VWAP',
        type: 'line',
        data: useTimeAxis ? timeVwapData : vwapData,
        smooth: false,
        lineStyle: { color: '#6a5acd', width: 1 },
        symbolSize: 0,
        progressive: 4000
      });
    }

    // 4. Bollinger Bands
    if (showBB && bbUpperData.length > 0) {
      const bbLabel = bbSigma === '1_5sigma' ? 'BB (1.5σ)' : 'BB (2σ)';
      series.push({
        name: `${bbLabel} Upper`,
        type: 'line',
        data: useTimeAxis ? timeBBUpperData : bbUpperData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0,
        progressive: 4000
      });
      series.push({
        name: `${bbLabel} Lower`,
        type: 'line',
        data: useTimeAxis ? timeBBLowerData : bbLowerData,
        smooth: false,
        lineStyle: { color: '#ffa500', width: 1 },
        symbolSize: 0,
        progressive: 4000
      });
      if (bb?.sma && bb.sma.length > 0) {
        series.push({
          name: `${bbLabel} SMA`,
          type: 'line',
          data: useTimeAxis ? timeBBSmaData : bb.sma,
          smooth: false,
          lineStyle: { color: '#d2691e', width: 1, type: 'dashed' },
          symbolSize: 0,
          progressive: 4000
        });
      }
    }

    // 5. Moving Averages (individually toggleable)
    if (showMA5 && ma5Data.length > 0) {
      series.push({
        name: 'MA5',
        type: 'line',
        data: useTimeAxis ? timeMA5Data : ma5Data,
        smooth: false,
        lineStyle: { color: '#2563EB', width: 1.5 },
        symbolSize: 0,
        progressive: 4000
      });
    }
    if (showMA25 && ma25Data.length > 0) {
      series.push({
        name: 'MA25',
        type: 'line',
        data: useTimeAxis ? timeMA25Data : ma25Data,
        smooth: false,
        lineStyle: { color: '#F97316', width: 1.5 },
        symbolSize: 0,
        progressive: 4000
      });
    }
    if (showMA75 && ma75Data.length > 0) {
      series.push({
        name: 'MA75',
        type: 'line',
        data: useTimeAxis ? timeMA75Data : ma75Data,
        smooth: false,
        lineStyle: { color: '#EF4444', width: 1.5 },
        symbolSize: 0,
        progressive: 4000
      });
    }

    // 6. Parabolic SAR
    if (showSAR && sarData.length > 0) {
      series.push({
        name: 'SAR',
        type: 'scatter',
        data: useTimeAxis ? timeSARData : sarData.map((val, i) => val ? [i, val] : null).filter(Boolean),
        symbolSize: 4,
        itemStyle: { color: '#10B981' }
      });
    }

    // Determine if using ordinal (multi-day) or date axis
    const isOrdinal = !useTimeAxis && (period && period.toLowerCase() !== '1d');

    const axisLabelFormatter = (value) => {
      if (!value) return '';
      try {
        const normalized = typeof value === 'number' ? new Date(value).toISOString() : value;
        const dt = parseToTimezone(normalized, timezone);
        if (!dt) return value;
        if (useTimeAxis) {
          // Intraday: show time; 5d: show time and day hint
          if (isIntraday1D) return dt.toFormat('HH:mm');
          if (isIntraday5D) return dt.toFormat('HH:mm\nLL-dd');
        }
        if (isOrdinal) {
          return dt.toFormat('LL-dd');
        }
        return dt.toFormat('HH:mm');
      } catch {
        return value;
      }
    };

    return {
      useUTC: true,
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { color: '#333' },
      axisPointer: {
        link: [
          {
            xAxisIndex: [0, 1]
          }
        ]
      },
      tooltip: {
        trigger: 'axis',
        showContent: true,
        transitionDuration: 0,
        confine: true,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        textStyle: { color: '#333', fontSize: 12 },
        axisPointer: { 
          type: isMobile ? 'line' : 'cross',
          axis: 'x',
          snap: true,
          label: { backgroundColor: '#6a7985' }
        },
        formatter: (params) => {
          if (!params || !Array.isArray(params)) return '';
          const p = params[0];
          if (!p) return '';
          
          const rawDate = useTimeAxis
            ? (typeof p.axisValue === 'number' ? new Date(p.axisValue).toISOString() : (dates && p.dataIndex !== undefined ? dates[p.dataIndex] : p.name))
            : (dates && p.dataIndex !== undefined ? dates[p.dataIndex] : p.name);
          
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
          
          let html = '<div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #2cc17f;">';
          html += `📅 ${dateStr}`;
          if (timeStr) html += ` <span style="color: #666; font-weight: 400;">⏰ ${timeStr}</span>`;
          html += '</div>';
          html += '<div style="border-top: 1px solid #e5e7eb; margin: 8px 0;"></div>';
          
          // Helper to add a compact row
          const addRow = (label, value, color) => {
            html += '<div style="margin: 3px 0; display: flex; align-items: center;">';
            html += `<span style="display: inline-block; width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin-right: 6px;"></span>`;
            html += `<span style="color: #666; font-size: 11px; margin-right: 8px;">${label}:</span>`;
            html += `<span style="font-weight: 600; color: #333;">${value}</span>`;
            html += '</div>';
          };

          params.forEach((param) => {
            if (param.value === undefined || param.value === null) return;
            const seriesColor = param.color || '#666';
            const seriesName = param.seriesName || '';

            if (Array.isArray(param.value)) {
              // OHLC candlestick: 5 elements [timestamp, open, close, low, high] or 4 elements [open, close, low, high]
              if (param.value.length === 5 || param.value.length === 4) {
                const startIdx = param.value.length === 5 ? 1 : 0; // Skip timestamp if present
                const [o, c, l, h] = param.value.slice(startIdx, startIdx + 4);
                const fmt = (v) => (v === undefined || v === null || Number.isNaN(Number(v)) ? '-' : formatWithCommas(Number(v), 2));
                // Break into separate, compact lines
                addRow(`Open`, fmt(o), seriesColor);
                addRow(`High`, fmt(h), seriesColor);
                addRow(`Low`, fmt(l), seriesColor);
                addRow(`Close`, fmt(c), seriesColor);
                return;
              }
              if (param.value.length === 2) {
                const [, val] = param.value;
                const num = Number(val);
                if (seriesName === 'Volume') {
                  addRow('Volume', abbreviateNumber(num), seriesColor);
                } else {
                  addRow(seriesName, Number.isNaN(num) ? '-' : formatWithCommas(num, 2), seriesColor);
                }
                return;
              }
              // Fallback for other array values
              addRow(seriesName, param.value.join(' / '), seriesColor);
              return;
            }

            // Scalar values
            const num = Number(param.value);
            if (seriesName === 'Volume') {
              addRow('Volume', abbreviateNumber(num), seriesColor);
            } else {
              addRow(seriesName, Number.isNaN(num) ? String(param.value) : formatWithCommas(num, 2), seriesColor);
            }
          });
          
          return html;
        }
      },
      legend: showLegend ? {
        data: series.map(s => s.name),
        top: 10,
        textStyle: { color: '#333' }
      } : { show: false },
      grid: [
        {
          left: '8%',
          right: '12%',
          top: '20%',
          bottom: isOrdinal ? '15%' : '22%'
        },
        {
          left: '8%',
          right: '12%',
          top: '75%',
          height: '12%'
        }
      ],
      xAxis: [
        useTimeAxis ? {
        type: 'time',
        min: timestamps.length ? timestamps[0] : undefined,
        max: timestamps.length ? timestamps[timestamps.length - 1] : undefined,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: {
          color: '#666',
          formatter: axisLabelFormatter,
          interval: timeLabelInterval
        },
        splitLine: { show: false },
        breaks: axisBreaks,
        breakArea: axisBreaks.length ? {
          expandOnClick: false,
          zigzagAmplitude: 0,
          itemStyle: { opacity: 0, borderColor: 'none' }
        } : undefined
      } : {
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
          formatter: axisLabelFormatter
        },
        splitLine: { show: false }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: true,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#999' } },
        axisPointer: {
          type: 'shadow',
          label: { show: false },
          triggerTooltip: true,
          handle: {
            show: true,
            margin: 18,
            color: '#2cc17f'
          }
        }
      }
      ],
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
        },
        {
          type: 'value',
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
          height: 16,
          minValueSpan: useTimeAxis ? 3600000 : undefined,
          textStyle: { color: '#666' },
          handleIcon: 'path://M10.7,11.9H9.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4h1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
          handleSize: '80%',
          handleStyle: { color: '#2cc17f', borderColor: '#2cc17f' }
        },
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          yAxisIndex: [0, 1],
          start: 0,
          end: 100,
          minValueSpan: useTimeAxis ? 3600000 : undefined,
          zoomOnMouseWheel: 'shift'
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
    timeCandleData,
    timeHeikinAshiData,
    heikinAshiData,
    hlcData,
    timeHlcData,
    timeLineData,
    volumeData,
    timeVolumeData,
    vwapData,
    timeVwapData,
    bbUpperData,
    bbLowerData,
    timeBBUpperData,
    timeBBLowerData,
    timeBBSmaData,
    bb,
    showBB,
    showVWAP,
    showVolume,
    mode,
    anomalyMarkers,
    period,
    useTimeAxis,
    isIntraday1D,
    isIntraday5D,
    axisBreaks,
    timestamps,
    isMobile,
    ma5Data,
    ma25Data,
    ma75Data,
    timeMA5Data,
    timeMA25Data,
    timeMA75Data,
    sarData,
    timeSARData,
    showMA5,
    showMA25,
    showMA75,
    showSAR,
    bbSigma
  ]);

  const chartRef = React.useRef(null);

  // Tooltip overlay state for accessibility / mobile readability
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const [tooltipContent, setTooltipContent] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 12, y: 12 });

  const onEvents = {
    mousemove: handleTooltipShow,
    globalout: () => {
      setTooltipVisible(false);
      setTooltipContent(null);
      onHoverSnapshot(null);
    }
  };

  return (
    <div
      style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height, flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}
      onMouseMove={(e) => {
        // update tooltip position relative to container
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setTooltipPos({ x, y });
      }}
      onTouchStart={(e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
      }}
    >
      <ReactEcharts
        ref={chartRef}
        option={option}
        style={{ width: '100%', height: '100%', flex: 1 }}
        notMerge={true}
        opts={{ renderer: 'canvas', useDirtyRect: true }}
        onEvents={onEvents}
      />
    </div>
  );
}
