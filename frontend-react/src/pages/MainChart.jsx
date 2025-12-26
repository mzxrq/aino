import React, { useEffect, useMemo, useState, useRef } from 'react';
import PortalDropdown from '../components/DropdownSelect/PortalDropdown';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as echarts from 'echarts';
import TimezoneSelect from '../components/TimezoneSelect';
import FinancialsTable from '../components/FinancialsTable';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import '../css/MainChart.css';
import { useAuth } from '../context/useAuth';
import Swal from '../utils/muiSwal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
const PY_API = `${API_URL}/py`;

// Currency mapping by market
const MARKET_CURRENCIES = {
  'US': '$',
  'JP': '¥',
  'TH': '฿',
  'GB': '£',
  'EU': '€',
  'IN': '₹',
  'CN': '¥',
  'HK': 'HK$',
};

// Common ticker extensions (to be removed from user input, handled by backend)
const TICKER_EXTENSIONS = ['.BK', '.T', '.L', '.TO', '.HK', '.NS', '.BO', '.TW', '.KS'];

// Helper: try Node gateway first, then fall back to Python 5000
async function fetchJsonWithFallback(path, init) {
  // path should start with '/'
  const fallback = `${PY_DIRECT}/py${path}`;
  const res2 = await fetch(fallback, init);
  if (!res2.ok) throw new Error(`Request failed: ${res2.status}`);
  return await res2.json();
}

const PERIOD_PRESETS = [
  { label: '1D', period: '1d', interval: '1m' },
  { label: '5D', period: '5d', interval: '5m' },
  { label: '1W', period: '1wk', interval: '5m' },
  { label: '1M30', period: '1mo', interval: '30m' },
  { label: '1M1', period: '1mo', interval: '1d' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '2Y', period: '2y', interval: '1d' },
  { label: '5Y', period: '5y', interval: '1wk' },
  { label: 'Max', period: 'max', interval: '1wk' }
];

