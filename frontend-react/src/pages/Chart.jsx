import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import Swal from '../utils/muiSwal';
import { useAuth } from '../context/useAuth';
import '../css/Chart.css';
import PortalDropdown from '../components/DropdownSelect/PortalDropdown';
import TimezoneSelect from '../components/TimezoneSelect';
import TickerSearch from '../components/TickerSearch';
import EchartsCard from '../components/EchartsCard';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import ChartCardButtons from '../components/ChartCardButtons';
import { formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands, hexToRgba, buildHoverTextForDates, resolvePlotlyColorFallback, findClosestIndex } from '../components/ChartCore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
const PY_API = `${PY_DIRECT}/py`;

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
    { label: '1D', period: '1d', interval: '1m' },
    { label: '5D', period: '5d', interval: '5m' },
    { label: '1M', period: '1mo', interval: '1d' },
    { label: '6M', period: '6mo', interval: '1d' },
    { label: '1Y', period: '1y', interval: '1d' },
    { label: 'Max', period: 'max', interval: '1wk' }
  ];

// Normalize preset display labels (e.g. "1D 1m" -> "1D", keep "1M 30m" and "1M 1d")
function formatPresetLabel(p) {
  if (!p) return '';
  const per = (p.period || '').toLowerCase();
  const itv = (p.interval || '').toLowerCase();
  if (per === '1d') return '1D';
  if (per === '5d') return '5D';
  if (per === '1wk') return '1W';
  if (per === '1mo') {
    if (itv === '30m') return '1M 30m';
    if (itv === '1d') return '1M';
    return '1M';
  }
  if (per === '3mo') return '3M';
  if (per === '6mo') return '6M';
  if (per === '1y') return '1Y';
  if (per === '2y') return '2Y';
  if (per === '5y') return '5Y';
  if (per === 'max') return 'Max';
  return (p.label || '').split(' ')[0] || p.label;
}

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
  const itv = (interval || '').toLowerCase();

  if (p === '1d') {
    const allowed = ['1m', '2m', '5m', '15m', '30m', '1h'];
    return allowed.includes(itv) ? itv : '1m';
  }

  if (p === '5d') {
    const allowed = ['1m', '2m', '5m', '15m', '30m', '1h', '1d'];
    return allowed.includes(itv) ? itv : '5m';
  }

  if (p === '1wk') {
    const allowed = ['1m', '2m', '5m', '15m', '30m', '1h', '1d'];
    return allowed.includes(itv) ? itv : '5m';
  }

  if (p === '1mo') {
    const allowed = ['5m', '15m', '30m', '1h', '1d'];
    return allowed.includes(itv) ? itv : '30m';
  }

  if (['3mo', '6mo', '1y', '2y'].includes(p)) {
    const allowed = ['1d', '1wk'];
    return allowed.includes(itv) ? itv : '1d';
  }

  if (p === '5y' || p === 'max') {
    const allowed = ['1wk', '1mo'];
    return allowed.includes(itv) ? itv : '1wk';
  }

  const allowed = ['1d', '1wk', '1mo'];
  return allowed.includes(itv) ? itv : '1wk';
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

