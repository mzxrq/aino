import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import PortalDropdown from '../components/DropdownSelect/PortalDropdown';
import { useParams, Link } from 'react-router-dom';
import * as echarts from 'echarts';
import FinancialsTable from '../components/FinancialsTable';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import '../css/MainChart.css';
import { useAuth } from '../context/useAuth';
import Swal from '../utils/muiSwal';
import { DateTime } from 'luxon';

const API_URL = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';

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


// Helper: try Python direct endpoint (5000). Node gateway not used here.
async function fetchJsonWithFallback(path, init) {
  // path should start with '/'
  const fallback = `${PY_DIRECT}/py${path}`;
  const res2 = await fetch(fallback, init);
  if (!res2.ok) throw new Error(`Request failed: ${res2.status}`);
  return await res2.json();
}

// Deduplicating fetch helper for Node API calls (GET + identical POSTs)
const _inFlightRequests = new Map();
async function fetchWithDedup(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let key = `${method} ${url}`;
  if (method !== 'GET' && options.body) {
    try { key += ' ' + (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)); } catch (_e) {}
  }
  if (_inFlightRequests.has(key)) return _inFlightRequests.get(key);
  const p = (async () => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
  })();
  _inFlightRequests.set(key, p);
  p.finally(() => { try { _inFlightRequests.delete(key); } catch (_) {} });
  return p;
}

const PERIOD_PRESETS = [
  { label: '1D', period: '1d', interval: '5m' },
  { label: '5D', period: '5d', interval: '5m' },
  { label: '1W', period: '1wk', interval: '5m' },
  { label: '1M', period: '1mo', interval: '5m' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '2Y', period: '2y', interval: '1d' },
  { label: '5Y', period: '5y', interval: '1wk' },
  { label: 'Max', period: 'max', interval: '1wk' }
];

// User-friendly display names for yfinance interval values (will be localized via helper)
const INTERVAL_DISPLAY_NAMES = {
  '1m': '1m',
  '2m': '2m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '1d': '1d',
  '1wk': '1wk',
  '1mo': '1mo'
};

function getIntervalDisplayName(interval, i18n) {
  // Maps will be handled in component via localization
  if (!i18n) return interval || '';
  const localizedMap = {
    '1m': i18n._('1 Min'),
    '2m': i18n._('2 Min'),
    '5m': i18n._('5 Min'),
    '15m': i18n._('15 Min'),
    '30m': i18n._('30 Min'),
    '1h': i18n._('1 Hour'),
    '1d': i18n._('1 Day'),
    '1wk': i18n._('1 Week'),
    '1mo': i18n._('1 Month')
  };
  return localizedMap[interval] || interval.toUpperCase();
}

