import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useAuth } from '../context/useAuth';
import '../css/Chart.css';
import PortalDropdown from '../components/PortalDropdown';
import FlagSelect from '../components/FlagSelect';
import EchartsCard from '../components/EchartsCard';
import ChartCardButtons from '../components/ChartCardButtons';
import { formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands, hexToRgba, buildHoverTextForDates, resolvePlotlyColorFallback, findClosestIndex } from '../components/ChartCore';

const PY_API = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:8000';

// Comprehensive timezone list (full-hour offsets only)
const TIMEZONES = [
  'UTC',
  'America/New_York',      // UTC-5/-4
  'America/Chicago',       // UTC-6/-5
  'America/Denver',        // UTC-7/-6
  'America/Los_Angeles',   // UTC-8/-7
  'America/Anchorage',     // UTC-9/-8
  'America/Honolulu',      // UTC-10
  'America/Sao_Paulo',     // UTC-3
  'America/Mexico_City',   // UTC-6/-5
  'America/Toronto',       // UTC-5/-4
  'Europe/London',         // UTC+0/+1
  'Europe/Paris',          // UTC+1/+2
  'Europe/Berlin',         // UTC+1/+2
  'Europe/Rome',           // UTC+1/+2
  'Europe/Madrid',         // UTC+1/+2
  'Europe/Amsterdam',      // UTC+1/+2
  'Europe/Brussels',       // UTC+1/+2
  'Europe/Zurich',         // UTC+1/+2
  'Europe/Vienna',         // UTC+1/+2
  'Europe/Stockholm',      // UTC+1/+2
  'Europe/Copenhagen',     // UTC+1/+2
  'Europe/Oslo',           // UTC+1/+2
  'Europe/Helsinki',       // UTC+2/+3
  'Europe/Athens',         // UTC+2/+3
  'Europe/Istanbul',       // UTC+3
  'Europe/Moscow',         // UTC+3
  'Europe/Warsaw',         // UTC+1/+2
  'Europe/Prague',         // UTC+1/+2
  'Asia/Tokyo',            // UTC+9
  'Asia/Seoul',            // UTC+9
  'Asia/Shanghai',         // UTC+8
  'Asia/Hong_Kong',        // UTC+8
  'Asia/Singapore',        // UTC+8
  'Asia/Bangkok',          // UTC+7
  'Asia/Jakarta',          // UTC+7
  'Asia/Manila',           // UTC+8
  'Asia/Taipei',           // UTC+8
  'Asia/Kuala_Lumpur',     // UTC+8
  'Asia/Dubai',            // UTC+4
  'Asia/Karachi',          // UTC+5
  'Asia/Tashkent',         // UTC+5
  'Asia/Almaty',           // UTC+6
  'Australia/Sydney',      // UTC+10/+11
  'Australia/Melbourne',   // UTC+10/+11
  'Australia/Brisbane',    // UTC+10
  'Australia/Perth',       // UTC+8
  'Pacific/Auckland',      // UTC+12/+13
  'Pacific/Fiji',          // UTC+12
  'Pacific/Honolulu',      // UTC-10
  'Africa/Cairo',          // UTC+2
  'Africa/Johannesburg',   // UTC+2
  'Africa/Lagos',          // UTC+1
  'Africa/Nairobi'         // UTC+3
];

