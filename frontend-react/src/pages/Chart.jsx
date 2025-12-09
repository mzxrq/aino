import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Plot from 'react-plotly.js';
import { DateTime } from 'luxon';
import { useAuth } from '../context/useAuth';
import '../css/Chart.css';
import PortalDropdown from '../components/PortalDropdown';
import FlagSelect from '../components/FlagSelect';
import { formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands, hexToRgba, buildHoverTextForDates, resolvePlotlyColorFallback, findClosestIndex } from '../components/ChartCore';

const PY_API = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:8000';

// Quick timezone list; can be expanded via a library like moment-timezone if needed
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Bangkok'
];

  const PRESETS = [
  { label: 'Intraday', period: '1d', interval: '1m' },
  { label: '5D', period: '5d', interval: '30m' },
  { label: '1M', period: '1mo', interval: '30m' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: 'YTD', period: '1y', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '5Y', period: '5y', interval: '1d' }
];

// Format numbers: add commas for thousands and show decimals when value has fraction
function formatNumber(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '';
  const n = Number(val);
  // detect fractional part
  const hasFrac = Math.abs(n - Math.trunc(n)) > 1e-8;
  const opts = { minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: hasFrac ? 2 : 0 };
  return n.toLocaleString(undefined, opts);
}

// Format prices with market rules (e.g., JPY shouldn't show decimals)
function formatPrice(val, market) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '';
  const n = Number(val);
  const isJPY = typeof market === 'string' && /jp|japan|tse|jpy/i.test(market);
  if (isJPY) {
    return Math.round(n).toLocaleString();
  }
  return formatNumber(n);
}

function changeColorClass(val) {
  if (val == null || Number.isNaN(Number(val))) return 'change-neutral';
  const n = Number(val);
  if (n > 0) return 'change-up';
  if (n < 0) return 'change-down';
  return 'change-neutral';
}

// (tick formatter defined later near Chart component)

function enforceIntervalRules(period, interval) {
  const p = (period || '').toLowerCase();
  const validIntraday = ['1m', '5m', '30m', '1h'];
  if (p === '1d') {
    return validIntraday.includes(interval) ? interval : '1m';
  }
  if (p === '5d') {
    // 30m or above for >= 5d
    const allowed = ['30m', '1h', '1d', '1wk', '1y'];
    return allowed.includes(interval) ? interval : '30m';
  }
  // For >= 1mo, prefer >= 30m
  const allowed = ['30m', '1h', '1d', '1wk', '1y'];
  return allowed.includes(interval) ? interval : '30m';
}

