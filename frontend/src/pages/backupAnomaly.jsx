import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './AnomalyChart.css';

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

const formatNumber = (num) => {
  if (num == null || isNaN(num)) return "-";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function AnomalyChart() {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL');

  // Controls
  const [period, setPeriod] = useState("1d");
  const [interval, setInterval] = useState("5m");
  const [chartType, setChartType] = useState("candlestick");
  const [showVolume, setShowVolume] = useState(true);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [sidebarData, setSidebarData] = useState(null);

  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  const ML_API_URL = 'http://127.0.0.1:5000';
  const NODE_API_URL = 'http://127.0.0.1:5050';

  const getRangeBreaks = (symbol, interval) => {
    const breaks = [{ bounds: ["sat", "mon"] }];
    if (interval.includes('m') || interval.includes('h')) {
      if (symbol.toUpperCase().endsWith('.T')) {
        breaks.push({ bounds: [15, 9], pattern: "hour" });
        breaks.push({ bounds: [11.5, 12.5], pattern: "hour" });
      } else {
        breaks.push({ bounds: [16, 9.5], pattern: "hour" });
      }
    }
    return breaks;
  };

  // --- SMART PERIOD CHANGE HANDLER ---
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);

    // Check if current interval is valid for the new period
    const validIntervals = ALLOWED_INTERVALS[newPeriod];

    if (!validIntervals.includes(interval)) {
      // If invalid, switch to the best default (usually the first or last item)
      // Logic: 1d/5d -> prefer 5m/15m. Longer terms -> prefer 1d.
      if (newPeriod === '1d') setInterval('5m');
      else if (newPeriod === '5d') setInterval('15m');
      else setInterval('1d');
    }
  };

  useEffect(() => {
    setTicker(searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL');
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${ML_API_URL}/detect?symbol=${ticker}&period=${period}&interval=${interval}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const chartData = await response.json();
        if (chartData.error) throw new Error(`Backend error: ${chartData.error}`);

        let traces = [];

        if (chartType === "candlestick") {
          traces.push({
            type: 'candlestick',
            x: chartData.dates,
            open: chartData.open, high: chartData.high, low: chartData.low, close: chartData.close,
            name: `${ticker}`,
            xaxis: 'x', yaxis: 'y',
            text: chartData.dates.map(() => ''),
            hoverlabel: { bgcolor: '#1E1E1E', font: { color: '#E0E0E0' }, bordercolor: '#333' }
          });
        } else {
          traces.push({
            type: 'scatter', mode: 'lines',
            x: chartData.dates, y: chartData.close,
            name: `${ticker}`,
            line: { color: '#00E5FF', width: 2 },
            xaxis: 'x', yaxis: 'y'
          });
        }

        if (chartData.bollinger_bands) {
          traces.push(
            { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.lower, line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 }, showlegend: false, hoverinfo: 'skip', xaxis: 'x', yaxis: 'y' },
            { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.upper, line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 }, fill: 'tonexty', fillcolor: 'rgba(86, 119, 164, 0.1)', name: 'Bollinger Bands', hoverinfo: 'skip', xaxis: 'x', yaxis: 'y' },
            { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.sma, line: { color: '#5677a4', width: 1.5 }, name: 'SMA (20)', hovertemplate: 'SMA: %{y:.2f}<extra></extra>', xaxis: 'x', yaxis: 'y' }
          );
        }

        if (chartData.anomaly_markers) {
          traces.push({
            type: 'scatter', mode: 'markers',
            x: chartData.anomaly_markers.dates, y: chartData.anomaly_markers.y_values,
            name: 'Anomaly',
            marker: { color: '#FFD700', symbol: 'x', size: 8, line: { width: 2 } },
            hovertemplate: 'Anomaly Detected<extra></extra>', xaxis: 'x', yaxis: 'y'
          });
        }

        if (showVolume) {
          const volumeColors = chartData.close.map((c, i) => (c >= chartData.open[i] ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'));
          traces.push({
            type: 'bar', x: chartData.dates, y: chartData.volume || [],
            name: 'Volume', marker: { color: volumeColors },
            yaxis: 'y3', xaxis: 'x', hovertemplate: 'Vol: %{y}<extra></extra>'
          });
        }

        if (chartData.anomaly_scores) {
          traces.push({
            type: 'bar', x: chartData.dates, y: chartData.anomaly_scores.values,
            marker: { color: chartData.anomaly_scores.colors, opacity: 0.6 },
            name: 'Anomaly Score', hovertemplate: 'Score: %{y:.3f}<extra></extra>',
            xaxis: 'x', yaxis: 'y2'
          });
        }

        setData(traces);

        const rangebreaks = getRangeBreaks(ticker, interval);
        const layoutConfig = {
          title: `${ticker} - ${interval.toUpperCase()} (${period.toUpperCase()})`,
          template: 'plotly_dark',
          paper_bgcolor: 'rgba(0, 0, 0, 0)', plot_bgcolor: 'rgba(0, 0, 0, 0)',
          hovermode: 'x unified',
          hoverlabel: { bgcolor: 'rgba(30, 30, 30, 0.9)', font: { size: 13, color: '#ffffff' }, bordercolor: '#555' },

          yaxis: { domain: [0.36, 1.0], title: 'Price' },
          yaxis3: { domain: [0.18, 0.33], title: 'Vol', showticklabels: false },
          yaxis2: { domain: [0.00, 0.15], title: 'Score' },

          xaxis: { showticklabels: false, rangebreaks: rangebreaks, anchor: 'y2' },
          xaxis_rangeslider_visible: false,
          legend: { orientation: 'h', y: -0.1, x: 0.5, xanchor: 'center' },
          margin: { t: 60, b: 40, l: 60, r: 40 },
          grid: { rows: 3, columns: 1, pattern: 'independent' }
        };

        if (!showVolume) {
          layoutConfig.yaxis = { domain: [0.25, 1.0], title: 'Price' };
          layoutConfig.yaxis2 = { domain: [0.00, 0.20], title: 'Score' };
        }

        setLayout(layoutConfig);

        const lastIdx = chartData.close.length - 1;
        setSidebarData({
          market: chartData.market || 'Unknown',
          companyName: chartData.companyName || 'N/A',
          displayTicker: ticker,
          open: chartData.open[lastIdx],
          high: chartData.high[lastIdx],
          low: chartData.low[lastIdx],
          close: chartData.close[lastIdx],
          volume: chartData.volume ? chartData.volume[lastIdx] : "N/A"
        });

      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [ticker, period, interval, chartType, showVolume]);

  // Subscription Logic (unchanged)
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isLoggedIn || !user) return;
      try {
        const userId = user.userId || user.id || user.sub;
        const res = await fetch(`${NODE_API_URL}/subscription?userId=${userId}&ticker=${ticker}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setIsSubscribed(true);
        else setIsSubscribed(false);
      } catch (err) { console.error(err); }
    };
    checkSubscription();
  }, [ticker, isLoggedIn, user]);

  const handleSubscribe = async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    setSubLoading(true);
    try {
      const userId = user.userId || user.id || user.sub;
      const response = await fetch(`${NODE_API_URL}/subscription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ticker })
      });
      if (response.ok) { setIsSubscribed(true); alert("Subscribed!"); }
    } catch (error) { alert("Error subscribing"); }
    finally { setSubLoading(false); }
  };

  return (
    <div className="chart-page-container">
      <aside className="chart-sidebar">
        <div className="sidebar-header">
          <h3>{sidebarData ? sidebarData.displayTicker : ticker}</h3>
          {sidebarData && <p className="company-name">{sidebarData.companyName}</p>}
          {sidebarData && <p className="market-type">Market: {sidebarData.market}</p>}
        </div>
        <div className="sidebar-data">
          {sidebarData ? (
            <>
              <div><span>Open</span><strong>{formatNumber(sidebarData.open)}</strong></div>
              <div><span>High</span><strong>{formatNumber(sidebarData.high)}</strong></div>
              <div><span>Low</span><strong>{formatNumber(sidebarData.low)}</strong></div>
              <div><span>Close</span><strong>{formatNumber(sidebarData.close)}</strong></div>
              <div><span>Volume</span><strong>{new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(sidebarData.volume)}</strong></div>
            </>
          ) : <p>Loading data...</p>}
        </div>
        <button className="btn btn-primary" onClick={handleSubscribe} disabled={isSubscribed || subLoading} style={{ backgroundColor: isSubscribed ? '#28a745' : '' }}>
          {subLoading ? "..." : (isSubscribed ? "Subscribed ✓" : "Subscribe to Alerts")}
        </button>
      </aside>

      <main className="chart-main">
        <div className="chart-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Range:</span>
            {['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y'].map(p => (
              <button key={p} className={`toolbar-btn ${period === p ? 'active' : ''}`} onClick={() => handlePeriodChange(p)}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* --- INTELLIGENT INTERVAL SELECTOR --- */}
          <div className="toolbar-group">
            <span className="toolbar-label">Interval:</span>
            {['1m', '5m', '15m', '30m', '1h', '1d', '1wk'].map(i => {
              // Determine if this button should be disabled based on selected Period
              const isDisabled = !ALLOWED_INTERVALS[period].includes(i);
              return (
                <button
                  key={i}
                  className={`toolbar-btn ${interval === i ? 'active' : ''}`}
                  onClick={() => setInterval(i)}
                  disabled={isDisabled} // <--- THE FIX
                  style={{
                    opacity: isDisabled ? 0.3 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    textDecoration: isDisabled ? 'line-through' : 'none'
                  }}
                >
                  {i.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Type:</span>
            <button className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')}>Candles</button>
            <button className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
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