import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import Swal from 'sweetalert2';
import { useAuth } from '../context/useAuth';
import '../css/Chart.css';
import PortalDropdown from '../components/PortalDropdown';
import TimezoneSelect from '../components/TimezoneSelect';
import EchartsCard from '../components/EchartsCard';
import ChartCardButtons from '../components/ChartCardButtons';
import { formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands, hexToRgba, buildHoverTextForDates, resolvePlotlyColorFallback, findClosestIndex } from '../components/ChartCore';

const PY_API = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:8000';

// City-based timezone labels mapped to IANA identifiers
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

const TIMEZONES = Object.keys(CITY_TZ_MAP);

// Format timezone with UTC offset: "(-10:00) Honolulu"
// tz is city label now; resolve to IANA for calculations
function formatTimezoneLabel(tz) {
  try {
    const now = new Date();
    const iana = CITY_TZ_MAP[tz] || tz;
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const absHours = Math.abs(Math.floor(offsetHours));
    const mins = Math.abs(Math.floor((Math.abs(offsetHours) - absHours) * 60));
    const signedHours = offsetHours >= 0 ? absHours : -absHours;
    const offsetStr = `(${signedHours >= 0 ? '+' : ''}${signedHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')})`;
    return `${offsetStr} ${tz}`;
  } catch (e) {
    return tz;
  }
}

// Get UTC offset for sorting (in hours)
function getTimezoneOffset(tz) {
  try {
    const now = new Date();
    const iana = CITY_TZ_MAP[tz] || tz;
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    return offsetHours;
  } catch (e) {
    return 0;
  }
}

// Sort timezones by UTC offset (from minimum negative to maximum positive)
function sortTimezonesByOffset(timezones) {
  return [...timezones].sort((a, b) => {
    return getTimezoneOffset(a) - getTimezoneOffset(b);
  });
}

// Auto-detect user's timezone based on browser locale
function detectUserTimezone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Try to map detected IANA to a city label
    const cityFromDetected = Object.keys(CITY_TZ_MAP).find(city => CITY_TZ_MAP[city] === detected);
    if (cityFromDetected) return cityFromDetected;
    // Fallback: find closest matching timezone
    const offset = new Date().getTimezoneOffset();
    // Common mappings based on offset
    if (offset === -540) return 'Tokyo'; // UTC+9
    if (offset === -480) return 'Singapore'; // UTC+8
    if (offset === -420) return 'Bangkok'; // UTC+7
    if (offset === 0) return 'London'; // UTC+0
    if (offset === 300) return 'New York'; // UTC-5
    if (offset === 420) return 'Los Angeles'; // UTC-7
  } catch (e) {
    console.warn('Timezone detection failed:', e);
  }
  return 'UTC'; // Ultimate fallback
}