function TickerCard({ ticker, data, timezone, showBB, showVWAP, showVolume, showAnomaly, onExpand, period, interval, globalChartMode = 'auto' }) {
  const payload = data?.[ticker] || {};
  const dates = useMemo(() => (payload.dates || []).map(d => normalizeIso(d)), [payload.dates]);
  const close = useMemo(() => payload.close || [], [payload.close]);
  const open = payload.open || [];
  const high = payload.high || [];
  const low = payload.low || [];
  const volume = payload.volume || [];
  const bb = payload.bollinger_bands || { lower: [], upper: [], sma: [] };
  const vwap = payload.VWAP || [];
  // Keep anomaly timestamps as-provided by backend. For intraday (1d) we
  // require exact data-point matches, but for ordinal axes (multi-day) we'll
  // keep the raw anomalies and map them to the nearest available index later
  // so small timezone/format differences don't drop valid detections.
  const rawAnomalies = useMemo(() => {
    return (payload.anomaly_markers?.dates || []).map((d, i) => ({ date: d, y: (payload.anomaly_markers?.y_values || [])[i] }))
      .filter(x => x.date && (x.y !== undefined && x.y !== null));
  }, [payload.anomaly_markers]);

  const anomalies = useMemo(() => {
    try {
      const isOrdinal = (((period || payload.period || '') + '').toLowerCase() !== '1d');
      if (isOrdinal) {
        // Defer strict matching to the index-mapping step so we can match by
        // nearest timestamp (useful when server returns midnight UTC dates
        // while anomalies may have slightly different hour offsets).
        console.debug(`anomalies:${ticker}`, { raw: rawAnomalies.length, matched: 'deferred' });
        return rawAnomalies;
      }
      const matched = rawAnomalies.filter(a => dates.includes(normalizeIso(a.date)));
      console.debug(`anomalies:${ticker}`, { raw: rawAnomalies.length, matched: matched.length });
      return matched;
    } catch (e) {
      console.debug('anomaly filter failed', e);
      return [];
    }
  }, [rawAnomalies, dates, ticker, period, payload.period]);

  const companyName = payload.companyName || ticker;
  const market = payload.market || '';

  const plotRef = useRef(null);
  const [badgeTopPx, setBadgeTopPx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [chartMode, setChartMode] = useState('lines'); // 'lines' or 'candlestick'
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const modeBtnRef = useRef(null);
  // Keyboard helpers for per-card mode dropdown
  const handleModeKeyDown = (e, mode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setChartMode(mode);
      setModeDropdownOpen(false);
    } else if (e.key === 'Escape') {
      setModeDropdownOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // toggle between the two modes for quick keyboard navigation
      setChartMode(prev => (prev === 'lines' ? 'candlestick' : 'lines'));
    }
  };
  const appliedChartMode = (globalChartMode === 'auto') ? chartMode : globalChartMode;

  // compute simple price change based on last close vs previous_close/open
  const lastClose = close.length ? close[close.length - 1] : null;
  const base = payload.previous_close ?? (open.length ? open[0] : (close.length > 1 ? close[close.length - 2] : lastClose));
  const price_change = (lastClose != null && base != null) ? (lastClose - base) : null;
  const pct_change = (price_change != null && base) ? (price_change / base * 100) : null;

  useEffect(() => {
    // compute overlay badge vertical position after plot renders
    if (!plotRef.current || !dates || dates.length === 0 || lastClose == null) {
      // Defer clearing the badge state to avoid synchronous setState inside effect
      // which ESLint flags; schedule it asynchronously if needed.
      setTimeout(() => setBadgeTopPx(null), 0);
      return;
    }
    // small delay to allow Plotly to draw
    const id = setTimeout(() => {
      try {
        const rect = plotRef.current.getBoundingClientRect();
        const plotHeight = rect.height || 200;
        let yMin = Math.min(...(close.length ? close : [lastClose]));
        let yMax = Math.max(...(close.length ? close : [lastClose]));
        if (yMin === yMax) { yMin = lastClose - 1; yMax = lastClose + 1; }
        const frac = 1 - ((lastClose - yMin) / (yMax - yMin));
        const topPx = Math.max(8, Math.min(plotHeight - 8, frac * plotHeight));
        setBadgeTopPx(topPx);
      } catch { setBadgeTopPx(null); }
    }, 80);
    return () => clearTimeout(id);
  }, [dates, close, lastClose, plotRef]);

  // market timezone label (GMT offset)
  let gmtLabel = '';
  try {
    const off = DateTime.now().setZone(timezone).offset; // minutes
    const hrs = off / 60;
    const sign = hrs >= 0 ? '+' : '-';
    gmtLabel = `GMT${sign}${Math.abs(hrs)}`;
  } catch { gmtLabel = '' }

  // Build traces (use payload data, no polling here)
  const priceTrace = {
    x: dates,
    y: close,
    type: 'scatter',
    mode: 'lines',
    name: `${ticker} Close`,
    line: { color: '#3fa34d', width: 2 }
  };
  // localized hover text
  const hoverTexts = useMemo(() => buildHoverTextForDates(dates, timezone, payload.period || period), [dates, timezone, payload.period, period]);
  priceTrace.text = hoverTexts;
  // If Bollinger Bands available and enabled, include BB values in the hover box via customdata
  // Build formatted hover text. For candlestick mode include OHLC, volume; for line mode show Close.
  const formattedHoverText = hoverTexts.map((t, i) => {
    const parts = [t];
    if (appliedChartMode === 'candlestick') {
      if (open && open[i] !== undefined && open[i] !== null) parts.push(`Open: ${formatPrice(open[i], market)}`);
      if (high && high[i] !== undefined && high[i] !== null) parts.push(`High: ${formatPrice(high[i], market)}`);
      if (low && low[i] !== undefined && low[i] !== null) parts.push(`Low: ${formatPrice(low[i], market)}`);
      parts.push(`Close: ${formatPrice(close[i], market)}`);
      if (showVolume && volume && volume[i] !== undefined && volume[i] !== null) parts.push(`Volume: ${formatNumber(volume[i])}`);
    } else {
      parts.push(`Close: ${formatPrice(close[i], market)}`);
    }
    if (showBB && bb) {
      const up = (bb.upper || [])[i];
      const sma = (bb.sma || [])[i];
      const lo = (bb.lower || [])[i];
      if (up !== undefined && up !== null) parts.push(`BB Upper: ${formatNumber(up)}`);
      if (sma !== undefined && sma !== null) parts.push(`BB SMA: ${formatNumber(sma)}`);
      if (lo !== undefined && lo !== null) parts.push(`BB Lower: ${formatNumber(lo)}`);
    }
    if (vwap && vwap[i] !== undefined && vwap[i] !== null && showVWAP) parts.push(`VWAP: ${formatPrice(vwap[i], market)}`);
    return parts.join('<br>');
  });
  priceTrace.text = formattedHoverText;
  priceTrace.hovertemplate = '%{text}<extra></extra>';
  // remove fill: Plotly can anchor to 0,0 when fill present which
  // causes rendering issues on small cards; keep solid line only
  // priceTrace.fill = 'tozeroy';
  // priceTrace.fillcolor = 'rgba(38,166,154,0.12)';

  const volumeTrace = showVolume ? {
    x: dates,
    y: volume,
    type: 'bar',
    name: 'Volume',
    marker: { color: 'rgba(100, 149, 237, 0.5)' },
    yaxis: 'y2'
  } : null;
  if (volumeTrace) {
    // show exact formatted volume in hover, but axis ticks will be normalized (see layout)
    volumeTrace.text = (volume || []).map(v => formatNumber(v));
    volumeTrace.hovertemplate = '%{text}<extra></extra>';
  }

  const bbUpperTrace = showBB ? {
    x: dates,
    y: bb.upper || [],
    type: 'scatter',
    mode: 'lines',
    name: 'BB Upper',
    line: { color: '#ffa500', width: 1 }
  } : null;

  const bbLowerTrace = showBB ? {
    x: dates,
    y: bb.lower || [],
    type: 'scatter',
    mode: 'lines',
    name: 'BB Lower',
    line: { color: '#ffa500', width: 1 }
  } : null;

  const bbSmaTrace = showBB ? {
    x: dates,
    y: bb.sma || [],
    type: 'scatter',
    mode: 'lines',
    name: 'BB SMA',
    line: { color: '#d2691e', width: 1, dash: 'dot' }
  } : null;

  const vwapTrace = showVWAP ? {
    x: dates,
    y: vwap,
    type: 'scatter',
    mode: 'lines',
    name: 'VWAP',
    line: { color: '#6a5acd', width: 1 }
  } : null;

  const anomalyTrace = (anomalies.length && showAnomaly) ? {
    // Use backend-provided x values for display, but only include anomalies
    // that matched an existing data point (see `anomalies` filter above).
    x: anomalies.map(a => a.date),
    y: anomalies.map(a => a.y),
    type: 'scatter',
    mode: 'markers',
    name: 'Anomaly',
    marker: { color: 'red', size: 10, symbol: 'triangle-up' },
    text: anomalies.map(() => 'Anomaly'),
    hovertemplate: '%{text}<extra></extra>'
  } : null;

  const traces = [
    // priceTrace may be replaced by a candlestick trace below if selected
    priceTrace,
    ...(volumeTrace ? [volumeTrace] : []),
    ...(bbUpperTrace ? [bbUpperTrace, bbLowerTrace, bbSmaTrace] : []),
    ...(vwapTrace ? [vwapTrace] : []),
    ...(anomalyTrace ? [anomalyTrace] : [])
  ];

  // Normalize ISO timestamps returned by the server (some servers use +0000 instead of +00:00)
  function normalizeIso(s) {
    if (!s || typeof s !== 'string') return s;
    if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    const m = s.match(/([+-])(\d{2})(\d{2})$/);
    if (m) return s.replace(/([+-])(\d{2})(\d{2})$/, `$1${m[2]}:${m[3]}`);
    return s;
  }

  // dashed gap connectors are added after axis computation below

  // attach tick labels per timezone/period (use payload period if available)
  const useOrdinalX = ((period || payload.period || '') + '').toLowerCase() !== '1d';
  const ticks = useOrdinalX ? buildOrdinalAxis(dates, timezone, payload.period || period) : formatTickLabels(dates, timezone, payload.period || '');

  const axisX = useOrdinalX ? (ticks.x || dates.map((_, i) => i)) : dates;

  // ensure traces use the chosen x-axis
  priceTrace.x = axisX;
  if (volumeTrace) volumeTrace.x = axisX;
  if (bbUpperTrace) bbUpperTrace.x = axisX;
  if (bbLowerTrace) bbLowerTrace.x = axisX;
  if (bbSmaTrace) bbSmaTrace.x = axisX;
  if (vwapTrace) vwapTrace.x = axisX;
  if (anomalyTrace) {
    if (useOrdinalX) {
      // Map anomalies to the nearest available index in `dates` and keep
      // corresponding y-values. Only map when the nearest timestamp is within
      // a reasonable threshold to avoid false matches (24h by default).
      const MAX_ANOMALY_MATCH_MS = 24 * 60 * 60 * 1000; // 24 hours
      const pairs = anomalies.map(a => ({ i: findClosestIndex(dates, a.date, MAX_ANOMALY_MATCH_MS), y: a.y })).filter(p => p.i >= 0);
      anomalyTrace.x = pairs.map(p => p.i);
      anomalyTrace.y = pairs.map(p => p.y);
      anomalyTrace.text = pairs.map(() => 'Anomaly');
      anomalyTrace.hovertemplate = '%{text}<extra></extra>';
      console.debug(`anomalies:${ticker}`, { raw: rawAnomalies.length, mapped: pairs.length });
    } else {
      anomalyTrace.x = anomalies.map(a => a.date);
      anomalyTrace.y = anomalies.map(a => a.y);
    }
  }

  // Determine Plotly text color from CSS/theme so legend/axis/title match app
  const plotTextColor = useMemo(() => resolvePlotlyColorFallback(), []);
  // Use Plotly dark template when app is in dark mode
  const plotlyTemplate = (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('dark')) ? 'plotly_dark' : 'plotly';
  const hasDecimals = (close || []).some(v => Math.abs(Number(v) - Math.trunc(Number(v))) > 1e-8);

  const layout = {
    title: { text: '', font: { color: plotTextColor } },
    template: plotlyTemplate,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: plotTextColor },
    hovermode: 'closest',
    // show axis spikes to help locate hovered x position (merged into axis defs below)
    showlegend: false,
    // increase right margin to make room for the right-side price badge
    margin: { l: 50, r: 90, t: 40, b: 40 },
    xaxis: {
      showspikes: true,
      spikemode: 'across',
      spikecolor: plotTextColor,
      spikethickness: 1,
      title: 'Time',
      showgrid: false,
      rangeslider: { visible: false },
      type: useOrdinalX ? 'linear' : 'date',
      tickmode: 'array',
      tickvals: ticks.tickvals,
      ticktext: ticks.ticktext,
      tickfont: { color: plotTextColor }
    },
    yaxis: {
      showspikes: true,
      spikecolor: plotTextColor,
      spikethickness: 1,
      title: 'Price',
      showgrid: true,
      tickfont: { color: plotTextColor },
      ticksuffix: '',
      tickformat: (function(){
        const isJPY = typeof market === 'string' && /jp|japan|tse|jpy/i.test(market);
        if (isJPY) return ',.0f';
        return hasDecimals ? ',.2f' : ',.0f';
      })()
    },
    yaxis2: showVolume ? {
      title: 'Volume',
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      tickfont: { color: plotTextColor },
      // Use SI suffixes on the axis so large numbers display as 10M/8M etc.
      tickformat: '.2s'
    } : undefined,
    legend: {
      orientation: 'h',
      y: -0.2,
      font: { color: plotTextColor }
    }
  };

  const config = {
    displayModeBar: false,
    responsive: true,
    scrollZoom: true,
    // Custom zoom/pan guidance: LeftCtrl + scroll to zoom; scroll to pan
    // Plotly supports scroll zoom natively; we present instructions in UI.
  };

  // add dashed connectors for detected gaps (intraday lunch etc)
  const axisForGap = useOrdinalX ? (ticks.x || dates.map((_, i) => i)) : dates;
  // Avoid computing gap/gradient traces for very large datasets (can be expensive)
  const GAP_THRESHOLD = 1000; // number of points above which we skip heavy visuals
  const gapTraces = useMemo(() => {
    if (!dates || dates.length > GAP_THRESHOLD) return [];
    return buildGapConnectors(dates, close, axisForGap, interval) || [];
  }, [dates, close, axisForGap, interval]);
  traces.push(...gapTraces);

  // Add stacked translucent gradient bands under the price line (before price trace)
  const gradientBands = useMemo(() => {
    if (!dates || dates.length > GAP_THRESHOLD) return [];
    return buildGradientBands(dates, close, axisForGap, 4, priceTrace.line?.color || '#26a69a') || [];
  }, [dates, close, axisForGap, priceTrace.line]);
  // Place gradient bands before the price trace so the line sits on top
  if (gradientBands && gradientBands.length) {
    traces.unshift(...gradientBands);
  }

  // If candlestick mode is selected, create a candlestick trace and replace priceTrace
  let candlestickTrace = null;
  if (appliedChartMode === 'candlestick') {
    candlestickTrace = {
      x: axisX,
      open: open,
      high: high,
      low: low,
      close: close,
      type: 'candlestick',
      name: `${ticker} OHLC`,
      increasing: { line: { color: '#26a69a' } },
      decreasing: { line: { color: '#e03b3b' } },
      hovertemplate: '%{text}<extra></extra>',
      text: formattedHoverText
    };
    // replace first occurrence of priceTrace in traces with candlestickTrace
    const idx = traces.findIndex(t => t === priceTrace);
    if (idx >= 0) traces.splice(idx, 1, candlestickTrace);
  }

  // hover marker trace: show a single marker at hovered index for clarity
  const hoverMarkerTrace = (hoverIdx != null && hoverIdx >= 0 && hoverIdx < axisForGap.length) ? {
    x: [axisForGap[hoverIdx]],
    y: [close[hoverIdx]],
    type: 'scatter',
    mode: 'markers',
    marker: { size: 8, color: '#26a69a', line: { width: 2, color: '#ffffff' } },
    hoverinfo: 'skip',
    showlegend: false
  } : null;

  // right-side last-price badge annotation (small card style)
  // we'll render a DOM overlay badge for rounded corners and crisp CSS styling

  const isMarketOpen = (() => {
    // Use payload-provided market_open/market_close if available (ISO strings), otherwise assume open if recent data exists
    try {
      if (payload.market_open && payload.market_close) {
        const now = DateTime.now().setZone(timezone);
        const openT = DateTime.fromISO(payload.market_open, { zone: timezone });
        const closeT = DateTime.fromISO(payload.market_close, { zone: timezone });
        return now >= openT && now <= closeT;
      }
    } catch { /* ignore */ }
    // fallback: if there's recent data within last 6 hours, treat as open (best-effort)
    if (dates.length) {
      const last = DateTime.fromISO(dates[dates.length - 1], { zone: 'utc' }).toUTC();
      const now = DateTime.utc();
      return (now.toMillis() - last.toMillis()) < (1000 * 60 * 60 * 6);
    }
    return false;
  })();

  return (
    <div className="chart-card sleek">
      <div className="chart-card-header">
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
              <div className="chart-card-title">{ticker} <span className="company-name">{companyName}</span></div>
            </div>
            <div style={{marginTop:6}}>
              <div className="market-compact" title={isMarketOpen ? 'the market is open' : 'the market is closed'}>
                <span className={`status-dot ${isMarketOpen ? 'open' : 'closed'}`} />
                <span className="pill-text">{isMarketOpen ? 'Open' : 'Closed'}</span>
                <span className="market-meta-compact">{market} {gmtLabel} {price_change != null ? (
                  <>
                    <span className={changeColorClass(price_change)}>{(price_change > 0 ? '+' : price_change < 0 ? '' : '±')}{formatNumber(price_change)}</span>
                    &nbsp;(<span className={changeColorClass(pct_change)}>{(pct_change > 0 ? '+' : pct_change < 0 ? '' : '±')}{formatNumber(pct_change)}%</span>)
                  </>
                ) : ''}</span>
              </div>
            </div>
          </div>
        <div className="chart-card-actions">
          <SubscribeButton ticker={ticker} />
          <div style={{position: 'relative'}}>
            <button className="btn btn-secondary btn-sm" onClick={() => onExpand(ticker)}>Superchart</button>
          </div>
            <div style={{position: 'relative'}}>
              <button
                ref={modeBtnRef}
                className={`btn btn-mode btn-sm ${appliedChartMode === 'lines' ? 'mode-lines' : (appliedChartMode === 'candlestick' ? 'mode-candle' : '')} ${globalChartMode !== 'auto' ? 'overridden' : ''}`}
                onClick={() => { if (globalChartMode === 'auto') setModeDropdownOpen(v => !v); }}
                aria-haspopup="true"
                aria-expanded={modeDropdownOpen}
                title={globalChartMode !== 'auto' ? `Overridden by toolbar (${globalChartMode})` : 'Change chart mode'}
                disabled={globalChartMode !== 'auto'}
              >
                {appliedChartMode === 'lines' ? (
                  <>
                    {/* simple line/sparkline icon */}
                    <svg width="18" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight:6}}>
                      <polyline points="3,15 9,9 13,12 21,6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="3" cy="15" r="1.6" fill="#fff" />
                      <circle cx="9" cy="9" r="1.6" fill="#fff" />
                      <circle cx="13" cy="12" r="1.6" fill="#fff" />
                      <circle cx="21" cy="6" r="1.6" fill="#fff" />
                    </svg>
                    Lines
                  </>
                ) : (
                  <>
                    {/* simple candlestick svg icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight:6}}>
                      <rect x="6" y="6" width="4" height="12" stroke="#fff" fill="#26a69a" rx="1" />
                      <rect x="14" y="9" width="4" height="9" stroke="#fff" fill="#e0e0e0" rx="1" />
                    </svg>
                    Candlestick
                  </>
                )}
              </button>
              {modeDropdownOpen && globalChartMode === 'auto' && modeBtnRef.current && (
                <PortalDropdown anchorRect={modeBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setModeDropdownOpen(false)} className="mode-dropdown">
                  <div role="listbox" tabIndex={0} aria-label={`${ticker} chart mode`} onMouseLeave={() => setModeDropdownOpen(false)}>
                    <div
                      className={`mode-item ${appliedChartMode === 'lines' ? 'active' : ''}`}
                      role="option"
                      tabIndex={0}
                      aria-selected={appliedChartMode === 'lines'}
                      onClick={() => { setChartMode('lines'); setModeDropdownOpen(false); }}
                      onKeyDown={(e) => handleModeKeyDown(e, 'lines')}
                    >
                      Lines
                    </div>
                    <div
                      className={`mode-item ${appliedChartMode === 'candlestick' ? 'active' : ''}`}
                      role="option"
                      tabIndex={0}
                      aria-selected={appliedChartMode === 'candlestick'}
                      onClick={() => { setChartMode('candlestick'); setModeDropdownOpen(false); }}
                      onKeyDown={(e) => handleModeKeyDown(e, 'candlestick')}
                    >
                      Candlestick
                    </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
        </div>
      </div>
      <div className="plot-wrapper" style={{position: 'relative'}} ref={plotRef}>
        <Plot
          data={[...traces, ...(hoverMarkerTrace ? [hoverMarkerTrace] : [])]}
          layout={layout}
          config={config}
          className="plot-container"
          onHover={(e) => {
            try {
              const p = e && e.points && e.points[0];
              if (p && typeof p.pointIndex === 'number') setHoverIdx(p.pointIndex);
            } catch { /* ignore */ }
          }}
          onUnhover={() => setHoverIdx(null)}
        />
        {lastClose != null && (
          <div className="badge-overlay" style={{ position: 'absolute', right: 10, top: badgeTopPx != null ? `${badgeTopPx}px` : '50%', transform: 'translateY(-50%)', background: (price_change != null && price_change < 0) ? '#e03b3b' : '#26a69a', color: '#fff', padding: '6px 8px', borderRadius: 8, fontSize: 12 }}>
            {formatNumber(lastClose)}
          </div>
        )}
      </div>
    </div>
  );
}

