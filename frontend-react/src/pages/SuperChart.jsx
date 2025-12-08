import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Plot from 'react-plotly.js';
import { DateTime } from 'luxon';
import { useAuth } from '../context/AuthContext';
import '../css/Chart.css';

const PY_API = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:8000';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Bangkok'
];

const PRESETS = [
  { label: '1D', period: '1d', interval: '1m' },
  { label: '5D', period: '5d', interval: '30m' },
  { label: '1Mo', period: '1mo', interval: '30m' },
  { label: '6Mo', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '5Y', period: '5y', interval: '1d' }
];

function enforceIntervalRules(period, interval) {
  const p = (period || '').toLowerCase();
  const validIntraday = ['1m', '5m', '30m', '1h'];
  if (p === '1d') {
    return validIntraday.includes(interval) ? interval : '1m';
  }
  if (p === '5d') {
    const allowed = ['30m', '1h', '1d', '1wk', '1y'];
    return allowed.includes(interval) ? interval : '30m';
  }
  const allowed = ['30m', '1h', '1d', '1wk', '1y'];
  return allowed.includes(interval) ? interval : '30m';
}

export default function SuperChart() {
  const { ticker: routeTicker } = useParams();
  const navigate = useNavigate();
  const [ticker, setTicker] = useState((routeTicker || 'AAPL').toUpperCase());
  const [tickerInput, setTickerInput] = useState((routeTicker || 'AAPL').toUpperCase());
  const navTimer = useRef(null);
  const { token, user } = useAuth();
  const serverPrefsLoaded = useRef(false);
  const savePrefsTimer = useRef(null);

    // Load server-side preferences when authenticated
    useEffect(() => {
      let mounted = true;
      async function loadServerPrefs() {
        if (!token || !user) return;
        try {
          const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
          const res = await fetch(`${front}/users/preferences`, { headers: { Authorization: `Bearer ${token}` } });
          if (!mounted) return;
          if (!res.ok) return;
          const j = await res.json();
          const prefs = j && j.preferences ? j.preferences : null;
          if (prefs && typeof prefs === 'object') {
            if (prefs.period) setPeriod(prefs.period);
            if (prefs.interval) setInterval(prefs.interval);
            if (prefs.timezone) setTimezone(prefs.timezone);
            if (prefs.showBB !== undefined) setShowBB(!!prefs.showBB);
            if (prefs.showVWAP !== undefined) setShowVWAP(!!prefs.showVWAP);
            if (prefs.showVolume !== undefined) setShowVolume(!!prefs.showVolume);
            if (prefs.showRSI !== undefined) setShowRSI(!!prefs.showRSI);
            if (prefs.showMACD !== undefined) setShowMACD(!!prefs.showMACD);
          }
          serverPrefsLoaded.current = true;
        } catch (e) { /* ignore */ }
      }
      loadServerPrefs();
      return () => { mounted = false; };
    }, [token, user]);
  // Default to intraday
  const PREF_KEY = 'chart_prefs_v1';
  const [period, setPeriod] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.period || '1d'; } catch (e) { return '1d'; } });
  const [interval, setInterval] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.interval || '1m'; } catch (e) { return '1m'; } });
  const [timezone, setTimezone] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.timezone || 'Asia/Tokyo'; } catch (e) { return 'Asia/Tokyo'; } });
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch (e) { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch (e) { return false; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch (e) { return true; } });
  const [showRSI, setShowRSI] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showRSI !== undefined) ? p.showRSI : false; } catch (e) { return false; } });
  const [showMACD, setShowMACD] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showMACD !== undefined) ? p.showMACD : false; } catch (e) { return false; } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState({});

  useEffect(() => { if (routeTicker) setTicker(routeTicker.toUpperCase()); }, [routeTicker]);
  useEffect(() => { if (routeTicker) setTickerInput(routeTicker.toUpperCase()); }, [routeTicker]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setError(null);
      const enforced = enforceIntervalRules(period, interval);
      try {
        const url = `${PY_API}/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
        console.debug('[SuperChart] fetching', url);
        const res = await fetch(url);
        const json = await res.json();
        // Response shape may be { TICKER: payload } or payload directly when single ticker.
        const resolved = (json && typeof json === 'object') ? (
          json[ticker.toUpperCase()] || json[ticker] || (Object.values(json || {})[0]) || json
        ) : json;
        // Ensure we set a fresh object so React will re-render even if server cache returned same reference
        const final = resolved && typeof resolved === 'object' ? { ...resolved } : {};
        // debug: log sizes so we can see why Plot may be blank
        try {
          console.debug('[SuperChart] fetched payload keys', Object.keys(final));
          console.debug('[SuperChart] dates count', (final.dates || []).length, 'close count', (final.close || []).length);
        } catch (e) { /* ignore */ }
        setPayload(final);
      } catch (e) {
        setError(e?.message || 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [ticker, period, interval]);

  // persist UI prefs back to localStorage when changed (so SuperChart and Chart share prefs)
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      const merged = { ...p, period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD };
      localStorage.setItem(PREF_KEY, JSON.stringify(merged));
      // sync to server when authenticated (debounced)
      if (token && user) {
        if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
        savePrefsTimer.current = setTimeout(async () => {
          try {
            const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
            await fetch(`${front}/users/preferences`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD })
            });
          } catch (e) { /* ignore */ }
        }, 600);
      }
    } catch (e) { /* ignore */ }
  }, [period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD]);

  const [showCandles, setShowCandles] = useState(false);
  const [seekRange, setSeekRange] = useState(null); // {start, end}

  function formatTickLabels(dates, tz, maxTicks = 8) {
    if (!dates || dates.length === 0) return { tickvals: [], ticktext: [] };
    const total = dates.length;
    const step = Math.max(1, Math.floor(total / maxTicks));
    const vals = [];
    const txt = [];
    for (let i = 0; i < total; i += step) {
      const d = DateTime.fromISO(dates[i], { zone: 'utc' }).setZone(tz);
      vals.push(dates[i]);
      txt.push(d.toFormat('yyyy-LL-dd HH:mm'));
    }
    const last = dates[total - 1];
    if (vals[vals.length - 1] !== last) {
      vals.push(last);
      txt.push(DateTime.fromISO(last, { zone: 'utc' }).setZone(tz).toFormat('yyyy-LL-dd HH:mm'));
    }
    return { tickvals: vals, ticktext: txt };
  }

  // Resolve Plotly colors from CSS variables when possible so Plotly SVG
  // and legends match the app theme (light/dark). Falls back to sensible colors.
  function resolvePlotlyColorFallback() {
    try {
      const s = getComputedStyle(document.body);
      const txt = (s.getPropertyValue('--text-primary') || s.getPropertyValue('--text') || '').trim();
      if (txt) return txt;
      return document.body.classList.contains('dark') ? '#FFFFFF' : '#111111';
    } catch (e) {
      try { return document.body.classList.contains('dark') ? '#FFFFFF' : '#111111'; } catch (e2) { return '#111111'; }
    }
  }

  function buildHoverTextForDates(dates, tz, period) {
    if (!dates || dates.length === 0) return [];
    const p = (period || '').toLowerCase();
    let fmt = 'yyyy-LL-dd HH:mm';
    if (p === '1d') fmt = 'HH:mm';
    else if (p === '5d') fmt = 'LL-dd HH:mm';
    else if (p === '1mo' || p === '6mo') fmt = 'LL-dd';
    else if (p === '1y' || p === '5y') fmt = 'yyyy-LL';
    return dates.map(d => {
      try { return DateTime.fromISO(d, { zone: 'utc' }).setZone(tz).toFormat(fmt); } catch (e) { return d; }
    });
  }

  function buildGapConnectors(dates, closes, axisX, interval) {
    if (!dates || dates.length < 2) return [];
    const mapIntervalMs = (itv) => {
      if (!itv) return 60000;
      if (itv.endsWith('m')) return parseInt(itv.replace('m','')) * 60000;
      if (itv.endsWith('h')) return parseInt(itv.replace('h','')) * 3600000;
      if (itv.endsWith('d')) return parseInt(itv.replace('d','')) * 86400000;
      return 60000;
    };
    const expected = mapIntervalMs(interval);
    const threshold = Math.max(expected * 3, 1000 * 60 * 30);
    const out = [];
    for (let i = 0; i < dates.length - 1; i++) {
      const a = DateTime.fromISO(dates[i], { zone: 'utc' }).toMillis();
      const b = DateTime.fromISO(dates[i+1], { zone: 'utc' }).toMillis();
      if ((b - a) > threshold) {
        const x0 = axisX ? axisX[i] : dates[i];
        const x1 = axisX ? axisX[i+1] : dates[i+1];
        out.push({
          x: [x0, x1],
          y: [closes[i], closes[i+1]],
          type: 'scatter',
          mode: 'lines',
          name: 'Gap',
          hoverinfo: 'skip',
          line: { color: 'rgba(200,200,200,0.6)', width: 1, dash: 'dash' },
          showlegend: false
        });
      }
    }
    return out;
  }

  // ordinal axis helper: compress gaps (weekends/holidays) by using indices for x
  function buildOrdinalAxis(dates, tz, period) {
    if (!dates || dates.length === 0) return { x: [], tickvals: [], ticktext: [] };
    const x = dates.map((d, i) => i);
    const ticks = formatTickLabels(dates, tz, 8);
    const idxMap = new Map(dates.map((d, i) => [d, i]));
    const tickvals = ticks.tickvals.map(v => idxMap.get(v)).filter(v => v !== undefined);
    return { x, tickvals, ticktext: ticks.ticktext };
  }

  // compute MACD client-side
  function computeEMA(values, span) {
    const alpha = 2 / (span + 1);
    const out = [];
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (prev === null) prev = v;
      else prev = alpha * v + (1 - alpha) * prev;
      out.push(prev);
    }
    return out;
  }

  function computeMACD(close) {
    if (!close || close.length === 0) return { macd: [], signal: [], hist: [] };
    const ema12 = computeEMA(close, 12);
    const ema26 = computeEMA(close, 26);
    const macd = ema12.map((v, i) => (v - (ema26[i] || 0)));
    const signal = computeEMA(macd, 9);
    const hist = macd.map((v, i) => v - (signal[i] || 0));
    return { macd, signal, hist };
  }

  const dates = payload.dates || [];
  const close = payload.close || [];
  const volume = payload.volume || [];
  const bb = payload.bollinger_bands || { lower: [], upper: [], sma: [] };
  const vwap = payload.VWAP || [];
  const rsi = payload.RSI || [];
  const anomalies = (payload.anomaly_markers?.dates || []).map((d, i) => ({
    date: d, y: (payload.anomaly_markers?.y_values || [])[i]
  })).filter(x => x.date && (x.y !== undefined && x.y !== null));

  const priceTrace = {
    x: dates,
    y: close,
    type: 'scatter',
    mode: 'lines',
    name: `${ticker} Close`,
    line: { color: '#3fa34d', width: 2 }
  };
  const hoverTexts = buildHoverTextForDates(dates, timezone, period);
  priceTrace.text = hoverTexts;
  priceTrace.hovertemplate = '%{text}<br>Close: %{y:.2f}<extra></extra>';
  const candleTrace = showCandles ? {
    x: dates,
    open: payload.open || [],
    high: payload.high || [],
    low: payload.low || [],
    close: payload.close || [],
    type: 'candlestick',
    name: `${ticker} Candles`,
    increasing: { line: { color: '#26a69a' } },
    decreasing: { line: { color: '#ef5350' } }
  } : null;
  if (candleTrace) {
    candleTrace.text = hoverTexts;
    candleTrace.hovertemplate = '%{text}<br>Open: %{open:.2f}<br>High: %{high:.2f}<br>Low: %{low:.2f}<br>Close: %{close:.2f}<extra></extra>';
  }
  const macdObj = computeMACD(close);
  const macdTrace = showMACD ? { x: dates, y: macdObj.macd, type: 'scatter', mode: 'lines', name: 'MACD', line: { color: '#ff7f0e', width: 1 }, yaxis: 'y4' } : null;
  const macdSignalTrace = showMACD ? { x: dates, y: macdObj.signal, type: 'scatter', mode: 'lines', name: 'Signal', line: { color: '#1f77b4', width: 1, dash: 'dot' }, yaxis: 'y4' } : null;
  const macdHistTrace = showMACD ? { x: dates, y: macdObj.hist, type: 'bar', name: 'MACD Hist', marker: { color: 'rgba(200,100,100,0.6)' }, yaxis: 'y4' } : null;
  const volumeTrace = showVolume ? {
    x: dates, y: volume, type: 'bar', name: 'Volume', marker: { color: 'rgba(100,149,237,0.5)' }, yaxis: 'y2'
  } : null;
  const bbUpperTrace = showBB ? { x: dates, y: bb.upper || [], type: 'scatter', mode: 'lines', name: 'BB Upper', line: { color: '#ffa500', width: 1 } } : null;
  const bbLowerTrace = showBB ? { x: dates, y: bb.lower || [], type: 'scatter', mode: 'lines', name: 'BB Lower', line: { color: '#ffa500', width: 1 } } : null;
  const bbSmaTrace   = showBB ? { x: dates, y: bb.sma   || [], type: 'scatter', mode: 'lines', name: 'BB SMA',   line: { color: '#d2691e', width: 1, dash: 'dot' } } : null;
  const vwapTrace    = showVWAP ? { x: dates, y: vwap, type: 'scatter', mode: 'lines', name: 'VWAP', line: { color: '#6a5acd', width: 1 } } : null;
  const anomalyTrace = anomalies.length ? {
    x: anomalies.map(a => a.date), y: anomalies.map(a => a.y), type: 'scatter', mode: 'markers+text', name: 'Anomaly',
    marker: { color: 'red', size: 12, symbol: 'triangle-up' }, text: anomalies.map(() => 'Anomaly'), textposition: 'top center'
  } : null;

  const topTraces = [ priceTrace, ...(volumeTrace ? [volumeTrace] : []), ...(bbUpperTrace ? [bbUpperTrace, bbLowerTrace, bbSmaTrace] : []), ...(vwapTrace ? [vwapTrace] : []), ...(anomalyTrace ? [anomalyTrace] : []) ];
  // dashed gap connectors will be appended after axis calculation below
  const rsiTrace = showRSI ? { x: dates, y: rsi, type: 'scatter', mode: 'lines', name: 'RSI', line: { color: '#999', width: 1 }, xaxis: 'x', yaxis: 'y3' } : null;
  const macdTraces = showMACD ? [macdTrace, macdSignalTrace, macdHistTrace].filter(Boolean) : [];
  // MACD not provided directly; we can derive from payload in future if needed.

  // allocate vertical space: top = price, then volume (if shown), then MACD, then RSI at bottom
  const volumeSize = showVolume ? 0.15 : 0;
  const macdSize = showMACD ? 0.12 : 0;
  const rsiSize = showRSI ? 0.12 : 0;
  let mainSize = 1 - (volumeSize + macdSize + rsiSize);
  if (mainSize < 0.35) mainSize = 0.35; // ensure main chart stays readable

  const yaxis_domain_top = 1.0;
  const yaxis_domain_bottom = volumeSize + macdSize + rsiSize;

  const yaxis2_domain_top = macdSize + rsiSize + volumeSize;
  const yaxis2_domain_bottom = macdSize + rsiSize;

  const yaxis4_domain_top = macdSize + rsiSize;
  const yaxis4_domain_bottom = rsiSize;

  const yaxis3_domain_top = rsiSize;
  const yaxis3_domain_bottom = 0;

  // compress gaps for multi-day periods by using ordinal x (indices)
  const useOrdinalX = ((period || '') + '').toLowerCase() !== '1d';
  const ordinal = useOrdinalX ? buildOrdinalAxis(dates, timezone, period) : null;
  const axisX = useOrdinalX ? (ordinal.x || dates.map((_,i)=>i)) : dates;

  // assign axis x values to traces
  priceTrace.x = axisX;
  if (candleTrace) candleTrace.x = axisX;
  if (volumeTrace) volumeTrace.x = axisX;
  if (bbUpperTrace) bbUpperTrace.x = axisX;
  if (bbLowerTrace) bbLowerTrace.x = axisX;
  if (bbSmaTrace) bbSmaTrace.x = axisX;
  if (vwapTrace) vwapTrace.x = axisX;
  if (macdTrace) macdTrace.x = axisX;
  if (macdSignalTrace) macdSignalTrace.x = axisX;
  if (macdHistTrace) macdHistTrace.x = axisX;
  if (anomalyTrace) anomalyTrace.x = useOrdinalX ? anomalies.map(a => dates.indexOf(a.date)) : anomalies.map(a => a.date);

  // add gap connectors for intraday lunch breaks
  const axisForGap = useOrdinalX ? (ordinal.x || dates.map((_,i)=>i)) : dates;
  const gapTraces = buildGapConnectors(dates, close, axisForGap, interval);
  topTraces.push(...gapTraces);

  const plotTextColor = useMemo(() => resolvePlotlyColorFallback(), []);

  // Build the final data array for Plotly and add debug info.
  const plotData = React.useMemo(() => {
    const arr = [
      ...(candleTrace ? [candleTrace] : [priceTrace]),
      ...topTraces.filter(t => t.type !== 'scatter' || t.name !== (priceTrace.name)),
      ...macdTraces,
      ...(rsiTrace ? [rsiTrace] : [])
    ];
    try {
      console.debug('[SuperChart] plotData summary', arr.map(t => ({ name: t.name, type: t.type, x: (t.x || []).length, y: (t.y || []).length })));
    } catch (e) { /* ignore */ }
    return arr;
  }, [dates.length, showCandles, showVolume, showBB, showVWAP, showRSI, showMACD]);

  // Render-time sanity checks
  useEffect(() => {
    try {
      if (plotData && plotData.length) {
        const first = plotData[0];
        console.debug('[SuperChart] render-check first-trace sample x[0..2]:', (first.x || []).slice(0,3), 'types:', (first.x || []).slice(0,3).map(v => typeof v));
      }
    } catch (e) { /* ignore */ }
  }, [plotData]);

  const layout = {
    title: { text: `${ticker} — ${payload.market || ''}`, font: { color: plotTextColor } },
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    font: { color: plotTextColor },
    margin: { l: 60, r: 60, t: 40, b: 40 },
    xaxis: { title: 'Time', type: useOrdinalX ? 'linear' : 'date', showgrid: false, rangeslider: { visible: true }, tickvals: useOrdinalX ? (ordinal.tickvals || []) : undefined, ticktext: useOrdinalX ? (ordinal.ticktext || []) : undefined, tickfont: { color: plotTextColor } },
    yaxis: { title: 'Price', showgrid: true, domain: [yaxis_domain_bottom, yaxis_domain_top], tickfont: { color: plotTextColor } },
    // volume below price (not overlaying)
    yaxis2: showVolume ? { title: 'Volume', domain: [yaxis2_domain_bottom, yaxis2_domain_top], showgrid: false, tickfont: { color: plotTextColor } } : undefined,
    // RSI and MACD stacked below volume
    yaxis4: showMACD ? { title: 'MACD', domain: [yaxis4_domain_bottom, yaxis4_domain_top], anchor: 'x', tickfont: { color: plotTextColor } } : undefined,
    yaxis3: showRSI ? { title: 'RSI', domain: [yaxis3_domain_bottom, yaxis3_domain_top], anchor: 'x', tickfont: { color: plotTextColor } } : undefined,
    legend: { orientation: 'h', y: -0.05, font: { color: plotTextColor } }
  };

  const config = { displayModeBar: false, responsive: true, scrollZoom: true };

  // subscription UI logic
  const [subscribed, setSubscribed] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user || !token) { setSubscribed(false); return; }
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/subscribers/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, ticker }) });
        const j = await res.json();
        if (!mounted) return;
        setSubscribed(!!j.subscribed);
      } catch (e) { setSubscribed(false); }
    }
    check();
    return () => { mounted = false; };
  }, [ticker, token, user]);

  async function toggleSubscribe() {
    if (!user || !token) { alert('Please login to manage subscriptions'); return; }
    const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    try {
      if (subscribed) {
        const res = await fetch(`${front}/subscribers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        if (!res.ok) throw new Error('Failed to unsubscribe');
        setSubscribed(false);
        alert('Unsubscribed');
      } else {
        const res = await fetch(`${front}/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || 'Failed to subscribe');
        setSubscribed(true);
        alert('Subscribed');
      }
    } catch (e) { alert(e.message || e); }
  }

  // Snapshot modal state
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  function saveSnapshot() {
    const key = `snapshot:${ticker}:${new Date().toISOString()}`;
    const payloadToSave = { config: { ticker, period, interval, showBB, showVWAP, showVolume, showRSI, showMACD }, payload };
    localStorage.setItem(key, JSON.stringify(payloadToSave));
    alert('Snapshot saved');
    setSnapshotOpen(false);
    setSnapshotName('');
  }

  // debounce navigation: when user types tickerInput, navigate after 1s of idle or on Enter
  useEffect(() => {
    // don't navigate if input matches current route
    const wanted = (tickerInput || '').trim().toUpperCase();
    const current = (routeTicker || '').trim().toUpperCase();
    if (!wanted || wanted === current) return;
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => {
      const dest = `/superchart/${encodeURIComponent(wanted)}`;
      navigate(dest);
    }, 1000);
    return () => { if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null; } };
  }, [tickerInput, routeTicker, navigate]);

  function handleRelayout(e) {
    // Plotly relayout gives keys like 'xaxis.range[0]' or 'xaxis.range'
    try {
      if (e['xaxis.range[0]'] && e['xaxis.range[1]']) {
        setSeekRange({ start: e['xaxis.range[0]'], end: e['xaxis.range[1]'] });
      } else if (e['xaxis.range']) {
        const r = e['xaxis.range'];
        setSeekRange({ start: r[0], end: r[1] });
      }
    } catch (err) { /* ignore */ }
  }

  return (
    <div className="chart-page">
      <div className="chart-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group">
            <label className="toolbar-label">Ticker</label>
            <input
              className="input"
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  // immediate navigation
                  const next = (tickerInput || '').trim().toUpperCase();
                  if (next) {
                    if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null; }
                    navigate(`/superchart/${encodeURIComponent(next)}`);
                  }
                }
              }}
            />
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Timezone</label>
            <select className="select styled-select" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Period</label>
            <select className="select styled-select" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="1d">1D</option>
              <option value="5d">5D</option>
              <option value="1mo">1Mo</option>
              <option value="6mo">6Mo</option>
              <option value="1y">1Y</option>
            </select>
            <label className="toolbar-label">Interval</label>
            <select className="select styled-select" value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          <div className="toolbar-group">
            <label className="checkbox"><input type="checkbox" checked={showCandles} onChange={e => setShowCandles(e.target.checked)} /> Candlesticks</label>
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Indicators</label>
            <label className="checkbox"><input type="checkbox" checked={showVolume} onChange={e => setShowVolume(e.target.checked)} /> Volume</label>
            <label className="checkbox"><input type="checkbox" checked={showBB} onChange={e => setShowBB(e.target.checked)} /> Bollinger Bands</label>
            <label className="checkbox"><input type="checkbox" checked={showVWAP} onChange={e => setShowVWAP(e.target.checked)} /> VWAP</label>
            <label className="checkbox"><input type="checkbox" checked={showRSI} onChange={e => setShowRSI(e.target.checked)} /> RSI</label>
          </div>
          <div className="toolbar-group">
            <button className="btn btn-primary btn-sm" onClick={toggleSubscribe}>{subscribed ? 'Unsubscribe' : 'Subscribe'}</button>
          </div>
        </div>
        <div className="toolbar-row presets">
          {PRESETS.map(p => (
            <button key={p.label} className={`btn ${period === p.period && interval === p.interval ? 'btn-primary' : ''}`} onClick={() => { setPeriod(p.period); setInterval(p.interval); }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="toolbar-row hints"><span>Tip: Hold LeftCtrl and scroll to zoom. Scroll to pan.</span></div>
      </div>

      {loading && <div className="status">Loading...</div>}
      {error && <div className="status error">{error}</div>}
          <div className="chart-card">
            {(!dates || dates.length === 0) ? (
              <div className="plot-container" style={{display:'flex',alignItems:'center',justifyContent:'center',height:320,color:'var(--text-secondary)'}}>
                <div>No chart data available for <strong>{ticker}</strong> (try a different period or ticker)</div>
              </div>
            ) : (
              <Plot
                key={`plot-${ticker}-${dates.length}`}
                data={plotData}
                layout={layout}
                config={config}
                className="plot-container"
                onRelayout={handleRelayout}
                onInitialized={(figure, graphDiv) => { console.debug('[SuperChart] Plot initialized', graphDiv); }}
                onUpdate={(figure, graphDiv) => { /* no-op, but useful when debugging */ }}
              />
            )}
        {seekRange && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>Selected: {seekRange.start} → {seekRange.end}</div>}
      </div>
    </div>
  );
}
