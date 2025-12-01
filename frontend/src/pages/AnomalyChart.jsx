// Restored previous AnomalyChart implementation (from backupAnomaly.jsx / history)
import React, { useEffect, useState, useRef } from 'react';
import Plot from 'react-plotly.js';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../pages/AnomalyChart.css';

// --- CONFIGURATION: Allowed Intervals per Range ---
const ALLOWED_INTERVALS = {
  '1d': ['1m', '5m', '15m', '30m', '1h'],
  '5d': ['5m', '15m', '30m', '1h', '1d'],
  '1mo': ['30m', '1h', '1d', '1wk'],
  '6mo': ['1d', '1wk', '1mo'],
  'ytd': ['1d', '1wk', '1mo'],
  '1y': ['1d', '1wk', '1mo'],
  '5y': ['1d', '1wk', '1mo']
};

export default function AnomalyChart() {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialTicker = (location && location.state && location.state.ticker) || searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL';
  const [ticker, setTicker] = useState(initialTicker);

  // --- Controls ---
  const [period, setPeriod] = useState("1d");
  const [interval, setInterval] = useState("5m");
  const [chartType, setChartType] = useState("line");
  const [showVolume, setShowVolume] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [sidebarData, setSidebarData] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const indicatorPanelRef = useRef(null);
  const indicatorsToggleRef = useRef(null);
  const chartContainerRef = useRef(null);
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const sidebarToggleRef = useRef(null);
  const plotRef = useRef(null);
  const [isDarkTheme, setIsDarkTheme] = useState(() => typeof document !== 'undefined' && document.body.classList.contains('dark'));
  const [sidebarOverlay, setSidebarOverlay] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [plotlyTheme, setPlotlyTheme] = useState('auto'); // 'auto' | 'light' | 'dark'
  const [editingTicker, setEditingTicker] = useState(false);
  const [tickerInput, setTickerInput] = useState(ticker);
  const tickerInputRef = useRef(null);

  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  const ML_API_URL = 'http://127.0.0.1:5000';
  const NODE_API_URL = 'http://127.0.0.1:5050';

  // Local frontend cache: keying + TTL helpers
  const [cacheBypassKey, setCacheBypassKey] = useState(null); // set to a cache key to force bypass for that key

  const LOCAL_CACHE_TTLS = {
    intraday: 300,
    short: 900,
    medium: 3600,
    long: 86400
  };

  function _localTTLForPeriod(period) {
    if (!period) return LOCAL_CACHE_TTLS.short;
    const p = String(period).toLowerCase();
    if (p === '1d' || p === '5d' || p.endsWith('m') || p.endsWith('h')) return LOCAL_CACHE_TTLS.intraday;
    if (p === '1mo' || p === '6mo') return LOCAL_CACHE_TTLS.medium;
    return LOCAL_CACHE_TTLS.long;
  }

  function _localCacheKey(ticker, period, interval) {
    return `chart_local::${String(ticker).toUpperCase()}::${period}::${interval}`;
  }

  // Helper to strip market suffix for display (.T, .BK)
  function stripSuffix(tickerStr) {
    if (!tickerStr) return tickerStr;
    const s = String(tickerStr).toUpperCase();
    if (s.endsWith('.T') || s.endsWith('.BK')) {
      return s.slice(0, -2);
    }
    return s;
  }

  function _loadLocalCache(key, ttlSeconds) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.payload || !obj.fetchedAt) return null;
      const fetched = new Date(obj.fetchedAt);
      if ((Date.now() - fetched.getTime()) / 1000 > ttlSeconds) {
        localStorage.removeItem(key);
        return null;
      }
      return obj.payload;
    } catch (e) {
      try { localStorage.removeItem(key); } catch (_) {}
      return null;
    }
  }

  function _saveLocalCache(key, payload) {
    try {
      const obj = { payload, fetchedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) { /* ignore quota errors */ }
  }

  const isHighFrequency = (intv) => intv.endsWith('m') || intv.endsWith('h');

  const shouldForceLine = (p, i) => {
    // For very short periods + fine intervals, candlesticks are messy
    if (p === '1d' && (i === '1m' || i === '5m')) return true;
    return false;
  };

  const getRangeBreaks = (symbol, interval) => {
    // Always skip weekends
    const breaks = [{ bounds: ['sat', 'mon'] }];

    // Only apply hour-breaks for intraday charts
    if (!interval || !(interval.endsWith('m') || interval.endsWith('h'))) return breaks;

    const s = (symbol || '').toUpperCase();
    // Japan tickers (.T)
    if (s.endsWith('.T')) {
      // Tokyo: market hours ~ 9:00-11:30 and 12:30-15:00 — skip overnight and lunch
      breaks.push({ bounds: [15, 9], pattern: 'hour' });
      breaks.push({ bounds: [11.5, 12.5], pattern: 'hour' });
      return breaks;
    }

    // Thailand tickers (.BK)
    if (s.includes('.BK')) {
      // Thailand: market hours ~ 9:30-16:30 — skip overnight
      breaks.push({ bounds: [16.5, 9.5], pattern: 'hour' });
      return breaks;
    }

    // Default: assume US hours 9:30-16:00
    breaks.push({ bounds: [16, 9.5], pattern: 'hour' }); // US Overnight
    return breaks;
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    // choose a safe default interval for the chosen period
    const allowed = ALLOWED_INTERVALS[newPeriod] || ['1d'];
    if (!allowed.includes(interval)) setInterval(allowed[0]);
  };

  useEffect(() => {
    // When interval/period change, we may force chart type
    if (shouldForceLine(period, interval)) setChartType('line');
  }, [interval, period]);

  useEffect(() => {
    // react to search params or navigation state (ticker changes)
    const stateTicker = (location && location.state && location.state.ticker) || null;
    const paramTicker = searchParams.get('ticker') || searchParams.get('symbol');
    if (stateTicker) setTicker(stateTicker);
    else if (paramTicker) setTicker(paramTicker);
  }, [searchParams, location]);

  // --- FETCH DATA ---
  useEffect(() => {
    let cancelled = false;
    async function chart() {
      setIsLoading(true);
      setError(null);
      try {
        const body = { ticker, period, interval };

        // local cache attempt (unless cacheBypassKey matches this key, which forces network refetch)
        const key = _localCacheKey(ticker, period, interval);
        const ttl = _localTTLForPeriod(period);
        let chartDataRaw = null;
        if (cacheBypassKey !== key) {
          chartDataRaw = _loadLocalCache(key, ttl);
        }

        if (!chartDataRaw) {
          const res = await fetch(`${ML_API_URL}/chart_full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const json = await res.json();

          // API returns an object keyed by ticker; handle accordingly
          chartDataRaw = json[ticker] || json[Object.keys(json)[0]] || json;
          // store processed payload into local cache for subsequent UI navigations
          if (chartDataRaw && chartDataRaw.dates) {
            _saveLocalCache(key, chartDataRaw);
            try { setCacheBypassKey(null); } catch (e) { }
          }
        } else {
          // we used local cache — allow subsequent UI code to render it
        }

        if (!chartDataRaw || !chartDataRaw.dates) {
          setError('No data returned');
          setIsLoading(false);
          return;
        }

        // Build traces
        const traces = [];

        // Candlestick or line
        if (chartType === 'candlestick') {
          traces.push({
            x: chartDataRaw.dates,
            open: chartDataRaw.open,
            high: chartDataRaw.high,
            low: chartDataRaw.low,
            close: chartDataRaw.close,
            type: 'candlestick',
            name: `${ticker} Price`,
            xaxis: 'x',
            yaxis: 'y'
          });
        } else {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.close, type: 'scatter', mode: 'lines', name: `${ticker} Close`, line: { shape: 'spline', width: 2 }, fill: '', xaxis: 'x', yaxis: 'y' });
        }

        // VWAP
        if (showVWAP && chartDataRaw.VWAP && chartDataRaw.VWAP.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.VWAP, type: 'scatter', mode: 'lines', name: 'VWAP', line: { dash: 'dash' }, xaxis: 'x', yaxis: 'y' });
        }

        // Bollinger bands (fill between lower and upper) + optional SMA
        if (chartDataRaw.bollinger_bands && chartDataRaw.bollinger_bands.sma) {
          const bb = chartDataRaw.bollinger_bands;
          if (showBollinger) {
            traces.push({ x: chartDataRaw.dates, y: bb.lower, type: 'scatter', mode: 'lines', name: 'BB Lower', line: { color: 'rgba(86, 119, 164, 0.4)', width: 0 }, fill: 'none', xaxis: 'x', yaxis: 'y' });
            traces.push({ x: chartDataRaw.dates, y: bb.upper, type: 'scatter', mode: 'lines', name: 'BB Upper', line: { color: 'rgba(86, 119, 164, 0.4)', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(86, 119, 164, 0.1)', xaxis: 'x', yaxis: 'y' });
          }
          if (showSMA) {
            traces.push({ x: chartDataRaw.dates, y: bb.sma, type: 'scatter', mode: 'lines', name: 'SMA (20)', line: { color: 'rgba(86,119,164,0.9)', width: 1 }, xaxis: 'x', yaxis: 'y' });
          }
        }

        // Anomaly markers
        if (chartDataRaw.anomaly_markers && chartDataRaw.anomaly_markers.dates && chartDataRaw.anomaly_markers.dates.length) {
          traces.push({ x: chartDataRaw.anomaly_markers.dates, y: chartDataRaw.anomaly_markers.y_values, type: 'scatter', mode: 'markers', marker: { color: 'red', size: 8 }, name: 'Anomalies', xaxis: 'x', yaxis: 'y' });
        }

        // Volume (secondary axis at bottom)
        if (showVolume && chartDataRaw.volume && chartDataRaw.volume.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.volume, type: 'bar', name: 'Volume', xaxis: 'x', yaxis: 'y3', marker: { color: 'rgba(100,100,100,0.6)' } });
        }

        // RSI / Score (small panel)
        if (showRSI && chartDataRaw.RSI && chartDataRaw.RSI.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.RSI, type: 'scatter', mode: 'lines', name: 'RSI', xaxis: 'x', yaxis: 'y2', line: { color: '#f39c12' } });
        }

        // Layout
        // Layout - compute domains based on which small panels are visible
        // Reserve space from bottom upwards: volume (y3), RSI (y2), price (y)
        const reserves = { volume: showVolume, rsi: showRSI };
        let y3Domain = [0, 0];
        let y2Domain = [0, 0];
        let yDomain = [0, 1];

        // Give more space to volume subplot so it doesn't visually overlap the main price chart.
        // When both volume and RSI are shown, allocate ~18% for volume and ~10% for RSI.
        if (reserves.volume && reserves.rsi) {
          y3Domain = [0, 0.18];
          y2Domain = [0.18, 0.28];
          yDomain = [0.28, 1];
        } else if (reserves.volume && !reserves.rsi) {
          y3Domain = [0, 0.18];
          y2Domain = [0, 0];
          yDomain = [0.18, 1];
        } else if (!reserves.volume && reserves.rsi) {
          y3Domain = [0, 0];
          y2Domain = [0, 0.18];
          yDomain = [0.18, 1];
        } else {
          y3Domain = [0, 0];
          y2Domain = [0, 0];
          yDomain = [0, 1];
        }

        const layoutObj = {
          margin: { t: 10, r: 8, l: 40, b: 28 },
          xaxis: { rangeslider: { visible: false }, rangebreaks: getRangeBreaks(ticker, interval) },
          yaxis: { domain: yDomain, title: 'Price' },
          yaxis2: { domain: y2Domain, title: 'RSI/Score' },
          yaxis3: { domain: y3Domain, anchor: 'x' },
          // default legend placement is hidden by default; toggle available in toolbar
          legend: { orientation: 'v', x: 0.99, xanchor: 'right', y: 0.98 },
          hovermode: 'x unified',
          plot_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          paper_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          font: { color: !isDarkTheme ? '#111111' : '#E0E0E0' }
        };

        if (!cancelled) {
          setData(traces);
          setLayout(layoutObj);
          setSidebarData({
            displayTicker: chartDataRaw.displayTicker || ticker,
            rawTicker: chartDataRaw.rawTicker || ticker,
            companyName: chartDataRaw.companyName || null,
            market: chartDataRaw.market || null,
            open: chartDataRaw.open ? chartDataRaw.open[chartDataRaw.open.length - 1] : null,
            high: chartDataRaw.high ? chartDataRaw.high[chartDataRaw.high.length - 1] : null,
            low: chartDataRaw.low ? chartDataRaw.low[chartDataRaw.low.length - 1] : null,
            close: chartDataRaw.close ? chartDataRaw.close[chartDataRaw.close.length - 1] : null,
            volume: chartDataRaw.volume ? chartDataRaw.volume[chartDataRaw.volume.length - 1] : 'N/A'
          });
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unknown error');
          setIsLoading(false);
        }
      }
    }
    chart();
    return () => { cancelled = true; };
  }, [ticker, period, interval, chartType, showVolume, showBollinger, isDarkTheme, cacheBypassKey]);

  // click-outside & escape handling for indicator panel
  useEffect(() => {
    function handler(e) {
      // indicators panel: close if open and clicked outside
      if (indicatorsOpen) {
        const panel = indicatorPanelRef.current;
        const toggle = indicatorsToggleRef.current;
        if (panel && !panel.contains(e.target) && toggle && !toggle.contains(e.target)) {
          setIndicatorsOpen(false);
        }
      }

      // sidebar overlay: close if open and clicked outside sidebar and not on the toggle
      if (sidebarOverlay) {
        const sidebarEl = sidebarRef.current;
        const toggle = sidebarToggleRef.current;
        if (sidebarEl && !sidebarEl.contains(e.target) && toggle && !toggle.contains(e.target)) {
          setSidebarOverlay(false);
        }
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        setIndicatorsOpen(false);
        setSidebarOverlay(false);
      }
    }

    // observe body class changes to sync theme with navbar
    const bodyObserver = new MutationObserver(() => {
      const dark = document.body.classList.contains('dark');
      setIsDarkTheme(dark);
      // toggle 'light' classname on chart container for existing light-mode CSS
      const el = chartContainerRef.current;
      if (el) el.classList.toggle('light', !dark);
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);

    // initialize chart container class
    if (chartContainerRef.current) chartContainerRef.current.classList.toggle('light', !document.body.classList.contains('dark'));

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
      bodyObserver.disconnect();
    };
  }, [indicatorsOpen, sidebarOverlay]);

  // keep the chart-page-container in-sync when fullscreen changes and update state
  useEffect(() => {
    function onFsChange() {
      const fsEl = document.fullscreenElement;
      const isFs = !!fsEl && (fsEl === mainRef.current || (mainRef.current && mainRef.current.contains(fsEl)));
      setIsFullscreen(isFs);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Force Plotly to resize when entering/exiting fullscreen so it uses the available area
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
        if (gd && window.Plotly && window.Plotly.Plots && window.Plotly.Plots.resize) window.Plotly.Plots.resize(gd);
        window.dispatchEvent(new Event('resize'));
      } catch (e) { }
    }, 160);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  // update CSS variable for toolbar height when collapsed to avoid unused reserved space
  useEffect(() => {
    try {
      const val = toolbarCollapsed ? '40px' : '56px';
      document.documentElement.style.setProperty('--toolbar-height', val);
      // force a resize so Plotly reflows after toolbar size change
      setTimeout(() => {
        try {
          const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
          if (gd && window.Plotly && window.Plotly.Plots && window.Plotly.Plots.resize) window.Plotly.Plots.resize(gd);
          window.dispatchEvent(new Event('resize'));
        } catch (e) { }
      }, 140);
    } catch (e) {}
  }, [toolbarCollapsed]);

  // load persisted UI preferences on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('chartPrefs') || '{}');
      if (saved.sidebarCollapsed !== undefined) setSidebarCollapsed(!!saved.sidebarCollapsed);
      if (saved.showVolume !== undefined) setShowVolume(!!saved.showVolume);
      if (saved.showBollinger !== undefined) setShowBollinger(!!saved.showBollinger);
      if (saved.showRSI !== undefined) setShowRSI(!!saved.showRSI);
      if (saved.showVWAP !== undefined) setShowVWAP(!!saved.showVWAP);
      if (saved.showSMA !== undefined) setShowSMA(!!saved.showSMA);
      if (saved.sidebarOverlay !== undefined) setSidebarOverlay(!!saved.sidebarOverlay);
      if (saved.plotlyTheme) setPlotlyTheme(saved.plotlyTheme);
    } catch (e) { }
  }, []);

  // focus input when entering edit mode
  useEffect(() => {
    if (editingTicker && tickerInputRef.current) {
      tickerInputRef.current.focus();
      tickerInputRef.current.select();
    }
  }, [editingTicker]);

  // persist preferences whenever they change
  useEffect(() => {
    const prefs = { sidebarCollapsed, showVolume, showBollinger, showRSI, showVWAP, showSMA, sidebarOverlay, plotlyTheme };
    try { localStorage.setItem('chartPrefs', JSON.stringify(prefs)); } catch (e) { }
  }, [sidebarCollapsed, showVolume, showBollinger, showRSI, showVWAP, showSMA, sidebarOverlay, plotlyTheme]);

  // trigger a resize so Plotly redraws correctly when sidebar collapses/expands
  useEffect(() => {
    const t = setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 120);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  // trigger a resize when toolbar collapses/expands so Plotly can reflow and avoid being blocked
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      try {
        const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
        if (gd && window.Plotly && window.Plotly.Plots && window.Plotly.Plots.resize) {
          window.Plotly.Plots.resize(gd);
        }
      } catch (e) { /* ignore */ }
    }, 140);
    return () => clearTimeout(t);
  }, [toolbarCollapsed]);

  // trigger a resize when overlay toggles so Plotly can reflow and gaps disappear
  useEffect(() => {
    const t = setTimeout(() => { 
      window.dispatchEvent(new Event('resize'));
      try {
        // attempt more aggressive Plotly relayout/resize if Plotly is available
        const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
        if (gd && window.Plotly && window.Plotly.Plots && window.Plotly.Plots.resize) {
          window.Plotly.Plots.resize(gd);
        }
      } catch (e) { /* ignore */ }
    }, 140);
    return () => clearTimeout(t);
  }, [sidebarOverlay]);

  // when theme flips, force Plotly to relayout as well (keeps colors/sizing in sync)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const gd = plotRef.current && (plotRef.current.el || plotRef.current.getPlot());
        if (gd && window.Plotly && window.Plotly.Plots && window.Plotly.Plots.resize) {
          window.Plotly.Plots.resize(gd);
        }
      } catch (e) {}
    }, 120);
    return () => clearTimeout(t);
  }, [isDarkTheme]);

  // Subscription Logic (unchanged)
  useEffect(() => {
    async function checkSubscription() {
      if (!isLoggedIn || !user || !ticker) {
        setIsSubscribed(false);
        return;
      }

      try {
        const res = await fetch(
          `${NODE_API_URL}/subscribers/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lineId: user.userId, ticker }),
          }
        );

        const data = await res.json();
        setIsSubscribed(data.subscribed);
      } catch (err) {
        console.error("Error checking subscription:", err);
        setIsSubscribed(false);
      }
    }

    checkSubscription();
  }, [ticker, isLoggedIn, user]);

  const handleSubscribe = async () => {
    if (!isLoggedIn) {
      alert('Please log in first to subscribe to alerts');
      navigate('/login');
      return;
    }

    setSubLoading(true);

    const body = { lineId: user?.userId || "anonymous", tickers: [ticker] };

    try {
      // Send a POST request to the backend
      const res = await fetch(`${NODE_API_URL}/subscribers/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Check if the response is successful (status 2xx)
      if (!res.ok) {
        throw new Error("Failed to subscribe");
      }

      // Assuming the response is a success message or updated data
      const responseData = await res.json();

      // Handle successful subscription (you can update this as per the API response)
      setIsSubscribed(true);

      // Optionally, you can do something with `responseData`, such as updating state
      console.log("Subscription success:", responseData);
    } catch (error) {
      // Handle error from the backend request
      console.error("Subscription error:", error.message);
      setIsSubscribed(false); // Update UI to indicate failure
    } finally {
      // Ensure loading state is updated regardless of success/failure
      setSubLoading(false);
    }
  };


  const forcedLineMode = shouldForceLine(period, interval);

  return (
    <div className={`chart-page-container ${sidebarOverlay ? 'overlay-mode' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <aside ref={sidebarRef} className={`chart-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOverlay ? 'overlay' : ''}`}>
        <div className="sidebar-header">
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: sidebarCollapsed && sidebarOverlay ? '100%' : (sidebarCollapsed ? '100%' : 'auto')}}>
            {/* Editable ticker: click to edit - HIDE when in overlay mode and collapsed */}
            {!editingTicker && !(sidebarCollapsed && sidebarOverlay) ? (
              <h3 style={{margin:0, cursor: 'pointer', flex: sidebarCollapsed && !sidebarOverlay ? 1 : 'none'}} onClick={() => { setEditingTicker(true); setTickerInput(sidebarData?.rawTicker || ticker); }}>{sidebarData ? stripSuffix(sidebarData.displayTicker) : stripSuffix(ticker)}</h3>
              ) : editingTicker ? (
              <input
                ref={tickerInputRef}
                style={{ fontSize: sidebarCollapsed && !sidebarOverlay ? '0.9rem' : '1.5rem', fontWeight: 700, padding: '4px 6px', flex: sidebarCollapsed && !sidebarOverlay ? 1 : 'none' }}
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onBlur={() => {
                  setEditingTicker(false);
                  const newT = tickerInput && tickerInput.trim().toUpperCase();
                  if (newT && newT !== ticker) {
                    setTicker(newT);
                    try {
                      const params = new URLSearchParams(searchParams);
                      params.set('ticker', newT);
                      setSearchParams(params, { replace: true });
                    } catch (e) { }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingTicker(false);
                    const newT = tickerInput && tickerInput.trim().toUpperCase();
                    if (newT && newT !== ticker) {
                      setTicker(newT);
                      try {
                        const params = new URLSearchParams(searchParams);
                        params.set('ticker', newT);
                        setSearchParams(params, { replace: true });
                      } catch (err) { }
                    }
                  }
                  if (e.key === 'Escape') { setEditingTicker(false); setTickerInput(sidebarData?.rawTicker || ticker); }
                }}
              />
            ) : null}
            {/* Show hamburger menu button when in overlay mode and collapsed */}
            {sidebarCollapsed && sidebarOverlay ? (
              <button className="hamburger-btn" onClick={() => setSidebarCollapsed(s => !s)} aria-label="Toggle sidebar" style={{flex: 1}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" fill="currentColor" />
                </svg>
              </button>
            ) : !sidebarCollapsed || (sidebarCollapsed && !sidebarOverlay) ? (
              <button className="collapse-btn" onClick={() => setSidebarCollapsed(s => !s)} aria-label="Toggle sidebar">
                {/* inline SVG chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform={sidebarCollapsed ? 'rotate(0 12 12)' : 'rotate(180 12 12)'} />
                </svg>
              </button>
            ) : null}
          </div>
          {sidebarData && !sidebarCollapsed && <p className="company-name"><strong>{sidebarData.companyName}</strong></p>}
          {sidebarData && !sidebarCollapsed && <p className="market-name"><strong>Market:</strong> {sidebarData.market}</p>}
        </div>
        <div className="sidebar-data">
          {sidebarData ? (
            <>
              {/* show full data only when not collapsed */}
              {!sidebarCollapsed && (
                <>
                  <div><span>Open</span><strong>{sidebarData.open?.toFixed?.(2)}</strong></div>
                  <div><span>High</span><strong>{sidebarData.high?.toFixed?.(2)}</strong></div>
                  <div><span>Low</span><strong>{sidebarData.low?.toFixed?.(2)}</strong></div>
                  <div><span>Close</span><strong>{sidebarData.close?.toFixed?.(2)}</strong></div>
                  <div><span>Volume</span><strong>{sidebarData.volume !== 'N/A' ? (sidebarData.volume ? new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(sidebarData.volume) : 'N/A') : 'N/A'}</strong></div>
                </>
              )}
              {sidebarCollapsed && <div style={{height: '64px'}} aria-hidden></div>}
            </>
          ) : <p>Loading data...</p>}
        </div>
        {/* Historical data box (placeholder) */}
        <div className="historical-data">
          <h4>Historical Data</h4>
          <div className="hist-grid">
            <div className="hist-card">
              <strong>Balance Sheet</strong>
              <div className="hist-placeholder">TBD</div>
            </div>
            <div className="hist-card">
              <strong>Income Statement</strong>
              <div className="hist-placeholder">TBD</div>
            </div>
            <div className="hist-card">
              <strong>Price Change</strong>
              <div className="hist-placeholder">+0.0% / -0.0%</div>
            </div>
          </div>
        </div>

        {/* Top news placeholder */}
        <div className="top-news">
          <h4>Top News</h4>
          <div className="news-placeholder">No news loaded. Add API integration here.</div>
        </div>
        <button className="btn btn-primary" onClick={handleSubscribe} disabled={isSubscribed || subLoading} style={{ backgroundColor: isSubscribed ? '#28a745' : '' }}>
          {subLoading ? '...' : (isSubscribed ? 'Subscribed ✓' : 'Subscribe to Alerts')}
        </button>
      </aside>

      <main className="chart-main" ref={mainRef}>
        {isLoading && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-panel">
              {/* Compact branded card: small two-bar mark + label (matches screenshot) */}
              <div className="brand-mark" aria-hidden>
                <span className="mark-bar" />
                <span className="mark-bar small" />
              </div>
              <div className="loading-text">Loading chart…</div>
            </div>
          </div>
        )}
        {error && <div className="error-overlay">Error: {error}</div>}
        {/* Skeleton placeholder sits behind the overlay so users see a faint chart while loading */}
        {isLoading && (
          <div className="chart-plot-wrapper skeleton-plot" aria-hidden>
            <div className="skeleton-grid">
              <div className="skeleton-upper">
                <div className="skeleton-line short"></div>
                <div className="skeleton-line long"></div>
                <div className="skeleton-line med"></div>
                <div className="skeleton-line long"></div>
              </div>
              <div className="skeleton-volume">
                <div className="skeleton-bar" style={{height: '40%'}}></div>
                <div className="skeleton-bar" style={{height: '70%'}}></div>
                <div className="skeleton-bar" style={{height: '30%'}}></div>
                <div className="skeleton-bar" style={{height: '85%'}}></div>
                <div className="skeleton-bar" style={{height: '55%'}}></div>
                <div className="skeleton-bar" style={{height: '20%'}}></div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <div ref={chartContainerRef} className="chart-plot-wrapper">
            {/* Decide actual theme for Plotly: auto -> sync with global isDarkTheme, else explicit */}
              {(() => {
              // Determine which theme to use: plotlyTheme selector can override isDarkTheme
              let effectiveTheme;
              if (plotlyTheme === 'auto') {
                effectiveTheme = isDarkTheme;
              } else if (plotlyTheme === 'dark') {
                effectiveTheme = true;
              } else {
                effectiveTheme = false;
              }

              // Read CSS defined theme colors so Plotly matches the exact app theme.
              // Prefer values on `document.body` (where `body.dark` may override variables), fall back to :root.
              const bodyStyle = (typeof window !== 'undefined') ? getComputedStyle(document.body) : null;
              const root = (typeof window !== 'undefined') ? getComputedStyle(document.documentElement) : null;
              const cardBgRaw = (bodyStyle && bodyStyle.getPropertyValue('--card-bg')) || (root && root.getPropertyValue('--card-bg')) || (root && root.getPropertyValue('--bg-secondary')) || (root && root.getPropertyValue('--bg-main')) || '';
              const textRaw = (bodyStyle && bodyStyle.getPropertyValue('--text-primary')) || (root && root.getPropertyValue('--text-primary')) || '';
              const cardBg = cardBgRaw ? cardBgRaw.trim() : null;
              const textColor = textRaw ? textRaw.trim() : (effectiveTheme ? '#E0E0E0' : '#111');
              const plotBgColor = cardBg || (effectiveTheme ? '#071024' : '#ffffff');

              const finalColors = { plot_bgcolor: plotBgColor, paper_bgcolor: plotBgColor, font: { color: (textColor || (effectiveTheme ? '#E0E0E0' : '#111')) } };

              // tweak domains slightly to give volume more vertical space to avoid overlap
              // Layout is computed above; we adjust small panels here if necessary via layout passed in
              return (
                <Plot
                  ref={plotRef}
                  data={data.map(trace => {
                    // adjust trace colors for theme where sensible
                    if (trace.name && trace.name.toLowerCase().includes('close') && !trace.line?.color) {
                      const primaryRaw = (bodyStyle && bodyStyle.getPropertyValue('--primary')) || (root && root.getPropertyValue('--primary')) || (root && root.getPropertyValue('--primary-btn')) || '';
                      const rootColor = primaryRaw ? primaryRaw.trim() : null;
                      trace.line = { ...trace.line, color: (rootColor || (effectiveTheme ? '#00aaff' : '#0b63d6')) };
                    }
                    if (trace.type === 'bar' && trace.name && trace.name.toLowerCase().includes('volume')) {
                      trace.marker = { ...trace.marker, color: (effectiveTheme ? 'rgba(100,100,100,0.6)' : 'rgba(30,30,30,0.12)') };
                    }
                    return trace;
                  })}
                  layout={{ ...layout, ...finalColors, showlegend: showLegend }}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                  config={{ responsive: true, displayModeBar: false }}
                />
              );
            })()}
          </div>
        )}

        {/* Toolbar moved BELOW the chart */}
        <div className={`chart-toolbar floating ${toolbarCollapsed ? 'collapsed' : ''}`}>
          <button className="toolbar-collapse-toggle" onClick={() => setToolbarCollapsed(s => !s)} aria-label="Toggle toolbar">{toolbarCollapsed ? '▸' : '▾'}</button>
          <div className="toolbar-group">
            <label className="toolbar-label" htmlFor="range-select">Range:</label>
            <select id="range-select" className="toolbar-select" value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
              {['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y'].map(p => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label" htmlFor="interval-select">Interval:</label>
            <select id="interval-select" className="toolbar-select" value={interval} onChange={(e) => setInterval(e.target.value)}>
              {(ALLOWED_INTERVALS[period] || ['1d']).map(i => (
                <option key={i} value={i}>{i.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Type:</span>
            <button className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')} disabled={forcedLineMode}
              title={forcedLineMode ? 'Candlesticks unavailable for intraday' : ''}
              style={{ opacity: forcedLineMode ? 0.3 : 1, cursor: forcedLineMode ? 'not-allowed' : 'pointer' }}>
              Candles
            </button>
            <button className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
            {/* BB control moved to Indicators panel */}
          </div>
          <div className="toolbar-group">
            <button ref={indicatorsToggleRef} id="indicators-toggle" className={`toolbar-btn ${indicatorsOpen ? 'active' : ''}`} onClick={() => setIndicatorsOpen(!indicatorsOpen)}>Indicators ▾</button>
          </div>

          <div className="toolbar-group">
            <label className="toolbar-label" htmlFor="plotly-theme-select">Plotly Theme:</label>
            <select id="plotly-theme-select" className="toolbar-select" value={plotlyTheme} onChange={(e) => setPlotlyTheme(e.target.value)}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="toolbar-group">
            <button ref={sidebarToggleRef} className={`toolbar-btn ${sidebarOverlay ? 'active' : ''}`} title="Toggle sidebar overlay" onClick={() => setSidebarOverlay(s => !s)}>{sidebarOverlay ? 'Overlay On' : 'Overlay Off'}</button>
            <button className="toolbar-btn" title="Refresh" onClick={() => {
              try {
                const key = _localCacheKey(ticker, period, interval);
                localStorage.removeItem(key);
                setCacheBypassKey(key);
                setIsLoading(true);
              } catch (e) { }
            }}>Refresh</button>
            <button className={`toolbar-btn ${showLegend ? 'active' : ''}`} title="Toggle legend" onClick={() => setShowLegend(s => !s)}>{showLegend ? 'Legend On' : 'Legend Off'}</button>
            <button className="toolbar-btn" title="Fullscreen" onClick={async () => {
              try {
                // Request fullscreen on the chart container
                const el = chartContainerRef.current || mainRef.current;
                if (!document.fullscreenElement) {
                  if (el && el.requestFullscreen) await el.requestFullscreen();
                  setIsFullscreen(true);
                } else {
                  if (document.exitFullscreen) await document.exitFullscreen();
                  setIsFullscreen(false);
                }
              } catch (e) { }
            }}>{isFullscreen ? 'Exit FS' : 'Fullscreen'}</button>
          </div>
        </div>
      </main>

      {/* Indicator overlay panel (positioned absolutely relative to page) */}
      <div ref={indicatorPanelRef} className={`indicator-panel ${indicatorsOpen ? 'open' : ''}`}>
        <label className="indicator-item"><input type="checkbox" checked={showVolume} onChange={() => setShowVolume(!showVolume)} /> <span>Volume</span></label>
        <label className="indicator-item"><input type="checkbox" checked={showBollinger} onChange={() => setShowBollinger(!showBollinger)} /> <span>Bollinger Bands</span></label>
        <label className="indicator-item"><input type="checkbox" checked={showSMA} onChange={() => setShowSMA(!showSMA)} /> <span>SMA (20)</span></label>
        <label className="indicator-item"><input type="checkbox" checked={showRSI} onChange={() => setShowRSI(!showRSI)} /> <span>RSI</span></label>
        <label className="indicator-item"><input type="checkbox" checked={showVWAP} onChange={() => setShowVWAP(!showVWAP)} /> <span>VWAP</span></label>
      </div>
    </div>
  );
}
