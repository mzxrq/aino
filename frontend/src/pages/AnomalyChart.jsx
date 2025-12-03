import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../pages/AnomalyChart.css';
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
    legendPos, setLegendPos,
  } = useChartPreferences();

  const { data, layout, error, isLoading, sidebarCore, refresh, shouldForceLine } = useChartData({
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
        const res = await fetch('http://127.0.0.1:5050/subscribers/status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lineId: user.userId, ticker }) });
        const d = await res.json(); setIsSubscribed(d.subscribed);
      } catch { setIsSubscribed(false); }
    }
    checkSubscription();
  }, [ticker, isLoggedIn, user]);

  async function handleSubscribe() {
    if (!isLoggedIn) { alert('Please log in first to subscribe to alerts'); navigate('/login'); return; }
    setSubLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:5050/subscribers/', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lineId: user?.userId || 'anonymous', tickers:[ticker] }) });
      if(!res.ok) throw new Error('Failed to subscribe');
      await res.json(); setIsSubscribed(true);
    } catch (e) { console.error(e); setIsSubscribed(false); } finally { setSubLoading(false); }
  }

  const forcedLineMode = shouldForceLine(period, interval);

  return (
    <div className={`chart-page-container ${sidebarOverlay ? 'overlay-mode' : ''} ${isFullscreen ? 'fullscreen' : ''} ${sidebarDock === 'right' ? 'sidebar-right' : ''}`}>
      <ChartSidebar
        sidebarData={sidebarData}
        collapsed={sidebarCollapsed}
        overlay={sidebarOverlay}
        dockSide={sidebarDock}
        setCollapsed={setSidebarCollapsed}
        onTickerChange={(newT) => {
          setTicker(newT);
          try { const params = new URLSearchParams(searchParams); params.set('ticker', newT); setSearchParams(params, { replace: true }); } catch {}
        }}
        stripSuffix={stripSuffix}
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
                volume: sidebarData.volume
              } : null}
              companyName={sidebarData?.companyName}
              dock={'left'}
              position={legendPos}
              onPositionChange={setLegendPos}
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
                toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
              />
            )}
          </div>
        )}
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
          toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen}
        />
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