function TickerCard({ ticker, data, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, onExpand, period, interval, globalChartMode = 'auto', totalTickersCount = 1, showMA5, showMA25, showMA75, showSAR, bbSigma, onApplyPreset }) {
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
    const datesArr = payload.anomaly_markers?.dates || [];
    const yArr = payload.anomaly_markers?.y_values || [];
    const reasonArr = payload.anomaly_markers?.reason || [];
    return datesArr.map((d, i) => ({ date: d, y: yArr[i], reason: reasonArr[i] }))
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
              <div className="chart-card-title">{(payload && (payload.displayTicker || getDisplayFromRaw(ticker))) || ticker} <span className="company-name">{companyName}</span></div>
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

      {/* per-card presets removed (moved to top-level toolbar) */}
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
  const [hoverSnapshot, setHoverSnapshot] = useState(null);
  const [timezoneTime, setTimezoneTime] = useState(getTimezoneTimeString(timezone));
  const [tzUserOverridden, setTzUserOverridden] = useState(false);
  const indicatorsBtnRef = useRef(null);
  const toolbarModeBtnRef = useRef(null);
  const periodIntervalBtnRef = useRef(null);
  const tickerSearchRef = useRef(null);
  const toolbarInnerRef = useRef(null);
  const toolbarCenterRef = useRef(null);
  const pillsContainerRef = useRef(null);
  const addBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({});

  // Refs for pill keyboard navigation
  const pillRefs = useRef([]);

  useEffect(() => {
    // Keep refs array in sync with tickers length
    pillRefs.current = pillRefs.current.slice(0, tickers.length); // keep refs for tickers only
  }, [tickers]);

  // Layout: rely on CSS rules in src/css/Chart.css for toolbar/pills sizing and scrolling.

  // compute how many pills fit in the container
  useEffect(() => {
    let mounted = true;
      const compute = () => {
      const container = pillsContainerRef.current;
      if (!container) return;
      const cw = container.getBoundingClientRect().width;
      const reserve = 40; // reduced reserve for add button / gaps to avoid over-collapsing
      // Determine allowed rows for tickers (on small screens allow multiple rows)
      const isSmall = (typeof window !== 'undefined' && window.innerWidth <= 480);
      const rowsForTickers = isSmall ? 2 : 1; // allow 2 rows of tickers on small screens
      let row = 1;
      let rowUsed = 0;
      let count = 0;
      for (let i = 0; i < tickers.length; i++) {
        const el = pillRefs.current[i];
        if (!el) break;
        const w = el.getBoundingClientRect().width + 8; // account for gap
        // If adding this pill would overflow the current row, move to next row
        if (rowUsed + w + reserve > cw) {
          row++;
          if (row > rowsForTickers) break;
          rowUsed = w;
        } else {
          rowUsed += w;
        }
        count++;
      }

      // If small screen we reserve the last (separate) row for the add-pill so it stays on its own line.
      // That means tickers occupy at most `rowsForTickers` rows and the add-pill is always visible below.
      const minVisible = Math.min(2, tickers.length);
      const visible = Math.max(count, minVisible);
      if (mounted) setVisibleCount(visible);
    };

    const ro = new ResizeObserver(compute);
    compute();
    if (pillsContainerRef.current) ro.observe(pillsContainerRef.current);
    window.addEventListener('resize', compute);
    return () => { mounted = false; ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [tickers, pillRefs.current]);

  // overflow collapse state
  const [visibleCount, setVisibleCount] = useState(() => tickers.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  // collapsed pills state: when true, show all pills and allow wrapping into new row
  const [showAllPills, setShowAllPills] = useState(false);

  const handlePillKeyDown = (index, e) => {
    const key = e.key;
    if (key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(pillRefs.current.length - 1, index + 1);
      const el = pillRefs.current[next]; if (el && typeof el.focus === 'function') el.focus();
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      const prev = Math.max(0, index - 1);
      const el = pillRefs.current[prev]; if (el && typeof el.focus === 'function') el.focus();
    } else if (key === 'Home') {
      e.preventDefault(); const el = pillRefs.current[0]; if (el && typeof el.focus === 'function') el.focus();
    } else if (key === 'End') {
      e.preventDefault(); const el = pillRefs.current[pillRefs.current.length - 1]; if (el && typeof el.focus === 'function') el.focus();
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault(); if (index < tickers.length) onExpand(tickers[index]); else {
        // add-pill pressed: open ticker search via ref
        if (tickerSearchRef.current && typeof tickerSearchRef.current.open === 'function') tickerSearchRef.current.open();
      }
    }
  };

  // Keyboard handler for the standalone Add button (now separated from the pills list)
  const handleAddKeyDown = (e) => {
    const key = e.key;
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (tickerSearchRef.current && typeof tickerSearchRef.current.open === 'function') tickerSearchRef.current.open();
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      const first = pillRefs.current[0]; if (first && typeof first.focus === 'function') first.focus();
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      const last = pillRefs.current[pillRefs.current.length - 1]; if (last && typeof last.focus === 'function') last.focus();
    } else if (key === 'Home') {
      e.preventDefault(); const first = pillRefs.current[0]; if (first && typeof first.focus === 'function') first.focus();
    } else if (key === 'End') {
      e.preventDefault(); const last = pillRefs.current[pillRefs.current.length - 1]; if (last && typeof last.focus === 'function') last.focus();
    }
  };

  // Remove ticker helper
  const removeTicker = (symbol) => {
    setTickers(prev => prev.filter(s => s !== symbol));
  };

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
        let res;
        let json;
        try {
          res = await fetch(url);
          if (!res.ok) throw new Error(`status ${res.status}`);
          json = await res.json();
        } catch (err) {
          try {
            const fallbackUrl = `${PY_DIRECT}/py/chart?ticker=${encodeURIComponent(q)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
            const r2 = await fetch(fallbackUrl);
            if (!r2.ok) throw new Error(`fallback status ${r2.status}`);
            json = await r2.json();
            console.warn('Chart: using direct Python fallback', { fallbackUrl });
          } catch (err2) {
            throw err2;
          }
        }
        
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

  // Map market code to a default timezone (city label in TIMEZONES)
  function marketToTimezoneLabel(marketStr) {
    if (!marketStr || typeof marketStr !== 'string') return 'UTC';
    const code = marketStr.split('(')[0].trim().toUpperCase();
    switch (code) {
      case 'US': return 'New York';
      case 'JP': return 'Tokyo';
      case 'TH': return 'Bangkok';
      case 'GB': return 'London';
      case 'EU': return 'Paris';
      case 'CN': return 'Shanghai';
      case 'HK': return 'Hong Kong';
      default: return 'UTC';
    }
  }

  // Auto-select timezone based on the first ticker's market unless user overrides
  useEffect(() => {
    if (tzUserOverridden) return;
    try {
      const primary = Array.isArray(tickers) && tickers.length ? tickers[0] : null;
      if (!primary || !data || typeof data !== 'object') return;
      const payload = data[primary] || data[primary?.toUpperCase?.()] || null;
      const m = payload && payload.market;
      if (m) {
        const tz = marketToTimezoneLabel(m);
        if (tz && tz !== timezone) setTimezone(tz);
      }
    } catch { /* ignore mapping issues */ }
  }, [data, tickers, tzUserOverridden]);

  // Persist preferences to localStorage when relevant values change
  useEffect(() => {
    try {
      const p = { tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, globalChartMode, showMA5, showMA25, showMA75, showMA: showMA5 || showMA25 || showMA75, showSAR, bbSigma };
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
  }, [tickers, period, interval, timezone, showBB, showVWAP, showVolume, showAnomaly, showLegend, globalChartMode, showMA5, showMA25, showMA75, showSAR, bbSigma, token, user]);

  function applyPreset(p) {
    const enforced = enforceIntervalRules(p.period, p.interval);
    setPeriod(p.period);
    setInterval(enforced);
  }

  function clearAllTags() {
    setTickers([]);
  }

  // Stock group save/load feature deprecated and removed.

  function onExpand(ticker) {
    navigate(`/chart/u/${encodeURIComponent(ticker)}`);
  }

  // `subscribe` helper removed (not used in toolbar); per-card SubscribeButton handles subscriptions.

  return (
    <div className="chart-page">
      <div className={`chart-toolbar ${showAllPills ? 'chart-toolbar--pills-expanded' : ''}`}>
        <div ref={toolbarInnerRef} className="chart-toolbar-inner">
        <div className="toolbar-left">
          {/* Add button separated from pills so pills width/scrolling isn't affected */}
          <button
            className="chart-pill add-pill"
            aria-label="Add ticker"
            onClick={() => { if (tickerSearchRef.current && typeof tickerSearchRef.current.open === 'function') tickerSearchRef.current.open(); }}
            ref={addBtnRef}
            onKeyDown={handleAddKeyDown}
          >
            +
          </button>

          {/* Clear All button (trash icon, same size as Add) */}
          <button
            className="chart-pill add-pill toolbar-action-btn clear-btn"
            aria-label="Clear all tickers"
            title="Clear all tickers"
            onClick={() => { if (tickers.length) clearAllTags(); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path className="trash-body" d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div
            className={`chart-pills ${showAllPills ? 'pills-expanded' : ''}`}
            role="list"
            ref={pillsContainerRef}
          >
            {/** Non-collapsing, always-visible pills container (interactable) **/}
            <>
              {tickers.map((t, i) => (
                <button
                  key={t}
                  className={`chart-pill`}
                  title={t}
                  onClick={() => onExpand(t)}
                  ref={el => pillRefs.current[i] = el}
                  onKeyDown={(e) => handlePillKeyDown(i, e)}
                  tabIndex={0}
                  aria-label={`Open ${t}`}
                >
                  <img className="chart-pill-logo" src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(t)}?format=png`} alt="" onError={(e)=>{e.currentTarget.style.display='none'}} />
                  <span className="chart-pill-text">{(data && data[t] && (data[t].displayTicker || data[t].meta?.displayTicker)) || t}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="pill-remove"
                    aria-label={`Remove ${t}`}
                    onClick={(e) => { e.stopPropagation(); removeTicker(t); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); removeTicker(t); } }}
                  >✕</span>
                </button>
              ))}
            </>
          </div>
        </div>

        <div ref={toolbarCenterRef} className="toolbar-center">
          {/* Center is now empty; pills moved to toolbar-left for left alignment */}
        </div>

        {/* TickerSearch instance (used via ref) */}
        <TickerSearch ref={tickerSearchRef} showInput={false} onSelect={(symbol) => {
          setTickers(prev => Array.from(new Set([...prev, symbol])));
        }} placeholder="Search stocks by name or symbol..." />

        {/* Right-side controls: Timezone, Indicators, Chart Mode */}
        <div className="toolbar-right">
          <div className="toolbar-control">
            <TimezoneSelect 
              value={timezone} 
              onChange={(tz) => { setTimezone(tz); setTzUserOverridden(true); }} 
              options={TIMEZONES}
              currentTimezone={timezone}
              formatLabel={formatTimezoneLabel}
              displayTime={timezoneTime}
              sortFn={sortTimezonesByOffset}
            />
          </div>

          {/* mobile period button removed as requested */}

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
                    {[
                      { key: 'auto', label: 'Auto', color: '#9CA3AF' },
                      { key: 'candlestick', label: 'Candlestick', color: '#F97316' },
                      { key: 'line', label: 'Line', color: '#3B82F6' },
                      { key: 'ohlc', label: 'OHLC (Heiken-Ashi)', color: '#B45309' },
                      { key: 'bar', label: 'Bar', color: '#8B5CF6' },
                      { key: 'column', label: 'Column', color: '#6366F1' },
                      { key: 'area', label: 'Area', color: '#06B6D4' },
                      { key: 'hlc', label: 'HLC', color: '#6B7280' }
                    ].map(m => (
                      <div
                        key={m.key}
                        className={`mode-item ${globalChartMode === m.key ? 'active' : ''}`}
                        role="option"
                        tabIndex={0}
                        aria-selected={globalChartMode === m.key}
                        onClick={() => { setGlobalChartMode(m.key); setToolbarModeOpen(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGlobalChartMode(m.key); setToolbarModeOpen(false); } }}
                        style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                      >
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: m.color, display: 'inline-block' }} aria-hidden></span>
                        <span>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </PortalDropdown>
              )}
          </div>
        </div>

      </div>
      </div>

      {/* Global presets moved here so changing a preset doesn't live inside each card */}
      <div
        className="preset-inner"
        role="toolbar"
        aria-label="Default presets"
        style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 auto', justifyContent: 'center', overflowX: 'auto', padding: 0, justifySelf: 'center' }}
      >
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            className={`preset-large btn preset ${period === p.period && interval === p.interval ? 'active' : ''}`}
            onClick={() => applyPreset(p)}
          >
            {formatPresetLabel(p)}
          </button>
        ))}
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
            onApplyPreset={applyPreset}
            onHoverSnapshot={setHoverSnapshot}
            bbSigma={bbSigma}
          />
        ))}
      </div>
    </div>
  );
}

// Shared helpers (formatTickLabels, buildOrdinalAxis, buildGapConnectors, buildGradientBands)
// are provided by `src/components/ChartCore.js` and imported above.