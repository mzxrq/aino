import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../css/AnomalyChart.css';
import { useChartPreferences } from '../hooks/useChartPreferences';
import { useChartData } from '../hooks/useChartData';
import { useMetadataEnrichment } from '../hooks/useMetadataEnrichment';
import { useFullscreen } from '../hooks/useFullscreen';
import { ChartSidebar } from '../components/chart/ChartSidebar';
import { ChartToolbar } from '../components/chart/ChartToolbar';
import { IndicatorPanel } from '../components/chart/IndicatorPanel';
import { PlotContainer } from '../components/chart/PlotContainer';
import { ChartLegend } from '../components/chart/ChartLegend';

function stripSuffix(t) {
  if (!t) return t;
  const s = String(t).toUpperCase();
  if (s.endsWith('.T') || s.endsWith('.BK')) return s.slice(0, -2);
  return s;
}

function deriveMarketFromTicker(t) {
  if (!t) return null;
  const s = String(t).toUpperCase();
  if (s.endsWith('.T')) return 'JP';
  if (s.endsWith('.BK')) return 'TH';
  return 'US';
}

export default function AnomalyChart() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialTicker = (location && location.state && location.state.ticker) || searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL';
  const [ticker, setTicker] = useState(initialTicker);
  const [period, setPeriod] = useState('1d');
  const [interval, setInterval] = useState('5m');
  const [chartType, setChartType] = useState('line');
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const chartContainerRef = useRef(null);
  const indicatorPanelRef = useRef(null);
  const indicatorsToggleRef = useRef(null);
  const sidebarToggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const [isDarkTheme, setIsDarkTheme] = useState(() => typeof document !== 'undefined' && document.body.classList.contains('dark'));
  const [hoverData, setHoverData] = useState(null);
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  // Preferences
  const {
    sidebarCollapsed, setSidebarCollapsed,
    sidebarOverlay, setSidebarOverlay,
    sidebarDock, setSidebarDock,
    showVolume, setShowVolume,
    showBollinger, setShowBollinger,
    showRSI, setShowRSI,
    showVWAP, setShowVWAP,
    showSMA, setShowSMA,
    plotlyTheme, setPlotlyTheme,
    showLegend, setShowLegend,
    plotlyLegendPos, setPlotlyLegendPos,
    toolbarCollapsed, setToolbarCollapsed,
    toolbarDock, setToolbarDock,
    toolbarPos, setToolbarPos,
    legendPos, setLegendPos,
  } = useChartPreferences();

  const { data, layout, error, isLoading, sidebarCore, refresh, shouldForceLine, traceList } = useChartData({
    ticker, period, interval, chartType, showVolume, showBollinger, showRSI, showVWAP, showSMA, isDarkTheme, ML_API_URL: 'http://127.0.0.1:5000', showLegend, plotlyLegendPos
  });

  const meta = useMetadataEnrichment(ticker, 'http://127.0.0.1:5050', deriveMarketFromTicker, stripSuffix);
  const { isFullscreen, toggleFullscreen } = useFullscreen(chartContainerRef);

  // Merge sidebar data (core + enriched meta)
  const sidebarData = sidebarCore ? {
    ...sidebarCore,
    companyName: sidebarCore.companyName || meta.companyName,
    market: sidebarCore.market || meta.market || deriveMarketFromTicker(ticker)
  } : null;

  // Toggle traces in Plotly by keyword mapping
  function toggleTrace(key) {
    try {
      const gd = document.querySelector('.js-plotly-plot');
      if (!gd || !window.Plotly) return;
      const idxs = [];
      const keyLower = String(key).toLowerCase();
      if (traceList && traceList.length) {
        traceList.forEach(t => {
          const id = (t.id || '').toString().toLowerCase();
          const nm = (t.name || '').toString().toLowerCase();
          if (id === keyLower || id.includes(keyLower) || nm.includes(keyLower)) idxs.push(t.index);
        });
      }
      // Fallback to name/type heuristics if traceList failed to match
      if (!idxs.length) {
        gd.data.forEach((t, i) => {
          const name = (t.name || '').toString().toLowerCase();
          if (keyLower === 'price') {
            if (t.type === 'candlestick' || name.includes('close') || name.includes('price')) idxs.push(i);
          } else if (keyLower === 'volume') {
            if (t.type === 'bar' || name.includes('volume')) idxs.push(i);
          } else if (keyLower === 'rsi') {
            if (name.includes('rsi')) idxs.push(i);
          } else if (keyLower === 'vwap') {
            if (name.includes('vwap')) idxs.push(i);
          } else if (keyLower === 'bb_upper' || keyLower === 'bbt') {
            if (name.includes('upper') || name.includes('bb') && name.includes('upper')) idxs.push(i);
          } else if (keyLower === 'bb_lower' || keyLower === 'bbl') {
            if (name.includes('lower') || name.includes('bb') && name.includes('lower')) idxs.push(i);
          } else if (keyLower === 'bb_sma' || keyLower === 'bbm') {
            if (name.includes('sma') || name.includes('sma (20)')) idxs.push(i);
          }
        });
      }
      if (!idxs.length) return;
      idxs.forEach(i => {
        const cur = gd.data[i].visible;
        const next = (cur === true || cur === undefined) ? 'legendonly' : true;
        window.Plotly.restyle(gd, { visible: next }, [i]);
      });
    } catch (e) { console.error(e); }
  }

  // Live price + market hours
  const [livePrice, setLivePrice] = useState(null);
  const [prevClose, setPrevClose] = useState(null);
  const [marketInfo, setMarketInfo] = useState({ isOpen: false, openLocal: null, closeLocal: null, label: null });

  function isUSDst(date) {
    const year = date.getUTCFullYear();
    // DST starts second Sunday in March
    function nthDowOfMonthUTC(n, dow, month) {
      const d = new Date(Date.UTC(year, month, 1));
      const firstDow = d.getUTCDay();
      const diff = (dow - firstDow + 7) % 7;
      d.setUTCDate(1 + diff + 7 * (n - 1));
      return d;
    }
    const dstStart = nthDowOfMonthUTC(2, 0, 2); // March (2), Sunday (0)
    dstStart.setUTCHours(7, 0, 0, 0); // 3:00 AM local shifts -> 07:00 UTC reference
    const dstEnd = nthDowOfMonthUTC(1, 0, 10); // November (10), Sunday (0)
    dstEnd.setUTCHours(6, 0, 0, 0); // 2:00 AM local shifts -> 06:00 UTC
    return date >= dstStart && date < dstEnd;
  }

  function computeMarketSchedule(market) {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun ... 6=Sat
    let label = 'Market';
    let openHourLocal = null;
    let openMinuteLocal = 0;
    let closeHourLocal = null;
    let closeMinuteLocal = 0;
    let offsetHours = 0; // market offset from UTC

    if (market === 'US') {
      // NYSE/Nasdaq: 9:30-16:00 ET; ET offset depends on DST
      const dst = isUSDst(now);
      offsetHours = dst ? -4 : -5; // ET relative to UTC
      openHourLocal = 9; openMinuteLocal = 30; closeHourLocal = 16; closeMinuteLocal = 0;
      label = 'US Market';
    } else if (market === 'JP') {
      // Tokyo: two sessions 09:00-11:30 and 12:30-15:00 JST (UTC+9)
      offsetHours = 9;
      // We'll represent sessions separately later
      openHourLocal = 9; openMinuteLocal = 0; closeHourLocal = 15; closeMinuteLocal = 0;
      label = 'JP (TSE/TYO)';
    } else if (market === 'TH') {
      // SET simplified: 10:00-17:00 BKK (UTC+7)
      offsetHours = 7;
      openHourLocal = 10; closeHourLocal = 17;
      label = 'TH (SET)';
    }

    // If market unknown, return neutral
    if (openHourLocal == null || closeHourLocal == null) {
      return { isOpen: false, openLocal: null, closeLocal: null, label };
    }

    // Compute market-local time by applying offset to UTC epoch and using UTC getters
    const nowUtcMs = Date.now();
    const marketMs = nowUtcMs + offsetHours * 3600 * 1000;
    const marketNow = new Date(marketMs);
    const isWeekend = marketNow.getUTCDay() === 0 || marketNow.getUTCDay() === 6;

    // For markets with single contiguous sessions (US, TH), reuse simple check
    if (market === 'US' || market === 'TH') {
      const openMarket = new Date(marketMs);
      openMarket.setUTCHours(openHourLocal, openMinuteLocal, 0, 0);
      const closeMarket = new Date(marketMs);
      closeMarket.setUTCHours(closeHourLocal, closeMinuteLocal, 0, 0);
      const isOpen = !isWeekend && marketNow.getTime() >= openMarket.getTime() && marketNow.getTime() <= closeMarket.getTime();
      const openLocal = new Date(openMarket.getTime()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const closeLocal = new Date(closeMarket.getTime()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { isOpen, openLocal, closeLocal, label };
    }

    // For JP, handle two sessions: morning 09:00-11:30, afternoon 12:30-15:00
    if (market === 'JP') {
      const morningOpen = new Date(marketMs); morningOpen.setUTCHours(9, 0, 0, 0);
      const morningClose = new Date(marketMs); morningClose.setUTCHours(11, 30, 0, 0);
      const afternoonOpen = new Date(marketMs); afternoonOpen.setUTCHours(12, 30, 0, 0);
      const afternoonClose = new Date(marketMs); afternoonClose.setUTCHours(15, 0, 0, 0);
      const isOpen = !isWeekend && ((marketNow.getTime() >= morningOpen.getTime() && marketNow.getTime() <= morningClose.getTime()) || (marketNow.getTime() >= afternoonOpen.getTime() && marketNow.getTime() <= afternoonClose.getTime()));
      const openLocal = `${new Date(morningOpen.getTime()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} / ${new Date(afternoonOpen.getTime()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
      const closeLocal = `${new Date(morningClose.getTime()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} / ${new Date(afternoonClose.getTime()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
      return { isOpen, openLocal, closeLocal, label };
    }
  }

  useEffect(() => {
    const schedule = computeMarketSchedule(sidebarData?.market || deriveMarketFromTicker(ticker));
    setMarketInfo(schedule);
  }, [ticker, sidebarData?.market]);

  useEffect(() => {
    let timer;
    async function fetchLive() {
      try {
        const url = `http://127.0.0.1:5000/chart?ticker=${encodeURIComponent(ticker)}&period=1d&interval=1m`;
        const res = await fetch(url);
        const json = await res.json();
        const payload = json[ticker] || json[Object.keys(json)[0]] || json;
        if (payload?.close?.length) {
          const last = payload.close[payload.close.length - 1];
          const prev = payload.close[payload.close.length - 2] ?? last;
          setLivePrice(last);
          setPrevClose(prev);
        }
      } catch {}
    }
    fetchLive();
    timer = setInterval(fetchLive, 30000);
    return () => clearInterval(timer);
  }, [ticker]);

  // Ensure legend restores to bottom-left when toggled back on
  useEffect(() => {
    if (showLegend) {
      setLegendPos(null);
      try { setPlotlyLegendPos('bottom-left'); } catch {}
    }
  }, [showLegend]);

  // React to URL state changes for ticker
  useEffect(() => {
    const stateTicker = (location && location.state && location.state.ticker) || null;
    const paramTicker = searchParams.get('ticker') || searchParams.get('symbol');
    if (stateTicker) setTicker(stateTicker); else if (paramTicker) setTicker(paramTicker);
  }, [searchParams, location]);

  // Force line when needed
  useEffect(() => { if (shouldForceLine(period, interval)) setChartType('line'); }, [interval, period, shouldForceLine]);

  // Body class observer to sync theme
  useEffect(() => {
    const bodyObserver = new MutationObserver(() => {
      const dark = document.body.classList.contains('dark');
      setIsDarkTheme(dark);
      const el = chartContainerRef.current;
      if (el) el.classList.toggle('light', !dark);
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (chartContainerRef.current) chartContainerRef.current.classList.toggle('light', !document.body.classList.contains('dark'));
    return () => bodyObserver.disconnect();
  }, []);

  // Auto disable overlay on mobile breakpoints
  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth;
      if (sidebarOverlay && (w <= 430 || w <= 414)) setSidebarOverlay(false);
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [sidebarOverlay]);

  // Outside click + escape for indicator panel & overlay
  useEffect(() => {
    function handler(e) {
      if (indicatorsOpen) {
        const panel = indicatorPanelRef.current; const toggle = indicatorsToggleRef.current;
        if (panel && !panel.contains(e.target) && toggle && !toggle.contains(e.target)) setIndicatorsOpen(false);
      }
      if (sidebarOverlay) {
        const sEl = sidebarRef.current; const tEl = sidebarToggleRef.current;
        if (sEl && !sEl.contains(e.target) && tEl && !tEl.contains(e.target)) setSidebarOverlay(false);
      }
    }
    function onKey(e){ if(e.key==='Escape'){ setIndicatorsOpen(false); setSidebarOverlay(false);} }
    document.addEventListener('mousedown', handler); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [indicatorsOpen, sidebarOverlay]);

  // Toolbar height variable
  useEffect(() => { try { document.documentElement.style.setProperty('--toolbar-height', toolbarCollapsed ? '40px' : '56px'); } catch {} }, [toolbarCollapsed]);
  // Resize triggers
  useEffect(() => { const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 120); return () => clearTimeout(t); }, [sidebarCollapsed]);
  useEffect(() => { const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 140); return () => clearTimeout(t); }, [toolbarCollapsed, sidebarOverlay]);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  useEffect(() => {
    async function checkSubscription() {
      if (!isLoggedIn || !user || !ticker) { setIsSubscribed(false); return; }
      try {
        const res = await fetch('http://127.0.0.1:5050/subscribers/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: user?.id || user?.userId, ticker }) });
        const d = await res.json(); setIsSubscribed(d.subscribed);
      } catch { setIsSubscribed(false); }
    }
    checkSubscription();
  }, [ticker, isLoggedIn, user]);

  async function handleSubscribe() {
    if (!isLoggedIn) { alert('Please log in first to subscribe to alerts'); navigate('/login'); return; }
    setSubLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:5050/subscribers/', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: user?.id || user?.userId || 'anonymous', tickers:[ticker] }) });
      if(!res.ok) throw new Error('Failed to subscribe');
      await res.json(); setIsSubscribed(true);
    } catch (e) { console.error(e); setIsSubscribed(false); } finally { setSubLoading(false); }
  }

  function formatPrice(p) {
    if (p == null || Number.isNaN(p)) return '—';
    const isInt = Math.floor(p) === p;
    const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: isInt ? 0 : 2, maximumFractionDigits: isInt ? 0 : 2 });
    return fmt.format(p);
  }

  // Expose formatter without rendering it as a React child
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__formatPrice = formatPrice;
    }
  }, [formatPrice]);

  const forcedLineMode = shouldForceLine(period, interval);

  return (
    <div className={`chart-page-container ${sidebarOverlay ? 'overlay-mode' : ''} ${isFullscreen ? 'fullscreen' : ''} ${sidebarDock === 'right' ? 'sidebar-right' : ''}`}>
      <ChartSidebar
        sidebarData={sidebarData}
        collapsed={sidebarCollapsed}
        overlay={sidebarOverlay}
        dockSide={sidebarDock}
        setCollapsed={setSidebarCollapsed}
        setSidebarOverlay={setSidebarOverlay}
        onTickerChange={(newT) => {
          setTicker(newT);
          try { const params = new URLSearchParams(searchParams); params.set('ticker', newT); setSearchParams(params, { replace: true }); } catch {}
        }}
        stripSuffix={stripSuffix}
        livePrice={livePrice}
        prevClose={prevClose}
        marketInfo={marketInfo}
        footerExtra={(
          <button className="btn btn-primary" onClick={handleSubscribe} disabled={isSubscribed || subLoading} style={{ backgroundColor: isSubscribed ? '#28a745' : '' }}>
            {subLoading ? '...' : (isSubscribed ? 'Subscribed ✓' : 'Subscribe to Alerts')}
          </button>
        )}
      />
      <main className="chart-main" ref={chartContainerRef}>
        {isLoading && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-panel">
              <div className="brand-mark" aria-hidden><span className="mark-bar"/><span className="mark-bar small"/></div>
              <div className="loading-text">Loading chart…</div>
            </div>
          </div>
        )}
        {error && <div className="error-overlay">Error: {error}</div>}
        {isLoading && (
          <div className="chart-plot-wrapper skeleton-plot" aria-hidden>
            <div className="skeleton-grid">
              <div className="skeleton-upper">
                <div className="skeleton-line short"/><div className="skeleton-line long"/><div className="skeleton-line med"/><div className="skeleton-line long"/>
              </div>
              <div className="skeleton-volume">
                <div className="skeleton-bar" style={{height:'40%'}}/><div className="skeleton-bar" style={{height:'70%'}}/><div className="skeleton-bar" style={{height:'30%'}}/><div className="skeleton-bar" style={{height:'85%'}}/><div className="skeleton-bar" style={{height:'55%'}}/><div className="skeleton-bar" style={{height:'20%'}}/>
              </div>
            </div>
          </div>
        )}
        {!isLoading && !error && (
          <div className="chart-plot-wrapper" style={{ position: 'relative' }}>
            {toolbarDock === 'top' && (
              <ChartToolbar
                period={period} setPeriod={setPeriod}
                interval={interval} setInterval={setInterval}
                chartType={chartType} setChartType={setChartType}
                forcedLineMode={forcedLineMode}
                indicatorsOpen={indicatorsOpen} setIndicatorsOpen={setIndicatorsOpen}
                plotlyTheme={plotlyTheme} setPlotlyTheme={setPlotlyTheme}
                sidebarOverlay={sidebarOverlay} setSidebarOverlay={setSidebarOverlay}
                refresh={refresh}
                showLegend={showLegend} setShowLegend={setShowLegend}
                toolbarCollapsed={toolbarCollapsed} setToolbarCollapsed={setToolbarCollapsed}
                toolbarDock={toolbarDock} setToolbarDock={setToolbarDock} toolbarPos={toolbarPos} setToolbarPos={setToolbarPos}
                toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
              />
            )}
            <PlotContainer 
              data={data} 
              layout={layout} 
              showLegend={showLegend} 
              plotlyTheme={plotlyTheme} 
              isDarkTheme={isDarkTheme}
              onHoverChange={setHoverData}
            />
            <ChartLegend
              ticker={stripSuffix(sidebarData?.displayTicker || ticker)}
              hoverData={hoverData}
              lastData={sidebarData ? {
                close: sidebarData.close,
                volume: sidebarData.volume,
                RSI: sidebarData.RSI,
                VWAP: sidebarData.VWAP,
                BB_upper: sidebarData.BB_upper,
                BB_lower: sidebarData.BB_lower,
                BB_sma: sidebarData.BB_sma,
              } : null}
              companyName={sidebarData?.companyName}
              // Auto-dock opposite side when sidebar overlays to avoid blocking
              dock={sidebarOverlay ? (sidebarDock === 'left' ? 'right' : 'left') : 'left'}
              position={legendPos}
              onPositionChange={setLegendPos}
              chartType={chartType}
              onToggleTrace={toggleTrace}
              traceList={traceList}
              legendOffset={(sidebarOverlay || sidebarCollapsed) ? 16 : 320}
            />
            {toolbarDock === 'bottom' && (
              <ChartToolbar
                period={period} setPeriod={setPeriod}
                interval={interval} setInterval={setInterval}
                chartType={chartType} setChartType={setChartType}
                forcedLineMode={forcedLineMode}
                indicatorsOpen={indicatorsOpen} setIndicatorsOpen={setIndicatorsOpen}
                plotlyTheme={plotlyTheme} setPlotlyTheme={setPlotlyTheme}
                sidebarOverlay={sidebarOverlay} setSidebarOverlay={setSidebarOverlay}
                refresh={refresh}
                showLegend={showLegend} setShowLegend={setShowLegend}
                toolbarCollapsed={toolbarCollapsed} setToolbarCollapsed={setToolbarCollapsed}
                toolbarDock={toolbarDock} setToolbarDock={setToolbarDock} toolbarPos={toolbarPos} setToolbarPos={setToolbarPos}
                toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
              />
            )}
          </div>
        )}
        {/* Toolbar is rendered conditionally inside the plot wrapper (top/bottom). For floating mode we render a single toolbar here. */}
        {toolbarDock === 'float' && (
          <ChartToolbar
            period={period} setPeriod={setPeriod}
            interval={interval} setInterval={setInterval}
            chartType={chartType} setChartType={setChartType}
            forcedLineMode={forcedLineMode}
            indicatorsOpen={indicatorsOpen} setIndicatorsOpen={setIndicatorsOpen}
            plotlyTheme={plotlyTheme} setPlotlyTheme={setPlotlyTheme}
            sidebarOverlay={sidebarOverlay} setSidebarOverlay={setSidebarOverlay}
            refresh={refresh}
            showLegend={showLegend} setShowLegend={setShowLegend}
            toolbarCollapsed={toolbarCollapsed} setToolbarCollapsed={setToolbarCollapsed}
            toolbarDock={toolbarDock} setToolbarDock={setToolbarDock} toolbarPos={toolbarPos} setToolbarPos={setToolbarPos}
            toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
          />
        )}
        <IndicatorPanel
          open={indicatorsOpen}
          showVolume={showVolume} setShowVolume={setShowVolume}
          showBollinger={showBollinger} setShowBollinger={setShowBollinger}
          showSMA={showSMA} setShowSMA={setShowSMA}
          showRSI={showRSI} setShowRSI={setShowRSI}
          showVWAP={showVWAP} setShowVWAP={setShowVWAP}
        />
      </main>
    </div>
  );
}