function formatPresetLabel(p, i18n) {
  if (!p) return '';
  if (!i18n) return (p.label || '').split(' ')[0] || p.label;
  const per = (p.period || '').toLowerCase();
  const itv = (p.interval || '').toLowerCase();
  // Labels will be handled via localization in component
  const labelMap = {
    '1d': i18n._('Intraday'),
    '5d': i18n._('5 Days'),
    '1wk': i18n._('1 Week'),
    '1mo_5m': i18n._('1 Month'),
    '1mo_15m': i18n._('1 Month'),
    '1mo_1h': i18n._('1 Month'),
    '1mo_1d': i18n._('1 Month'),
    '1mo': i18n._('1 Month'),
    '3mo': i18n._('3 Months'),
    '6mo': i18n._('6 Months'),
    '1y': i18n._('1 Year'),
    '2y': i18n._('2 Years'),
    '5y': i18n._('5 Years'),
    'max': i18n._('Max')
  };
  const specificKey = `${per}_${itv}`;
  return labelMap[specificKey] || labelMap[per] || (p.label || '').split(' ')[0] || p.label || per.toUpperCase();
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


function enforceIntervalRules(period, interval) {
  const p = (period || '').toLowerCase();
  const itv = (interval || '').toLowerCase();
  if (p === '1d') return ['1m','2m','5m','15m','30m','1h'].includes(itv) ? itv : '5m';
  if (p === '5d') return ['1m','2m','5m','15m','30m','1h','1d'].includes(itv) ? itv : '5m';
  if (p === '1wk') return ['1m','2m','5m','15m','30m','1h','1d'].includes(itv) ? itv : '5m';
  if (p === '1mo') return ['5m','15m','1h','1d'].includes(itv) ? itv : '5m';
  if (['3mo','6mo','1y','2y'].includes(p)) return ['1d','1wk'].includes(itv) ? itv : '1d';
  if (p === '5y' || p === 'max') return ['1wk','1mo'].includes(itv) ? itv : '1wk';
  return ['1d','1wk','1mo'].includes(itv) ? itv : '1wk';
}

function getIntervalOptions(period) {
  const p = (period || '').toLowerCase();
  if (p === '1d') return ['1m','2m','5m','15m','30m','1h'];
  if (p === '5d' || p === '1wk') return ['1m','2m','5m','15m','30m','1h','1d'];
  if (p === '1mo') return ['5m','15m','1h','1d'];
  if (['3mo','6mo','1y','2y'].includes(p)) return ['1d','1wk'];
  if (p === '5y' || p === 'max') return ['1wk','1mo'];
  return ['1d','1wk','1mo'];
}

function getCurrency(marketStr) {
  if (!marketStr) return '$';
  const marketCode = marketStr.split('(')[0].trim().toUpperCase();
  return MARKET_CURRENCIES[marketCode] || '$';
}

// Removed cleanTickerInput/TICKER_EXTENSIONS (unused)

// Removed unused MARKET_EXTENSIONS configuration

// Hidden extraction container for i18n string extraction
const _StringExtractor = () => (
  <>
    <Trans>1 Min</Trans>
    <Trans>2 Min</Trans>
    <Trans>5 Min</Trans>
    <Trans>15 Min</Trans>
    <Trans>30 Min</Trans>
    <Trans>1 Hour</Trans>
    <Trans>1 Day</Trans>
    <Trans>1 Week</Trans>
    <Trans>1 Month</Trans>
    <Trans>Intraday</Trans>
    <Trans>5 Days</Trans>
    <Trans>1 Month</Trans>
    <Trans>3 Months</Trans>
    <Trans>6 Months</Trans>
    <Trans>1 Year</Trans>
    <Trans>2 Years</Trans>
    <Trans>5 Years</Trans>
    <Trans>Max</Trans>
    <Trans>Open</Trans>
    <Trans>High</Trans>
    <Trans>Low</Trans>
    <Trans>Close</Trans>
  </>
);

export default function MainChart() {
  const { i18n } = useLingui();
  const { ticker: paramTicker } = useParams();
  const [ticker, setTicker] = useState((paramTicker || 'AAPL').toUpperCase());
  const displayTicker = getDisplayFromRaw(ticker);
  const [companyName, setCompanyName] = useState('');
  const [companyNameLocal, setCompanyNameLocal] = useState('');
  const [country, setCountry] = useState('');
  const [market, setMarket] = useState('US');
  
  // Inline localization helper (same logic as Chart.jsx)
  const localizedCompanyName = useMemo(() => {
    const locale = i18n.locale || 'en';
    const localePrefix = locale.split('-')[0];
    const isJa = localePrefix === 'ja' || localePrefix === 'jp';
    const isTh = localePrefix === 'th';
    const hasLocal = companyNameLocal && companyNameLocal.trim() !== '';
    
    if (isJa && (country === 'JP' || ticker.endsWith('.T')) && hasLocal) {
      return companyNameLocal;
    }
    if (isTh && country === 'TH' && hasLocal) {
      return companyNameLocal;
    }
    return companyName || ticker;
  }, [companyName, companyNameLocal, country, ticker, i18n.locale]);
  
  // removed unused searchInput/search dropdown states
  const [period, setPeriod] = useState('1mo');
  const [interval, setInterval] = useState('5m');
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
  const [financialTab, setFinancialTab] = useState('income');
  // removed unused More menu and lcNews states
  const [modalResults, setModalResults] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [finOverlayOpen, setFinOverlayOpen] = useState(false);
  const [finOverlayTitle, setFinOverlayTitle] = useState('');
  const [finOverlayData, setFinOverlayData] = useState(null);
  // removed market selection modal (unused and incomplete)
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch { return false; } });
  const [showAnomaly, setShowAnomaly] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showAnomaly !== undefined) ? p.showAnomaly : true; } catch { return true; } });
  const [showMA5, setShowMA5] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA5 !== undefined) ? p.showMA5 : false; } catch { return false; } });
  const [showMA25, setShowMA25] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA25 !== undefined) ? p.showMA25 : false; } catch { return false; } });
  const [showMA75, setShowMA75] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA75 !== undefined) ? p.showMA75 : false; } catch { return false; } });
  const [showEMA, setShowEMA] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showEMA !== undefined) ? p.showEMA : true; } catch { return true; } });
  const [showMACD, setShowMACD] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMACD !== undefined) ? p.showMACD : true; } catch { return true; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch { return true; } });
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}');
      p.showBB = !!showBB;
      p.showVWAP = !!showVWAP;
      p.showAnomaly = !!showAnomaly;
      p.showMA5 = !!showMA5;
      p.showMA25 = !!showMA25;
      p.showMA75 = !!showMA75;
      p.showEMA = !!showEMA;
      p.showMACD = !!showMACD;
      p.showVolume = !!showVolume;
      localStorage.setItem('lc_prefs', JSON.stringify(p));
    } catch (_e) { /* ignore */ }
  }, [showBB, showVWAP, showAnomaly, showMA5, showMA25, showMA75, showEMA, showMACD, showVolume]);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsBtnRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTickerSearchModal, setShowTickerSearchModal] = useState(false);
  const [tickerSearchQuery, setTickerSearchQuery] = useState('');

  // Follow state (check whether current user follows this ticker)
  const { user, token } = useAuth();
  const [followed, setFollowed] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [followHover, setFollowHover] = useState(false);

  // Ensure page starts at top when entering this route
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); }
  }, []);

  // Check follow status on mount / when ticker or auth changes
  useEffect(() => {
    let mounted = true;
    async function checkFollowStatus() {
      if (!user || !token) {
        if (mounted) setFollowed(false);
        return;
      }
      try {
        const front = API_URL;
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
    const front = API_URL;
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

  // removed unused filteredStocks memo

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
        } catch (_err) {
          try {
            url = `${PY_DIRECT}/py/chart/ticker?query=${encodeURIComponent(q)}`;
            res = await fetch(url);
            if (!res.ok) throw new Error(`fallback status ${res.status}`);
          } catch (_err2) {
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
    if (market) {
      const tz = marketToTimezone(market);
      setTimezone(tz);
    }
  }, [market]);

  // On mount, if user hasn't set timezone, prefer browser's timezone (IANA)
  useEffect(() => {
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
  }, []);

  // removed unused searchInput effect

  // Fetch company metadata when ticker changes
  useEffect(() => {
    let cancelled = false;
    async function loadMetadata() {
      try {
        const data = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(ticker)}`);
        if (!cancelled) {
          const match = Array.isArray(data) ? data.find((d) => d.ticker === ticker) : null;
          if (match) {
            setCompanyName(match.name || '');
            setCompanyNameLocal(match.companyNameLocal || '');
            setCountry(match.country || '');
          }
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
        if (!cancelled) setError(<Trans>Unable to load chart data</Trans>);
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
        // Fetch income statement from MongoDB (via Node backend)
        let incomeStmtFormat = {};
        try {
          const incomeStmtData = await fetchWithDedup(`${API_URL}/node/financials/incomeStmt?ticker=${encodeURIComponent(ticker)}`);
          if (Array.isArray(incomeStmtData)) {
            incomeStmtData.forEach(doc => {
              Object.entries(doc.metrics || {}).forEach(([metricName, value]) => {
                if (!incomeStmtFormat[metricName]) incomeStmtFormat[metricName] = {};
                incomeStmtFormat[metricName][doc.fiscalDate] = value;
              });
            });
          }
        } catch (e) { console.warn('incomeStmt fetch failed', e); }

        // Fetch balance sheet from MongoDB (via Node backend)
        let balSheetFormat = {};
        try {
          const balSheetData = await fetchWithDedup(`${API_URL}/node/financials/balSheet?ticker=${encodeURIComponent(ticker)}`);
          if (Array.isArray(balSheetData)) {
            balSheetData.forEach(doc => {
              const allMetrics = {
                ...doc.assets,
                ...doc.liabilities,
                ...doc.equity
              };
              Object.entries(allMetrics || {}).forEach(([metricName, value]) => {
                if (!balSheetFormat[metricName]) balSheetFormat[metricName] = {};
                balSheetFormat[metricName][doc.fiscalDate] = value;
              });
            });
          }
        } catch (e) { console.warn('balSheet fetch failed', e); }

        // Fetch news
        let newsData = [];
        try {
          const newsResponse = await fetchJsonWithFallback(`/news?ticker=${encodeURIComponent(ticker)}&pageSize=10`);
          if (Array.isArray(newsResponse)) {
            newsData = newsResponse;
          } else if (newsResponse && Array.isArray(newsResponse.items)) {
            newsData = newsResponse.items;
          }
        } catch (e) { console.warn('news fetch failed', e); }

        if (!cancelled) {
          const processed = {
            income_stmt: incomeStmtFormat,
            balance_sheet: balSheetFormat,
            cash_flow: {},
            news: newsData,
            fetched_at: new Date().toISOString()
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

  // Market status calculation (OPEN/CLOSED)
  const isMarketOpen = useMemo(() => {
    try {
      if (payload.market_open && payload.market_close) {
        const zone = timezone || 'UTC';
        const now = DateTime.now().setZone(zone);
        const openT = DateTime.fromISO(payload.market_open, { zone });
        const closeT = DateTime.fromISO(payload.market_close, { zone });
        return now >= openT && now <= closeT;
      }
    } catch (e) { /* ignore */ }
    // fallback: if there's recent data within last 6 hours, treat as open
    if (dates.length) {
      try {
        const last = DateTime.fromISO(dates[dates.length - 1], { zone: 'utc' }).toUTC();
        const now = DateTime.utc();
        return (now.toMillis() - last.toMillis()) < (1000 * 60 * 60 * 6);
      } catch (e) { /* ignore */ }
    }
    return false;
  }, [payload.market_open, payload.market_close, timezone, dates]);

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
    const tsToIndex = new Map();
    timestamps.forEach((t, idx) => tsToIndex.set(t, idx));
    const categories = timestamps; // category axis using actual timestamps but without real-time gaps
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
    const shortEMAData = [];
    const longEMAData = [];
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
      // Add short and long EMA data for MACD panel
      shortEMAData.push(...shortEMA);
      longEMAData.push(...longEMA);
    }

    // helper to create [timestamp, value] pairs for time-axis series
    const toTimestampValuePairs = (arr) => {
      const out = [];
      for (let i = 0; i < timestamps.length; i++) {
        const v = (arr && arr[i] !== undefined && arr[i] !== null) ? arr[i] : null;
        if (v !== null) {
          out.push([timestamps[i], v]);
        } else {
          out.push([timestamps[i], '-']);
        }
      }
      return out;
    };

    // support multiple series payloads: payload.seriesList = [{ name, close, open, high, low, volume, vwap, movingAverages, anomalies }]
    const multi = Array.isArray(payload.seriesList) && payload.seriesList.length > 0;

    // MATRIX 5x6 layout: remove Order Book, keep Price/Volume/MACD/Depth
    const matrixMargin = 0;
    const chartWidth = mainChartRef.current?.offsetWidth || 800;
    const chartHeight = mainChartRef.current?.offsetHeight || 600;
    const matrixWidth = chartWidth - matrixMargin * 2;
    const matrixHeight = chartHeight - matrixMargin * 2;

    const lastClose = close.length ? close[close.length - 1] : 0;
    const maxPrice = Math.max(...close.filter(Boolean));
    const minPrice = Math.min(...close.filter(Boolean));
    const maxAbs = Math.max(maxPrice - lastClose, lastClose - minPrice);

    const colorGreen = '#47b262';
    const colorRed = '#eb5454';
    const colorGray = '#888';

    // Volume broken-axis helper (soft-compress tall spikes so small bars stay visible)
    const volValues = (volArr || []).map(v => Array.isArray(v) ? v[1] : null).filter(v => typeof v === 'number' && v >= 0);
    const sortedVol = [...volValues].sort((a, b) => a - b);
    const volBreak = sortedVol.length ? sortedVol[Math.floor(sortedVol.length * 0.9)] : null; // 90th percentile
    const volMax = sortedVol.length ? sortedVol[sortedVol.length - 1] : null;
    const transformVol = (v) => {
      if (volBreak === null || volMax === null) return v;
      if (v <= volBreak) return v;
      const extra = v - volBreak;
      return volBreak + Math.sqrt(extra); // compress tail smoothly
    };
    const volMaxDisplay = (volBreak !== null && volMax !== null) ? transformVol(volMax) : null;

    const getPriceColor = (price) => price === lastClose ? colorGray : price > lastClose ? colorRed : colorGreen;
    const priceFormatter = (value) => {
      const result = Math.round(value * 100) / 100 + '';
      const dotIndex = result.indexOf('.');
      if (dotIndex < 0) return result + '.00';
      if (dotIndex === result.length - 2) return result + '0';
      return result;
    };

    const toCategoryValues = (arr) => categories.map((_, i) => {
      const v = (arr && arr[i] !== undefined && arr[i] !== null) ? arr[i] : null;
      return (v !== null) ? v : '-';
    });

    // Calculate dynamic grid coordinates based on visible charts
    let volumeRow = 5;
    let macdRow = 4;
    let emaRow = 3;
    let priceBottomRow = 2;

    if (!showVolume && !showMACD && !showEMA) {
      // All hidden: price takes full height (0-5)
      priceBottomRow = 5;
    } else if (!showVolume && !showMACD && showEMA) {
      // Only EMA: Price (0-4), EMA (5)
      priceBottomRow = 4;
      emaRow = 5;
    } else if (!showVolume && showMACD && !showEMA) {
      // Only MACD: Price (0-4), MACD (5)
      priceBottomRow = 4;
      macdRow = 5;
    } else if (showVolume && !showMACD && !showEMA) {
      // Only Volume: Price (0-4), Volume (5)
      priceBottomRow = 4;
      volumeRow = 5;
    } else if (!showVolume && showMACD && showEMA) {
      // MACD + EMA: Price (0-3), EMA (4), MACD (5)
      priceBottomRow = 3;
      emaRow = 4;
      macdRow = 5;
    } else if (showVolume && !showMACD && showEMA) {
      // Volume + EMA: Price (0-3), EMA (4), Volume (5)
      priceBottomRow = 3;
      emaRow = 4;
      volumeRow = 5;
    } else if (showVolume && showMACD && !showEMA) {
      // Volume + MACD: Price (0-3), MACD (4), Volume (5)
      priceBottomRow = 3;
      macdRow = 4;
      volumeRow = 5;
    }

    const grid = [
      { coordinateSystem: 'matrix', coord: [0, 0], coordSize: [undefined, (priceBottomRow - 0 + 1) / 6 * 100 + '%'], top: 0, bottom: 0, left: 0, right: 0 },
      { coordinateSystem: 'matrix', coord: [0, volumeRow], top: 20, bottom: 0, left: 0, right: 0 },
      { coordinateSystem: 'matrix', coord: [0, macdRow], top: 20, bottom: 0, left: 0, right: 0 },
      { coordinateSystem: 'matrix', coord: [0, emaRow], top: 20, bottom: 0, left: 0, right: 0 }
    ];

    const xAxis = [
      { type: 'category', show: false, boundaryGap: false, data: categories },
      { type: 'category', gridIndex: 1, show: false, boundaryGap: false, data: categories },
      { type: 'category', gridIndex: 2, show: false, boundaryGap: false, data: categories },
      { type: 'category', gridIndex: 3, show: false, boundaryGap: false, data: categories }
    ];

    const yAxis = [
      { type: 'value', show: false, min: lastClose - maxAbs, max: lastClose + maxAbs },
      { type: 'value', gridIndex: 1, show: false, scale: true, max: volMaxDisplay || undefined },
      { type: 'value', gridIndex: 2, show: false, scale: true },
      { type: 'value', gridIndex: 2, show: false, scale: true, alignTicks: true },
      { type: 'value', gridIndex: 3, show: false, scale: true }
    ];

    // Tooltip formatter to show values with 2 decimal places
    const formatVolume = (vol) => {
      if (!vol || vol === 0) return '0';
      const absVol = Math.abs(vol);
      if (absVol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
      if (absVol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
      if (absVol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
      return vol.toFixed(0);
    };

    const tooltipFormatter = (params) => {
      if (!Array.isArray(params)) params = [params];
      const formatAxisValue = (val) => {
        const num = Number(val);
        if (!Number.isNaN(num)) {
          const d = new Date(num);
          if (!isNaN(d.getTime())) return d.toLocaleString();
        }
        return val || '';
      };
      let html = `<div style="color:#000;font-size:12px;">`;
      html += `<strong>${formatAxisValue(params[0]?.axisValue)}</strong>`;
      params.forEach(p => {
        // Special handling for candlestick chart
        if (p.seriesType === 'candlestick' && Array.isArray(p.value) && p.value.length >= 4) {
          const [, open, close, low, high] = p.value;
          // Get translated labels based on current language
          const openLabel = i18n._('Open');
          const highLabel = i18n._('High');
          const lowLabel = i18n._('Low');
          const closeLabel = i18n._('Close');
          html += `<br/><span style="color:${p.color}">${openLabel}: ${open?.toFixed(2)}</span>`;
          html += `<br/><span style="color:${p.color}">${highLabel}: ${high?.toFixed(2)}</span>`;
          html += `<br/><span style="color:${p.color}">${lowLabel}: ${low?.toFixed(2)}</span>`;
          html += `<br/><span style="color:${p.color}">${closeLabel}: ${close?.toFixed(2)}</span>`;
        } else {
          let raw = null;
          if (p && p.data && p.data.real !== undefined) {
            raw = p.data.real;
          } else if (Array.isArray(p.value)) {
            raw = p.value.length > 1 ? p.value[p.value.length - 1] : p.value[0];
          } else {
            raw = p.value;
          }
          if (raw !== null && raw !== undefined && raw !== '-') {
            let formatted;
            let label = p.seriesName;
            
            // Special formatting for Volume
            if (p.seriesName === 'Volume') {
              formatted = formatVolume(raw);
            } else {
              formatted = typeof raw === 'number' ? raw.toFixed(2) : raw;
            }
            
            // For line chart with Close data, rename to Price
            if (p.seriesName === 'Close' && p.seriesType === 'line') {
              label = 'Price';
            }
            html += `<br/><span style="color:${p.color}">${label}: ${formatted}</span>`;
          }
        }
      });
      html += `</div>`;
      return html;
    };

    const textColor = (typeof document !== 'undefined' && document.body.classList.contains('dark')) ? '#e0e0e0' : '#333';

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: tooltipFormatter },
      title: [
        ...(showVolume ? [{ text: 'Volume', subtext: Math.round(volArr.reduce((s, v) => s + v[1], 0) / 1000) + 'B', left: 2, top: 2, padding: 0, textStyle: { fontSize: 12, fontWeight: 'bold', color: '#444' }, subtextStyle: { fontSize: 10, color: '#666' }, itemGap: 0, coordinateSystem: 'matrix', coord: [0, volumeRow] }] : []),
        ...(showEMA ? [{ text: 'EMA', subtext: '', left: 2, top: 2, padding: 0, textStyle: { fontSize: 12, fontWeight: 'bold', color: '#444' }, subtextStyle: { fontSize: 10, color: '#666' }, itemGap: 0, coordinateSystem: 'matrix', coord: [0, emaRow] }] : []),
        ...(showMACD ? [{ text: 'MACD', subtext: '', left: 2, top: 2, padding: 0, textStyle: { fontSize: 12, fontWeight: 'bold', color: '#444' }, subtextStyle: { fontSize: 10, color: '#666' }, itemGap: 0, coordinateSystem: 'matrix', coord: [0, macdRow] }] : [])
      ],
      grid,
      xAxis,
      yAxis,
      dataZoom: [ { type: 'inside', xAxisIndex: [0, 1, 2, 3] }, { show: true, xAxisIndex: [0, 1, 2, 3], type: 'slider', top: '96%', height: 20, textStyle: { color: '#666' } } ],
      series: [],
      matrix: {
        left: matrixMargin,
        right: matrixMargin,
        top: matrixMargin,
        bottom: matrixMargin,
        x: { show: false, data: Array(5).fill(null) },
        y: { show: false, data: Array(6).fill(null) },
        body: {
          data: [
            { coord: [[0, 4], [0, priceBottomRow]], mergeCells: true },
            ...(showEMA ? [{ coord: [[0, 4], [emaRow, emaRow]], mergeCells: true }] : []),
            ...(showMACD ? [{ coord: [[0, 4], [macdRow, macdRow]], mergeCells: true }] : []),
            ...(showVolume ? [{ coord: [[0, 4], [volumeRow, volumeRow]], mergeCells: true }] : [])
          ]
        }
      },
      graphic: {
        elements: Array.from({ length: 3 }, (_, i) => {
          const lineWidth = 1;
          return {
            type: 'line',
            shape: { x1: matrixMargin + lineWidth, y1: (matrixHeight / 6) * (i + 1), x2: matrixWidth + matrixMargin, y2: (matrixHeight / 6) * (i + 1) },
            style: { stroke: i === 1 ? '#bbb' : '#eee', lineWidth, lineDash: i === 1 ? 'dashed' : false }
          };
        }).concat(
          Array.from({ length: 4 }, (_, i) => {
            const lineWidth = 1;
            return {
              type: 'line',
              shape: { x1: (matrixWidth / 5) * (i + 1) + matrixMargin, y1: matrixMargin + lineWidth, x2: (matrixWidth / 5) * (i + 1) + matrixMargin, y2: matrixHeight + matrixMargin },
              style: { stroke: '#eee', lineDash: false, lineWidth }
            };
          })
        ).concat([
          {
            type: 'line',
            shape: { x1: matrixWidth + matrixMargin, y1: matrixMargin, x2: matrixWidth + matrixMargin, y2: matrixHeight + matrixMargin },
            style: { stroke: '#ccc', lineWidth: 1 }
          },
          // Stock name overlay at the top-right above percentage
          {
            type: 'text',
            right: 8,
            top: 6,
            z: 100,
            style: {
              text: (localizedCompanyName && localizedCompanyName.trim()) ? localizedCompanyName : displayTicker,
              fill: textColor,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'right'
            }
          }
        ])
      }
    };

    const volGridIndex = 1;
    const macdGridIndex = 2;
    const macdLineAxisIndex = 3;

    // build series for single or multiple stocks
    if (multi) {
      // stacked area/line per payload.seriesList
      payload.seriesList.forEach((s, idx) => {
        const name = s.name || `Series ${idx+1}`;
        const sClose = s.close || [];
        const data = toCategoryValues(sClose);
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
        // if candlestick, replace data format with [timestamp, o, c, l, h] arrays
        if (chartType === 'candlestick' && s.open && s.high && s.low && s.close) {
          seriesItem.type = 'candlestick';
          seriesItem.data = categories.map((_, i) => {
            const o = s.open[i], h = s.high[i], lo = s.low[i], c = s.close[i];
            return (o !== undefined && h !== undefined && lo !== undefined && c !== undefined) ? [o, c, lo, h] : ['-','-','-','-'];
          });
        }
        option.series.push(seriesItem);
      });
    } else {
      // single series flow (existing payload arrays)
      // Build the base mark config for all chart types
      const baseMarkPoint = { symbolSize: 0, symbol: 'circle', data: [ { relativeTo: 'coordinate', x: 0, y: 0, name: 'max', type: 'max', label: { align: 'left', verticalAlign: 'top', offset: [0, 12], formatter: priceFormatter(lastClose + maxAbs), color: getPriceColor(lastClose + maxAbs) } }, { relativeTo: 'coordinate', x: 0, y: '100%', name: 'min', type: 'min', label: { align: 'left', verticalAlign: 'bottom', offset: [0, -12], formatter: priceFormatter(lastClose - maxAbs), color: getPriceColor(lastClose - maxAbs) } }, { relativeTo: 'coordinate', x: '100%', y: 0, name: priceFormatter((maxAbs / lastClose) * 100) + '%', label: { align: 'right', verticalAlign: 'top', offset: [0, 12], color: colorRed, formatter: '{b}' } }, { relativeTo: 'coordinate', x: '100%', y: '100%', name: '-' + priceFormatter((maxAbs / lastClose) * 100) + '%', label: { align: 'right', verticalAlign: 'bottom', offset: [0, -12], color: colorGreen, formatter: '{b}' } } ] };
      const baseMarkLine = { data: [ { name: 'Current Price', yAxis: lastClose, lineStyle: { color: colorGray, type: 'dashed', width: 1, opacity: 0.6 }, label: { position: 'end', formatter: priceFormatter(lastClose), color: colorGray } } ], symbol: 'none', tooltip: { show: false } };

      if ((chartType === 'candlestick' || chartType === 'heikin_ashi' || chartType === 'ohlc') && open.length && high.length && low.length && close.length) {
        let ohlc;
        if (chartType === 'heikin_ashi') {
          // Calculate Heikin Ashi OHLC values
          const haOpen = []; const haClose = []; const haHigh = []; const haLow = [];
          let prevHaOpen = null, prevHaClose = null;
          for (let i = 0; i < categories.length; i++) {
            const o = open[i], h = high[i], lo = low[i], c = close[i];
            if (o === undefined || h === undefined || lo === undefined || c === undefined) continue;
            const currentHaClose = (o + h + lo + c) / 4;
            const currentHaOpen = (prevHaOpen !== null && prevHaClose !== null) ? (prevHaOpen + prevHaClose) / 2 : (o + c) / 2;
            const currentHaHigh = Math.max(h, currentHaOpen, currentHaClose);
            const currentHaLow = Math.min(lo, currentHaOpen, currentHaClose);
            haOpen.push(currentHaOpen); haClose.push(currentHaClose); haHigh.push(currentHaHigh); haLow.push(currentHaLow);
            prevHaOpen = currentHaOpen; prevHaClose = currentHaClose;
          }
          ohlc = categories.map((_, i) => {
            return (haOpen[i] !== undefined && haHigh[i] !== undefined && haLow[i] !== undefined && haClose[i] !== undefined) ? [haOpen[i], haClose[i], haLow[i], haHigh[i]] : ['-','-','-','-'];
          });
        } else {
          // Regular candlestick or OHLC: use raw OHLC data
          ohlc = categories.map((_, i) => {
            const o = open[i], h = high[i], lo = low[i], c = close[i];
            return (o !== undefined && h !== undefined && lo !== undefined && c !== undefined) ? [o, c, lo, h] : ['-','-','-','-'];
          });
        }
        const seriesName = chartType === 'heikin_ashi' ? 'Heikin Ashi' : (chartType === 'ohlc' ? 'OHLC' : 'Price');
        option.series.push({ name: seriesName, type: 'candlestick', data: ohlc, xAxisIndex: 0, yAxisIndex: 0, zlevel: 10, markPoint: baseMarkPoint, markLine: baseMarkLine });
      } else if (chartType === 'bar' && close.length) {
        // Bar chart: show as vertical bars
        option.series.push({ 
          name: 'Price', 
          type: 'bar', 
          data: categories.map((_, idx) => {
            let color = colorGray;
            if (idx > 0 && close[idx] !== undefined && close[idx-1] !== undefined) color = close[idx] > close[idx-1] ? colorRed : colorGreen;
            return { value: [idx, close[idx]], itemStyle: { color } };
          }),
          xAxisIndex: 0, 
          yAxisIndex: 0, 
          zlevel: 10, 
          markPoint: baseMarkPoint, 
          markLine: baseMarkLine 
        });
      } else if (chartType === 'area' && close.length) {
        // Area chart: filled under the line
        option.series.push({ 
          name: 'Price', 
          type: 'line', 
          data: toCategoryValues(close), 
          showSymbol: false, 
          smooth: false, 
          xAxisIndex: 0, 
          yAxisIndex: 0, 
          zlevel: 10,
          areaStyle: { color: 'rgba(47, 223, 145, 0.2)' },
          markPoint: baseMarkPoint, 
          markLine: baseMarkLine 
        });
      } else {
        // Default: Line chart
        option.series.push({ 
          name: 'Close', 
          type: 'line', 
          data: toCategoryValues(close), 
          showSymbol: false, 
          smooth: false, 
          xAxisIndex: 0, 
          yAxisIndex: 0, 
          zlevel: 10, 
          markPoint: baseMarkPoint, 
          markLine: baseMarkLine 
        });
      }

      // moving averages on main chart
      if (showMA5 && movingAverages.MA5) {
        option.series.push({ name: 'MA5', type: 'line', data: toCategoryValues(movingAverages.MA5), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { width: 1 } });
      }
      if (showMA25 && movingAverages.MA25) {
        option.series.push({ name: 'MA25', type: 'line', data: toCategoryValues(movingAverages.MA25), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { width: 1 } });
      }
      if (showMA75 && movingAverages.MA75) {
        option.series.push({ name: 'MA75', type: 'line', data: toCategoryValues(movingAverages.MA75), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { width: 1 } });
      }

      // Bollinger Bands (upper/lower and SMA) — draw when enabled
      if (showBB && bollinger_bands && Array.isArray(bollinger_bands.upper) && bollinger_bands.upper.length) {
        option.series.push({ name: 'BB Upper', type: 'line', data: toCategoryValues(bollinger_bands.upper), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { color: '#9ca3af', width: 1, opacity: 0.9 } });
        option.series.push({ name: 'BB Lower', type: 'line', data: toCategoryValues(bollinger_bands.lower), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { color: '#9ca3af', width: 1, opacity: 0.9 } });
        if (bollinger_bands.sma && bollinger_bands.sma.length) {
          option.series.push({ name: 'BB SMA', type: 'line', data: toCategoryValues(bollinger_bands.sma), xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, lineStyle: { color: '#6b7280', width: 1, opacity: 0.8 } });
        }
      }
    }

    // anomalies as scatter with labeled markers (like Chart.jsx)
    if (showAnomaly && anomalies && anomalies.length) {
      // Reason mapping - MUST MATCH backend train_service.py identify_reason()
      // Use i18n._() for translated labels that support Japanese and other languages
      const REASON_MAP = {
        'Volume Spike': { color: '#ff8c00', label: i18n._('Volume Spike') },
        'Volume Average (14d)': { color: '#ff9500', label: i18n._('Volume Average (14d)') },
        'Price Spike': { color: '#ff3b30', label: i18n._('Price Spike') },
        'Flash Crash': { color: '#dc143c', label: i18n._('Flash Crash') },
        'Price Average (20d)': { color: '#f59e0b', label: i18n._('Price Average (20d)') },
        'Absorption': { color: '#0ea5a4', label: i18n._('Absorption') },
        'Bullish Crossover': { color: '#10b981', label: i18n._('Bullish') },
        'Bearish Crossunder': { color: '#ef4444', label: i18n._('Bearish') },
        'Anomaly Detected': { color: '#6b7280', label: i18n._('Anomaly') },
        'System anomaly detected': { color: '#6b7280', label: i18n._('System') },
        'Rule-based': { color: '#8b5cf6', label: i18n._('Rule') },
        other: { color: '#9ca3af', label: i18n._('Other') }
      };

      const normalizeReasonType = (r) => {
        if (!r) return 'other';
        const s = String(r).trim();
        // Match exact backend strings first
        if (REASON_MAP[s]) return s;
        // Fallback to lowercase matching for legacy/typos
        const lower = s.toLowerCase();
        if (lower.includes('volume average')) return 'Volume Average (14d)';
        if (lower.includes('volume spike') || lower.includes('vol spike')) return 'Volume Spike';
        if (lower.includes('price spike')) return 'Price Spike';
        if (lower.includes('flash crash')) return 'Flash Crash';
        if (lower.includes('absorption')) return 'Absorption';
        if (lower.includes('bullish')) return 'Bullish Crossover';
        if (lower.includes('bearish')) return 'Bearish Crossunder';
        if (lower.includes('price average')) return 'Price Average (20d)';
        if (lower.includes('system anomaly')) return 'System anomaly detected';
        if (lower.includes('rule-based')) return 'Rule-based';
        return 'other';
      };

      const scatterData = [];
      const alwaysShow = []; // Empty array - labels only show on hover

      anomalies.forEach(a => {
        try {
          const ts = Date.parse(a.date);
          const idx = tsToIndex.has(ts) ? tsToIndex.get(ts) : null;
          if (idx === null || idx === undefined) return;
          
          const rawReason = a.reason || '';
          const reasonType = normalizeReasonType(rawReason);
          const map = REASON_MAP[reasonType] || REASON_MAP.other;

          scatterData.push({
            value: [idx, a.y],
            reason: map.label,  // Store reason label for tooltip
            itemStyle: { color: map.color },
            label: {
              show: alwaysShow.includes(reasonType),
              formatter: map.label,
              color: '#ffffff',
              backgroundColor: map.color,
              padding: [6, 8],
              borderRadius: 6,
              fontSize: 11,
              position: 'top'
            },
            emphasis: {
              label: { show: true }
            }
          });
        } catch (e) {
          // ignore parse errors
        }
      });

      option.series.push({
        name: i18n._('Anomalies'),
        type: 'scatter',
        data: scatterData,
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 8,
        zlevel: 15,
        tooltip: {
          formatter: (params) => {
            if (params.data && params.data.reason) {
              const date = new Date(params.axisValue);
              const price = params.value[1]?.toFixed(2) || '-';
              return `<div style="color:#000;font-size:12px;"><strong>${date.toLocaleString()}</strong><br/><span style="color:${params.color}">Reason: ${params.data.reason}</span><br/><span style="color:${params.color}">Price: ${price}</span></div>`;
            }
            return '';
          }
        }
      });
    }

    // VWAP overlay on main price chart
    if (showVWAP && vwapArr.length) {
      option.series.push({ name: <Trans>VWAP</Trans>, type: 'line', xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, zlevel: 5, data: toCategoryValues(vwapArr.map(v => v[1])), lineStyle: { color: '#FFC458', width: 1 } });
    }

    // Volume series in grid 1 (always show) with soft broken-axis compression
    if (showVolume && volArr.length) {
      const volMarkLine = (volBreak !== null) ? {
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#aaa' },
        label: { show: true, position: 'insideEndTop', formatter: 'break', color: '#aaa', fontSize: 10, padding: [2, 4] },
        data: [ { yAxis: transformVol(volBreak) } ]
      } : undefined;

      option.series.push({
        name: <Trans>Volume</Trans>, type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
        data: categories.map((_, idx) => {
          let color = colorGray;
          if (idx > 0 && close[idx] !== undefined && close[idx-1] !== undefined) color = close[idx] > close[idx-1] ? colorRed : colorGreen;
          const rawVal = volArr[idx] ? volArr[idx][1] : null;
          return { value: [idx, transformVol(rawVal)], real: rawVal, itemStyle: { color } };
        }),
        barWidth: '60%',
        markLine: volMarkLine
      });
    }

    // MACD in grid 2
    if (showMACD && macdHistData.length) {
      const macdHistCat = macdHistData.map(it => {
        const t = Array.isArray(it.value) ? it.value[0] : null;
        const idx = (t !== null && tsToIndex.has(t)) ? tsToIndex.get(t) : null;
        if (idx === null || idx === undefined) return null;
        return { ...it, value: [idx, it.value[1]] };
      }).filter(Boolean);
      const macdLineCat = macdLineData.map(it => {
        const t = Array.isArray(it) ? it[0] : null;
        const idx = (t !== null && tsToIndex.has(t)) ? tsToIndex.get(t) : null;
        if (idx === null || idx === undefined) return null;
        return [idx, it[1]];
      }).filter(Boolean);
      const signalLineCat = signalLineData.map(it => {
        const t = Array.isArray(it) ? it[0] : null;
        const idx = (t !== null && tsToIndex.has(t)) ? tsToIndex.get(t) : null;
        if (idx === null || idx === undefined) return null;
        return [idx, it[1]];
      }).filter(Boolean);

      option.series.push({ name: <Trans>MACD</Trans>, type: 'bar', xAxisIndex: 2, yAxisIndex: 2, data: macdHistCat, barWidth: '70%' });
      if (macdLineCat.length) {
        option.series.push({ name: <Trans>DIF</Trans>, type: 'line', xAxisIndex: 2, yAxisIndex: macdLineAxisIndex, showSymbol: false, data: macdLineCat, lineStyle: { color: '#FFC458', width: 1 } });
      }
      if (signalLineCat.length) {
        option.series.push({ name: <Trans>DEA</Trans>, type: 'line', xAxisIndex: 2, yAxisIndex: macdLineAxisIndex, showSymbol: false, data: signalLineCat, lineStyle: { color: '#333', width: 1 } });
      }
    }

    // EMA chart (separate, above volume)
    const emaGridIndex = 3;
    const emaLineAxisIndex = 4;
    if (showEMA && shortEMAData.length) {
      const shortEMACat = shortEMAData.map(it => {
        const t = Array.isArray(it) ? it[0] : null;
        const idx = (t !== null && tsToIndex.has(t)) ? tsToIndex.get(t) : null;
        if (idx === null || idx === undefined) return null;
        return [idx, it[1]];
      }).filter(Boolean);
      const longEMACat = longEMAData.map(it => {
        const t = Array.isArray(it) ? it[0] : null;
        const idx = (t !== null && tsToIndex.has(t)) ? tsToIndex.get(t) : null;
        if (idx === null || idx === undefined) return null;
        return [idx, it[1]];
      }).filter(Boolean);

      if (shortEMACat.length) {
        option.series.push({ name: 'EMA12', type: 'line', xAxisIndex: 3, yAxisIndex: emaLineAxisIndex, showSymbol: false, data: shortEMACat, lineStyle: { color: '#1f77b4', width: 1 } });
      }
      if (longEMACat.length) {
        option.series.push({ name: 'EMA26', type: 'line', xAxisIndex: 3, yAxisIndex: emaLineAxisIndex, showSymbol: false, data: longEMACat, lineStyle: { color: '#ff7f0e', width: 1 } });
      }
    }

    // No side-panel series; main price uses full width

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
  }, [dates, open, high, low, close, volume, VWAP, movingAverages, chartType, showVWAP, showBB, showAnomaly, showMA5, showMA25, showMA75, showEMA, showMACD, showVolume]);

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
  const news = mappedProviderNews.length ? mappedProviderNews.slice(0, 2) : [];

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
          if (toCache.length) {
            try {
              const cj = await fetchWithDedup(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
              const found = (cj.items || []).find(i => i && i.articleKey === (item.articleKey || item.link));
              if (found) {
                articleId = found.id || found.articleKey || articleId;
                item.cacheId = found.id || null;
                if (!item.thumbnail && found.thumbnail) item.thumbnail = found.thumbnail;
                if (!item.date && found.pubDate) item.date = found.pubDate;
              }
            } catch (_e) { }
          }
        } catch (e) { /* ignore cache errors */ }
      }
      const payload = { url: link, articleId, title: item.title, ticker, thumbnail: item.thumbnail || null, pubDate: item.date || item.pubDate || null };
      fetchWithDedup(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
      window.open(link, '_blank', 'noopener');
    }catch(err){
      const link = item.link || item.url || '#';
      window.open(link, '_blank', 'noopener');
    }
  }

  return (
    <div className="lc-shell">
      {/* Navbar elements merged into main controls (removed fixed bottom navbar) */}

      <div className={`lc-body ${sidebarOpen ? 'sidebar-open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setSidebarOpen(false); }}>
        {/* Sidebar with ticker info, financials, news */}
        <aside className="lc-sidebar">
          {/* Ticker Card */}
          <div className="lc-card lc-ticker-card">
            <div className="lc-row">
              <div className="lc-name-wrap">
                <button
                  className="lc-ticker-name lc-ticker-name-btn"
                  onClick={() => { setShowTickerSearchModal(true); setSidebarOpen(false); }}
                  title="Click to search for another ticker"
                  type="button"
                >
                  {displayTicker}
                </button>
                <div className="lc-company-name">{localizedCompanyName || 'Loading...'}</div>
              </div>
              <div className="lc-status">
                <span className={`lc-dot ${isMarketOpen ? 'open' : 'closed'}`} />
                <span>{isMarketOpen ? <Trans>OPEN</Trans> : <Trans>CLOSED</Trans>}</span>
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
              {isLoadingFollow ? '...' : (followed ? (followHover ? <Trans>Unfollow</Trans> : <Trans>Following</Trans>) : <Trans>Follow</Trans>)}
            </button>
          </div>

          <div className="lc-card">
            <div className="lc-card-header">
              <span><Trans>Financials</Trans></span>
              <button
                type="button"
                className="lc-btn-small"
                onClick={() => { setFinOverlayTitle('Recent Financials'); setFinOverlayData(null); setFinOverlayOpen(true); }}
                title="View recent financial data (2 periods)"
              >
                <Trans>More</Trans>
              </button>
            </div>
            <div className="lc-financial-tabs">
              <button
                className={`lc-tab ${financialTab === 'income' ? 'active' : ''}`}
                onClick={() => setFinancialTab('income')}
              >
                <Trans>Income</Trans>
              </button>
              <button
                className={`lc-tab ${financialTab === 'balance' ? 'active' : ''}`}
                onClick={() => setFinancialTab('balance')}
              >
                <Trans>Balance</Trans>
              </button>
            </div>
            <div className="lc-financials-content">
              {financialTab === 'income' && (
                <div style={{ padding: 4 }}>
                  <FinancialsTable title="Income Statement" data={truncatedFinancials.income_stmt || {}} compact importantMetrics={["totalRevenue"]} />
                </div>
              )}
              {financialTab === 'balance' && (
                <div style={{ padding: 4 }}>
                  <FinancialsTable title="Balance Sheet" data={truncatedFinancials.balance_sheet || {}} compact importantMetrics={["totalAssets"]} />
                </div>
              )}
            </div>
          </div>

          {/* News Card */}
          <div className="lc-card">
            <div className="lc-card-header">
              <span><Trans>News</Trans></span>
              <Link to={`/company/${ticker}`} className="lc-btn-small" title={`Open ${getDisplayFromRaw(ticker)} company page`} onClick={() => setSidebarOpen(false)}><Trans>More</Trans></Link>
              {/* <button
                type="button"
                className="lc-btn-small"
              >
                More
              </button> */}
            </div>
            <div className="lc-news-list">
              {news.length === 0 && <div className="lc-muted"><Trans>No recent news</Trans></div>}
              {news.map((n, idx) => (
                <a
                  className="news-item"
                  key={n.id || idx}
                  href={n.link || n.url || '#'}
                  onClick={(e) => handleNewsClick(e, n)}
                  onMouseDown={(e) => {
                    // Track views for middle-click (button 1) and any click that opens new tab
                    if (e.button === 1 || e.button === 2) {
                      handleNewsClick(null, n);
                    }
                  }}
                  onAuxClick={(e) => {
                    // Catch middle-click if onMouseDown missed it
                    if (e.button === 1) {
                      handleNewsClick(null, n);
                    }
                  }}
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
                    {formatPresetLabel(PERIOD_PRESETS.find(pp => pp.period === period), i18n) || period}
                  </button>
                  <button
                    ref={intervalBtnRef}
                    type="button"
                    className="lc-tz-select interval-select"
                    onClick={() => setIntervalOpen(s => !s)}
                    aria-haspopup="listbox"
                    aria-expanded={intervalOpen}
                  >
                    {getIntervalDisplayName(interval, i18n)}
                  </button>

                  {periodOpen && periodBtnRef.current && (
                    <PortalDropdown
                      anchorRect={periodBtnRef.current.getBoundingClientRect()}
                      align="right"
                      onClose={() => setPeriodOpen(false)}
                      className="mode-dropdown"
                    >
                      {[...new Set(PERIOD_PRESETS.map(pp => pp.period))].map(p => (
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
                          {formatPresetLabel({ period: p, interval }, i18n)}
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
                          {getIntervalDisplayName(iv, i18n)}
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
                  className={`lc-chart-type-btn ${chartType === 'heikin_ashi' ? 'active' : ''}`}
                  onClick={() => setChartType('heikin_ashi')}
                  title="Heikin Ashi Chart"
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
                className="lc-btn ghost sidebar-toggle-btn"
                onClick={() => setSidebarOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={sidebarOpen}
                title={sidebarOpen ? "Hide data panel" : "Show data panel"}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="3" y="3" width="8" height="18" rx="1" fill="currentColor" opacity={sidebarOpen ? "1" : "0.3"} />
                  <rect x="13" y="3" width="8" height="18" rx="1" fill="currentColor" opacity="0.3" />
                  <line x1="11" y1="3" x2="11" y2="21" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
              <button
                ref={indicatorsBtnRef}
                className={`lc-btn ghost ${showBB || showVWAP || showAnomaly || showMA5 || showMA25 || showMA75 || showEMA || showMACD || showVolume ? 'active' : ''}`}
                onClick={() => setIndicatorsOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={indicatorsOpen}
                title="Indicators"
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                <Trans>Indicators</Trans>
              </button>
              <button onClick={() => window.location.href = `/company/${ticker}`} className="lc-btn ghost" title="Open company profile" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Trans>Profile</Trans>
              </button>
              {indicatorsOpen && indicatorsBtnRef.current && (
                <PortalDropdown anchorRect={indicatorsBtnRef.current.getBoundingClientRect()} align="right" onClose={() => setIndicatorsOpen(false)} className="mode-dropdown indicators-dropdown">
                  <div role="listbox" aria-label="Indicators" onMouseLeave={() => setIndicatorsOpen(false)}>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showBB} onClick={() => setShowBB(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showBB: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowBB(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showBB: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showBB ? 'checked' : ''}`} aria-hidden>{showBB && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>Bollinger Bands</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showVWAP} onClick={() => setShowVWAP(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVWAP: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVWAP(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVWAP: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showVWAP ? 'checked' : ''}`} aria-hidden>{showVWAP && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>VWAP</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showAnomaly} onClick={() => setShowAnomaly(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showAnomaly: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAnomaly(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showAnomaly: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showAnomaly ? 'checked' : ''}`} aria-hidden>{showAnomaly && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>Anomalies</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA5} onClick={() => setShowMA5(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA5: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA5(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA5: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA5 ? 'checked' : ''}`} aria-hidden>{showMA5 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>MA (5)</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA25} onClick={() => setShowMA25(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA25: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA25(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA25: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA25 ? 'checked' : ''}`} aria-hidden>{showMA25 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>MA (25)</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMA75} onClick={() => setShowMA75(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA75: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMA75(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMA75: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMA75 ? 'checked' : ''}`} aria-hidden>{showMA75 && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>MA (75)</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showEMA} onClick={() => setShowEMA(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showEMA: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowEMA(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showEMA: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showEMA ? 'checked' : ''}`} aria-hidden>{showEMA && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>EMA</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showMACD} onClick={() => setShowMACD(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMACD: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMACD(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showMACD: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showMACD ? 'checked' : ''}`} aria-hidden>{showMACD && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>MACD</Trans>
                    </div>
                    <div className="mode-item" role="option" tabIndex={0} aria-checked={showVolume} onClick={() => setShowVolume(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVolume: nv })); return nv; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowVolume(v => { const nv = !v; localStorage.setItem('lc_prefs', JSON.stringify({ ...(JSON.parse(localStorage.getItem('lc_prefs')||'{}')), showVolume: nv })); return nv; }); } }}>
                      <span className={`indicator-dot ${showVolume ? 'checked' : ''}`} aria-hidden>{showVolume && (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>)}</span>
                      <Trans>Volume</Trans>
                    </div>
                  </div>
                </PortalDropdown>
              )}
            </div>
          </div>

          {loading && <div className="lc-muted">Loading chart…</div>}
          {error && <div className="lc-error">{error}</div>}
          {!loading && !error && (
            <div style={{ width: '100%', display: 'flex', flex: 1, minHeight: 0 }}>
              <div id="main-chart-container" ref={mainChartRef} style={{ width: '100%', height: '100%', minHeight: 0, minWidth: 0 }} />
            </div>
          )}
        </main>
      </div>

      <Dialog 
        open={finOverlayOpen} 
        onClose={() => setFinOverlayOpen(false)} 
        maxWidth="lg" 
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogTitle-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#252525' : '#f5f5f5',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
            borderBottom: document.body.classList.contains('dark') ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiDialogContent-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogActions-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            borderTop: document.body.classList.contains('dark') ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiButton-root': {
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
        }}
      >
        <DialogTitle>{displayTicker} — {finOverlayTitle}</DialogTitle>
        <DialogContent>
          <div style={{ paddingTop: 8 }}>
            {finOverlayTitle === 'Recent Financials' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <h5 style={{ marginTop: 0 }}><Trans>Income Statement (most recent 2 periods)</Trans></h5>
                  <FinancialsTable title="Income Statement" data={truncatedFinancials.income_stmt || {}} />
                </div>
                <div>
                  <h5 style={{ marginTop: 0 }}><Trans>Balance Sheet (most recent 2 periods)</Trans></h5>
                  <FinancialsTable title="Balance Sheet" data={truncatedFinancials.balance_sheet || {}} />
                </div>
              </div>
            ) : (
              <FinancialsTable title={finOverlayTitle} data={finOverlayData || {}} />
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinOverlayOpen(false)}><Trans>Close</Trans></Button>
          <Button component={Link} to={`/company/${encodeURIComponent(ticker)}`} onClick={() => setFinOverlayOpen(false)}><Trans>Open Company Profile</Trans></Button>
        </DialogActions>
      </Dialog>

      {/* Market Selection Modal removed: unused feature */}

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
                            setCompanyNameLocal('');
                            setCountry('');
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
                          <button key={`res-${idx}-${symbolText}`} type="button" className="lc-ticker-search-item" onClick={() => { setTicker(symbolText); setCompanyName(t.name || ''); setCompanyNameLocal(t.companyNameLocal || ''); setCountry(t.country || ''); setShowTickerSearchModal(false); setTickerSearchQuery(''); }}>
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
