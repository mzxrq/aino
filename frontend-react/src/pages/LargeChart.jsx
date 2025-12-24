import React, { useEffect, useMemo, useState, useRef } from 'react';
import PortalDropdown from '../components/DropdownSelect/PortalDropdown';
import { useParams, useNavigate, Link } from 'react-router-dom';
import EchartsCard from '../components/EchartsCard';
import TimezoneSelect from '../components/TimezoneSelect';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import '../css/LargeChart.css';

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
  const primary = `${PY_API}${path}`;
  const fallback = `${PY_DIRECT}/py${path}`;
  try {
    const res = await fetch(primary, init);
    if (res.ok) return await res.json();
  } catch (_) { /* continue to fallback */ }
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

const TIMEZONES = [
  { offset: 0, label: 'UTC', name: 'UTC' },
  { offset: 1, label: 'UTC+1', name: 'Europe/London' },
  { offset: 2, label: 'UTC+2', name: 'Europe/Paris' },
  { offset: 3, label: 'UTC+3', name: 'Europe/Moscow' },
  { offset: 5.5, label: 'UTC+5:30', name: 'Asia/Kolkata' },
  { offset: 8, label: 'UTC+8', name: 'Asia/Singapore' },
  { offset: 9, label: 'UTC+9', name: 'Asia/Tokyo' },
  { offset: -5, label: 'UTC-5', name: 'America/New_York' },
  { offset: -8, label: 'UTC-8', name: 'America/Los_Angeles' }
];

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
  const [lcNewsPageSize] = useState(5);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showMarketModal, setShowMarketModal] = useState(false);
  const [showBB, setShowBB] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showBB !== undefined) ? p.showBB : false; } catch { return false; } });
  const [showVWAP, setShowVWAP] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVWAP !== undefined) ? p.showVWAP : false; } catch { return false; } });
  const [showVolume, setShowVolume] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showVolume !== undefined) ? p.showVolume : true; } catch { return true; } });
  const [showAnomaly, setShowAnomaly] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showAnomaly !== undefined) ? p.showAnomaly : true; } catch { return true; } });
  const [showMA5, setShowMA5] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA5 !== undefined) ? p.showMA5 : false; } catch { return false; } });
  const [showMA25, setShowMA25] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA25 !== undefined) ? p.showMA25 : false; } catch { return false; } });
  const [showMA75, setShowMA75] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showMA75 !== undefined) ? p.showMA75 : false; } catch { return false; } });
  const [showSAR, setShowSAR] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return (p.showSAR !== undefined) ? p.showSAR : false; } catch { return false; } });
  const [bbSigma, setBbSigma] = useState(() => { try { const p = JSON.parse(localStorage.getItem('lc_prefs') || '{}'); return p.bbSigma || '2sigma'; } catch { return '2sigma'; } });
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsBtnRef = useRef(null);
  const [marketCandidates, setMarketCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTickerSearchModal, setShowTickerSearchModal] = useState(false);
  const [tickerSearchQuery, setTickerSearchQuery] = useState('');

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

  const lastClose = close.length ? close[close.length - 1] : null;
  const prevClose = close.length > 1 ? close[close.length - 2] : null;
  const change = (lastClose !== null && prevClose !== null) ? (lastClose - prevClose) : null;
  const changePct = (change !== null && prevClose) ? (change / prevClose) * 100 : null;

  const netIncome = useMemo(() => {
    const data = financials.income_stmt || {};
    return Object.entries(data).slice(0, 4).map(([key, value]) => {
      const numVal = typeof value === 'number' ? value : (typeof value === 'object' && value !== null ? 0 : parseFloat(value) || 0);
      return { period: key, value: numVal };
    });
  }, [financials.income_stmt]);

  const balanceSheetData = useMemo(() => {
    const data = financials.balance_sheet || {};
    return Object.entries(data).slice(0, 8).map(([key, value]) => {
      const numVal = typeof value === 'number' ? value : (typeof value === 'object' && value !== null ? 0 : parseFloat(value) || 0);
      return { period: key, value: numVal };
    });
  }, [financials.balance_sheet]);

  const cashFlowData = useMemo(() => {
    const data = financials.cash_flow || {};
    return Object.entries(data).slice(0, 4).map(([key, value]) => {
      const numVal = typeof value === 'number' ? value : (typeof value === 'object' && value !== null ? 0 : parseFloat(value) || 0);
      return { period: key, value: numVal };
    });
  }, [financials.cash_flow]);

  const news = lcNews.length ? lcNews : (Array.isArray(financials.news) ? financials.news.slice(0, 5) : []);

  const currencySymbol = useMemo(() => getCurrency(market), [market]);

  const handleSearchAllMarkets = async (cleanedInput) => {

  useEffect(() => {
    let cancelled = false;
    async function loadLcNews(){
      if (!ticker) return;
      setLcNewsLoading(true);
      try{
        const res = await fetchJsonWithFallback(`/news?ticker=${encodeURIComponent(ticker)}&page=1&pageSize=${lcNewsPageSize}`);
        if (!cancelled) {
          // support response shapes: { items: [...] } | { news: [...] } | array
          let rawItems = [];
          if (!res) rawItems = [];
          else if (Array.isArray(res)) rawItems = res;
          else if (Array.isArray(res.items)) rawItems = res.items;
          else if (Array.isArray(res.news)) rawItems = res.news;
          else rawItems = [];

          const mapped = rawItems.map((it, idx) => {
            const c = (it && it.content) ? it.content : it || {};
            const raw = (c.raw && typeof c.raw === 'object') ? c.raw : (it.raw || it || {});

            const title = c.title || c.headline || c.summary || raw.title || raw.headline || '';

            const lookup = (obj) => {
              if (!obj || typeof obj !== 'object') return null;
              if (obj.clickThroughUrl && (obj.clickThroughUrl.url || obj.clickThroughUrl)) return (obj.clickThroughUrl.url || obj.clickThroughUrl);
              if (obj.canonicalUrl && (obj.canonicalUrl.url || obj.canonicalUrl)) return (obj.canonicalUrl.url || obj.canonicalUrl);
              if (obj.link) return obj.link;
              if (obj.url) return obj.url;
              if (obj.href) return obj.href;
              return null;
            };

            const link = lookup(c) || lookup(raw) || lookup(raw.content) || lookup(it) || '#';
            const source = (c.source) || (raw.provider && raw.provider.displayName) || raw.source || raw.publisher || '';
            const thumbnail = (c.thumbnail && (c.thumbnail.originalUrl || c.thumbnail.url)) || raw.image || raw.thumbnail || raw.summary_img || null;
            const date = c.pubDate || raw.pubDate || raw.providerPublishTime || null;
            const displayTime = c.displayTime || null;

            return {
              title: title || 'Headline',
              source: source || 'News',
              link,
              date,
              displayTime,
              thumbnail
            };
          });
          setLcNews(mapped);
        }
      }catch(e){ console.warn('lc news fetch', e); }
      finally{ if(!cancelled) setLcNewsLoading(false); }
    }
    loadLcNews();
    return ()=>{ cancelled = true; };
  }, [ticker, lcNewsPageSize]);
    // Try to find the ticker in all markets
    const candidates = [];
    
    for (const marketConfig of MARKET_EXTENSIONS) {
      for (const ext of marketConfig.extensions) {
        const tickerToTry = cleanedInput + ext;
        try {
          const data = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(tickerToTry)}`);
          const match = Array.isArray(data) ? data.find(d => d.ticker.toUpperCase() === tickerToTry.toUpperCase()) : null;
          if (match) {
            candidates.push({
              ticker: match.ticker,
              name: match.name,
              market: marketConfig.label,
              marketCode: marketConfig.market
            });
          }
        } catch (e) {
          // Silent fail
        }
      }
    }
    
    return candidates;
  };

  const handlePreset = (p) => {
    setPeriod(p.period);
    setInterval(p.interval);
  };

  const handleSelectTicker = (selectedTicker, selectedName) => {
    // Store full ticker with extensions for backend, clean only for display
    setTicker(selectedTicker);
    setSearchInput(cleanTickerInput(selectedTicker));
    setCompanyName(selectedName || '');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  const downloadFinancialsCSV = () => {
    const currentData = financialTab === 'income' ? netIncome : financialTab === 'balance' ? balanceSheetData : cashFlowData;
    if (!currentData.length) return;

    const header = ['Period', 'Value'];
    const rows = currentData.map(item => [item.period, item.value]);
    const csv = [header, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}-${financialTab}-financials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Report news view and open link
  function handleNewsClick(e, item){
    try{
      if (e && e.preventDefault) e.preventDefault();
      const link = item.link || item.url || '#';
      fetch(`${API_URL}/node/news/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, articleId: item.id, title: item.title, ticker })
      }).catch(()=>{});
      window.open(link, '_blank', 'noopener');
    }catch(err){
      const link = item.link || item.url || '#';
      window.open(link, '_blank', 'noopener');
    }
  }

  return (
    <div className="lc-shell">
      {/* Navbar with compact controls (ticker button + period/interval + chart type) */}
      <div className="lc-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="lc-ticker-name lc-ticker-name-btn"
            onClick={() => setShowTickerSearchModal(true)}
            title="Click to search for another ticker"
          >
            {displayTicker}
          </button>

          <div className="lc-selector-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 0 }}>
            <label style={{ fontSize: 12, color: '#666' }}>Period</label>
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
            <label style={{ fontSize: 12, color: '#666' }}>Interval</label>
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

        {/* chart type buttons moved into main area */}

        <Link to={`/company/${ticker}`} className="lc-company-btn lc-company-profile-btn" title="Open company profile">
          Profile
        </Link>
      </div>

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
            <button className="lc-btn follow" type="button">Follow</button>
          </div>

          {/* Financials Card - TradingView Style */}
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
              <button
                className={`lc-tab ${financialTab === 'cash' ? 'active' : ''}`}
                onClick={() => setFinancialTab('cash')}
              >
                Cash Flow
              </button>
            </div>
            <div className="lc-financials-content">
              {financialTab === 'income' && (
                <div className="lc-financial-table">
                  {netIncome.length === 0 ? (
                    <div className="lc-muted">No income data available</div>
                  ) : (
                    netIncome.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">{currencySymbol}{Math.abs(item.value) > 1e9 ? (item.value / 1e9).toFixed(2) : (item.value / 1e6).toFixed(2)}{Math.abs(item.value) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {financialTab === 'balance' && (
                <div className="lc-financial-table">
                  {balanceSheetData.length === 0 ? (
                    <div className="lc-muted">No balance sheet data available</div>
                  ) : (
                    balanceSheetData.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">{currencySymbol}{Math.abs(item.value) > 1e9 ? (item.value / 1e9).toFixed(2) : (item.value / 1e6).toFixed(2)}{Math.abs(item.value) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {financialTab === 'cash' && (
                <div className="lc-financial-table">
                  {cashFlowData.length === 0 ? (
                    <div className="lc-muted">No cash flow data available</div>
                  ) : (
                    cashFlowData.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">{currencySymbol}{Math.abs(item.value) > 1e9 ? (item.value / 1e9).toFixed(2) : (item.value / 1e6).toFixed(2)}{Math.abs(item.value) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* News Card */}
          <div className="lc-card">
            <div className="lc-card-header">
              <span>News</span>
            </div>
            <div className="lc-news-list">
              {news.length === 0 && <div className="lc-muted">No recent news</div>}
              {news.map((n, idx) => (
                <a
                  key={idx}
                  className="lc-news-item"
                  href={n.link || n.url || '#'}
                  onClick={(e) => handleNewsClick(e, n)}
                  rel="noreferrer"
                >
                  <div className="lc-news-source">{n.source || 'News'}</div>
                  <div className="lc-news-title">{n.title || 'Headline'}</div>
                  <div className="lc-news-date">{n.date || n.providerPublishTime || ''}</div>
                </a>
              ))}
              {/* More link to open full company news/profile */}
              </div>
            <div style={{ paddingTop: 8, textAlign: 'right' }}>
              <Link to={`/company/${ticker}`} className="lc-btn ghost" title={`Open ${getDisplayFromRaw(ticker)} company page`}>More</Link>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="lc-footer">
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
          </div>
        </aside>

        {/* Main chart area */}
        <main className="lc-main">
          {/* Controls placed inside main: chart type + indicators */}
          <div className="lc-main-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                className={`lc-btn ghost ${showVolume || showBB || showVWAP || showAnomaly || showMA5 || showMA25 || showMA75 || showSAR ? 'active' : ''}`}
                onClick={() => setIndicatorsOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={indicatorsOpen}
                title="Indicators"
              >
                Indicators
              </button>
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
                  </div>
                </PortalDropdown>
              )}
            </div>
          </div>

          {loading && <div className="lc-muted">Loading chart…</div>}
          {error && <div className="lc-error">{error}</div>}
          {!loading && !error && (
            <EchartsCard
              ticker={ticker}
              dates={dates}
              open={open}
              high={high}
              low={low}
              close={close}
              volume={volume}
              vwap={VWAP}
              bb={bollinger_bands}
              anomalies={anomalies}
              timezone={timezone}
              period={period}
              interval={interval}
              chartMode={chartType}
              showVolume={showVolume}
              showVWAP={showVWAP}
              showBB={showBB}
              showAnomaly={showAnomaly}
              showRSI={false}
              showMACD={false}
              height="100%"
              showMA5={showMA5}
              showMA25={showMA25}
              showMA75={showMA75}
              showSAR={showSAR}
              bbSigma={bbSigma}
              movingAverages={movingAverages}
            />
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

              {/* Cash Flow */}
              <div className="lc-modal-section">
                <h3>Cash Flow</h3>
                <div className="lc-modal-table">
                  <div className="lc-table-header">
                    <div>Period</div>
                    <div>Value</div>
                  </div>
                  {Object.entries(financials.cash_flow || {}).map(([period, value]) => {
                    const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
                    return (
                      <div key={period} className="lc-table-row">
                        <div className="lc-table-cell">{period}</div>
                        <div className="lc-table-cell">{currencySymbol}{Math.abs(numVal) > 1e9 ? (numVal / 1e9).toFixed(2) : (numVal / 1e6).toFixed(2)}{Math.abs(numVal) > 1e9 ? 'B' : 'M'}</div>
                      </div>
                    );
                  })}
                  {Object.keys(financials.cash_flow || {}).length === 0 && (
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
                {filteredStocks.map((stock, idx) => (
                  <button
                    key={idx}
                    className="lc-ticker-search-item"
                    onClick={() => {
                      setTicker(stock.ticker);
                      setCompanyName(stock.name);
                      setShowTickerSearchModal(false);
                      setTickerSearchQuery('');
                    }}
                    type="button"
                  >
                    <div className="lc-ticker-search-item-ticker">{stock.ticker}</div>
                    <div className="lc-ticker-search-item-name">{stock.name}</div>
                    <div className="lc-ticker-search-item-market">{stock.market}</div>
                  </button>
                ))}
                {filteredStocks.length === 0 && (
                  <div className="lc-ticker-search-empty">No results found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
