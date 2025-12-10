import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useAuth } from '../context/useAuth';
import '../css/Chart.css';
import PortalDropdown from '../components/PortalDropdown';
import FlagSelect from '../components/FlagSelect';
import DropdownSelect from '../components/DropdownSelect';
import EchartsCard from '../components/EchartsCard';
import { formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands, hexToRgba, buildHoverTextForDates, resolvePlotlyColorFallback, findClosestIndex } from '../components/ChartCore';

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
  { label: 'Intraday', period: '1d', interval: '1m' },
  { label: '5D', period: '5d', interval: '30m' },
  { label: '1M', period: '1mo', interval: '30m' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: 'YTD', period: '1y', interval: '1d' },
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
  const [compareMode, setCompareMode] = useState(false);
  const [compareInput, setCompareInput] = useState('');
  const [compareTickers, setCompareTickers] = useState([]);
  const [compareData, setCompareData] = useState(null);
  const navTimer = useRef(null);
  const { token, user } = useAuth();
  const savePrefsTimer = useRef(null);

    // Load server-side preferences when authenticated
    useEffect(() => {
      let mounted = true;
      async function loadServerPrefs() {
        if (!token || !user) return;
        try {
          const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
          const res = await fetch(`${front}/node/users/preferences`, { headers: { Authorization: `Bearer ${token}` } });
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
          // serverPrefsLoaded removed; no-op here
        } catch { /* ignore */ }
      }
      loadServerPrefs();
      return () => { mounted = false; };
    }, [token, user]);
  // Default to intraday
  const PREF_KEY = 'chart_prefs_v1';
  const [period, setPeriod] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.period || '1d'; } catch { return '1d'; } });
  const [interval, setInterval] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.interval || '1m'; } catch { return '1m'; } });
  const [timezone, setTimezone] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.timezone || 'Asia/Tokyo'; } catch { return 'Asia/Tokyo'; } });
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch { return false; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch { return true; } });
  const [showRSI, setShowRSI] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showRSI !== undefined) ? p.showRSI : false; } catch { return false; } });
  const [showMACD, setShowMACD] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showMACD !== undefined) ? p.showMACD : false; } catch { return false; } });
  const [showExtendedHours, setShowExtendedHours] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showExtendedHours !== undefined) ? p.showExtendedHours : true; } catch { return true; } });
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsBtnRef = useRef(null);
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
        if (compareMode && compareTickers && compareTickers.length) {
          // fetch multiple tickers and store in compareData
          const q = compareTickers.join(',');
          const url = `${PY_API}/chart?ticker=${encodeURIComponent(q)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
          console.debug('[SuperChart] fetching compare', url);
          const res = await fetch(url);
          const json = await res.json();
          setCompareData(json || {});
          setPayload({}); // clear single payload
          setSideInfo({ balanceSheets: [], reports: [], earnings: [], news: [], raw: null });
          setLoading(false);
          return;
        }
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
        // No client-side anomaly injection: anomalies come from backend /db
        // debug: log sizes so we can see why Plot may be blank
        try {
          console.debug('[SuperChart] fetched payload keys', Object.keys(final));
          console.debug('[SuperChart] dates count', (final.dates || []).length, 'close count', (final.close || []).length);
        } catch { /* ignore */ }
        // Fetch real financials/news from backend; fall back to mocks if unavailable
        try {
          const finUrl = `${PY_API}/financials?ticker=${encodeURIComponent(ticker)}`;
          console.debug('[SuperChart] fetching financials', finUrl);
          const fres = await fetch(finUrl);
          if (fres.ok) {
            const fj = await fres.json();
            // Normalize shapes: yfinance returns nested dicts; we map into simple arrays where useful
            const balanceSheets = [];
            try {
              const bs = fj.balance_sheet || fj.balanceSheet || {};
              // bs may be an object of columns; try to pull years as keys
              if (bs && typeof bs === 'object') {
                // If it's a dict-of-dicts (col -> {row:val}), convert to per-year objects
                const cols = Object.keys(bs || {});
                if (cols.length) {
                  // collect all years from nested keys
                  const years = new Set();
                  cols.forEach(c => { const col = bs[c]; if (col && typeof col === 'object') Object.keys(col).forEach(y => years.add(y)); });
                  Array.from(years).sort().reverse().slice(0,3).forEach(y => {
                    const yearNum = parseInt(y, 10) || y;
                    const totalAssets = Math.round(((bs.TotalAssets && bs.TotalAssets[y]) || (bs.totalAssets && bs.totalAssets[y]) || 0));
                    const totalLiabilities = Math.round(((bs.TotalLiab && bs.TotalLiab[y]) || (bs.totalLiabilities && bs.totalLiabilities[y]) || 0));
                    const equity = Math.round(((bs.TotalStockholderEquity && bs.TotalStockholderEquity[y]) || (bs.totalStockholderEquity && bs.totalStockholderEquity[y]) || 0));
                    balanceSheets.push({ year: yearNum, totalAssets, totalLiabilities, equity });
                  });
                }
              }
            } catch (e) { console.debug('balance parse failed', e); }

            const reports = (fj.reports || fj.financialReports || []).slice(0,5).map(r => ({ date: r.endDate || r.date || r.fiscalDateEnding || '', title: r.title || r.report || 'Report', link: r.link || '#' }));
            const earnings = [];
            try {
              const eg = fj.earnings || {};
              if (eg && typeof eg === 'object') {
                // try quarterly or annual
                const periods = eg.quarterly || eg; // fallback
                if (Array.isArray(periods)) {
                  periods.slice(0,4).forEach(p => earnings.push({ period: p.period || p.fiscalPeriod || '', eps: (p.EarningsPerShare || p.eps || p.EPS || '').toString(), surprise: '' }));
                } else if (typeof periods === 'object') {
                  Object.keys(periods).slice(0,4).forEach(k => earnings.push({ period: k, eps: (periods[k] && periods[k].eps) || '' }));
                }
              }
            } catch (e) { console.debug('earnings parse failed', e); }

            const news = Array.isArray(fj.news) ? (fj.news.slice(0,5).map(n => ({ title: n.title || n.headline || '', url: n.link || n.url || '#', date: n.providerPublishTime ? new Date(n.providerPublishTime*1000).toISOString().slice(0,10) : (n.date || ''), summary: n.summary || n.text || '' }))) : [];

            // If we couldn't parse meaningful data, fallback to mock
            if (!balanceSheets.length && !reports.length && !earnings.length && !news.length) throw new Error('no-financial-data');

            // Preserve the raw financial payload so we can show full tables in overlays
            setSideInfo({ balanceSheets, reports, earnings, news, raw: fj });
          } else {
            throw new Error('financials fetch failed');
          }
        } catch (e) {
          console.debug('[SuperChart] financials fetch failed, using mock', e);
          // fallback mocks
          const latestClose = (final.close && final.close.length) ? final.close[final.close.length - 1] : null;
          const mockBalance = [];
          const yearNow = new Date().getFullYear();
          for (let i = 0; i < 3; i++) {
            const year = yearNow - i;
            mockBalance.push({ year, totalAssets: Math.round((1000 + Math.random() * 4000) * (latestClose || 1)), totalLiabilities: Math.round((300 + Math.random() * 1500) * (latestClose || 1)), equity: Math.round((700 + Math.random() * 2500) * (latestClose || 1)) });
          }
          const mockReports = [
            { date: `${yearNow}-08-01`, title: 'Q2 Financial Report', link: '#' },
            { date: `${yearNow}-05-01`, title: 'Annual Summary', link: '#' }
          ];
          const mockEarnings = [
            { period: 'Q2', eps: (Math.random()*2).toFixed(2), surprise: (Math.random()*0.2-0.05).toFixed(2) },
            { period: 'Q1', eps: (Math.random()*2).toFixed(2), surprise: (Math.random()*0.2-0.05).toFixed(2) }
          ];
          const mockNews = [
            { title: `${ticker} announces partnership`, url: '#', date: `${yearNow}-12-01`, summary: 'Strategic partnership announced to expand services.' },
            { title: `${ticker} posts quarterly results`, url: '#', date: `${yearNow}-10-15`, summary: 'Results beat estimates amid higher sales.' },
            { title: `Analyst upgrades ${ticker}`, url: '#', date: `${yearNow}-09-30`, summary: 'Analyst raised target price citing growth.' }
          ];
          setSideInfo({ balanceSheets: mockBalance, reports: mockReports, earnings: mockEarnings, news: mockNews, raw: null });
        }
        setPayload(final);
        setCompareData(null);
      } catch (e) {
        setError(e?.message || 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [ticker, period, interval, compareMode, compareTickers]);

  // persist UI prefs back to localStorage when changed (so SuperChart and Chart share prefs)
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      const merged = { ...p, period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD, showExtendedHours };
      localStorage.setItem(PREF_KEY, JSON.stringify(merged));
      // sync to server when authenticated (debounced)
      if (token && user) {
        if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
        savePrefsTimer.current = setTimeout(async () => {
          try {
            const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
            await fetch(`${front}/node/users/preferences`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD, showExtendedHours })
            });
          } catch { /* ignore */ }
        }, 600);
      }
    } catch { /* ignore */ }
  }, [period, interval, timezone, showBB, showVWAP, showVolume, showRSI, showMACD, showExtendedHours, token, user]);

  const [showCandles, setShowCandles] = useState(false);
  const [seekRange, setSeekRange] = useState(null); // {start, end}
  const plotWrapperRef = useRef(null);
  const [plotHeight, setPlotHeight] = useState(560);

  // right-side info panel data (mocked for now)
  const [sideInfo, setSideInfo] = useState({ balanceSheets: [], reports: [], earnings: [], news: [], raw: null });
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showEarningsModal, setShowEarningsModal] = useState(false);

  // Shared helpers (formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands)
  // are provided by `src/components/ChartCore.js` and imported above.

  // compute MACD client-side (stable callbacks)
  const computeEMA = React.useCallback((values, span) => {
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
  }, []);

  const computeMACD = React.useCallback((closeArr) => {
    if (!closeArr || closeArr.length === 0) return { macd: [], signal: [], hist: [] };
    const ema12 = computeEMA(closeArr, 12);
    const ema26 = computeEMA(closeArr, 26);
    const macd = ema12.map((v, i) => (v - (ema26[i] || 0)));
    const signal = computeEMA(macd, 9);
    const hist = macd.map((v, i) => v - (signal[i] || 0));
    return { macd, signal, hist };
  }, [computeEMA]);

  // Normalize ISO timestamps returned by the server (some servers use +0000 instead of +00:00)
  const normalizeIso = React.useCallback((s) => {
    if (!s || typeof s !== 'string') return s;
    // If ends with Z or has colon in timezone, assume valid
    if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    // convert +0000 -> +00:00 or +0530 -> +05:30
    const m = s.match(/([+-])(\d{2})(\d{2})$/);
    if (m) {
      return s.replace(/([+-])(\d{2})(\d{2})$/, `$1${m[2]}:${m[3]}`);
    }
    return s;
  }, []);

  const dates = useMemo(() => (payload.dates || []).map(normalizeIso), [payload.dates, normalizeIso]);
  const close = useMemo(() => payload.close || [], [payload.close]);
  const volume = useMemo(() => payload.volume || [], [payload.volume]);
  const bb = useMemo(() => payload.bollinger_bands || { lower: [], upper: [], sma: [] }, [payload.bollinger_bands]);
  const vwap = useMemo(() => payload.VWAP || [], [payload.VWAP]);
  const rsi = useMemo(() => payload.RSI || [], [payload.RSI]);
  const anomalies = useMemo(() => (payload.anomaly_markers?.dates || []).map((d, i) => ({
    date: normalizeIso(d), y: (payload.anomaly_markers?.y_values || [])[i]
  })).filter(x => x.date && (x.y !== undefined && x.y !== null)), [payload.anomaly_markers, normalizeIso]);

  // helper: map period -> days window (null means all)
  const periodWindowDays = React.useCallback((p) => {
    const x = (p || '').toLowerCase();
    if (x === '1d') return 1; // intraday: same day
    if (x === '5d') return 5;
    if (x === '1mo') return 30;
    if (x === '6mo') return 180;
    if (x === '1y') return 365;
    if (x === '5y') return null; // all
    return null;
  }, []);

  const rawAnomalies = anomalies;

  const filteredAnomalies = useMemo(() => {
    try {
      const days = periodWindowDays(period);
      if (days === null) return rawAnomalies;
      if (days === 1) {
        // same day as latest data point (use payload last date)
        // compare using the chart's timezone so "1d" matches the visible day's local timestamps
        const latest = dates && dates.length ? DateTime.fromISO(dates[dates.length - 1], { zone: 'utc' }).setZone(timezone) : DateTime.now().setZone(timezone);
        return rawAnomalies.filter(a => {
          const ad = DateTime.fromISO(a.date, { zone: 'utc' }).setZone(timezone);
          return ad.year === latest.year && ad.month === latest.month && ad.day === latest.day;
        });
      }
      const latestMs = dates && dates.length ? DateTime.fromISO(dates[dates.length - 1], { zone: 'utc' }).toMillis() : Date.now();
      const cutoff = latestMs - (days * 24 * 60 * 60 * 1000);
      return rawAnomalies.filter(a => DateTime.fromISO(a.date, { zone: 'utc' }).toMillis() >= cutoff);
    } catch (e) { return rawAnomalies; }
  }, [rawAnomalies, period, dates, periodWindowDays]);

  // anomaly memos: localStorage-backed fallback only (server-backed memos rolled back)
  const MEMO_KEY = `anomaly_memos_v1::${ticker}`;
  const [anomalyMemos, setAnomalyMemos] = useState([]);

  // load memos from localStorage for the current ticker
  useEffect(() => {
    let mounted = true;
    try {
      const ls = JSON.parse(localStorage.getItem(MEMO_KEY) || '[]');
      if (mounted) setAnomalyMemos(ls);
    } catch {
      if (mounted) setAnomalyMemos([]);
    }
    return () => { mounted = false; };
  }, [ticker]);

  const [activeAnomaly, setActiveAnomaly] = useState(null);
  function handleSaveMemo(obj, note) {
    const entry = { id: `${obj.date}::${obj.y}`, date: obj.date, y: obj.y, note, createdAt: new Date().toISOString() };
    setAnomalyMemos(prev => {
      const next = [entry, ...(prev || [])];
      try { localStorage.setItem(MEMO_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setActiveAnomaly(null);
  }

  const [newMemoNote, setNewMemoNote] = useState('');
  function handleRemoveMemo(id) {
    setAnomalyMemos(prev => {
      const next = (prev || []).filter(m => m.id !== id);
      try { localStorage.setItem(MEMO_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function handlePlotClick(event) {
    try {
      if (!event || !event.points || !event.points.length) return;
      const p = event.points[0];
      const traceName = p.data && p.data.name;
      if (traceName && (traceName === 'Anomalies' || traceName === 'Anomaly')) {
        // compute ISO date for the clicked point
        let clickedDate = null;
        if (useOrdinalX) {
          // x is index
          const idx = p.x;
          clickedDate = dates && dates[idx] ? dates[idx] : null;
        } else {
          clickedDate = p.x;
        }
        const y = p.y;
        if (clickedDate) setActiveAnomaly({ date: clickedDate, y });
      }
    } catch (e) { console.debug('plot click failed', e); }
  }

  const hoverTexts = useMemo(() => buildHoverTextForDates(dates, timezone, period), [dates, timezone, period]);

  const topTraces = useMemo(() => {
    const _priceTrace = {
      x: dates,
      y: close,
      type: 'scatter',
      mode: 'lines',
      name: `${ticker} Close`,
      line: { color: '#3fa34d', width: 2 },
      text: hoverTexts,
      hovertemplate: '%{text}<br>Close: %{y:.2f}<extra></extra>'
    };

    const _candleTrace = showCandles ? {
      x: dates,
      open: payload.open || [],
      high: payload.high || [],
      low: payload.low || [],
      close: payload.close || [],
      type: 'candlestick',
      name: `${ticker} Candles`,
      increasing: { line: { color: '#26a69a' } },
      decreasing: { line: { color: '#ef5350' } },
      text: hoverTexts,
      hovertemplate: '%{text}<br>Open: %{open:.2f}<br>High: %{high:.2f}<br>Low: %{low:.2f}<br>Close: %{close:.2f}<extra></extra>'
    } : null;

    const _volumeTrace = showVolume ? { x: dates, y: volume, type: 'bar', name: 'Volume', marker: { color: 'rgba(100,149,237,0.5)' }, yaxis: 'y2' } : null;
    const _bbUpperTrace = showBB ? { x: dates, y: bb.upper || [], type: 'scatter', mode: 'lines', name: 'BB Upper', line: { color: '#ffa500', width: 1 } } : null;
    const _bbLowerTrace = showBB ? { x: dates, y: bb.lower || [], type: 'scatter', mode: 'lines', name: 'BB Lower', line: { color: '#ffa500', width: 1 } } : null;
    const _bbSmaTrace   = showBB ? { x: dates, y: bb.sma   || [], type: 'scatter', mode: 'lines', name: 'BB SMA',   line: { color: '#d2691e', width: 1, dash: 'dot' } } : null;
    const _vwapTrace    = showVWAP ? { x: dates, y: vwap, type: 'scatter', mode: 'lines', name: 'VWAP', line: { color: '#6a5acd', width: 1 } } : null;
    // For SuperChart, anomalies are rendered using the filteredAnomalies logic below
    // so do not include the raw anomaly trace here (it would show unfiltered markers).
    // const _anomalyTrace = anomalies.length ? { x: anomalies.map(a => a.date), y: anomalies.map(a => a.y), type: 'scatter', mode: 'markers+text', name: 'Anomaly', marker: { color: 'red', size: 12, symbol: 'triangle-up' }, text: anomalies.map(() => 'Anomaly'), textposition: 'top center' } : null;

    return [ _priceTrace, ...(_volumeTrace ? [_volumeTrace] : []), ...(_bbUpperTrace ? [_bbUpperTrace, _bbLowerTrace, _bbSmaTrace] : []), ...(_vwapTrace ? [_vwapTrace] : []) ];
  }, [dates, close, payload.open, payload.high, payload.low, payload.close, volume, bb, vwap, anomalies, showVolume, showBB, showVWAP, showCandles, hoverTexts, ticker]);
  // expose individual trace references for downstream axis assignment
  const priceTrace = topTraces[0];
  const candleTrace = topTraces.find(t => t && t.type === 'candlestick') || null;
  const volumeTrace = topTraces.find(t => t && t.name === 'Volume') || null;
  const bbUpperTrace = topTraces.find(t => t && t.name === 'BB Upper') || null;
  const bbLowerTrace = topTraces.find(t => t && t.name === 'BB Lower') || null;
  const bbSmaTrace = topTraces.find(t => t && t.name === 'BB SMA') || null;
  const vwapTrace = topTraces.find(t => t && t.name === 'VWAP') || null;
  const anomalyTrace = topTraces.find(t => t && t.name === 'Anomaly') || null;
  // dashed gap connectors will be appended after axis calculation below
  const rsiTrace = useMemo(() => showRSI ? { x: dates, y: rsi, type: 'scatter', mode: 'lines', name: 'RSI', line: { color: '#999', width: 1 }, xaxis: 'x', yaxis: 'y3' } : null, [dates, rsi, showRSI]);
  const macdTraces = useMemo(() => {
    const macdObj = computeMACD(close);
    const macdTrace = showMACD ? { x: dates, y: macdObj.macd, type: 'scatter', mode: 'lines', name: 'MACD', line: { color: '#ff7f0e', width: 1 }, yaxis: 'y4' } : null;
    const macdSignalTrace = showMACD ? { x: dates, y: macdObj.signal, type: 'scatter', mode: 'lines', name: 'Signal', line: { color: '#1f77b4', width: 1, dash: 'dot' }, yaxis: 'y4' } : null;
    const macdHistTrace = showMACD ? { x: dates, y: macdObj.hist, type: 'bar', name: 'MACD Hist', marker: { color: 'rgba(200,100,100,0.6)' }, yaxis: 'y4' } : null;
    return showMACD ? [macdTrace, macdSignalTrace, macdHistTrace].filter(Boolean) : [];
  }, [close, dates, showMACD, computeMACD]);
  const macdTrace = macdTraces[0] || null;
  const macdSignalTrace = macdTraces[1] || null;
  const macdHistTrace = macdTraces[2] || null;
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
  if (anomalyTrace) {
    if (useOrdinalX) {
      const idxs = anomalies.map(a => findClosestIndex(dates, a.date)).filter(i => i >= 0);
      anomalyTrace.x = idxs;
    } else {
      anomalyTrace.x = anomalies.map(a => a.date);
    }
  }

  // add gap connectors for intraday lunch breaks
  const axisForGap = useOrdinalX ? (ordinal.x || dates.map((_,i)=>i)) : dates;
  const gapTraces = buildGapConnectors(dates, close, axisForGap, interval);
  topTraces.push(...gapTraces);

  // Add gradient bands under the price line to match small-card style
  const gradientBands = buildGradientBands(dates, close, axisForGap, 4, priceTrace.line?.color || '#26a69a');
  if (gradientBands && gradientBands.length) {
    // place gradient bands before the price trace
    topTraces.unshift(...gradientBands);
  }

  const plotTextColor = useMemo(() => resolvePlotlyColorFallback(), []);
  // Build the final data array for Plotly and add debug info.
  // Also sanitize traces so empty or mismatched traces don't break rendering.
  function sanitizeTrace(trace) {
    if (!trace) return null;
    const t = { ...trace };
    try {
      // Candlestick requires open/high/low/close arrays
      if (t.type === 'candlestick') {
        const opens = t.open || [];
        const highs = t.high || [];
        const lows = t.low || [];
        const closes = t.close || [];
        const xs = t.x || [];
        const minLen = Math.min(xs.length, opens.length, highs.length, lows.length, closes.length);
        if (minLen <= 0) return null;
        t.x = xs.slice(0, minLen);
        t.open = opens.slice(0, minLen);
        t.high = highs.slice(0, minLen);
        t.low = lows.slice(0, minLen);
        t.close = closes.slice(0, minLen);
        return t;
      }
      // For simple scatter/bar traces, align x and y lengths
      const xs = Array.isArray(t.x) ? t.x : [];
      const ys = Array.isArray(t.y) ? t.y : [];
      if (xs.length && ys.length) {
        const minLen = Math.min(xs.length, ys.length);
        if (minLen <= 0) return null;
        t.x = xs.slice(0, minLen);
        t.y = ys.slice(0, minLen);
        return t;
      }
      // If trace has only x (e.g., gap connectors use x and y), ensure both exist
      if (xs.length && !ys.length) return null;
      if (!xs.length && ys.length) return null;
      return t;
    } catch (e) { return null; }
  }

  const plotData = React.useMemo(() => {
    // If compare mode is active and we have compareData (multiple tickers), build one trace per ticker
    if (compareMode && compareData) {
      try {
        const palette = ['#3fa34d','#1f77b4','#ff7f0e','#9467bd','#e377c2'];
        const traces = [];
        const keys = compareTickers.length ? compareTickers : Object.keys(compareData || {});
        for (let i = 0; i < keys.length && i < 5; i++) {
          const tk = keys[i];
          const pl = (compareData && (compareData[tk] || compareData[tk.toUpperCase()])) || null;
          if (!pl) continue;
          const ds = (pl.dates || []).map(normalizeIso);
          const closes = pl.close || [];
          if (!ds.length || !closes.length) continue;
          traces.push({ x: ds, y: closes, type: 'scatter', mode: 'lines', name: tk, line: { color: palette[i % palette.length], width: 2 }, hovertemplate: '%{x}<br>%{y}<extra></extra>' });
        }
        return traces;
      } catch (e) { /* fallback to single-ticker path below */ }
    }
    // Always include priceTrace as core visible trace. Include candleTrace additionally when toggled.
    const arr = [
      priceTrace,
      ...(showCandles && candleTrace ? [candleTrace] : []),
      ...topTraces.filter(t => t && t.name !== priceTrace.name && t.name !== (candleTrace && candleTrace.name)),
      ...macdTraces,
      ...(rsiTrace ? [rsiTrace] : [])
    ];
    // Add a dedicated anomaly highlight trace (filtered by period)
    try {
      const ani = (filteredAnomalies || []).map(a => a.date);
      const ay = (filteredAnomalies || []).map(a => a.y);
        if (ani && ani.length) {
          // color marker if a memo exists for that anomaly date
          const colors = ani.map(d => {
            try {
              const found = (anomalyMemos || []).find(m => normalizeIso((m.date || m.datetime || m.createdAt || '')) === normalizeIso(d));
              return found ? '#ffb300' : 'red';
            } catch { return 'red'; }
          });
          if (useOrdinalX) {
            const indices = ani.map(d => findClosestIndex(dates, d)).filter(i => i >= 0);
            if (indices && indices.length) {
              arr.push({ x: indices, y: ay.slice(0, indices.length), mode: 'markers', type: 'scatter', name: 'Anomalies', marker: { color: colors.slice(0, indices.length), size: 12, symbol: 'diamond' }, hovertemplate: '%{x}<br>Anomaly: %{y}<extra></extra>' });
            }
          } else {
              // For non-ordinal (intraday) charts, only include anomaly timestamps that exactly
              // match an x value in `dates` (avoid nearest-index mapping which can place markers
              // on other days). Use normalized ISO strings for comparison.
              const exactXs = [];
              const exactYs = [];
              for (let i = 0; i < ani.length; i++) {
                const d = normalizeIso(ani[i]);
                const idx = dates.indexOf(d);
                if (idx >= 0) {
                  exactXs.push(dates[idx]);
                  exactYs.push(ay[i]);
                }
              }
              if (exactXs.length) {
                const usedColors = colors.slice(0, exactXs.length);
                arr.push({ x: exactXs, y: exactYs, mode: 'markers', type: 'scatter', name: 'Anomalies', marker: { color: usedColors, size: 12, symbol: 'diamond' }, hovertemplate: '%{x}<br>Anomaly: %{y}<extra></extra>' });
              }
            }
        }
    } catch (e) { /* ignore */ }

    // sanitize traces and remove any null/empty traces
    const cleaned = arr.map(sanitizeTrace).filter(Boolean);
    try {
      console.debug('[SuperChart] plotData summary', cleaned.map(t => ({ name: t.name, type: t.type, x: (t.x || []).length, y: (t.y || []).length })));
    } catch (e) { void e; }
    return cleaned;
  }, [candleTrace, priceTrace, topTraces, macdTraces, rsiTrace, filteredAnomalies, anomalyMemos, useOrdinalX, dates, showCandles, compareMode, compareData, compareTickers]);

  // Render-time sanity checks
  useEffect(() => {
    try {
      if (plotData && plotData.length) {
        const first = plotData[0];
        console.debug('[SuperChart] render-check first-trace sample x[0..2]:', (first.x || []).slice(0,3), 'types:', (first.x || []).slice(0,3).map(v => typeof v));
      }
    } catch { /* ignore */ }
  }, [plotData]);

  // compute responsive plot height to maximize chart area
  useEffect(() => {
    function recompute() {
      try {
        const toolbar = document.querySelector('.chart-toolbar');
        const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 120;
        // leave room for side panel header + margins (~160px)
        const h = Math.max(360, window.innerHeight - toolbarH - 160);
        setPlotHeight(h);
      } catch (e) { /* ignore */ }
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  const layout = {
    title: { text: `${ticker} — ${payload.market || ''}`, font: { color: plotTextColor } },
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    font: { color: plotTextColor },
    margin: { l: 60, r: 60, t: 40, b: 40 },
    xaxis: { title: 'Time', type: useOrdinalX ? 'linear' : 'date', showgrid: false, rangeslider: { visible: !useOrdinalX }, tickvals: useOrdinalX ? (ordinal.tickvals || []) : undefined, ticktext: useOrdinalX ? (ordinal.ticktext || []) : undefined, tickfont: { color: plotTextColor } },
    yaxis: { title: 'Price', showgrid: true, domain: [yaxis_domain_bottom, yaxis_domain_top], tickfont: { color: plotTextColor } },
    // volume below price (not overlaying)
    yaxis2: showVolume ? { title: 'Volume', domain: [yaxis2_domain_bottom, yaxis2_domain_top], showgrid: false, tickfont: { color: plotTextColor } } : undefined,
    // RSI and MACD stacked below volume
    yaxis4: showMACD ? { title: 'MACD', domain: [yaxis4_domain_bottom, yaxis4_domain_top], anchor: 'x', tickfont: { color: plotTextColor } } : undefined,
    yaxis3: showRSI ? { title: 'RSI', domain: [yaxis3_domain_bottom, yaxis3_domain_top], anchor: 'x', tickfont: { color: plotTextColor } } : undefined,
    legend: { orientation: 'h', y: -0.05, font: { color: plotTextColor } }
  };
  // set layout height dynamically so chart fills available area
  layout.height = plotHeight;

  // Extended hours shading: use timezone to compute pre/post-market rectangles
  try {
    const shapes = Array.isArray(layout.shapes) ? [...layout.shapes] : [];
    if (showExtendedHours && dates && dates.length) {
      // derive unique local dates in selected timezone
      const days = Array.from(new Set(dates.map(d => DateTime.fromISO(d).setZone(timezone).toISODate()))).sort();
      // extended hours window: pre-market 04:00-09:30, post-market 16:00-20:00 (exchange local time)
      for (const day of days) {
        const dt = DateTime.fromISO(day, { zone: timezone });
        const preStart = DateTime.fromObject({ year: dt.year, month: dt.month, day: dt.day, hour: 4, minute: 0 }, { zone: timezone }).toISO();
        const preEnd = DateTime.fromObject({ year: dt.year, month: dt.month, day: dt.day, hour: 9, minute: 30 }, { zone: timezone }).toISO();
        const postStart = DateTime.fromObject({ year: dt.year, month: dt.month, day: dt.day, hour: 16, minute: 0 }, { zone: timezone }).toISO();
        const postEnd = DateTime.fromObject({ year: dt.year, month: dt.month, day: dt.day, hour: 20, minute: 0 }, { zone: timezone }).toISO();
        shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: preStart, x1: preEnd, y0: 0, y1: 1, fillcolor: 'rgba(70,90,120,0.06)', layer: 'below', line: { width: 0 } });
        shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: postStart, x1: postEnd, y0: 0, y1: 1, fillcolor: 'rgba(70,90,120,0.06)', layer: 'below', line: { width: 0 } });
      }
    }
    if (shapes.length) layout.shapes = shapes;
  } catch (e) { /* ignore shading errors */ }

  const config = { displayModeBar: false, responsive: true, scrollZoom: true };

  // subscription UI logic
  const [subscribed, setSubscribed] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user || !token) { setSubscribed(false); return; }
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/node/subscribers/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, ticker }) });
        const j = await res.json();
        if (!mounted) return;
        setSubscribed(!!j.subscribed);
      } catch { setSubscribed(false); }
    }
    check();
    return () => { mounted = false; };
  }, [ticker, token, user]);

  async function toggleSubscribe() {
    if (!user || !token) { alert('Please login to manage subscriptions'); return; }
    const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    try {
      if (subscribed) {
        const res = await fetch(`${front}/node/subscribers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        if (!res.ok) throw new Error('Failed to unsubscribe');
        setSubscribed(false);
        alert('Unsubscribed');
      } else {
        const res = await fetch(`${front}/node/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || 'Failed to subscribe');
        setSubscribed(true);
        alert('Subscribed');
      }
    } catch (e) { alert(e.message || e); }
  }

  // Snapshot feature omitted for now (no UI hooks present).

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
    } catch { /* ignore */ }
  }

  return (
    <div className="chart-page">
      <div className="chart-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group">
            <label className="toolbar-label">Ticker</label>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <button className={`btn btn-sm ${compareMode ? 'btn-active' : ''}`} onClick={() => setCompareMode(m => !m)} title="Toggle compare mode">{compareMode ? 'Compare (on)' : 'Compare'}</button>
              {!compareMode ? (
                <input
                  className="input"
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const next = (tickerInput || '').trim().toUpperCase();
                      if (next) {
                        if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null; }
                        navigate(`/superchart/${encodeURIComponent(next)}`);
                      }
                    }
                  }}
                />
              ) : (
                <div className="tag-input" onClick={() => document.getElementById('compare-input')?.focus()} style={{flex:1}}>
                  {compareTickers.map((t) => (
                    <span className="tag-pill" key={t} tabIndex={0} role="option" aria-label={`Ticker ${t}`} onKeyDown={(e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setCompareTickers(prev => prev.filter(x => x !== t)); } }}>
                      {t}
                      <button aria-label={`Remove ${t}`} className="tag-x" onClick={(e) => { e.stopPropagation(); setCompareTickers(prev => prev.filter(x => x !== t)); }}>{'\u00d7'}</button>
                    </span>
                  ))}
                  <input id="compare-input" className="input tag-text" value={compareInput} onChange={e => setCompareInput(e.target.value.toUpperCase())}
                    placeholder={compareTickers.length ? '' : 'e.g. AAPL, MSFT'}
                    onKeyDown={(e) => {
                      const v = e.target.value;
                      if (e.key === ' ' || e.key === ',' || e.key === 'Enter') {
                        e.preventDefault();
                        const parts = v.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                        if (parts.length) {
                          setCompareTickers(prev => Array.from(new Set([...prev, ...parts])).slice(0,5));
                          setCompareInput('');
                        }
                      } else if (e.key === 'Backspace' && !v) {
                        setCompareTickers(prev => prev.slice(0, Math.max(0, prev.length - 1)));
                      }
                    }}
                    onBlur={() => {
                      const v = compareInput.trim();
                      if (v) {
                        const parts = v.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                        setCompareTickers(prev => Array.from(new Set([...prev, ...parts])).slice(0,5));
                        setCompareInput('');
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{marginTop:8}}>
              {!compareMode ? (
                <button className="btn btn-primary" onClick={() => { const next = (tickerInput || '').trim().toUpperCase(); if (next) navigate(`/superchart/${encodeURIComponent(next)}`); }}>Go</button>
              ) : (
                <button className="btn btn-primary" onClick={() => { if (compareTickers.length) { /* triggers fetch via effect */ } else { alert('Add tickers to compare (max 5)'); } }}>Apply Compare ({compareTickers.length || 0})</button>
              )}
            </div>
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Timezone</label>
            <FlagSelect value={timezone} onChange={setTimezone} options={TIMEZONES} />
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Period</label>
            {/* custom Portal-backed select matching FlagSelect style */}
            <div style={{width:120}}>
              <DropdownSelect value={period} onChange={setPeriod} placeholder="Period" options={[{value:'1d',label:'1D'},{value:'5d',label:'5D'},{value:'1mo',label:'1Mo'},{value:'6mo',label:'6Mo'},{value:'1y',label:'1Y'}]} />
            </div>
            <label className="toolbar-label">Interval</label>
            <div style={{width:120}}>
              <DropdownSelect value={interval} onChange={setInterval} placeholder="Interval" options={[{value:'1m',label:'1m'},{value:'5m',label:'5m'},{value:'30m',label:'30m'},{value:'1h',label:'1h'},{value:'1d',label:'1d'}]} />
            </div>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label">Display</label>
            <div style={{display:'flex', gap:8}}>
              <button className={`btn btn-sm ${!showCandles ? 'btn-primary' : ''}`} onClick={() => setShowCandles(false)} title="Lines" style={!showCandles ? { background: '#3fa34d', color: '#fff' } : {}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{marginRight:6}} xmlns="http://www.w3.org/2000/svg"><polyline points="3,15 9,9 13,12 21,6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Lines
              </button>
              <button className={`btn btn-sm ${showCandles ? 'btn-primary' : ''}`} onClick={() => setShowCandles(true)} title="Candlestick" style={showCandles ? { background: '#3fa34d', color: '#fff' } : {}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{marginRight:6}} xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="4" height="12" stroke="#fff" fill="#26a69a" rx="1"/><rect x="14" y="9" width="4" height="9" stroke="#fff" fill="#e0e0e0" rx="1"/></svg>
                Candles
              </button>
              <button className={`btn btn-sm ${showExtendedHours ? 'btn-primary' : ''}`} onClick={() => setShowExtendedHours(v => !v)} title="Show Extended Hours" style={showExtendedHours ? { background: '#ffd54f', color: '#000' } : {}}>
                ETH
              </button>
            </div>
          </div>
          <div className="toolbar-group">
            <label className="toolbar-label">Indicators</label>
            <div className="indicator-select">
              <button
                ref={indicatorsBtnRef}
                className={`btn btn-mode btn-sm ${showVolume || showBB || showVWAP || showRSI || showMACD ? 'active' : ''}`}
                onClick={() => setIndicatorsOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={indicatorsOpen}
              >Indicators</button>
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
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showRSI} onClick={() => setShowRSI(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowRSI(v => !v); } }}>
                      <span className={`indicator-dot ${showRSI ? 'checked' : ''}`} aria-hidden>
                        {showRSI && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      RSI
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMACD} onClick={() => setShowMACD(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMACD(v => !v); } }}>
                      <span className={`indicator-dot ${showMACD ? 'checked' : ''}`} aria-hidden>
                        {showMACD && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      MACD
                    </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
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
        <div className="toolbar-row hints"><span></span></div>
      </div>

      {loading && <div className="status">Loading...</div>}
      {error && <div className="status error">{error}</div>}

      <div className="superchart-layout">
        <div className="superchart-main">
          <div className="chart-card">
            {(!dates || dates.length === 0) ? (
              <div className="plot-container" style={{display:'flex',alignItems:'center',justifyContent:'center',height:320,color:'var(--text-secondary)'}}>
                <div>No chart data available for <strong>{ticker}</strong> (try a different period or ticker)</div>
              </div>
            ) : compareMode && compareData && compareTickers.length ? (
              // Compare mode: render comparison tickers as line overlays
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:plotHeight,color:'var(--text-secondary)'}}>
                <div>Compare mode with {compareTickers.length} ticker(s) — ECharts view (coming soon)</div>
              </div>
            ) : (
              // Single-ticker expanded view with ECharts
              <EchartsCard
                ticker={ticker}
                dates={dates}
                open={open}
                high={high}
                low={low}
                close={close}
                volume={volume}
                VWAP={VWAP}
                bollinger_bands={bollinger_bands}
                anomalies={filteredAnomalies}
                timezone={timezone}
                period={period}
                interval={interval}
                chartMode={showCandles ? 'candlestick' : 'line'}
                showVolume={showVolume}
                showVWAP={showVWAP}
                showBB={showBB}
                showAnomaly={showRSI} // use RSI toggle as anomaly toggle for consistency
                height={plotHeight}
              />
            )}
            {seekRange && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>Selected: {seekRange.start} → {seekRange.end}</div>}
          </div>
        </div>

        <aside className="superchart-side">
          <h4>Financials</h4>
          <div className="section" style={{position:'relative'}}><strong>Balance Sheets</strong>
            <button className="btn btn-link" style={{position:'absolute', right:0, top:2, fontSize:12}} onClick={() => setShowBalanceModal(true)}>View full</button>
            {(() => {
              // If raw data available, show a compact row summary using common keys
              const raw = sideInfo.raw && sideInfo.raw.balance_sheet;
              if (raw && typeof raw === 'object') {
                // Try to pick the most recent year and display several common metrics
                try {
                  const cols = Object.keys(raw || {});
                  // find a representative year by scanning nested keys
                  const years = new Set();
                  cols.forEach(c => { const col = raw[c]; if (col && typeof col === 'object') Object.keys(col).forEach(y => years.add(y)); });
                  const yearsArr = Array.from(years).sort().reverse();
                  const recent = yearsArr[0];
                  const getVal = (field) => {
                    // field match by exact or case-insensitive includes
                    for (const k of Object.keys(raw)) {
                      if (k.toLowerCase() === field.toLowerCase() || k.toLowerCase().includes(field.toLowerCase())) {
                        const v = raw[k];
                        if (v && typeof v === 'object') return v[recent] || v[recent.toString()] || '';
                        return v;
                      }
                    }
                    return '';
                  };
                  const assets = getVal('TotalAssets') || getVal('Total Assets') || getVal('Total Assets Net');
                  const liab = getVal('TotalLiab') || getVal('Total Liab') || getVal('Total Liabilities');
                  const equity = getVal('TotalStockholderEquity') || getVal('Total Equity') || getVal('TotalStockholdersEquity') || getVal('TotalStockholderEquity');
                  return (
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
                      <div><div style={{fontSize:12,color:'var(--text-secondary)'}}>Year</div><div style={{fontWeight:600}}>{recent || '-'}</div></div>
                      <div><div style={{fontSize:12,color:'var(--text-secondary)'}}>Assets</div><div style={{fontWeight:600}}>{assets ? Number(assets).toLocaleString() : '-'}</div></div>
                      <div><div style={{fontSize:12,color:'var(--text-secondary)'}}>Liabilities</div><div style={{fontWeight:600}}>{liab ? Number(liab).toLocaleString() : '-'}</div></div>
                    </div>
                  );
                } catch (e) { /* fallthrough to parsed summary */ }
              }
              return sideInfo.balanceSheets && sideInfo.balanceSheets.length ? (
                <table style={{width:'100%', fontSize:'0.9rem'}}>
                  <thead><tr><th>Year</th><th style={{textAlign:'right'}}>Assets</th><th style={{textAlign:'right'}}>Liabilities</th><th style={{textAlign:'right'}}>Equity</th></tr></thead>
                  <tbody>
                    {sideInfo.balanceSheets.map(b => (
                      <tr key={b.year}><td>{b.year}</td><td style={{textAlign:'right'}}>{b.totalAssets.toLocaleString()}</td><td style={{textAlign:'right'}}>{b.totalLiabilities.toLocaleString()}</td><td style={{textAlign:'right'}}>{b.equity.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No balance sheet data.</div>;
            })()}
          </div>
          <div className="section"><strong>Reports</strong>
            {sideInfo.reports && sideInfo.reports.length ? (
              <ul style={{paddingLeft:16}}>
                {sideInfo.reports.map(r => <li key={r.date}><a href={r.link}>{r.date} — {r.title}</a></li>)}
              </ul>
            ) : <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No reports available.</div>}
          </div>
          <div className="section"><strong>Earnings</strong>
            {sideInfo.earnings && sideInfo.earnings.length ? (
              <div>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>{sideInfo.earnings.length} periods</div>
                  <button className="btn btn-link" style={{fontSize:12}} onClick={() => setShowEarningsModal(true)}>Show graph</button>
                </div>
                <ul style={{paddingLeft:16}}>
                  {sideInfo.earnings.map((e,i) => <li key={i}>{e.period}: EPS {e.eps} {e.surprise ? `(surprise ${e.surprise})` : ''}</li>)}
                </ul>
              </div>
            ) : <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No earnings data.</div>}
          </div>
          <div className="section"><strong>News</strong>
            {sideInfo.news && sideInfo.news.length ? (
              <div>
                {/* Hero: first news item */}
                {(() => {
                  const first = sideInfo.news[0];
                  const thumb = first && (first.thumbnail || first.image || first.img) || null;
                  return (
                    <div style={{display:'flex', gap:12, marginBottom:8, alignItems:'center'}}>
                      {thumb ? <img src={thumb} alt="thumb" style={{width:72,height:48,objectFit:'cover',borderRadius:6}} /> : <div style={{width:72,height:48,background:'var(--surface)',borderRadius:6}} />}
                      <div style={{flex:1}}>
                        <a href={first.url || '#'} target="_blank" rel="noopener noreferrer" style={{fontWeight:600, color:'var(--text-primary)'}}>{first.title}</a>
                        <div style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>{first.date} • {first.summary}</div>
                      </div>
                    </div>
                  );
                })()}
                <ul style={{paddingLeft:16}}>
                  {sideInfo.news.slice(1).map((n,i) => <li key={i}><a href={n.url || '#'} target="_blank" rel="noopener noreferrer">{n.date} — {n.title}</a><div style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>{n.summary}</div></li>)}
                </ul>
              </div>
            ) : <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No news available.</div>}
          </div>
          <div className="section"><strong>Anomaly Memos</strong>
            {anomalyMemos && anomalyMemos.length ? (
              <div style={{maxHeight:180, overflow:'auto'}}>
                <ul style={{paddingLeft:16}}>
                  {anomalyMemos.map(m => (
                    <li key={m.id} style={{marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:600}}>{m.date}</div>
                      <div style={{fontSize:12,color:'var(--text-secondary)'}}>{m.note}</div>
                      <div style={{textAlign:'right'}}><button className="btn btn-sm" onClick={() => handleRemoveMemo(m.id)}>Remove</button></div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No memos saved.</div>}
          </div>
        </aside>
        {/* Modals rendered at root of layout */}
        {activeAnomaly && (
          <div className="modal-backdrop" onClick={() => setActiveAnomaly(null)} style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1300}}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()} style={{background:'var(--surface)',color:'var(--text)',width:'90%',maxWidth:520,maxHeight:'70%',overflow:'auto',borderRadius:8,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h3 style={{margin:0}}>Anomaly — {ticker}</h3>
                <button className="btn btn-sm" onClick={() => setActiveAnomaly(null)}>Close</button>
              </div>
              <div style={{marginTop:12}}>
                <div style={{marginBottom:8}}>Detected at: <strong>{activeAnomaly.date}</strong></div>
                <div style={{marginBottom:8}}>Value: <strong>{activeAnomaly.y}</strong></div>
                <div style={{marginBottom:8}}>
                  <label style={{display:'block',fontSize:12,color:'var(--text-secondary)'}}>Memo (optional)</label>
                  <textarea value={newMemoNote} onChange={e => setNewMemoNote(e.target.value)} style={{width:'100%',minHeight:80}} />
                </div>
                <div style={{textAlign:'right'}}>
                  <button className="btn" onClick={() => { setNewMemoNote(''); setActiveAnomaly(null); }}>Cancel</button>
                  <button className="btn btn-primary" style={{marginLeft:8}} onClick={() => { handleSaveMemo(activeAnomaly, newMemoNote || ''); setNewMemoNote(''); }}>Save Memo</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showBalanceModal && (
          <div className="modal-backdrop" onClick={() => setShowBalanceModal(false)} style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200}}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()} style={{background:'var(--surface)',color:'var(--text)',width:'90%',maxWidth:900,maxHeight:'80%',overflow:'auto',borderRadius:8,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h3 style={{margin:0}}>Full Balance Sheet</h3>
                <button className="btn btn-sm" onClick={() => setShowBalanceModal(false)}>Close</button>
              </div>
              <div style={{marginTop:12}}>
                {sideInfo.raw && sideInfo.raw.balance_sheet ? (
                  (() => {
                    // If balance_sheet is a dict-of-dicts (col -> {row: val}), render a table of rows
                    const bs = sideInfo.raw.balance_sheet;
                    // Detect nested dict form
                    const isNested = Object.values(bs || {}).some(v => v && typeof v === 'object');
                    if (isNested) {
                      // collect years / columns
                      const cols = Object.keys(bs || {});
                      const years = new Set();
                      cols.forEach(c => { const col = bs[c]; if (col && typeof col === 'object') Object.keys(col).forEach(y => years.add(y)); });
                      const yearsArr = Array.from(years).sort().reverse();
                      // build rows for each metric (field)
                      const metrics = Object.keys(bs || {}).sort();
                      return (
                        <div style={{maxHeight:'60vh', overflow:'auto'}}>
                          <table style={{width:'100%',fontSize:12, borderCollapse:'collapse'}}>
                            <thead>
                              <tr>
                                <th style={{textAlign:'left', padding:'6px'}}>Field</th>
                                {yearsArr.map(y => <th key={y} style={{textAlign:'right', padding:'6px'}}>{y}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {metrics.map(m => (
                                <tr key={m}>
                                  <td style={{padding:'6px'}}>{m}</td>
                                  {yearsArr.map(y => {
                                    const v = (bs[m] && (bs[m][y] || bs[m][y.toString()])) || '';
                                    const num = typeof v === 'number' ? v : (v && !isNaN(Number(v)) ? Number(v) : null);
                                    return <td key={y} style={{textAlign:'right', padding:'6px'}}>{num != null ? num.toLocaleString() : (v || '')}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    // Fallback: if not nested, just pretty-print JSON in an auto-scroll area but formatted clearly
                    return <pre style={{whiteSpace:'pre-wrap',fontSize:12, maxHeight:'60vh', overflow:'auto'}}>{JSON.stringify(bs, null, 2)}</pre>;
                  })()
                ) : (
                  <div style={{maxHeight: '60vh', overflow:'auto'}}>
                    <table style={{width:'100%',fontSize:12}}>
                      <thead><tr><th>Year</th><th style={{textAlign:'right'}}>Assets</th><th style={{textAlign:'right'}}>Liabilities</th><th style={{textAlign:'right'}}>Equity</th></tr></thead>
                      <tbody>
                        {(sideInfo.balanceSheets || []).map(b => (
                          <tr key={b.year}><td>{b.year}</td><td style={{textAlign:'right'}}>{b.totalAssets.toLocaleString()}</td><td style={{textAlign:'right'}}>{b.totalLiabilities.toLocaleString()}</td><td style={{textAlign:'right'}}>{b.equity.toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showEarningsModal && (
          <div className="modal-backdrop" onClick={() => setShowEarningsModal(false)} style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200}}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()} style={{background:'var(--surface)',color:'var(--text)',width:'90%',maxWidth:700,maxHeight:'80%',overflow:'auto',borderRadius:8,padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h3 style={{margin:0}}>Earnings (EPS)</h3>
                <button className="btn btn-sm" onClick={() => setShowEarningsModal(false)}>Close</button>
              </div>
              <div style={{marginTop:12}}>
                {(() => {
                  const vals = (sideInfo.earnings || []).map(e => parseFloat(e.eps || 0)).filter(v => !Number.isNaN(v));
                  if (!vals.length) return <div style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>No earnings numbers to graph.</div>;
                  const w = 600, h = 160, pad = 12;
                  const min = Math.min(...vals), max = Math.max(...vals);
                  const range = max - min || 1;
                  const step = (w - pad*2) / (vals.length - 1 || 1);
                  const points = vals.map((v,i) => `${pad + i*step},${h - pad - ((v - min)/range)*(h - pad*2)}`).join(' ');
                  return (
                    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
                      <polyline fill="none" stroke="#3fa34d" strokeWidth="2" points={points} />
                      {vals.map((v,i)=>{
                        const x = pad + i*step; const y = h - pad - ((v - min)/range)*(h - pad*2);
                        return <circle key={i} cx={x} cy={y} r={3} fill="#3fa34d" />
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