function SubscribeButton({ ticker }) {
  const { token, user } = useAuth();
  // server-side prefs merge intentionally removed from here to keep
  // Subscribe handling localized to the card-level component.
  const [state, setState] = useState(null); // null=unknown, true=subscribed, false=not

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user || !token) { if (mounted) setState(false); return; }
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/subscribers/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: user.id || user._id || user.userId, ticker })
        });
        const j = await res.json();
        if (!mounted) return;
        setState(!!j.subscribed);
      } catch {
        if (mounted) setState(false);
      }
    }
    check();
    return () => { mounted = false; };
  }, [ticker, token, user]);

  async function toggle() {
    if (!user || !token) { alert('Please login'); return; }
    const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    try {
      if (state) {
        // Unsubscribe
        const res = await fetch(`${front}/subscribers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        if (!res.ok) throw new Error('Failed to unsubscribe');
        setState(false);
        alert('Unsubscribed');
      } else {
        const res = await fetch(`${front}/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || 'Failed to subscribe');
        setState(true);
        alert('Subscribed');
      }
    } catch (e) { alert(e.message || e); }
  }

  return (
    <button className={`btn btn-sm ${state ? 'btn-active btn-primary' : 'btn-primary'}`} onClick={toggle} title={state ? 'Unsubscribe' : 'Subscribe'}>
      {state ? 'Subscribed' : 'Subscribe'}
    </button>
  );
}
export default function Chart() {
  const navigate = useNavigate();
  const PREF_KEY = 'chart_prefs_v1';

  const savePrefsTimer = useRef(null);

  const [tickersInput, setTickersInput] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.tickersInput || 'AAPL,MSFT'; } catch { return 'AAPL,MSFT'; }
  });
  const [tickers, setTickers] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.tickers || ['AAPL','MSFT']; } catch { return ['AAPL','MSFT']; }
  });
  const [period, setPeriod] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.period || '1mo'; } catch { return '1mo'; } });
  const [interval, setInterval] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.interval || '1m'; } catch { return '1m'; } });
  const [timezone, setTimezone] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.timezone || 'Asia/Tokyo'; } catch { return 'Asia/Tokyo'; } });
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch { return false; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch { return true; } });
  // Anomalies are now an indicator toggle like the others. Default to true to preserve visibility.
  const [showAnomaly, setShowAnomaly] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showAnomaly !== undefined) ? p.showAnomaly : true; } catch { return true; } });
  const [globalChartMode, setGlobalChartMode] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.globalChartMode || 'auto'; } catch { return 'auto'; } });
  const [toolbarModeOpen, setToolbarModeOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsBtnRef = useRef(null);
  const toolbarModeBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({});

  const { token, user } = useAuth();

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setError(null);
      const enforced = enforceIntervalRules(period, interval);
      try {
        const q = tickers.join(',');
        const url = `${PY_API}/chart?ticker=${encodeURIComponent(q)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
        const res = await fetch(url);
        const json = await res.json();
        // Temporary debug logging to diagnose period/interval/date-range issues
        try {
          console.debug('Chart fetch', { url, requested: { period, interval: enforced, tickers }, returnedKeys: Object.keys(json || {}) });
          // log per-ticker date counts and first/last ISO strings (if available)
          for (const t of tickers) {
            const pl = (json && json[t]) || {};
            const d = pl.dates || [];
            if (d && d.length) {
              console.debug(`chart:${t}`, { count: d.length, first: d[0], last: d[d.length - 1] });
            } else {
              console.debug(`chart:${t}`, { count: 0 });
            }
          }
        } catch (e) { console.debug('Chart fetch debug failed', e); }
        // No client-side anomaly injection: rely on server-side anomaly detection
        setData(json || {});
      } catch (e) {
        setError(e?.message || 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [tickers, period, interval]);

  // Persist preferences to localStorage when relevant values change
  useEffect(() => {
    try {
      const p = { tickersInput, tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, globalChartMode };
      localStorage.setItem(PREF_KEY, JSON.stringify(p));
      // also persist to server for authenticated users (debounced)
      if (token && user) {
        if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
        savePrefsTimer.current = setTimeout(async () => {
          try {
            const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
            await fetch(`${front}/users/preferences`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(p)
            });
          } catch { /* ignore */ }
        }, 600);
      }
    } catch { /* ignore */ }
  }, [tickersInput, tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, globalChartMode, token, user]);

  function applyPreset(p) {
    setPeriod(p.period);
    setInterval(p.interval);
  }

  function applyTickers() {
    const parts = tickersInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    setTickers(parts.length ? parts : ['AAPL']);
  }

  function onExpand(ticker) {
    navigate(`/superchart/${encodeURIComponent(ticker)}`);
  }

  // `subscribe` helper removed (not used in toolbar); per-card SubscribeButton handles subscriptions.

  return (
    <div className="chart-page">
      <div className="chart-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group">
            <label className="toolbar-label">Tickers</label>
            <div className="tag-input" onClick={() => document.getElementById('ticker-input')?.focus()}>
              {tickers.map((t) => (
                <span className="tag-pill" key={t} tabIndex={0} role="option" aria-label={`Ticker ${t}`} onKeyDown={(e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setTickers(prev => prev.filter(x => x !== t)); } }}>
                  {t}
                  <button aria-label={`Remove ${t}`} className="tag-x" onClick={(e) => { e.stopPropagation(); setTickers(prev => prev.filter(x => x !== t)); }}>{'\u00d7'}</button>
                </span>
              ))}
              <input
                id="ticker-input"
                className="input tag-text"
                value={tickersInput}
                onChange={e => setTickersInput(e.target.value)}
                placeholder={tickers.length ? '' : 'e.g. 9020.T, AAPL'}
                onKeyDown={(e) => {
                  const v = e.target.value;
                  if (e.key === ' ' || e.key === ',' || e.key === 'Enter') {
                    e.preventDefault();
                    const parts = v.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    if (parts.length) {
                      setTickers(prev => Array.from(new Set([...prev, ...parts])));
                      setTickersInput('');
                    }
                  } else if (e.key === 'Backspace' && !v) {
                    setTickers(prev => prev.slice(0, Math.max(0, prev.length - 1)));
                  }
                }}
                onBlur={() => {
                  const v = tickersInput.trim();
                  if (v) {
                    const parts = v.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    setTickers(prev => Array.from(new Set([...prev, ...parts])));
                    setTickersInput('');
                  }
                }}
              />
            </div>
            <button className="btn btn-primary" onClick={applyTickers}>Apply</button>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Timezone</label>
            <div style={{width: 200}}>
              {/* custom flag-select replaces native select for richer UI */}
              <FlagSelect value={timezone} onChange={setTimezone} options={TIMEZONES} />
            </div>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Indicators</label>
            <div className="indicator-select">
              <button
                ref={indicatorsBtnRef}
                className={`btn btn-mode btn-sm ${showVolume || showBB || showVWAP || showAnomaly ? 'active' : ''}`}
                onClick={() => setIndicatorsOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={indicatorsOpen}
              >
                Indicators
              </button>
              {indicatorsOpen && indicatorsBtnRef.current && (
                <PortalDropdown anchorRect={indicatorsBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setIndicatorsOpen(false)} className="mode-dropdown indicators-dropdown">
                  <div role="listbox" aria-label="Indicators" onMouseLeave={() => setIndicatorsOpen(false)}>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showVolume} onClick={() => setShowVolume(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVolume(v => !v); } }}>
                          <span className={`indicator-dot ${showVolume ? 'checked' : ''}`} aria-hidden>
                            {showVolume && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          Volume
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showBB} onClick={() => setShowBB(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowBB(v => !v); } }}>
                          <span className={`indicator-dot ${showBB ? 'checked' : ''}`} aria-hidden>
                            {showBB && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          Bollinger Bands
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showVWAP} onClick={() => setShowVWAP(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVWAP(v => !v); } }}>
                          <span className={`indicator-dot ${showVWAP ? 'checked' : ''}`} aria-hidden>
                            {showVWAP && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          VWAP
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showAnomaly} onClick={() => setShowAnomaly(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAnomaly(v => !v); } }}>
                          <span className={`indicator-dot ${showAnomaly ? 'checked' : ''}`} aria-hidden>
                            {showAnomaly && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          Anomalies
                        </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Chart Mode</label>
            <div className="mode-select">
              <button
                ref={toolbarModeBtnRef}
                className="btn btn-mode btn-sm"
                onClick={() => setToolbarModeOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={toolbarModeOpen}
              >{globalChartMode === 'lines' ? 'Lines' : (globalChartMode === 'candlestick' ? 'Candlestick' : 'Auto')}</button>
              {toolbarModeOpen && toolbarModeBtnRef.current && (
                <PortalDropdown anchorRect={toolbarModeBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setToolbarModeOpen(false)} className="mode-dropdown">
                  <div role="listbox" aria-label="Chart Mode" onMouseLeave={() => setToolbarModeOpen(false)}>
                    <div className={`mode-item ${globalChartMode === 'auto' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'auto'} onClick={() => { setGlobalChartMode('auto'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('auto'); setToolbarModeOpen(false); } }}>
                      Auto
                    </div>
                    <div className={`mode-item ${globalChartMode === 'lines' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'lines'} onClick={() => { setGlobalChartMode('lines'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('lines'); setToolbarModeOpen(false); } }}>
                      Lines
                    </div>
                    <div className={`mode-item ${globalChartMode === 'candlestick' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'candlestick'} onClick={() => { setGlobalChartMode('candlestick'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('candlestick'); setToolbarModeOpen(false); } }}>
                      Candlestick
                    </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
          </div>

          {/* top-level subscribe removed (subscriptions kept per-card) */}
        </div>

        <div className="toolbar-row presets">
          {PRESETS.map(p => (
            <button
              key={p.label}
              className={`btn btn-sm ${period === p.period && interval === p.interval ? 'btn-primary' : ''}`}
              onClick={() => applyPreset(p)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>

        
      </div>

      {loading && <div className="status">Loading...</div>}
      {error && <div className="status error">{error}</div>}

      <div className="charts-grid">
        {tickers.map(ticker => (
          <TickerCard
            key={ticker}
            ticker={ticker}
            data={data}
            timezone={timezone}
            showBB={showBB}
            showVWAP={showVWAP}
            showVolume={showVolume}
            showAnomaly={showAnomaly}
            onExpand={onExpand}
            period={period}
            interval={interval}
            globalChartMode={globalChartMode}
          />
        ))}
      </div>
    </div>
  );
}

// Shared helpers (formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands)
// are provided by `src/components/ChartCore.js` and imported above.