// Format timezone with UTC offset: "(UTC+09:00) Tokyo"
function formatTimezoneLabel(tz) {
  try {
    const now = new Date();
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = Math.abs(Math.floor(offsetHours));
    const mins = Math.abs(Math.floor((Math.abs(offsetHours) - absHours) * 60));
    const offsetStr = `${sign}${absHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    
    // Extract city name from timezone (e.g., "Asia/Tokyo" -> "Tokyo")
    const cityName = tz.split('/').pop().replace(/_/g, ' ');
    
    return `(UTC${offsetStr}) ${cityName}`;
  } catch (e) {
    return tz;
  }
}

// Auto-detect user's timezone based on browser locale
function detectUserTimezone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Check if detected timezone is in our list
    if (TIMEZONES.includes(detected)) {
      return detected;
    }
    // Fallback: find closest matching timezone
    const offset = new Date().getTimezoneOffset();
    // Common mappings based on offset
    if (offset === -540) return 'Asia/Tokyo'; // UTC+9
    if (offset === -480) return 'Asia/Singapore'; // UTC+8
    if (offset === -420) return 'Asia/Bangkok'; // UTC+7
    if (offset === 0) return 'Europe/London'; // UTC+0
    if (offset === 300) return 'America/New_York'; // UTC-5
    if (offset === 420) return 'America/Los_Angeles'; // UTC-7
  } catch (e) {
    console.warn('Timezone detection failed:', e);
  }
  return 'UTC'; // Ultimate fallback
}

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

function TickerCard({ ticker, data, timezone, showBB, showVWAP, showVolume, showAnomaly, onExpand, period, interval, globalChartMode = 'auto', totalTickersCount = 1 }) {
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
  const [chartMode, setChartMode] = useState('lines'); // 'lines' or 'candlestick'
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const modeBtnRef = useRef(null);
  const { token, user } = useAuth();

  // Check follow status on mount
  useEffect(() => {
    let mounted = true;
    async function checkFollowStatus() {
      if (!user || !token) {
        if (mounted) setFollowed(false);
        return;
      }
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/node/subscribers/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: user.id || user._id || user.userId, ticker })
        });
        const j = await res.json();
        if (mounted) setFollowed(!!j.subscribed);
      } catch {
        if (mounted) setFollowed(false);
      }
    }
    checkFollowStatus();
    return () => { mounted = false; };
  }, [ticker, token, user]);

  async function handleFollowToggle() {
    if (!user || !token) {
      alert('Please login to follow tickers');
      return;
    }
    const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    setIsLoadingFollow(true);
    try {
      if (followed) {
        const res = await fetch(`${front}/node/tickers/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] })
        });
        if (!res.ok) throw new Error('Failed to unfollow');
        setFollowed(false);
      } else {
        const res = await fetch(`${front}/node/subscribers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: user.id || user._id || user.userId, tickers: [ticker] })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || 'Failed to follow');
        setFollowed(true);
      }
    } catch (e) {
      alert(e.message || e.toString());
    } finally {
      setIsLoadingFollow(false);
    }
  }

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

  // Normalize ISO timestamps returned by the server (some servers use +0000 instead of +00:00)
  function normalizeIso(s) {
    if (!s || typeof s !== 'string') return s;
    if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    const m = s.match(/([+-])(\d{2})(\d{2})$/);
    if (m) return s.replace(/([+-])(\d{2})(\d{2})$/, `$1${m[2]}:${m[3]}`);
    return s;
  }

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
        <ChartCardButtons
          ticker={ticker}
          followed={followed}
          onFollowToggle={handleFollowToggle}
          onExpandView={() => onExpand(ticker)}
          chartMode={appliedChartMode}
          onModeChange={setChartMode}
          globalChartMode={globalChartMode}
          isLoadingFollow={isLoadingFollow}
        />
      </div>
      <div
        className="plot-wrapper"
        style={{position: 'relative'}}
        ref={plotRef}
        tabIndex={0}
      >
        <EchartsCard
          ticker={ticker}
          dates={dates}
          open={open}
          high={high}
          low={low}
          close={close}
          volume={volume}
          vwap={vwap}
          bb={bb}
          anomalies={anomalies}
          timezone={timezone}
          period={period}
          showBB={showBB}
          showVWAP={showVWAP}
          showVolume={showVolume}
          showAnomaly={showAnomaly}
          chartMode={appliedChartMode}
          market={market}
          lastClose={lastClose}
          companyName={companyName}
          isMarketOpen={isMarketOpen}
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
  const [timezone, setTimezone] = useState(() => { 
    try { 
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); 
      return p.timezone || detectUserTimezone(); 
    } catch { 
      return detectUserTimezone(); 
    } 
  });
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
            await fetch(`${front}/node/users/preferences`, {
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
              <FlagSelect 
                value={timezone} 
                onChange={setTimezone} 
                options={TIMEZONES}
                currentTimezone={timezone}
                formatLabel={formatTimezoneLabel}
              />
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
            totalTickersCount={tickers.length}
          />
        ))}
      </div>
    </div>
  );
}

// Shared helpers (formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands)
// are provided by `src/components/ChartCore.js` and imported above.