function formatPresetLabel(p) {
  if (!p) return '';
  const per = (p.period || '').toLowerCase();
  const itv = (p.interval || '').toLowerCase();
  if (per === '1d') return '1D';
  if (per === '5d') return '5D';
  if (per === '1wk') return '1W';
  if (per === '1mo') {
    if (itv === '30m') return '1M(30)';
    if (itv === '1d') return '1M(1)';
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

function formatTZLabel(iana) {
  const found = TIMEZONES.find(t => t.name === iana);
  return found ? found.label : iana;
}

function getTimezoneTimeString(iana) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { timeZone: iana, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = Math.abs(Math.floor(offsetHours));
    const mins = Math.abs(Math.floor((Math.abs(offsetHours) - absHours) * 60));
    return `${timeStr} UTC${sign}${absHours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
  } catch (e) {
    return '';
  }
}
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

// Get UTC offset for a city label (returns hours, may be fractional)
function getTimezoneOffset(cityLabel) {
  try {
    const now = new Date();
    const iana = CITY_TZ_MAP[cityLabel] || cityLabel;
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    return offsetHours;
  } catch (e) {
    return 0;
  }
}

// Format timezone with UTC offset: "(+09:00) Tokyo"
function formatTimezoneLabel(cityLabel) {
  try {
    const now = new Date();
    const iana = CITY_TZ_MAP[cityLabel] || cityLabel;
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: iana }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const absHours = Math.abs(Math.floor(offsetHours));
    const mins = Math.abs(Math.floor((Math.abs(offsetHours) - absHours) * 60));
    const signedHours = offsetHours >= 0 ? absHours : -absHours;
    const offsetStr = `(${signedHours >= 0 ? '+' : ''}${signedHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')})`;
    return `${offsetStr} ${cityLabel}`;
  } catch (e) {
    return cityLabel;
  }
}

// Sort timezones by UTC offset
function sortTimezonesByOffset(timezones) {
  return [...timezones].sort((a, b) => getTimezoneOffset(a) - getTimezoneOffset(b));
}

// Auto-detect user's timezone (returns city label present in CITY_TZ_MAP or 'UTC')
function detectUserTimezone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = Object.keys(CITY_TZ_MAP).find(c => CITY_TZ_MAP[c] === detected);
    if (city) return city;
    const offset = new Date().getTimezoneOffset();
    if (offset === -540) return 'Tokyo'; // UTC+9
    if (offset === -480) return 'Singapore'; // UTC+8
    if (offset === -420) return 'Bangkok'; // UTC+7
    if (offset === 0) return 'London'; // UTC+0
    if (offset === 300) return 'New York'; // UTC-5
    if (offset === 420) return 'Los Angeles'; // UTC-7
  } catch (e) {
    console.warn('Timezone detection failed:', e);
  }
  return 'UTC';
}

// Get current time string for a city label (wraps existing IANA helper)
function getTimezoneTimeStringCity(cityLabel) {
  try {
    const iana = CITY_TZ_MAP[cityLabel] || cityLabel;
    return getTimezoneTimeString(iana);
  } catch (e) { return ''; }
}

// Build TIMEZONES array used by TimezoneSelect: array of objects { offset, label, name }
const TIMEZONES = sortTimezonesByOffset(Object.keys(CITY_TZ_MAP)).map(name => ({ offset: getTimezoneOffset(name), label: formatTimezoneLabel(name), name: CITY_TZ_MAP[name] }));

function enforceIntervalRules(period, interval) {
  const p = (period || '').toLowerCase();
  const itv = (interval || '').toLowerCase();
  if (p === '1d') return ['1m','2m','5m','15m','30m','1h'].includes(itv) ? itv : '1m';
  if (p === '5d') return ['1m','2m','5m','15m','30m','1h','1d'].includes(itv) ? itv : '5m';
  if (p === '1wk') return ['1m','2m','5m','15m','30m','1h','1d'].includes(itv) ? itv : '5m';
  if (p === '1mo') return ['5m','15m','30m','1h','1d'].includes(itv) ? itv : '30m';
  if (['3mo','6mo','1y','2y'].includes(p)) return ['1d','1wk'].includes(itv) ? itv : '1d';
  if (p === '5y' || p === 'max') return ['1wk','1mo'].includes(itv) ? itv : '1wk';
  return ['1d','1wk','1mo'].includes(itv) ? itv : '1wk';
}

function getIntervalOptions(period) {
  const p = (period || '').toLowerCase();
  if (p === '1d') return ['1m','2m','5m','15m','30m','1h'];
  if (p === '5d' || p === '1wk') return ['1m','2m','5m','15m','30m','1h','1d'];
  if (p === '1mo') return ['5m','15m','30m','1h','1d'];
  if (['3mo','6mo','1y','2y'].includes(p)) return ['1d','1wk'];
  if (p === '5y' || p === 'max') return ['1wk','1mo'];
  return ['1d','1wk','1mo'];
}

function getCurrency(marketStr) {
  if (!marketStr) return '$';
  const marketCode = marketStr.split('(')[0].trim().toUpperCase();
  return MARKET_CURRENCIES[marketCode] || '$';
}

function cleanTickerInput(input) {
  let cleaned = input.toUpperCase().trim();
  for (const ext of TICKER_EXTENSIONS) {
    if (cleaned.endsWith(ext)) {
      cleaned = cleaned.slice(0, -ext.length);
      break;
    }
  }
  return cleaned;
}

// Market configurations with their extensions
const MARKET_EXTENSIONS = [
  { market: 'US', extensions: [''], label: 'US (NASDAQ/NYSE)' },
  { market: 'Thailand', extensions: ['.BK'], label: 'Thailand (SET)' },
  { market: 'Japan', extensions: ['.T'], label: 'Japan (TSE)' },
  { market: 'UK', extensions: ['.L'], label: 'UK (LSE)' },
  { market: 'Canada', extensions: ['.TO'], label: 'Canada (TSX)' },
  { market: 'Hong Kong', extensions: ['.HK'], label: 'Hong Kong (HKEX)' },
  { market: 'India', extensions: ['.NS', '.BO'], label: 'India (NSE/BSE)' },
  { market: 'Taiwan', extensions: ['.TW'], label: 'Taiwan (TWSE)' },
  { market: 'South Korea', extensions: ['.KS'], label: 'South Korea (KRX)' }
];

export default function LargeChart() {
  const { ticker: paramTicker } = useParams();
  const navigate = useNavigate();
  const [ticker, setTicker] = useState((paramTicker || 'AAPL').toUpperCase());
  const displayTicker = getDisplayFromRaw(ticker);
  const [companyName, setCompanyName] = useState('');
  const [market, setMarket] = useState('US');
  const [searchInput, setSearchInput] = useState((paramTicker || 'AAPL').toUpperCase());
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [period, setPeriod] = useState('1d');
  const [interval, setInterval] = useState('1m');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const periodBtnRef = useRef(null);
  const intervalBtnRef = useRef(null);
  const [payload, setPayload] = useState({});
  const [financials, setFinancials] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('line');
  const [timezone, setTimezone] = useState('UTC');
  const [tzUserOverridden, setTzUserOverridden] = useState(false);
  const [financialTab, setFinancialTab] = useState('income');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [lcNews, setLcNews] = useState([]);
  const [lcNewsLoading, setLcNewsLoading] = useState(false);
  const [lcNewsPageSize] = useState(3);
  const [modalResults, setModalResults] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showMarketModal, setShowMarketModal] = useState(false);
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch { return false; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch { return true; } });
  const [showAnomaly, setShowAnomaly] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showAnomaly !== undefined) ? p.showAnomaly : true; } catch { return true; } });
  const [showDIF, setShowDIF] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showDIF !== undefined) ? p.showDIF : true; } catch { return true; } });
  const [showDEA, setShowDEA] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showDEA !== undefined) ? p.showDEA : true; } catch { return true; } });
  const [showMA5, setShowMA5] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA5 !== undefined) ? p.showMA5 : false; } catch { return false; } });
  const [showMA25, setShowMA25] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA25 !== undefined) ? p.showMA25 : false; } catch { return false; } });
  const [showMA75, setShowMA75] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA75 !== undefined) ? p.showMA75 : false; } catch { return false; } });
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}');
      p.showBB = !!showBB;
      p.showVWAP = !!showVWAP;
      p.showVolume = !!showVolume;
      p.showAnomaly = !!showAnomaly;
      p.showMA5 = !!showMA5;
      p.showMA25 = !!showMA25;
      p.showMA75 = !!showMA75;
      p.showDIF = !!showDIF;
      p.showDEA = !!showDEA;
      localStorage.setItem('lc_prefs', JSON.stringify(p));
    } catch (e) {}
  }, [showBB, showVWAP, showVolume, showAnomaly, showMA5, showMA25, showMA75, showDIF, showDEA]);
  const [showSAR, setShowSAR] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showSAR !== undefined) ? p.showSAR : false; } catch { return false; } });
  const [bbSigma, setBbSigma] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return p.bbSigma || '2sigma'; } catch { return '2sigma'; } });
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsBtnRef = useRef(null);
  const [marketCandidates, setMarketCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTickerSearchModal, setShowTickerSearchModal] = useState(false);
  const [tickerSearchQuery, setTickerSearchQuery] = useState('');

  // Follow state (check whether current user follows this ticker)
  const { user, token } = useAuth();
  const [followed, setFollowed] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [followHover, setFollowHover] = useState(false);

  // Check follow status on mount / when ticker or auth changes
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
        const res = await fetch(`${front}/node/subscribers/tickers/remove`, {
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
      await Swal.fire({ icon: 'error', title: 'Error', text: e.message || e.toString(), confirmButtonColor: '#dc2626' });
    } finally {
      setIsLoadingFollow(false);
    }
  }

  // Preloaded list of interesting stocks
  const INTERESTING_STOCKS = useMemo(() => [
    { ticker: 'AAPL', name: 'Apple Inc.', market: 'US' },
    { ticker: 'MSFT', name: 'Microsoft Corporation', market: 'US' },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', market: 'US' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', market: 'US' },
    { ticker: 'TSLA', name: 'Tesla Inc.', market: 'US' },
    { ticker: 'META', name: 'Meta Platforms Inc.', market: 'US' },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', market: 'US' },
    { ticker: 'AMD', name: 'Advanced Micro Devices', market: 'US' },
    { ticker: 'INTC', name: 'Intel Corporation', market: 'US' },
    { ticker: 'JPM', name: 'JPMorgan Chase', market: 'US' },
    { ticker: '9020.T', name: 'East Japan Railway', market: 'JP' },
    { ticker: '6758.T', name: 'Sony Group Corporation', market: 'JP' },
    { ticker: '7203.T', name: 'Toyota Motor', market: 'JP' },
    { ticker: '8035.T', name: 'Tokyo Electron', market: 'JP' },
    { ticker: 'PTTEP.BK', name: 'PTT Exploration', market: 'TH' },
    { ticker: 'ADVANC.BK', name: 'Advanced Info Service', market: 'TH' },
    { ticker: 'CPALL.BK', name: 'CP ALL Public', market: 'TH' },
    { ticker: 'BTS.BK', name: 'Bangkok Mass Transit', market: 'TH' }
  ], []);

  const filteredStocks = useMemo(() => {
    if (!tickerSearchQuery.trim()) return INTERESTING_STOCKS;
    const q = tickerSearchQuery.toLowerCase();
    return INTERESTING_STOCKS.filter(s => 
      s.ticker.toLowerCase().includes(q) || 
      s.name.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [tickerSearchQuery, INTERESTING_STOCKS]);

  // Modal server-side search (debounced)
  useEffect(() => {
    if (!showTickerSearchModal) return;
    let mounted = true;
    let timer = null;
    const q = tickerSearchQuery && tickerSearchQuery.trim();
    const doFallbackFilter = () => {
      if (!q) return [];
      const lq = q.toLowerCase();
      return INTERESTING_STOCKS.filter(t => {
        const symbol = (t.ticker || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        return symbol.includes(lq) || name.includes(lq);
      }).slice(0, 400);
    };

    if (!q) {
      setModalResults([]);
      setModalLoading(false);
      return () => {};
    }

    timer = setTimeout(async () => {
      setModalLoading(true);
      try {
        let url = `${API_URL}/py/chart/ticker?query=${encodeURIComponent(q)}`;
        let res;
        try {
          res = await fetch(url);
          if (!res.ok) throw new Error(`status ${res.status}`);
        } catch (err) {
          try {
            url = `${PY_DIRECT}/py/chart/ticker?query=${encodeURIComponent(q)}`;
            res = await fetch(url);
            if (!res.ok) throw new Error(`fallback status ${res.status}`);
          } catch (err2) {
            const fb = doFallbackFilter();
            if (mounted) setModalResults(fb);
            return;
          }
        }

        const json = await res.json();
        if (Array.isArray(json)) {
          const norm = json.map(item => {
            const rawSym = (item.symbol || item.ticker || item.ticker_symbol || item.code || '').toString();
            const symbol = rawSym ? rawSym.toUpperCase() : '';
            const name = item.name || item.company || item.label || item.longName || '';
            const exchange = item.exchange || item.exch || item.market || item.market_code || '';
            const display = (item.displayTicker || item.display || (symbol ? symbol.split('.')[0] : '')).toString();
            return { symbol, name, exchange, displayTicker: display };
          }).filter(x => x.symbol || x.name || x.displayTicker);
          if (mounted) setModalResults(norm.slice(0, 400));
        } else {
          const fb = doFallbackFilter();
          if (mounted) setModalResults(fb);
        }
      } catch (e) {
        const fb = doFallbackFilter();
        if (mounted) setModalResults(fb);
      } finally {
        if (mounted) setModalLoading(false);
      }
    }, 250);

    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, [tickerSearchQuery, showTickerSearchModal, INTERESTING_STOCKS]);

  useEffect(() => {
    if (!paramTicker) return;
    setTicker(paramTicker.toUpperCase());
    setSearchInput(cleanTickerInput(paramTicker));
  }, [paramTicker]);

  // Map market code to default timezone city label
  function marketToTimezone(marketStr) {
    if (!marketStr || typeof marketStr !== 'string') return 'UTC';
    const code = marketStr.split('(')[0].trim().toUpperCase();
    switch (code) {
      case 'US': return 'America/New_York';
      case 'JP': return 'Asia/Tokyo';
      case 'TH': return 'Asia/Bangkok';
      case 'GB': return 'Europe/London';
      case 'EU': return 'Europe/Paris';
      case 'IN': return 'Asia/Kolkata';
      case 'CN': return 'Asia/Shanghai';
      case 'HK': return 'Asia/Hong_Kong';
      default: return 'UTC';
    }
  }

  // Auto-set timezone when market changes unless user has overridden
  useEffect(() => {
    if (!tzUserOverridden && market) {
      const tz = marketToTimezone(market);
      setTimezone(tz);
    }
  }, [market, tzUserOverridden]);

  // On mount, if user hasn't set timezone, prefer browser's timezone (IANA)
  useEffect(() => {
    if (tzUserOverridden) return;
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) {
        setTimezone(resolved);
        return;
      }
    } catch (e) {
      // ignore
    }
    // fallback: map detected city label to IANA
    try {
      const city = detectUserTimezone();
      const iana = CITY_TZ_MAP[city] || city;
      setTimezone(iana);
    } catch (e) {}
  }, [tzUserOverridden]);

  // Search for tickers by name or symbol
  useEffect(() => {
    if (!searchInput || searchInput.length === 0) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(searchInput)}`);
        if (!cancelled) setSearchResults(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setSearchResults([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInput]);

  // Fetch company metadata when ticker changes
  useEffect(() => {
    let cancelled = false;
    async function loadMetadata() {
      try {
        const data = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(ticker)}`);
        if (!cancelled) {
          const match = Array.isArray(data) ? data.find((d) => d.ticker === ticker) : null;
          if (match) setCompanyName(match.name || '');
        }
      } catch (e) {
        // Silently fail
      }
    }
    loadMetadata();
    return () => { cancelled = true; };
  }, [ticker]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const enforced = enforceIntervalRules(period, interval);
      try {
        const path = `/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
        const json = await fetchJsonWithFallback(path);
        const resolved = (json && typeof json === 'object') ? (
          json[ticker.toUpperCase()] || json[ticker] || (Object.values(json || {})[0]) || json
        ) : json;
        const finalPayload = resolved && typeof resolved === 'object' ? { ...resolved } : {};
        if (!cancelled) {
          setPayload(finalPayload);
          if (finalPayload.market) setMarket(finalPayload.market);
        }
      } catch (e) {
        if (!cancelled) setError('Unable to load chart data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ticker, period, interval]);

  useEffect(() => {
    let cancelled = false;
    async function loadFinancials() {
      try {
        const fj = await fetchJsonWithFallback(`/financials?ticker=${encodeURIComponent(ticker)}`);
        // If backend returned fetched_at and it's older than 7 days, request a refresh
        const fetchedAt = fj && (fj.fetched_at || fj.fetchedAt || fj.fetchedAtTime);
        if (fetchedAt) {
          const then = new Date(fetchedAt).getTime();
          const age = Date.now() - then;
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          if (age > SEVEN_DAYS) {
            try {
              const refreshed = await fetchJsonWithFallback(`/financials?ticker=${encodeURIComponent(ticker)}&force=true`);
              if (!cancelled && refreshed) {
                Object.assign(fj, refreshed);
              }
            } catch (e) {
              // ignore refresh failure, keep existing
            }
          }
        }
        if (!cancelled) {
          // Convert nested dict structures to usable format
            const processed = {
              income_stmt: fj.income_stmt || {},
              balance_sheet: fj.balance_sheet || {},
              cash_flow: fj.cash_flow || fj.cashflow || {},
              news: Array.isArray(fj.news) ? fj.news : [],
              fetched_at: fj.fetched_at || fj.fetchedAt || null
            };
          setFinancials(processed);
        }
      } catch (e) {
        if (!cancelled) setFinancials({ income_stmt: {}, balance_sheet: {}, cash_flow: {}, news: [] });
      }
    }
    loadFinancials();
    return () => { cancelled = true; };
  }, [ticker]);

  const dates = useMemo(() => (payload.dates || []), [payload.dates]);
  const open = useMemo(() => payload.open || [], [payload.open]);
  const high = useMemo(() => payload.high || [], [payload.high]);
  const low = useMemo(() => payload.low || [], [payload.low]);
  const close = useMemo(() => payload.close || [], [payload.close]);
  const volume = useMemo(() => payload.volume || [], [payload.volume]);
  const anomalies = useMemo(() => {
    const datesArr = payload.anomaly_markers?.dates || [];
    const yArr = payload.anomaly_markers?.y_values || [];
    const reasonArr = payload.anomaly_markers?.reason || [];
    return datesArr.map((d, i) => ({ date: d, y: yArr[i], reason: reasonArr[i] })).filter(x => x.date && (x.y !== undefined && x.y !== null));
  }, [payload.anomaly_markers]);
  const VWAP = useMemo(() => payload.VWAP || [], [payload.VWAP]);
  const bollinger_bands = useMemo(() => payload.bollinger_bands || { lower: [], upper: [], sma: [] }, [payload.bollinger_bands]);
  const movingAverages = useMemo(() => payload.moving_averages || { MA5: [], MA25: [], MA75: [] }, [payload.moving_averages]);

  // Refs for ECharts
  const mainChartRef = useRef(null);
  const echartsInstance = useRef(null);

  // Build and render ECharts option (main price + compact subchart for volume/MACD/VWAP)
  useEffect(() => {
    try {
      console.debug('MainChart useEffect start', { mainChartRef: !!mainChartRef.current, datesLen: (dates||[]).length, closeLen: (close||[]).length });
    } catch (e) {}
    if (!mainChartRef.current) return;

    // prepare data arrays
    const toTime = (d) => {
      if (!d) return null;
      const t = (typeof d === 'number') ? d : Date.parse(d);
      return isNaN(t) ? null : t;
    };

    const timestamps = (dates || []).map(d => toTime(d)).filter(Boolean);
    const priceArr = (close || []).slice(0, timestamps.length).map((v, i) => [timestamps[i], v]);
    const volArr = (volume || []).slice(0, timestamps.length).map((v, i) => [timestamps[i], v]);
    // VWAP: use payload VWAP if present otherwise compute cumulative VWAP
    const vwapArr = (VWAP && VWAP.length === timestamps.length) ? VWAP.map((v, i) => [timestamps[i], v]) : (() => {
      const out = [];
      let sump = 0, sumv = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const p = (close && close[i]) || 0;
        const v = (volume && volume[i]) || 0;
        sump += p * v;
        sumv += v;
        out.push([timestamps[i], sumv ? (sump / sumv) : p]);
      }
      return out;
    })();

    // MACD calculation (adapted)
    function calculateEMA(prices, period) {
      const ema = [];
      const k = 2 / (period + 1);
      if (prices.length >= period) {
        let sum = 0;
        for (let i = 0; i < period; i++) sum += prices[i][1];
        const first = sum / period;
        ema.push([prices[period - 1][0], first]);
        for (let i = period; i < prices.length; i++) {
          const newEMA = prices[i][1] * k + ema[ema.length - 1][1] * (1 - k);
          ema.push([prices[i][0], newEMA]);
        }
      }
      return ema;
    }

    const shortP = 12, longP = 26, signalP = 9;
    const macdLineData = [];
    const signalLineData = [];
    const macdHistData = [];
    if (priceArr.length >= longP) {
      const shortEMA = calculateEMA(priceArr, shortP);
      const longEMA = calculateEMA(priceArr, longP);
      const shortMap = new Map(shortEMA.map(it => [it[0], it[1]]));
      const longMap = new Map(longEMA.map(it => [it[0], it[1]]));
      const macdLine = [];
      for (let i = 0; i < priceArr.length; i++) {
        const t = priceArr[i][0];
        if (shortMap.has(t) && longMap.has(t)) {
          macdLine.push([t, (shortMap.get(t) || 0) - (longMap.get(t) || 0)]);
        }
      }
      const signal = calculateEMA(macdLine, signalP);
      const signalMap = new Map(signal.map(it => [it[0], it[1]]));
      const macdMap = new Map(macdLine.map(it => [it[0], it[1]]));
      const common = Array.from(macdMap.keys()).filter(k => signalMap.has(k)).sort((a,b)=>a-b);
      for (const t of common) {
        const m = macdMap.get(t) || 0;
        const s = signalMap.get(t) || 0;
        macdLineData.push([t, m]);
        signalLineData.push([t, s]);
        const hist = m - s;
        macdHistData.push({ value: [t, hist], itemStyle: { color: hist > 0 ? '#eb5454' : '#47b262' } });
      }
    }

    // build category labels from timestamps (ISO strings)
    const labels = timestamps.map(t => new Date(t).toISOString());

    // helper to align arrays to labels and insert '-' for gaps
    const alignOrDash = (arr) => {
      const out = [];
      for (let i = 0; i < labels.length; i++) {
        const v = (arr && arr[i] !== undefined && arr[i] !== null) ? arr[i] : '-';
        out.push(v);
      }
      return out;
    };

    // support multiple series payloads: payload.seriesList = [{ name, close, open, high, low, volume, vwap, movingAverages, anomalies }]
    const multi = Array.isArray(payload.seriesList) && payload.seriesList.length > 0;

    // build main and sub option (multi-grid) dynamically so main chart can expand
    const hasVolume = showVolume && volArr && volArr.length;
    const hasMACD = macdHistData && macdHistData.length;
    const subGrids = [];
    if (hasVolume) subGrids.push('volume');
    if (hasMACD) subGrids.push('macd');

    let grid = [];
    let xAxis = [];
    let yAxis = [];
    if (subGrids.length === 0) {
      // single full-height grid
      grid = [{ left: 50, right: 20, top: 10, height: '88%' }];
      xAxis = [{ type: 'category', gridIndex: 0, data: labels, boundaryGap: false }];
      yAxis = [{ type: 'value', gridIndex: 0, scale: true }];
    } else if (subGrids.length === 1) {
      // main + one subgrid
      grid = [{ left: 50, right: 20, top: 10, height: '72%' }, { left: 50, right: 20, top: '84%', height: '14%' }];
      xAxis = [
        { type: 'category', gridIndex: 0, data: labels, boundaryGap: false },
        { type: 'category', gridIndex: 1, data: labels, boundaryGap: false }
      ];
      yAxis = [ { type: 'value', gridIndex: 0, scale: true }, { type: 'value', gridIndex: 1, scale: true } ];
    } else {
      // main + two subgrids (volume + macd)
      grid = [
        { left: 50, right: 20, top: 10, height: '58%' },
        { left: 50, right: 20, top: '62%', height: '18%' },
        { left: 50, right: 20, top: '82%', height: '16%' }
      ];
      xAxis = [
        { type: 'category', gridIndex: 0, data: labels, boundaryGap: false },
        { type: 'category', gridIndex: 1, data: labels, boundaryGap: false },
        { type: 'category', gridIndex: 2, data: labels, boundaryGap: false }
      ];
      yAxis = [ { type: 'value', gridIndex: 0, scale: true }, { type: 'value', gridIndex: 1, scale: true }, { type: 'value', gridIndex: 2, scale: true } ];
    }

    // dataZoom xAxisIndex list depends on number of axes
    const xAxisIndices = xAxis.map((_, i) => i);

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid,
      xAxis,
      yAxis,
      dataZoom: [ { type: 'inside', xAxisIndex: xAxisIndices }, { show: true, xAxisIndex: xAxisIndices, type: 'slider', top: '94%' } ],
      series: []
    };

    // determine which grid index to use for volume and macd
    const volGridIndex = subGrids.length === 0 ? 0 : (subGrids.length === 1 ? 1 : 1);
    const macdGridIndex = subGrids.length === 0 ? 0 : (subGrids.length === 1 ? 1 : 2);

    // build series for single or multiple stocks
    if (multi) {
      // stacked area/line per payload.seriesList
      payload.seriesList.forEach((s, idx) => {
        const name = s.name || `Series ${idx+1}`;
        const sClose = s.close || [];
        const data = alignOrDash(sClose);
        const seriesItem = {
          name,
          type: chartType === 'area' ? 'line' : (chartType === 'candlestick' ? 'candlestick' : 'line'),
          data: data,
          xAxisIndex: 0,
          yAxisIndex: 0,
          stack: chartType === 'area' ? 'x' : undefined,
          areaStyle: chartType === 'area' ? {} : undefined,
          showSymbol: false
        };
        // if candlestick, replace data format with ohlc arrays
        if (chartType === 'candlestick' && s.open && s.high && s.low && s.close) {
          seriesItem.type = 'candlestick';
          seriesItem.data = labels.map((l,i) => {
            const o = s.open[i], h = s.high[i], lo = s.low[i], c = s.close[i];
            return (o !== undefined && h !== undefined && lo !== undefined && c !== undefined) ? [o,c,lo,h] : '-';
          });
        }
        option.series.push(seriesItem);
      });
    } else {
      // single series flow (existing payload arrays)
      if (chartType === 'candlestick' && open.length && high.length && low.length && close.length) {
        const ohlc = labels.map((lab, i) => {
          const o = open[i], h = high[i], lo = low[i], c = close[i];
          return (o !== undefined && h !== undefined && lo !== undefined && c !== undefined) ? [o,c,lo,h] : '-';
        });
        option.series.push({ name: 'Price', type: 'candlestick', data: ohlc, xAxisIndex: 0, yAxisIndex: 0 });
      } else {
        option.series.push({ name: 'Close', type: 'line', data: alignOrDash(close), showSymbol: false, smooth: false, xAxisIndex: 0, yAxisIndex: 0 });
      }

      // moving averages on main chart
      if (showMA5 && movingAverages.MA5) {
        option.series.push({ name: 'MA5', type: 'line', data: alignOrDash(movingAverages.MA5), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 1 } });
      }
      if (showMA25 && movingAverages.MA25) {
        option.series.push({ name: 'MA25', type: 'line', data: alignOrDash(movingAverages.MA25), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 1 } });
      }
      if (showMA75 && movingAverages.MA75) {
        option.series.push({ name: 'MA75', type: 'line', data: alignOrDash(movingAverages.MA75), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 1 } });
      }

      // Bollinger Bands (upper/lower and SMA) — draw when enabled
      if (showBB && bollinger_bands && Array.isArray(bollinger_bands.upper) && bollinger_bands.upper.length) {
        option.series.push({ name: 'BB Upper', type: 'line', data: alignOrDash(bollinger_bands.upper), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { color: '#9ca3af', width: 1, opacity: 0.9 }, showSymbol: false });
        option.series.push({ name: 'BB Lower', type: 'line', data: alignOrDash(bollinger_bands.lower), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { color: '#9ca3af', width: 1, opacity: 0.9 }, showSymbol: false });
        if (bollinger_bands.sma && bollinger_bands.sma.length) {
          option.series.push({ name: 'BB SMA', type: 'line', data: alignOrDash(bollinger_bands.sma), xAxisIndex: 0, yAxisIndex: 0, lineStyle: { color: '#6b7280', width: 1, opacity: 0.8 }, showSymbol: false });
        }
      }
    }

    // anomalies as scatter overlay. Show labels by default, hide on hover, exclude from main tooltip.
    if (showAnomaly && anomalies && anomalies.length) {
      const reasonPriority = ['Price Spike', 'Vol+Price', 'VEI Break', 'High Vol', 'Price Warning'];
      const colorMap = { 'Price Spike': '#e74c3c', 'Vol+Price': '#c0392b', 'VEI Break': '#d35400', 'High Vol': '#f39c12', 'Price Warning': '#7f8c8d' };
      const scat = anomalies.map(a => {
        const reason = a.reason || 'anomaly';
        const pr = reasonPriority.indexOf(reason) >= 0 ? reasonPriority.indexOf(reason) : reasonPriority.length;
        const symbolSize = 10 + Math.max(0, (reasonPriority.length - pr));
        return {
          name: reason,
          value: [new Date(a.date).toISOString(), a.y],
          itemStyle: { color: colorMap[reason] || '#dc3545' },
          label: { show: true, formatter: reason, position: 'top', backgroundColor: 'rgba(0,0,0,0.6)', padding: 4 },
          symbolSize
        };
      });
      option.series.push({ name: 'Anomalies', type: 'scatter', data: scat, xAxisIndex: 0, yAxisIndex: 0, symbol: 'triangle', tooltip: { show: false }, emphasis: { label: { show: false } } });
    }

    // Volume series in sub-grid
    if (showVolume && volArr.length) {
      option.series.push({
        name: 'Volume', type: 'bar', xAxisIndex: volGridIndex, yAxisIndex: volGridIndex,
        data: volArr.map((it, idx) => {
          let color = '#888';
          if (idx > 0 && close[idx] !== undefined && close[idx-1] !== undefined) color = close[idx] > close[idx-1] ? '#eb5454' : '#47b262';
          return { value: [labels[idx], it[1]], itemStyle: { color } };
        }),
        barWidth: '60%'
      });
    }

    // VWAP in sub-grid
    if (showVWAP && vwapArr.length) {
      option.series.push({ name: 'VWAP', type: 'line', xAxisIndex: volGridIndex, yAxisIndex: volGridIndex, data: vwapArr.map(it=>[new Date(it[0]).toISOString(), it[1]]), lineStyle: { color: '#FFC458', width: 1 } });
    }

    // MACD in lowest grid (histogram always, DIF/DEA opt-in)
    if (macdHistData.length) {
      option.series.push({ name: 'MACD', type: 'bar', xAxisIndex: macdGridIndex, yAxisIndex: macdGridIndex, data: macdHistData, barWidth: '70%' });
      if (showDIF && macdLineData.length) {
        option.series.push({ name: 'DIF', type: 'line', xAxisIndex: macdGridIndex, yAxisIndex: macdGridIndex, data: macdLineData.map(it=>[new Date(it[0]).toISOString(), it[1]]), lineStyle: { color: '#FFC458', width: 1 }, showSymbol: false });
      }
      if (showDEA && signalLineData.length) {
        option.series.push({ name: 'DEA', type: 'line', xAxisIndex: macdGridIndex, yAxisIndex: macdGridIndex, data: signalLineData.map(it=>[new Date(it[0]).toISOString(), it[1]]), lineStyle: { color: '#333', width: 1 }, showSymbol: false });
      }
    }

    // init or set option
    try {
      if (!echartsInstance.current) {
        echartsInstance.current = echarts.init(mainChartRef.current, undefined, { renderer: 'canvas' });
      }
      echartsInstance.current.setOption(option, { replaceMerge: ['series'] });
      // ensure chart resizes after layout finishes
      const t = setTimeout(() => { try { echartsInstance.current && echartsInstance.current.resize(); } catch (e) {} }, 50);
      const resize = () => { try { echartsInstance.current && echartsInstance.current.resize(); } catch (e) {} };
      window.addEventListener('resize', resize);
      return () => {
        clearTimeout(t);
        window.removeEventListener('resize', resize);
        try {
          // keep instance alive between renders but dispose when component unmounts
          if (echartsInstance.current) {
            echartsInstance.current.dispose();
            echartsInstance.current = null;
          }
        } catch (e) { console.warn('ECharts dispose error', e); }
      };
    } catch (e) {
      console.error('ECharts init error', e, { optionSize: (option && option.series && option.series.length) });
    }
  }, [dates, open, high, low, close, volume, VWAP, movingAverages, chartType, showVolume, showVWAP, showBB, showAnomaly, showMA5, showMA25, showMA75, showDIF, showDEA]);

  const lastClose = close.length ? close[close.length - 1] : null;
  const prevClose = close.length > 1 ? close[close.length - 2] : null;
  const change = (lastClose !== null && prevClose !== null) ? (lastClose - prevClose) : null;
  const changePct = (change !== null && prevClose) ? (change / prevClose) * 100 : null;

  // Truncate financials to most recent N periods for compact display in sidebar
  const truncatedFinancials = useMemo(() => {
    const takeLastN = (obj, n = 2) => {
      if (!obj || typeof obj !== 'object') return {};
      // keys are period strings; sort descending (newest first) by string comparison then take first n
      const keys = Object.keys(obj || {}).sort((a,b) => b.localeCompare(a)).slice(0, n);
      const out = {};
      for (const k of keys) out[k] = obj[k];
      return out;
    };
    return {
      income_stmt: takeLastN(financials.income_stmt || {}, 2),
      balance_sheet: takeLastN(financials.balance_sheet || {}, 2),
      cash_flow: takeLastN(financials.cash_flow || {}, 2)
    };
  }, [financials]);

  // Normalize provider news entries (shape may vary) and prefer lcNews if present
  const mappedProviderNews = useMemo(() => {
    const arr = Array.isArray(financials.news) ? financials.news : [];
    const lookupUrl = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.clickThroughUrl) return (obj.clickThroughUrl.url || obj.clickThroughUrl);
      if (obj.canonicalUrl) return (obj.canonicalUrl.url || obj.canonicalUrl);
      if (obj.link) return obj.link;
      if (obj.url) return obj.url;
      if (obj.href) return obj.href;
      return null;
    };
    return arr.map((it, idx) => {
      const c = (it && it.content) ? it.content : it || {};
      const raw = (c.raw && typeof c.raw === 'object') ? c.raw : (it.raw || it || {});
      const title = c.title || c.headline || c.summary || raw.title || raw.headline || raw.headlineText || '';
      const link = lookupUrl(c) || lookupUrl(raw) || '#';
      const thumbnail = (c.thumbnail && (c.thumbnail.originalUrl || c.thumbnail.url)) || raw.image || raw.thumbnail || raw.summary_img || raw.mediaUrl || null;
      const contentType = (c.contentType || c.type || raw.type || 'STORY').toString().toUpperCase();
      const source = c.source || (raw.provider && raw.provider.displayName) || raw.source || raw.publisher || '';
      const pubDate = c.pubDate || raw.pubDate || raw.providerPublishTime || null;
      return {
        id: it.id || `prov-${ticker}-${idx}`,
        title: title || '',
        link,
        thumbnail,
        contentType,
        source,
        pubDate,
        displayTime: c.displayTime || null
      };
    });
  }, [financials.news, ticker]);

  // prefer lcNews (cached top news), otherwise mapped provider news limited to 2 items
  const news = (lcNews && lcNews.length) ? lcNews : (mappedProviderNews.length ? mappedProviderNews.slice(0, 2) : []);

  // Format news time: prefer displayTime (but if it's an ISO timestamp, present as local string)
  function formatNewsTime(item) {
    try {
      const dt = item && (item.displayTime || item.pubDate || item.date || item.providerPublishTime);
      if (!dt) return '';
      // detect ISO Z format like 2025-12-25T15:36:47Z
      if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dt)) {
        const d = new Date(dt);
        if (!isNaN(d.getTime())) {
          // format without seconds: e.g., "Dec 25, 2025, 15:36"
          try {
            return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            return d.toLocaleString();
          }
        }
      }
      // if it's a relative string (e.g., '2d ago' or '3h ago'), return as-is
      return String(dt);
    } catch (e) {
      return '';
    }
  }

  const currencySymbol = useMemo(() => getCurrency(market), [market]);

  // Report news view and open link. Ensure cache entry exists (first-click creates thumbnail/pubDate).
  async function handleNewsClick(e, item){
    try{
      if (e && e.preventDefault) e.preventDefault();
      const link = item.link || item.url || '#';
      let articleId = item.articleKey || item.cacheId || item.id || link;
      if (!item.cacheId) {
        try {
          const toCache = [{ articleId: item.articleKey || item.link, url: item.link || null, title: item.title || null, source: item.source || null, pubDate: item.date || item.pubDate || null, thumbnail: item.thumbnail || null, sourceTicker: ticker || null }].filter(x => x.url && x.url !== '#');
          let cr = null;
          if (toCache.length) cr = await fetch(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
          if (cr.ok) {
            const cj = await cr.json();
            const found = (cj.items || []).find(i => i && i.articleKey === (item.articleKey || item.link));
            if (found) {
              articleId = found.id || found.articleKey || articleId;
              item.cacheId = found.id || null;
              if (!item.thumbnail && found.thumbnail) item.thumbnail = found.thumbnail;
              if (!item.date && found.pubDate) item.date = found.pubDate;
            }
          }
        } catch (e) { /* ignore cache errors */ }
      }
      const payload = { url: link, articleId, title: item.title, ticker, thumbnail: item.thumbnail || null, pubDate: item.date || item.pubDate || null };
      fetch(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
      window.open(link, '_blank', 'noopener');
    }catch(err){
      const link = item.link || item.url || '#';
      window.open(link, '_blank', 'noopener');
    }
  }

  return (
    <div className="lc-shell">
      {/* Navbar elements merged into main controls (removed fixed bottom navbar) */}

      <div className="lc-body">
        {/* Sidebar with ticker info, financials, news */}
        <aside className="lc-sidebar">
          {/* Ticker Card */}
          <div className="lc-card lc-ticker-card">
            <div className="lc-row">
              <div>
                <button
                  className="lc-ticker-name lc-ticker-name-btn"
                  onClick={() => setShowTickerSearchModal(true)}
                  title="Click to search for another ticker"
                  type="button"
                >
                  {displayTicker}
                </button>
                <div className="lc-company-name">{companyName || 'Loading...'}</div>
              </div>
              <div className="lc-status">
                <span className="lc-dot" />
                <span>OPEN</span>
              </div>
            </div>
            <div className="lc-price-row">
              <div className="lc-price">{currencySymbol}{lastClose ? lastClose.toFixed(2) : '--'}</div>
              <div className={`lc-change ${change && change < 0 ? 'down' : 'up'}`}>
                {change !== null ? `${change >= 0 ? '+' : ''}${currencySymbol}${Math.abs(change).toFixed(2)} (${changePct ? changePct.toFixed(2) : '0.00'}%)` : '--'}
              </div>
            </div>
            <div className="lc-market">{payload.market || 'US (NASDAQ)'}</div>
            {/* Follow button: shows Follow / Following (hover -> Unfollow) */}
            <button
              className={`lc-btn follow chart-btn-follow ${followed ? 'followed' : ''}`}
              type="button"
              onClick={handleFollowToggle}
              onMouseEnter={() => setFollowHover(true)}
              onMouseLeave={() => setFollowHover(false)}
              aria-pressed={followed}
              title={isLoadingFollow ? 'Updating...' : (followed ? (followHover ? 'Unfollow' : 'Following') : 'Follow')}
              disabled={isLoadingFollow}
            >
              {isLoadingFollow ? '...' : (followed ? (followHover ? 'Unfollow' : 'Following') : 'Follow')}
            </button>
          </div>

          <div className="lc-card">
            <div className="lc-card-header">
              <span>Financials</span>
              <button
                type="button"
                className="lc-btn-small"
                onClick={() => setShowFinancialModal(true)}
                title="View all financial data"
              >
                More
              </button>
            </div>
            <div className="lc-financial-tabs">
              <button
                className={`lc-tab ${financialTab === 'income' ? 'active' : ''}`}
                onClick={() => setFinancialTab('income')}
              >
                Income
              </button>
              <button
                className={`lc-tab ${financialTab === 'balance' ? 'active' : ''}`}
                onClick={() => setFinancialTab('balance')}
              >
                Balance
              </button>
            </div>
            <div className="lc-financials-content">
              {financialTab === 'income' && (
                <div style={{ padding: 4 }}>
                  <FinancialsTable title="Income Statement" data={truncatedFinancials.income_stmt || {}} compact importantMetrics={["totalRevenue","netIncome","operatingIncome","ebitda","basicEPS"]} />
                </div>
              )}
              {financialTab === 'balance' && (
                <div style={{ padding: 4 }}>
                  <FinancialsTable title="Balance Sheet" data={truncatedFinancials.balance_sheet || {}} compact importantMetrics={["totalAssets","totalLiab","totalLiabilities","totalCurrentAssets","totalCurrentLiabilities"]} />
                </div>
              )}
            </div>
          </div>

          {/* News Card */}
          <div className="lc-card">
            <div className="lc-card-header">
              <span>News</span>
              <Link to={`/company/${ticker}`} className="lc-btn-small" title={`Open ${getDisplayFromRaw(ticker)} company page`}>More</Link>
              {/* <button
                type="button"
                className="lc-btn-small"
              >
                More
              </button> */}
            </div>
            <div className="lc-news-list">
              {news.length === 0 && <div className="lc-muted">No recent news</div>}
              {news.map((n, idx) => (
                <a
                  className="news-item"
                  key={n.id || idx}
                  href={n.link || n.url || '#'}
                  onClick={(e) => handleNewsClick(e, n)}
                  rel="noreferrer"
                >
                  {n.thumbnail ? (
                    <img className="news-thumb" src={n.thumbnail} alt="thumb" />
                  ) : null}
                  <div className="news-body">
                    <div className="news-title">{n.title}</div>
                    <div className="news-meta">
                      <span className="news-badge">{n.contentType}</span>
                      {n.source ? ` ${n.source} · ` : " "}
                      <span className="news-time">{formatNewsTime(n)}</span>
                      {n.views ? <span className="news-views" style={{ marginLeft: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.views} views</span> : null}
                    </div>
                  </div>
                </a>
              ))}
              {/* More link to open full company news/profile */}
              </div>
          </div>

          {/* Footer Controls */}
          {/* <div className="lc-footer">
            <button
              type="button"
              className="lc-btn ghost"
              onClick={downloadFinancialsCSV}
              title="Download financial data as CSV"
            >
              CSV
            </button>
            <div className="lc-more-menu">
              <button
                type="button"
                className="lc-btn ghost"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
              >
                More
              </button>
              {showMoreMenu && (
                <div className="lc-more-options">
                  <button className="lc-menu-item">Subscribe</button>
                  <button className="lc-menu-item">Share</button>
                  <button className="lc-menu-item">Settings</button>
                </div>
              )}
            </div>
            <div className="lc-timezone-selector">
              <TimezoneSelect
                value={timezone}
                onChange={(val) => { setTimezone(val); setTzUserOverridden(true); }}
                options={TIMEZONES.map(t => t.name)}
                currentTimezone={timezone}
                formatLabel={formatTZLabel}
                displayTime={getTimezoneTimeString(timezone)}
                sortFn={(opts) => opts}
                className="lc-timezone-select-component"
              />
            </div>
          </div> */}
        </aside>

        {/* Main chart area */}
        <main className="lc-main">
          {/* Controls placed inside main: chart type + indicators */}
          <div className="lc-main-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Move ticker + period/interval selector here so controls live inside main */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
                <div className="lc-selector-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 0 }}>
                  <button
                    ref={periodBtnRef}
                    type="button"
                    className="lc-tz-select period-select"
                    onClick={() => setPeriodOpen(p => !p)}
                    aria-haspopup="listbox"
                    aria-expanded={periodOpen}
                  >
                    {formatPresetLabel(PERIOD_PRESETS.find(pp => pp.period === period)) || period}
                  </button>
                  <button
                    ref={intervalBtnRef}
                    type="button"
                    className="lc-tz-select interval-select"
                    onClick={() => setIntervalOpen(s => !s)}
                    aria-haspopup="listbox"
                    aria-expanded={intervalOpen}
                  >
                    {interval}
                  </button>

                  {periodOpen && periodBtnRef.current && (
                    <PortalDropdown
                      anchorRect={periodBtnRef.current.getBoundingClientRect()}
                      align="right"
                      onClose={() => setPeriodOpen(false)}
                      className="mode-dropdown"
                    >
                      {['1d','5d','1wk','1mo','3mo','6mo','1y','2y','5y','max'].map(p => (
                        <div
                          key={p}
                          role="option"
                          tabIndex={0}
                          className={`mode-item ${p === period ? 'active' : ''}`}
                          onClick={() => {
                            const enforced = enforceIntervalRules(p, interval);
                            setPeriod(p);
                            setInterval(enforced);
                            setPeriodOpen(false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const enforced = enforceIntervalRules(p, interval); setPeriod(p); setInterval(enforced); setPeriodOpen(false); } }}
                        >
                          {p}
                        </div>
                      ))}
                    </PortalDropdown>
                  )}

                  {intervalOpen && intervalBtnRef.current && (
                    <PortalDropdown
                      anchorRect={intervalBtnRef.current.getBoundingClientRect()}
                      align="right"
                      onClose={() => setIntervalOpen(false)}
                      className="mode-dropdown"
                    >
                      {getIntervalOptions(period).map(iv => (
                        <div
                          key={iv}
                          role="option"
                          tabIndex={0}
                          className={`mode-item ${iv === interval ? 'active' : ''}`}
                          onClick={() => { setInterval(iv); setIntervalOpen(false); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInterval(iv); setIntervalOpen(false); } }}
                        >
                          {iv}
                        </div>
                      ))}
                    </PortalDropdown>
                  )}
                </div>
              </div>

              <div className="lc-chart-type-group">
                <button
                  type="button"
                  className={`lc-chart-type-btn ${chartType === 'candlestick' ? 'active' : ''}`}
                  onClick={() => setChartType('candlestick')}
                  title="Candlestick Chart"
                  aria-pressed={chartType === 'candlestick'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <rect x="3" y="6" width="4" height="12" rx="1" fill="currentColor" />
                    <rect x="9" y="9" width="4" height="9" rx="1" fill="currentColor" />
                    <rect x="15" y="3" width="4" height="15" rx="1" fill="currentColor" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`lc-chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
                  onClick={() => setChartType('line')}
                  title="Line Chart"
                  aria-pressed={chartType === 'line'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <polyline points="3 17 9 11 14 14 21 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`lc-chart-type-btn ${chartType === 'ohlc' ? 'active' : ''}`}
                  onClick={() => setChartType('ohlc')}
                  title="OHLC Chart"
                  aria-pressed={chartType === 'ohlc'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M6 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6 8h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 6v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 14h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M18 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M18 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`lc-chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
                  onClick={() => setChartType('bar')}
                  title="Bar Chart"
                  aria-pressed={chartType === 'bar'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <rect x="3" y="10" width="3" height="8" fill="currentColor" />
                    <rect x="9" y="6" width="3" height="12" fill="currentColor" />
                    <rect x="15" y="3" width="3" height="15" fill="currentColor" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`lc-chart-type-btn ${chartType === 'area' ? 'active' : ''}`}
                  onClick={() => setChartType('area')}
                  title="Area Chart"
                  aria-pressed={chartType === 'area'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M3 17l6-6 4 4 8-8v10H3z" fill="currentColor" opacity="0.15" />
                    <polyline points="3 17 9 11 13 15 21 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                ref={indicatorsBtnRef}
                className={`lc-btn ghost ${showVolume || showBB || showVWAP || showAnomaly || showMA5 || showMA25 || showMA75 || showSAR || showDIF || showDEA ? 'active' : ''}`}
                onClick={() => setIndicatorsOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={indicatorsOpen}
                title="Indicators"
              >
                Indicators
              </button>
              <Link to={`/company/${ticker}`} className="lc-company-btn lc-company-profile-btn" title="Open company profile">
                Profile
              </Link>
              {indicatorsOpen && indicatorsBtnRef.current && (
                <PortalDropdown anchorRect={indicatorsBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setIndicatorsOpen(false)} className="mode-dropdown indicators-dropdown">
                  <div role="listbox" aria-label="Indicators" onMouseLeave={() => setIndicatorsOpen(false)}>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showVolume} onClick={() => setShowVolume(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVolume: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVolume(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVolume: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showVolume ? 'checked' : ''}`} aria-hidden>{showVolume && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      Volume
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showBB} onClick={() => setShowBB(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showBB: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowBB(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showBB: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showBB ? 'checked' : ''}`} aria-hidden>{showBB && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      Bollinger Bands
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showVWAP} onClick={() => setShowVWAP(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVWAP: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVWAP(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVWAP: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showVWAP ? 'checked' : ''}`} aria-hidden>{showVWAP && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      VWAP
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showAnomaly} onClick={() => setShowAnomaly(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showAnomaly: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAnomaly(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showAnomaly: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showAnomaly ? 'checked' : ''}`} aria-hidden>{showAnomaly && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      Anomalies
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA5} onClick={() => setShowMA5(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA5: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA5(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA5: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA5 ? 'checked' : ''}`} aria-hidden>{showMA5 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      MA (5)
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA25} onClick={() => setShowMA25(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA25: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA25(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA25: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA25 ? 'checked' : ''}`} aria-hidden>{showMA25 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      MA (25)
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA75} onClick={() => setShowMA75(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA75: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA75(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA75: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA75 ? 'checked' : ''}`} aria-hidden>{showMA75 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      MA (75)
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showDIF} onClick={() => setShowDIF(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showDIF: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDIF(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showDIF: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showDIF ? 'checked' : ''}`} aria-hidden>{showDIF && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      MACD — DIF
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showDEA} onClick={() => setShowDEA(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showDEA: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDEA(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showDEA: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showDEA ? 'checked' : ''}`} aria-hidden>{showDEA && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      MACD — DEA
                    </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
          </div>

          {loading && <div className="lc-muted">Loading chart…</div>}
          {error && <div className="lc-error">{error}</div>}
          {!loading && !error && (
            <div style={{ width: '100%' }}>
              <div id="main-chart-container" ref={mainChartRef} style={{ width: '100%', height: '62vh' }} />
            </div>
          )}
        </main>
      </div>

      {/* Financial Details Modal */}
      {showFinancialModal && (
        <div className="lc-modal-overlay" onClick={() => setShowFinancialModal(false)}>
          <div className="lc-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lc-modal-header">
              <h2>{displayTicker} — Financial Data</h2>
              <button
                type="button"
                className="lc-modal-close"
                onClick={() => setShowFinancialModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="lc-modal-body">
              {/* Income Statement */}
              <div className="lc-modal-section">
                <h3>Income Statement</h3>
                <div className="lc-modal-table">
                  <div className="lc-table-header">
                    <div>Period</div>
                    <div>Value</div>
                  </div>
                  {Object.entries(financials.income_stmt || {}).map(([period, value]) => {
                    const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
                    return (
                      <div key={period} className="lc-table-row">
                        <div className="lc-table-cell">{period}</div>
                        <div className="lc-table-cell">{currencySymbol}{Math.abs(numVal) > 1e9 ? (numVal / 1e9).toFixed(2) : (numVal / 1e6).toFixed(2)}{Math.abs(numVal) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    );
                  })}
                  {Object.keys(financials.income_stmt || {}).length === 0 && (
                    <div className="lc-table-empty">No data available</div>
                  )}
                </div>
              </div>

              {/* Balance Sheet */}
              <div className="lc-modal-section">
                <h3>Balance Sheet</h3>
                <div className="lc-modal-table">
                  <div className="lc-table-header">
                    <div>Period</div>
                    <div>Value</div>
                  </div>
                  {Object.entries(financials.balance_sheet || {}).map(([period, value]) => {
                    const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
                    return (
                      <div key={period} className="lc-table-row">
                        <div className="lc-table-cell">{period}</div>
                        <div className="lc-table-cell">{currencySymbol}{Math.abs(numVal) > 1e9 ? (numVal / 1e9).toFixed(2) : (numVal / 1e6).toFixed(2)}{Math.abs(numVal) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    );
                  })}
                  {Object.keys(financials.balance_sheet || {}).length === 0 && (
                    <div className="lc-table-empty">No data available</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Market Selection Modal */}
      {showMarketModal && marketCandidates.length > 0 && (
        <div className="lc-modal-overlay" onClick={() => setShowMarketModal(false)}>
          <div className="lc-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lc-modal-header">
              <h2>Multiple Markets Found</h2>
              <button 
                className="lc-modal-close" 
                onClick={() => setShowMarketModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="lc-modal-body">
              <p className="lc-modal-subtitle">We found "{cleanTickerInput(marketCandidates[0].ticker)}" in multiple markets. Which one would you like to view?</p>
              <div className="lc-market-candidates">
                {marketCandidates.map((candidate, idx) => (
                  <button
                    key={idx}
                    className="lc-market-option"
                    onClick={() => {
                      setTicker(candidate.ticker);
                      setCompanyName(candidate.name);
                      setMarket(candidate.marketCode);
                      setShowMarketModal(false);
                    }}
                  >
                    <div className="lc-market-option-label">{candidate.market}</div>
                    <div className="lc-market-option-name">{candidate.name}</div>
                    <div className="lc-market-option-ticker">{candidate.ticker}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticker Search Modal */}
      {showTickerSearchModal && (
        <div className="lc-modal-overlay" onClick={() => setShowTickerSearchModal(false)}>
          <div className="lc-modal-content lc-ticker-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lc-modal-header">
              <h2>Search Ticker</h2>
              <button 
                className="lc-modal-close" 
                onClick={() => setShowTickerSearchModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="lc-modal-body">
              <div className="lc-ticker-search-input-wrapper">
                <input
                  type="text"
                  className="lc-ticker-search-input"
                  placeholder="Search by ticker or company name..."
                  value={tickerSearchQuery}
                  onChange={(e) => setTickerSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="lc-ticker-search-list">
                {(!tickerSearchQuery || !tickerSearchQuery.trim()) ? (
                  // show featured interesting stocks (with logos) and current ticker at top
                  (() => {
                    const cur = ticker ? { ticker, name: companyName || ticker, market } : null;
                    const interesting = INTERESTING_STOCKS.slice();
                    const list = [];
                    if (cur) {
                      const already = interesting.find(s => (s.ticker || '').toUpperCase() === cur.ticker.toUpperCase());
                      if (!already) list.push({ ticker: cur.ticker, name: cur.name, market: cur.market, isCurrent: true });
                    }
                    for (const s of interesting) {
                      list.push({ ticker: s.ticker, name: s.name, market: s.market, isCurrent: (s.ticker === (ticker || '')) });
                    }
                    return list.map((stock, idx) => {
                      const displayTicker = (stock.ticker || '').toString().toUpperCase();
                      const logoUrl = displayTicker ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(displayTicker)}?format=png` : null;
                      return (
                        <button
                          key={`feat-${idx}-${displayTicker}`}
                          className="lc-ticker-search-item"
                          onClick={() => {
                            setTicker(stock.ticker);
                            setCompanyName(stock.name || '');
                            setShowTickerSearchModal(false);
                            setTickerSearchQuery('');
                          }}
                          type="button"
                        >
                          <div className="lc-ticker-search-item-ticker">
                            {logoUrl ? (
                              <img src={logoUrl} alt={`${displayTicker} logo`} className="ticker-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <div className="ticker-logo-placeholder" aria-hidden></div>
                            )}
                            <div style={{ marginLeft: 8, fontWeight: 700 }}>{displayTicker}</div>
                            {stock.isCurrent && (
                              <div className="lc-current-badge">current</div>
                            )}
                          </div>
                          <div className="lc-ticker-search-item-name">{stock.name}</div>
                          <div className="lc-ticker-search-item-market">{stock.market}</div>
                        </button>
                      );
                    });
                  })()
                ) : (
                  // show server-backed modalResults
                  modalLoading ? (
                    <div className="ticker-search-loading">Searching...</div>
                  ) : (
                    (modalResults && modalResults.length) ? (
                      modalResults.slice(0,400).map((t, idx) => {
                        const symbolText = (t.symbol || t.displayTicker || '').toString().toUpperCase();
                        const exchangeText = (t.exchange || '').toString();
                        const logoUrl = symbolText ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbolText)}?format=png` : null;
                        const displayTicker = (t.displayTicker || symbolText).toString();
                        return (
                          <button key={`res-${idx}-${symbolText}`} type="button" className="lc-ticker-search-item" onClick={() => { setTicker(symbolText); setCompanyName(t.name || ''); setShowTickerSearchModal(false); setTickerSearchQuery(''); }}>
                            <div className="lc-ticker-search-item-ticker">
                              {logoUrl ? (
                                <img src={logoUrl} alt={`${symbolText} logo`} className="ticker-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              ) : (
                                <div className="ticker-logo-placeholder" aria-hidden></div>
                              )}
                              <div style={{ marginLeft: 6, fontWeight: 700 }}>{displayTicker}</div>
                            </div>
                            <div className="lc-ticker-search-item-name">{t.name}</div>
                            <div className="lc-ticker-search-item-market">{exchangeText}</div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="lc-ticker-search-empty">No results found</div>
                    )
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