// Get current time in specified timezone with UTC offset
function getTimezoneTimeString(tz) {
  try {
    const now = new Date();
    const iana = CITY_TZ_MAP[tz] || tz;
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = Math.abs(Math.floor(offsetHours));
    const mins = Math.abs(Math.floor((Math.abs(offsetHours) - absHours) * 60));
    const offsetStr = `${sign}${absHours.toString().padStart(2, '0')}`;
    const timeStr = now.toLocaleString('en-US', { timeZone: iana, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${timeStr} UTC${offsetStr}`;
  } catch (e) {
    return 'N/A';
  }
}

  const PRESETS = [
  { label: 'Intraday', period: '1d', interval: '1m' },
  { label: '5D', period: '5d', interval: '30m' },
  { label: '1M', period: '1mo', interval: '30m' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '5Y', period: '5y', interval: '1wk' }
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

  // Intraday: only intraday granularities
  if (p === '1d') {
    const allowed = ['1m', '2m', '5m', '15m', '30m', '1h'];
    return allowed.includes((interval || '').toLowerCase()) ? interval : '1m';
  }

  // 5 trading days: allow finer intraday but default to 30m
  if (p === '5d') {
    const allowed = ['5m', '15m', '30m', '1h', '1d'];
    return allowed.includes((interval || '').toLowerCase()) ? interval : '30m';
  }

  // Month-based periods
  if (p.endsWith('mo')) {
    const n = parseInt(p.replace('mo', ''), 10) || 1;
    if (n <= 1) {
      const allowed = ['15m', '30m', '1h', '1d'];
      return allowed.includes((interval || '').toLowerCase()) ? interval : '30m';
    }
    // For >= 2mo, 1d or coarser is reliable
    const allowed = ['1d', '1wk', '1mo'];
    return allowed.includes((interval || '').toLowerCase()) ? interval : '1d';
  }

  // Year-based periods
  if (p.endsWith('y')) {
    const n = parseInt(p.replace('y', ''), 10) || 1;
    if (n <= 1) {
      const allowed = ['1d', '1wk'];
      return allowed.includes((interval || '').toLowerCase()) ? interval : '1d';
    }
    const allowed = ['1wk', '1mo', '1y'];
    return allowed.includes((interval || '').toLowerCase()) ? interval : '1wk';
  }

  // Fallback for 'max' or unknown: use weekly
  const allowed = ['1d', '1wk', '1mo'];
  return allowed.includes((interval || '').toLowerCase()) ? interval : '1wk';
}

// Convert an interval string (e.g., "30m", "1h", "1d", "1wk") to milliseconds.
function intervalToMs(interval) {
  const itv = (interval || '').toLowerCase();
  if (itv.endsWith('m')) return parseInt(itv, 10) * 60000;
  if (itv.endsWith('h')) return parseInt(itv, 10) * 3600000;
  if (itv.endsWith('d')) return parseInt(itv, 10) * 86400000;
  if (itv.endsWith('wk')) return parseInt(itv, 10) * 604800000;
  if (itv.endsWith('mo')) return parseInt(itv, 10) * 2629800000; // approx. month
  if (itv.endsWith('y')) return parseInt(itv, 10) * 31557600000; // approx. year
  return 60000;
}

function TickerCard({ ticker, data, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, onExpand, period, interval, globalChartMode = 'auto', totalTickersCount = 1, showMA5, showMA25, showMA75, showSAR, bbSigma }) {
  const payload = data?.[ticker] || {};
  const dates = useMemo(() => (payload.dates || []).map(d => normalizeIso(d)), [payload.dates]);
  const close = useMemo(() => payload.close || [], [payload.close]);
  const open = payload.open || [];
  const high = payload.high || [];
  const low = payload.low || [];
  const volume = payload.volume || [];
  const bb = payload.bollinger_bands || { lower: [], upper: [], sma: [] };
  const vwap = payload.VWAP || [];
  const movingAverages = payload.moving_averages || { MA5: [], MA25: [], MA75: [] };
  const parabolicSAR = payload.parabolic_sar || { SAR: [] };
  const rawAnomalies = useMemo(() => {
    return (payload.anomaly_markers?.dates || []).map((d, i) => ({ date: d, y: (payload.anomaly_markers?.y_values || [])[i] }))
      .filter(x => x.date && (x.y !== undefined && x.y !== null));
  }, [payload.anomaly_markers]);

  // Map anomalies to the nearest data point index so ECharts can render markers reliably.
  const intervalMs = useMemo(() => intervalToMs(interval || payload.interval || '30m'), [interval, payload.interval]);
  const anomalies = useMemo(() => {
    if (!rawAnomalies.length || !dates.length) return [];
    // Tolerance: 2x interval length, at least 15 minutes, to accommodate small timezone offsets.
    const toleranceMs = Math.max(intervalMs * 2, 15 * 60 * 1000);
    const used = new Set();
    const mapped = rawAnomalies.map((a) => {
      const normalized = normalizeIso(a.date);
      let idx = findClosestIndex(dates, normalized, toleranceMs);

      // Fallback: match by calendar day when anomaly timestamps are daily but chart data is intraday
      if (idx === -1) {
        const targetDay = normalized.split('T')[0];
        idx = dates.findIndex(d => normalizeIso(d).split('T')[0] === targetDay);
      }

      if (idx === -1 || used.has(idx)) return null;
      used.add(idx);
      return { ...a, date: dates[idx], i: idx };
    }).filter(Boolean);
    try {
      console.debug(`anomalies:${ticker}`, { raw: rawAnomalies.length, matched: mapped.length, toleranceMs });
    } catch {/* ignore logging errors */}
    return mapped;
  }, [rawAnomalies, dates, intervalMs, ticker]);

  const companyName = payload.companyName || ticker;
  const market = payload.market || '';

  const plotRef = useRef(null);
  const [badgeTopPx, setBadgeTopPx] = useState(null);
  const [chartMode, setChartMode] = useState('line'); // 'candlestick', 'line', 'ohlc', 'bar', 'column', 'area', 'hlc'
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
      await Swal.fire({
        icon: 'info',
        title: 'Please Login',
        text: 'You need to be signed in to follow tickers.',
        confirmButtonColor: '#00aaff'
      });
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
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.message || e.toString(),
        confirmButtonColor: '#dc2626'
      });
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
    }
  };
  const appliedChartMode = (globalChartMode === 'auto') ? chartMode : (globalChartMode === 'lines' ? 'line' : globalChartMode === 'candlestick' ? 'candlestick' : globalChartMode);

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

  // Resolve city label to IANA for Luxon/Date APIs
  const toIana = (tz) => CITY_TZ_MAP[tz] || tz || 'UTC';

  // market timezone label (GMT offset)
  let gmtLabel = '';
  try {
    const off = DateTime.now().setZone(toIana(timezone)).offset; // minutes
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
        const zone = toIana(timezone);
        const now = DateTime.now().setZone(zone);
        const openT = DateTime.fromISO(payload.market_open, { zone });
        const closeT = DateTime.fromISO(payload.market_close, { zone });
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
        {dates.length === 0 ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '300px', 
            color: 'var(--text-secondary)', 
            fontSize: '14px',
            fontStyle: 'italic'
          }}>
            No data available for this period
          </div>
        ) : (
          <>
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
              showLegend={showLegend}
              chartMode={appliedChartMode}
              market={market}
              lastClose={lastClose}
              companyName={companyName}
              isMarketOpen={isMarketOpen}
              movingAverages={movingAverages}
              parabolicSAR={parabolicSAR}
              showMA5={showMA5}
              showMA25={showMA25}
              showMA75={showMA75}
              showSAR={showSAR}
              bbSigma={bbSigma}
            />
            {lastClose != null && (
              <div className="badge-overlay" style={{ position: 'absolute', right: 10, top: badgeTopPx != null ? `${badgeTopPx}px` : '50%', transform: 'translateY(-50%)', background: (price_change != null && price_change < 0) ? '#e03b3b' : '#26a69a', color: '#fff', padding: '6px 8px', borderRadius: 8, fontSize: 12 }}>
                {formatNumber(lastClose)}
              </div>
            )}
          </>
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
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.tickersInput || ''; } catch { return ''; }
  });
  const [tickers, setTickers] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.tickers || []; } catch { return []; }
  });
  const [period, setPeriod] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.period || '1d'; } catch { return '1d'; } });
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
  const [showMA5, setShowMA5] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p.showMA5 !== undefined) return p.showMA5; if (p.showMA !== undefined) return p.showMA; return false; } catch { return false; } });
  const [showMA25, setShowMA25] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p.showMA25 !== undefined) return p.showMA25; if (p.showMA !== undefined) return p.showMA; return false; } catch { return false; } });
  const [showMA75, setShowMA75] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p.showMA75 !== undefined) return p.showMA75; if (p.showMA !== undefined) return p.showMA; return false; } catch { return false; } });
  const [showSAR, setShowSAR] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showSAR !== undefined) ? p.showSAR : false; } catch { return false; } });
  const [bbSigma, setBbSigma] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.bbSigma || '2sigma'; } catch { return '2sigma'; } });
  const [showLegend, setShowLegend] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p.showLegend !== undefined) ? p.showLegend : false; } catch { return false; } });
  const [globalChartMode, setGlobalChartMode] = useState(() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p.globalChartMode || 'candlestick'; } catch { return 'candlestick'; } });
  const [toolbarModeOpen, setToolbarModeOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [periodIntervalOpen, setPeriodIntervalOpen] = useState(false);
  const [timezoneTime, setTimezoneTime] = useState(getTimezoneTimeString(timezone));
  const indicatorsBtnRef = useRef(null);
  const toolbarModeBtnRef = useRef(null);
  const periodIntervalBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({});

  const { token, user } = useAuth();

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setError(null);
      const enforced = enforceIntervalRules(period, interval);
      
      // Update interval state if it was enforced differently
      if (enforced !== interval) {
        setInterval(enforced);
      }
      
      try {
        const q = tickers.join(',');
        const url = `${PY_API}/chart?ticker=${encodeURIComponent(q)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
        const res = await fetch(url);
        const json = await res.json();
        
        // If all requested tickers returned no data, attempt a coarser interval automatically.
        try {
          const allEmpty = Array.isArray(tickers) && tickers.length > 0 && tickers.every(t => {
            const pl = (json && json[t]) || {};
            return !pl.dates || pl.dates.length === 0;
          });

          if (allEmpty) {
            const order = ['1m','2m','5m','15m','30m','1h','1d','1wk','1mo'];
            const currentIdx = Math.max(0, order.indexOf(enforced));
            let next = enforced;
            for (let i = currentIdx + 1; i < order.length; i++) {
              const candidate = order[i];
              const allowed = enforceIntervalRules(period, candidate);
              if (allowed === candidate) { next = candidate; break; }
            }
            if (next !== enforced) {
              // Notify once and retry by updating state; effect will re-fetch.
              try { await Swal.fire({ icon: 'info', title: 'Switched interval', text: `No data for ${enforced}. Trying ${next} instead.`, timer: 2000, showConfirmButton: false }); } catch {}
              setInterval(next);
              setLoading(false);
              return; // skip setting data for this response
            }
          }
        } catch {}
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

  // Update timezone time display every second
  useEffect(() => {
    setTimezoneTime(getTimezoneTimeString(timezone));
    const interval = setInterval(() => {
      setTimezoneTime(getTimezoneTimeString(timezone));
    }, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  // Persist preferences to localStorage when relevant values change
  useEffect(() => {
    try {
      const p = { tickersInput, tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, globalChartMode, showMA5, showMA25, showMA75, showMA: showMA5 || showMA25 || showMA75, showSAR, bbSigma };
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
  }, [tickersInput, tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, globalChartMode, showMA5, showMA25, showMA75, showSAR, bbSigma, token, user]);

  function applyPreset(p) {
    const enforced = enforceIntervalRules(p.period, p.interval);
    setPeriod(p.period);
    setInterval(enforced);
  }

  function applyTickers() {
    const parts = tickersInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    setTickers(parts.length ? parts : []);
  }

  function clearAllTags() {
    setTickers([]);
    setTickersInput('');
  }

  async function saveToStockGroup() {
    if (!token || !user) {
      await Swal.fire({
        icon: 'info',
        title: 'Please Login',
        text: 'You need to be signed in to save stock groups.',
        confirmButtonText: 'Go to Login',
        confirmButtonColor: '#00aaff'
      }).then((result) => {
        if (result.isConfirmed) navigate('/login');
      });
      return;
    }

    if (tickers.length === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'No Tickers',
        text: 'Please add at least one ticker before saving.',
        confirmButtonColor: '#00aaff'
      });
      return;
    }

    const { value: groupName } = await Swal.fire({
      title: 'Save Stock Group',
      input: 'text',
      inputPlaceholder: 'e.g., Tech Stocks, Watchlist 1',
      inputLabel: 'Group Name',
      showCancelButton: true,
      confirmButtonColor: '#00aaff',
      inputValidator: (value) => {
        if (!value) return 'Group name cannot be empty';
        if (value.length > 50) return 'Group name must be 50 characters or less';
      }
    });

    if (groupName) {
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/node/stock-groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ 
            userId: user.id || user._id || user.userId,
            name: groupName,
            tickers: tickers
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save group');
        await Swal.fire({
          icon: 'success',
          title: 'Saved!',
          text: `Stock group "${groupName}" saved successfully.`,
          confirmButtonColor: '#00aaff'
        });
      } catch (error) {
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'Failed to save stock group',
          confirmButtonColor: '#dc2626'
        });
      }
    }
  }

  async function loadFromStockGroup() {
    if (!token || !user) {
      await Swal.fire({
        icon: 'info',
        title: 'Please Login',
        text: 'You need to be signed in to load stock groups.',
        confirmButtonText: 'Go to Login',
        confirmButtonColor: '#00aaff'
      }).then((result) => {
        if (result.isConfirmed) navigate('/login');
      });
      return;
    }

    try {
      const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
      const res = await fetch(`${front}/node/stock-groups`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const groups = await res.json();
      if (!res.ok) throw new Error(groups.message || 'Failed to fetch groups');
      
      if (!groups || groups.length === 0) {
        await Swal.fire({
          icon: 'info',
          title: 'No Groups',
          text: 'You have no saved stock groups yet.',
          confirmButtonColor: '#00aaff'
        });
        return;
      }

      const { value: selectedGroup } = await Swal.fire({
        title: 'Load Stock Group',
        input: 'select',
        inputOptions: groups.reduce((acc, g) => ({ ...acc, [g._id]: g.name }), {}),
        inputPlaceholder: 'Select a group',
        showCancelButton: true,
        confirmButtonColor: '#00aaff',
        inputValidator: (value) => {
          if (!value) return 'Please select a group';
        }
      });

      if (selectedGroup) {
        const group = groups.find(g => g._id === selectedGroup);
        setTickers(group.tickers || []);
        setTickersInput('');
        await Swal.fire({
          icon: 'success',
          title: 'Loaded!',
          text: `Stock group "${group.name}" loaded with ${group.tickers.length} ticker(s).`,
          timer: 1500,
          confirmButtonColor: '#00aaff'
        });
      }
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to load stock groups',
        confirmButtonColor: '#dc2626'
      });
    }
  }

  function onExpand(ticker) {
    navigate(`/chart/u/${encodeURIComponent(ticker)}`);
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
            <button className="btn btn-icon-search" onClick={applyTickers} title="Apply tickers">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 20l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            {tickers.length > 0 && (
              <button className="btn btn-icon-clear" onClick={clearAllTags} title="Clear all tags">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button className="btn btn-stock-group" onClick={saveToStockGroup} title="Save as stock group">
              💾
            </button>
            <button className="btn btn-stock-group" onClick={loadFromStockGroup} title="Load stock group">
              📂
            </button>
          </div>

        </div>

        {/* Right-side controls: Timezone, Indicators, Chart Mode */}
        <div className="toolbar-right">
          <div className="toolbar-control">
            <TimezoneSelect 
              value={timezone} 
              onChange={setTimezone} 
              options={TIMEZONES}
              currentTimezone={timezone}
              formatLabel={formatTimezoneLabel}
              displayTime={timezoneTime}
              sortFn={sortTimezonesByOffset}
            />
          </div>

          <div className="toolbar-control toolbar-period-mobile">
            <button
              ref={periodIntervalBtnRef}
              className="toolbar-period-btn"
              onClick={() => setPeriodIntervalOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={periodIntervalOpen}
              title="Period & Interval"
            >
              <span className="period-label">{PRESETS.find(p => p.period === period && p.interval === interval)?.label || 'Period'}</span>
            </button>
            {periodIntervalOpen && periodIntervalBtnRef.current && (
              <PortalDropdown anchorRect={periodIntervalBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setPeriodIntervalOpen(false)} className="mode-dropdown">
                <div role="listbox" aria-label="Period & Interval" onMouseLeave={() => setPeriodIntervalOpen(false)}>
                  {PRESETS.map(p => (
                    <div
                      key={p.label}
                      className={`mode-item ${period === p.period && interval === p.interval ? 'active' : ''}`}
                      role="option"
                      tabIndex={0}
                      aria-selected={period === p.period && interval === p.interval}
                      onClick={() => { applyPreset(p); setPeriodIntervalOpen(false); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyPreset(p); setPeriodIntervalOpen(false); } }}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>
              </PortalDropdown>
            )}
          </div>

          <div className="toolbar-control">
            <button
              ref={indicatorsBtnRef}
              className={`toolbar-icon-btn ${showVolume || showBB || showVWAP || showAnomaly || showMA5 || showMA25 || showMA75 || showSAR ? 'active' : ''}`}
              onClick={() => setIndicatorsOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={indicatorsOpen}
              title="Indicators"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h4v12H3V6M8 3h4v15H8V3M13 10h4v8h-4v-8M18 2h4v16h-4V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA5} onClick={() => setShowMA5(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA5(v => !v); } }}>
                          <span className={`indicator-dot ${showMA5 ? 'checked' : ''}`} aria-hidden>
                            {showMA5 && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          MA5
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA25} onClick={() => setShowMA25(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA25(v => !v); } }}>
                          <span className={`indicator-dot ${showMA25 ? 'checked' : ''}`} aria-hidden>
                            {showMA25 && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          MA25
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA75} onClick={() => setShowMA75(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA75(v => !v); } }}>
                          <span className={`indicator-dot ${showMA75 ? 'checked' : ''}`} aria-hidden>
                            {showMA75 && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          MA75
                        </div>
                        <div className="mode-item" role="option" tabIndex={0} aria-checked={showSAR} onClick={() => setShowSAR(v => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSAR(v => !v); } }}>
                          <span className={`indicator-dot ${showSAR ? 'checked' : ''}`} aria-hidden>
                            {showSAR && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          Parabolic SAR
                        </div>
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0' }}></div>
                        <div style={{ padding: '8px 12px', fontSize: '12px', color: '#666' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>BB Bands Width</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                              <input 
                                type="radio" 
                                name="bbSigma" 
                                value="2sigma" 
                                checked={bbSigma === '2sigma'}
                                onChange={() => setBbSigma('2sigma')}
                                style={{ cursor: 'pointer' }}
                              />
                              2σ (Standard)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                              <input 
                                type="radio" 
                                name="bbSigma" 
                                value="1_5sigma" 
                                checked={bbSigma === '1_5sigma'}
                                onChange={() => setBbSigma('1_5sigma')}
                                style={{ cursor: 'pointer' }}
                              />
                              1.5σ (Tight)
                            </label>
                          </div>
                        </div>
                  </div>
                </PortalDropdown>
              )}
          </div>

          <div className="toolbar-control">
            <button
              ref={toolbarModeBtnRef}
              className="toolbar-icon-btn"
              onClick={() => setToolbarModeOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={toolbarModeOpen}
              title="Chart Mode"
            >
              {globalChartMode === 'lines' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 18l6-6 4 4 8-8M18 5h3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'candlestick' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'ohlc' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'bar' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'column' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'area' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : globalChartMode === 'hlc' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 8h2v8H4V8M7 5h2v11H7V5M10 9h2v7h-2v-7M13 6h2v10h-2V6M16 8h2v8h-2V8M19 7h2v9h-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 18l6-6 4 4 8-8M18 5h3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
              {toolbarModeOpen && toolbarModeBtnRef.current && (
                <PortalDropdown anchorRect={toolbarModeBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setToolbarModeOpen(false)} className="mode-dropdown">
                  <div role="listbox" aria-label="Chart Mode" onMouseLeave={() => setToolbarModeOpen(false)}>
                    <div className={`mode-item ${globalChartMode === 'auto' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'auto'} onClick={() => { setGlobalChartMode('auto'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('auto'); setToolbarModeOpen(false); } }}>
                      Auto
                    </div>
                    <div className={`mode-item ${globalChartMode === 'candlestick' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'candlestick'} onClick={() => { setGlobalChartMode('candlestick'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('candlestick'); setToolbarModeOpen(false); } }}>
                      Candlestick
                    </div>
                    <div className={`mode-item ${globalChartMode === 'line' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'line'} onClick={() => { setGlobalChartMode('line'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('line'); setToolbarModeOpen(false); } }}>
                      Line
                    </div>
                    <div className={`mode-item ${globalChartMode === 'ohlc' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'ohlc'} onClick={() => { setGlobalChartMode('ohlc'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('ohlc'); setToolbarModeOpen(false); } }}>
                      OHLC (Heiken-Ashi)
                    </div>
                    <div className={`mode-item ${globalChartMode === 'bar' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'bar'} onClick={() => { setGlobalChartMode('bar'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('bar'); setToolbarModeOpen(false); } }}>
                      Bar
                    </div>
                    <div className={`mode-item ${globalChartMode === 'column' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'column'} onClick={() => { setGlobalChartMode('column'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('column'); setToolbarModeOpen(false); } }}>
                      Column
                    </div>
                    <div className={`mode-item ${globalChartMode === 'area' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'area'} onClick={() => { setGlobalChartMode('area'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('area'); setToolbarModeOpen(false); } }}>
                      Area
                    </div>
                    <div className={`mode-item ${globalChartMode === 'hlc' ? 'active' : ''}`} role="option" tabIndex={0} aria-selected={globalChartMode === 'hlc'} onClick={() => { setGlobalChartMode('hlc'); setToolbarModeOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode('hlc'); setToolbarModeOpen(false); } }}>
                      HLC
                    </div>
                  </div>
                </PortalDropdown>
              )}
          </div>
        </div>

        {/* top-level subscribe removed (subscriptions kept per-card) */}

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
            showLegend={showLegend}
            onExpand={onExpand}
            period={period}
            interval={interval}
            globalChartMode={globalChartMode}
            totalTickersCount={tickers.length}
            showMA5={showMA5}
            showMA25={showMA25}
            showMA75={showMA75}
            showSAR={showSAR}
            bbSigma={bbSigma}
          />
        ))}
      </div>
    </div>
  );
}

// Shared helpers (formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands)
// are provided by `src/components/ChartCore.js` and imported above.