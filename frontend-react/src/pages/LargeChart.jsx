import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EchartsCard from '../components/EchartsCard';
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
  { label: '1D 1m', period: '1d', interval: '1m' },
  { label: '5D 5m', period: '5d', interval: '5m' },
  { label: '1W 5m', period: '1wk', interval: '5m' },
  { label: '1M 30m', period: '1mo', interval: '30m' },
  { label: '1M 1d', period: '1mo', interval: '1d' },
  { label: '3M 1d', period: '3mo', interval: '1d' },
  { label: '6M 1d', period: '6mo', interval: '1d' },
  { label: '1Y 1d', period: '1y', interval: '1d' },
  { label: '2Y 1d', period: '2y', interval: '1d' },
  { label: '5Y 1wk', period: '5y', interval: '1wk' },
  { label: 'MAX 1wk', period: 'max', interval: '1wk' }
];

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
  const [companyName, setCompanyName] = useState('');
  const [market, setMarket] = useState('US');
  const [searchInput, setSearchInput] = useState((paramTicker || 'AAPL').toUpperCase());
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [period, setPeriod] = useState('1d');
  const [interval, setInterval] = useState('1m');
  const [payload, setPayload] = useState({});
  const [financials, setFinancials] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('candlestick');
  const [timezone, setTimezone] = useState('UTC');
  const [tzUserOverridden, setTzUserOverridden] = useState(false);
  const [financialTab, setFinancialTab] = useState('income');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showMarketModal, setShowMarketModal] = useState(false);
  const [marketCandidates, setMarketCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

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
        if (!cancelled) {
          // Convert nested dict structures to usable format
          const processed = {
            income_stmt: fj.income_stmt || {},
            balance_sheet: fj.balance_sheet || {},
            cash_flow: fj.cash_flow || fj.cashflow || {},
            news: Array.isArray(fj.news) ? fj.news : []
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
  const anomalies = useMemo(() => (payload.anomaly_markers?.dates || []).map((d, i) => ({
    date: d,
    y: (payload.anomaly_markers?.y_values || [])[i]
  })).filter(x => x.date && (x.y !== undefined && x.y !== null)), [payload.anomaly_markers]);
  const VWAP = useMemo(() => payload.VWAP || [], [payload.VWAP]);
  const bollinger_bands = useMemo(() => payload.bollinger_bands || { lower: [], upper: [], sma: [] }, [payload.bollinger_bands]);

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

  const news = useMemo(() => Array.isArray(financials.news) ? financials.news.slice(0, 5) : [], [financials.news]);

  const currencySymbol = useMemo(() => getCurrency(market), [market]);

  const handleSearchAllMarkets = async (cleanedInput) => {
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

  return (
    <div className="lc-shell">
      {/* Navbar with editable ticker search and period controls */}
      <div className="lc-navbar">
        <div className="lc-ticker-input-wrapper">
          <input
            type="text"
            placeholder="Type ticker or company name (e.g., AAPL, 6758.T, 0001.HK)..."
            className="lc-ticker-input"
            value={searchInput}
            onChange={(e) => {
              const input = e.target.value;
              setSearchInput(input);
              setShowSearchDropdown(true);
            }}
            onFocus={() => setShowSearchDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // User pressed Enter - search across all markets
                const cleanedInput = cleanTickerInput(searchInput.toUpperCase().trim());
                const inputUpper = searchInput.toUpperCase().trim();
                
                // If user typed with extension, use it directly
                if (TICKER_EXTENSIONS.some(ext => inputUpper.endsWith(ext))) {
                  setTicker(inputUpper);
                  setShowSearchDropdown(false);
                } else if (cleanedInput.length > 0) {
                  // Otherwise search across all markets
                  setIsSearching(true);
                  handleSearchAllMarkets(cleanedInput).then(candidates => {
                    setIsSearching(false);
                    setShowSearchDropdown(false);
                    if (candidates.length === 0) {
                      // No results found, try the raw input anyway
                      console.warn(`Ticker "${cleanedInput}" not found in any market`);
                      setTicker(inputUpper);
                    } else if (candidates.length === 1) {
                      // Only one match, use it directly
                      setTicker(candidates[0].ticker);
                      setCompanyName(candidates[0].name);
                      setMarket(candidates[0].marketCode);
                    } else {
                      // Multiple matches, show modal to let user choose
                      setMarketCandidates(candidates);
                      setShowMarketModal(true);
                    }
                  }).catch(err => {
                    setIsSearching(false);
                    console.error('Market search failed:', err);
                    setTicker(inputUpper);
                  });
                }
              }
            }}
          />
          {isSearching && (
            <div className="lc-ticker-dropdown">
              <div className="lc-search-loading">Searching all markets...</div>
            </div>
          )}
          {showSearchDropdown && searchResults.length > 0 && !isSearching && (
            <div className="lc-ticker-dropdown">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="lc-ticker-result"
                  onClick={() => handleSelectTicker(result.ticker, result.name)}
                >
                  <div className="lc-result-ticker">{result.ticker}</div>
                  <div className="lc-result-company">{result.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="lc-preset-row">
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              className={`lc-pill ${period === p.period && interval === p.interval ? 'active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="lc-selector-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <label style={{ fontSize: 12, color: '#666' }}>Period</label>
          <select
            className="lc-tz-select"
            value={period}
            onChange={(e) => {
              const newPeriod = e.target.value;
              const enforced = enforceIntervalRules(newPeriod, interval);
              setPeriod(newPeriod);
              setInterval(enforced);
            }}
          >
            {['1d','5d','1wk','1mo','3mo','6mo','1y','2y','5y','max'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: '#666' }}>Interval</label>
          <select
            className="lc-tz-select"
            value={interval}
            onChange={(e) => setInterval(enforceIntervalRules(period, e.target.value))}
          >
            {getIntervalOptions(period).map(iv => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart Type Selector */}
      <div className="lc-chart-toolbar">
        <div className="lc-chart-type-group">
          <button type="button" className={`lc-chart-type-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')} title="Candlestick Chart">🔯 Candlestick</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')} title="Line Chart">📈 Line</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'ohlc' ? 'active' : ''}`} onClick={() => setChartType('ohlc')} title="OHLC Chart">📊 OHLC</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')} title="Bar Chart">📋 Bar</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'column' ? 'active' : ''}`} onClick={() => setChartType('column')} title="Column Chart">📊 Column</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')} title="Area Chart">🏞️ Area</button>
          <button type="button" className={`lc-chart-type-btn ${chartType === 'hlc' ? 'active' : ''}`} onClick={() => setChartType('hlc')} title="HLC Chart">📍 HLC</button>
        </div>
      </div>

      <div className="lc-body">
        {/* Sidebar with ticker info, financials, news */}
        <aside className="lc-sidebar">
          {/* Ticker Card */}
          <div className="lc-card lc-ticker-card">
            <div className="lc-row">
              <div>
                <div className="lc-ticker-name">{cleanTickerInput(ticker)}</div>
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
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="lc-news-source">{n.source || 'News'}</div>
                  <div className="lc-news-title">{n.title || 'Headline'}</div>
                  <div className="lc-news-date">{n.date || n.providerPublishTime || ''}</div>
                </a>
              ))}
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
              <select
                value={timezone}
                onChange={(e) => { setTimezone(e.target.value); setTzUserOverridden(true); }}
                className="lc-tz-select"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.name} value={tz.name}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* Main chart area */}
        <main className="lc-main">
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
              VWAP={VWAP}
              bollinger_bands={bollinger_bands}
              anomalies={anomalies}
              timezone={timezone}
              period={period}
              interval={interval}
              chartMode={chartType}
              showVolume
              showVWAP
              showBB
              showRSI={false}
              showMACD={false}
              height="100%"
            />
          )}
        </main>
      </div>

      {/* Financial Details Modal */}
      {showFinancialModal && (
        <div className="lc-modal-overlay" onClick={() => setShowFinancialModal(false)}>
          <div className="lc-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lc-modal-header">
              <h2>{ticker} — Financial Data</h2>
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
    </div>
  );
}
