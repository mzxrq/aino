import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './AnomalyChart.css';

export default function AnomalyChart() {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(
    searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL'
  );

  const formatNumber = (num) => {
    if (num == null || isNaN(num)) return "-";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // --- CONTROLS ---
  const [period, setPeriod] = useState("1y");

  // Rename to avoid conflict with JS setInterval
  const [chartInterval, setChartInterval] = useState("1d");

  const [chartType, setChartType] = useState("candlestick");
  const [showVolume, setShowVolume] = useState(true);

  const [sidebarData, setSidebarData] = useState(null);
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  // Map from period → interval (candle size)
  const intervalMap = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1h",
    "6mo": "1d",
    "1y": "1d",
    "ytd": "1d",
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    // Use mapping to set the interval
    const mapped = intervalMap[newPeriod];
    // If there's no mapping for that period, fallback to "1d"
    setChartInterval(mapped || "1d");
  };

  useEffect(() => {
    const newTicker =
      searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL';
    setTicker(newTicker);
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setSidebarData(null);

      try {
        const baseUrl = 'http://127.0.0.1:5000';
        const response = await fetch(
          `${baseUrl}/detect?symbol=${ticker}&period=${period}&interval=${chartInterval}`
        );

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const chartData = await response.json();
        if (chartData.error) throw new Error(`Backend error: ${chartData.error}`);

        const traces = [];

        // Price trace (candlestick or line)
        if (chartType === "candlestick") {
          traces.push({
            type: 'candlestick',
            x: chartData.dates,
            open: chartData.open,
            high: chartData.high,
            low: chartData.low,
            close: chartData.close,
            name: `${ticker}`,
            xaxis: 'x', yaxis: 'y',
            text: chartData.dates.map(() => ''),
            hoverlabel: {
              bgcolor: '#1E1E1E',
              font: { color: '#E0E0E0' },
              bordercolor: '#333'
            }
          });
        } else {
          traces.push({
            type: 'scatter',
            mode: 'lines',
            x: chartData.dates,
            y: chartData.close,
            name: `${ticker}`,
            line: { color: '#00E5FF', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(0, 229, 255, 0.1)',
            xaxis: 'x',
            yaxis: 'y'
          });
        }

        // Overlays: BB, SMA, anomalies
        traces.push(
          {
            type: 'scatter',
            mode: 'lines',
            x: chartData.dates,
            y: chartData.bollinger_bands.lower,
            line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 },
            showlegend: false,
            hoverinfo: 'skip',
            xaxis: 'x', yaxis: 'y'
          },
          {
            type: 'scatter',
            mode: 'lines',
            x: chartData.dates,
            y: chartData.bollinger_bands.upper,
            line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 },
            fill: 'tonexty',
            fillcolor: 'rgba(86, 119, 164, 0.1)',
            name: 'Bollinger Bands',
            hoverinfo: 'skip',
            xaxis: 'x', yaxis: 'y'
          },
          {
            type: 'scatter',
            mode: 'lines',
            x: chartData.dates,
            y: chartData.bollinger_bands.sma,
            line: { color: '#5677a4', width: 1.5 },
            name: 'SMA (20)',
            hovertemplate: 'SMA: %{y:.2f}<extra></extra>',
            xaxis: 'x', yaxis: 'y'
          },
          {
            type: 'scatter',
            mode: 'markers',
            x: chartData.anomaly_markers.dates,
            y: chartData.anomaly_markers.y_values,
            name: 'Anomaly',
            marker: { color: '#FFD700', symbol: 'x', size: 8, line: { width: 2 } },
            hovertemplate: 'Anomaly Detected<extra></extra>',
            xaxis: 'x', yaxis: 'y'
          },
        );

        // Volume
        if (showVolume && chartData.volume) {
          const volColors = chartData.close.map((c, i) => {
            const o = chartData.open[i];
            return c >= o ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
          });
          traces.push({
            type: 'bar',
            x: chartData.dates,
            y: chartData.volume,
            name: 'Volume',
            marker: { color: volColors },
            yaxis: 'y3',
            xaxis: 'x',
            hovertemplate: 'Vol: %{y}<extra></extra>'
          });
        }

        // Anomaly score
        traces.push({
          type: 'bar',
          x: chartData.dates,
          y: chartData.anomaly_scores.values,
          marker: { color: chartData.anomaly_scores.colors, opacity: 0.6 },
          name: 'Anomaly Score',
          hovertemplate: 'Score: %{y:.3f}<extra></extra>',
          xaxis: 'x',
          yaxis: 'y2'
        });

        setData(traces);

        // Layout
        let rangebreaks = [{ bounds: ["sat", "mon"] }];
        const layoutConfig = {
          title: `${ticker} - ${period.toUpperCase()} Chart`,
          template: 'plotly_dark',
          paper_bgcolor: 'rgba(0, 0, 0, 0)',
          plot_bgcolor: 'rgba(0, 0, 0, 0)',
          hovermode: 'x unified',

          // --- Clean, balanced panel sizes ---
          yaxis: { domain: [0.45, 1.0], title: 'Price' },        // 55%
          yaxis3: { domain: [0.25, 0.40], title: 'Vol', showticklabels: false }, // 15%
          yaxis2: { domain: [0.00, 0.20], title: 'Score' },      // 20%

          // --- Remove cluttered gridlines ---
          xaxis: {
            showticklabels: false,
            rangebreaks: [{ bounds: ["sat", "mon"] }],
            gridcolor: "rgba(255,255,255,0.05)"
          },
          yaxis_gridcolor: "rgba(255,255,255,0.05)",
          yaxis2_gridcolor: "rgba(255,255,255,0.05)",
          yaxis3_gridcolor: "rgba(255,255,255,0.05)",

          xaxis_rangeslider_visible: false,

          // --- Legend OUTSIDE the chart ---
          legend: { orientation: 'h', y: -0.18, x: 0.5, xanchor: 'center' },

          margin: { t: 80, b: 60, l: 60, r: 40 }
        };

        if (!showVolume) {
          layoutConfig.yaxis = { domain: [0.25, 1.0], title: 'Price' };
          layoutConfig.yaxis2 = { domain: [0.00, 0.20], title: 'Score' };
        }

        setLayout(layoutConfig);

        setSidebarData({
          market: chartData.market || 'Unknown',
          companyName: chartData.companyName || 'N/A',
          displayTicker: chartData.displayTicker || ticker,
          displayMarket: chartData.market,
          open: chartData.open[chartData.open.length - 1],
          high: chartData.high[chartData.high.length - 1],
          low: chartData.low[chartData.low.length - 1],
          close: chartData.close[chartData.close.length - 1],
          volume: chartData.volume ? chartData.volume[chartData.volume.length - 1] : "N/A"
        });
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [ticker, period, chartInterval, chartType, showVolume]);

  const handleSubscribe = () => {
    if (!isLoggedIn) {
      alert("Please log in to subscribe to alerts!");
      navigate('/login');
    } else {
      alert(`Subscribing to ${ticker}... (API call not implemented)`);
    }
  };

  return (
    <div className="chart-page-container">
      <aside className="chart-sidebar">
        <div className="sidebar-header">
          <h3>{sidebarData ? sidebarData.displayTicker : ticker}</h3>
          {sidebarData && <p className="company-name">{sidebarData.companyName}</p>}
          {sidebarData && <p className="market-name">Market: {sidebarData.displayMarket || sidebarData.market}</p>}
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
          ) : (
            <p>Loading data...</p>
          )}
        </div>

        <button className="btn btn-primary" onClick={handleSubscribe}>
          Subscribe to Alerts
        </button>
      </aside>

      <main className="chart-main">
        <div className="chart-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Range:</span>
            {["1d", "5d", "1mo", "6mo", "ytd", "1y"].map((p) => (
              <button
                key={p}
                className={`toolbar-btn ${period === p ? "active" : ""}`}
                onClick={() => handlePeriodChange(p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            <button
              className={`toolbar-btn ${chartType === "candlestick" ? "active" : ""}`}
              onClick={() => setChartType("candlestick")}
            >
              Candles
            </button>
            <button
              className={`toolbar-btn ${chartType === "line" ? "active" : ""}`}
              onClick={() => setChartType("line")}
            >
              Line
            </button>
            <button
              className={`toolbar-btn ${showVolume ? "active" : ""}`}
              onClick={() => setShowVolume(!showVolume)}
            >
              Vol
            </button>
          </div>
        </div>

        {isLoading && <div className="loading-overlay">Loading...</div>}
        {error && <div className="error-overlay">Error: {error}</div>}
        {!isLoading && !error && (
          <Plot
            data={data}
            layout={layout}
            style={{ width: "100%", flex: 1 }}
            useResizeHandler={true}
            config={{ responsive: true, displayModeBar: false }}
          />
        )}
      </main>
    </div>
  );
}