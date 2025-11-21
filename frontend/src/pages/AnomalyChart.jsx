// Restored previous AnomalyChart implementation (from backupAnomaly.jsx / history)
import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
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

  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL');

  // --- Controls ---
  const [period, setPeriod] = useState("1d");
  const [interval, setInterval] = useState("5m");
  const [chartType, setChartType] = useState("line");
  const [showVolume, setShowVolume] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [sidebarData, setSidebarData] = useState(null);

  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  const ML_API_URL = 'http://127.0.0.1:5000';
  const NODE_API_URL = 'http://127.0.0.1:5050';

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
    // react to search params (ticker changes)
    setTicker(searchParams.get('ticker') || searchParams.get('symbol') || ticker);
  }, [searchParams]);

  // --- FETCH DATA ---
  useEffect(() => {
    let cancelled = false;
    async function chart() {
      setIsLoading(true);
      setError(null);
      try {
        const body = { ticker, period, interval };
        const res = await fetch(`${ML_API_URL}/chart_full`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await res.json();

        // API returns an object keyed by ticker; handle accordingly
        const chartDataRaw = json[ticker] || json[Object.keys(json)[0]] || json;

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
        if (chartDataRaw.VWAP && chartDataRaw.VWAP.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.VWAP, type: 'scatter', mode: 'lines', name: 'VWAP', line: { dash: 'dash' }, xaxis: 'x', yaxis: 'y' });
        }

        // Bollinger bands (fill between lower and upper)
        if (showBollinger && chartDataRaw.bollinger_bands && chartDataRaw.bollinger_bands.sma) {
          const bb = chartDataRaw.bollinger_bands;
          traces.push({ x: chartDataRaw.dates, y: bb.lower, type: 'scatter', mode: 'lines', name: 'BB Lower', line: { color: 'rgba(86, 119, 164, 0.4)', width: 0 }, fill: 'none', xaxis: 'x', yaxis: 'y' });
          traces.push({ x: chartDataRaw.dates, y: bb.upper, type: 'scatter', mode: 'lines', name: 'BB Upper', line: { color: 'rgba(86, 119, 164, 0.4)', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(86, 119, 164, 0.1)', xaxis: 'x', yaxis: 'y' });
          traces.push({ x: chartDataRaw.dates, y: bb.sma, type: 'scatter', mode: 'lines', name: 'SMA (20)', line: { color: 'rgba(86,119,164,0.9)', width: 1 }, xaxis: 'x', yaxis: 'y' });
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
        if (chartDataRaw.RSI && chartDataRaw.RSI.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.RSI, type: 'scatter', mode: 'lines', name: 'RSI', xaxis: 'x', yaxis: 'y2', line: { color: '#f39c12' } });
        }

        // Layout
        const layoutObj = {
          margin: { t: 10, r: 10, l: 40, b: 40 },
          xaxis: { rangeslider: { visible: false }, rangebreaks: getRangeBreaks(ticker, interval) },
          yaxis: { domain: [0.2, 1], title: 'Price' },
          yaxis2: { domain: [0.05, 0.18], title: 'RSI/Score' },
          yaxis3: { domain: [0, 0.15], anchor: 'x' },
          legend: { orientation: 'h', y: -0.1, x: 0.5, xanchor: 'center' },
          hovermode: 'x unified',
          plot_bgcolor: '#0f0f0f',
          paper_bgcolor: '#0f0f0f',
          font: { color: '#E0E0E0' }
        };

        if (!cancelled) {
          setData(traces);
          setLayout(layoutObj);
          setSidebarData({
            displayTicker: chartDataRaw.displayTicker || ticker,
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
  }, [ticker, period, interval, chartType, showVolume, showBollinger]);

  // Subscription Logic (unchanged)
  useEffect(() => {
    // TODO: check subscription state from backend
    setIsSubscribed(false);
  }, [ticker, isLoggedIn, user]);

  const handleSubscribe = async () => {
    setSubLoading(true);
    // placeholder - hook to backend subscription endpoint if configured
    setTimeout(() => { setSubLoading(false); setIsSubscribed(true); }, 700);
  };

  const forcedLineMode = shouldForceLine(period, interval);

  return (
    <div className="chart-page-container">
      <aside className="chart-sidebar">
        <div className="sidebar-header">
          <h3>{sidebarData ? sidebarData.displayTicker : ticker}</h3>
          {sidebarData && <p className="company-name"><strong>{sidebarData.companyName}</strong></p>}
          {sidebarData && <p className="market-name"><strong>Market:</strong> {sidebarData.market}</p>}
        </div>
        <div className="sidebar-data">
          {sidebarData ? (
            <>
              <div><span>Open</span><strong>{sidebarData.open?.toFixed?.(2)}</strong></div>
              <div><span>High</span><strong>{sidebarData.high?.toFixed?.(2)}</strong></div>
              <div><span>Low</span><strong>{sidebarData.low?.toFixed?.(2)}</strong></div>
              <div><span>Close</span><strong>{sidebarData.close?.toFixed?.(2)}</strong></div>
              <div><span>Volume</span><strong>{sidebarData.volume !== 'N/A' ? (sidebarData.volume ? new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(sidebarData.volume) : 'N/A') : 'N/A'}</strong></div>
            </>
          ) : <p>Loading data...</p>}
        </div>
        <button className="btn btn-primary" onClick={handleSubscribe} disabled={isSubscribed || subLoading} style={{ backgroundColor: isSubscribed ? '#28a745' : '' }}>
          {subLoading ? '...' : (isSubscribed ? 'Subscribed ✓' : 'Subscribe to Alerts')}
        </button>
      </aside>

      <main className="chart-main">
        <div className="chart-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Range:</span>
            {['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y'].map(p => (
              <button key={p} className={`toolbar-btn ${period === p ? 'active' : ''}`} onClick={() => handlePeriodChange(p)}>{p.toUpperCase()}</button>
            ))}
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Interval:</span>
            {['1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo'].map(i => {
              const isDisabled = !ALLOWED_INTERVALS[period].includes(i);
              return (
                <button key={i} className={`toolbar-btn ${interval === i ? 'active' : ''}`} onClick={() => setInterval(i)} disabled={isDisabled}
                  style={{ opacity: isDisabled ? 0.3 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', textDecoration: isDisabled ? 'line-through' : 'none' }}>
                  {i.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Type:</span>
            <button className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')} disabled={forcedLineMode}
              title={forcedLineMode ? 'Candlesticks unavailable for intraday' : ''}
              style={{ opacity: forcedLineMode ? 0.3 : 1, cursor: forcedLineMode ? 'not-allowed' : 'pointer' }}>
              Candles
            </button>
            <button className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
            <button className={`toolbar-btn ${showBollinger ? 'active' : ''}`} onClick={() => setShowBollinger(!showBollinger)}>BB</button>
            <button className={`toolbar-btn ${showVolume ? 'active' : ''}`} onClick={() => setShowVolume(!showVolume)}>Vol</button>
          </div>
        </div>

        {isLoading && <div className="loading-overlay">Loading...</div>}
        {error && <div className="error-overlay">Error: {error}</div>}
        {!isLoading && !error && (
          <Plot data={data} layout={layout} style={{ width: '100%', height: '100%' }} useResizeHandler={true} config={{ responsive: true, displayModeBar: false }} />
        )}
      </main>
    </div>
  );
}
