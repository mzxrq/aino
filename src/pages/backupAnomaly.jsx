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
  const [ticker, setTicker] = useState(searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL');
  
  // --- CONTROLS ---
  const [period, setPeriod] = useState("1y");     
  const [interval, setInterval] = useState("1d"); 
  const [chartType, setChartType] = useState("candlestick");
  const [showVolume, setShowVolume] = useState(true); // <-- NEW: Volume Toggle
  
  const [sidebarData, setSidebarData] = useState(null);
  const { isLoggedIn } = useAuth(); 
  const navigate = useNavigate();

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "1d") setInterval("5m");       
    else if (newPeriod === "5d") setInterval("15m"); 
    else if (newPeriod === "1mo") setInterval("1h"); 
    else setInterval("1d");                          
  };

  useEffect(() => {
    const newTicker = searchParams.get('ticker') || searchParams.get('symbol') || 'AAPL';
    setTicker(newTicker);
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const baseUrl = 'http://127.0.0.1:5000';
        const response = await fetch(`${baseUrl}/detect?symbol=${ticker}&period=${period}&interval=${interval}`);
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        
        const chartData = await response.json();

        if (chartData.error) {
          throw new Error(`Backend error: ${chartData.error}`);
        }

        // --- TRACES ---
        let traces = [];

        // 1. Price Trace (Candle or Line)
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
                hoverlabel: { bgcolor: '#1E1E1E', font: { color: '#E0E0E0' }, bordercolor: '#333' }
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
                xaxis: 'x', yaxis: 'y'
            });
        }

        // 2. Overlays (BB, SMA, Anomalies)
        traces.push(
          { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.lower, line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 }, showlegend: false, hoverinfo: 'skip', xaxis: 'x', yaxis: 'y' },
          { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.upper, line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 }, fill: 'tonexty', fillcolor: 'rgba(86, 119, 164, 0.1)', name: 'Bollinger Bands', hoverinfo: 'skip', xaxis: 'x', yaxis: 'y' },
          { type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.sma, line: { color: '#5677a4', width: 1.5 }, name: 'SMA (20)', hovertemplate: 'SMA: %{y:.2f}<extra></extra>', xaxis: 'x', yaxis: 'y' },
          { type: 'scatter', mode: 'markers', x: chartData.anomaly_markers.dates, y: chartData.anomaly_markers.y_values, name: 'Anomaly', marker: { color: '#FFD700', symbol: 'x', size: 8, line: { width: 2 } }, hovertemplate: 'Anomaly Detected<extra></extra>', xaxis: 'x', yaxis: 'y' }
        );

        // 3. Volume Trace (New!)
        // We create colors for volume: Green if close > open, Red if close < open
        // But since we don't have that logic easily here without calculating, let's stick to a neutral color or match price
        if (showVolume) {
            // Simple color logic: Green if Close > Open, else Red
            const volumeColors = chartData.close.map((c, i) => {
                const o = chartData.open[i];
                return c >= o ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
            });

            traces.push({
                type: 'bar',
                x: chartData.dates,
                y: chartData.volume, // We need to make sure backend sends this!
                name: 'Volume',
                marker: { color: volumeColors },
                yaxis: 'y3', // New Y-axis for volume
                xaxis: 'x',
                hovertemplate: 'Vol: %{y}<extra></extra>'
            });
        }

        // 4. Anomaly Score Trace
        traces.push({ 
            type: 'bar', 
            x: chartData.dates, 
            y: chartData.anomaly_scores.values, 
            marker: { color: chartData.anomaly_scores.colors, opacity: 0.6 }, 
            name: 'Anomaly Score', 
            hovertemplate: 'Score: %{y:.3f}<extra></extra>', 
            xaxis: 'x', // Share X axis
            yaxis: 'y2' 
        });

        setData(traces);

        let rangebreaks = [{ bounds: ["sat", "mon"] }];

        // --- LAYOUT CONFIGURATION ---
        // We need 3 rows now: Price (Top), Volume (Middle), Score (Bottom)
        // But standard is Price + Volume overlay. Let's do 3 stacked rows to be clean.
        
        // Row 1: Price (60% height)
        // Row 2: Volume (15% height)
        // Row 3: Score (15% height)
        
        // Domain calculation:
        // Total space 0 to 1.
        // Score: 0.00 to 0.15
        // Volume: 0.18 to 0.33 (Gap 0.03)
        // Price: 0.36 to 1.00 (Gap 0.03)

        const layoutConfig = {
          title: `${ticker} Price & Anomaly Score`,
          template: 'plotly_dark', 
          paper_bgcolor: 'rgba(0, 0, 0, 0)',
          plot_bgcolor: 'rgba(0, 0, 0, 0)', 
          hovermode: 'x unified', 
          hoverlabel: { bgcolor: 'rgba(30, 30, 30, 0.9)', font: { size: 13, color: '#ffffff' }, bordercolor: '#555' },
          
          // --- AXIS DOMAINS ---
          yaxis: { domain: [0.36, 1.0], title: 'Price' },           // Main Price
          yaxis3: { domain: [0.18, 0.33], title: 'Vol', showticklabels: false }, // Volume
          yaxis2: { domain: [0.00, 0.15], title: 'Score' },         // Anomaly Score
          
          xaxis: { showticklabels: false, rangebreaks: rangebreaks, anchor: 'y2' }, // Shared X axis, anchored to bottom plot
          
          xaxis_rangeslider_visible: false,
          legend: { orientation: 'h', y: -0.1, x: 0.5, xanchor: 'center' },
          margin: { t: 80, b: 40, l: 60, r: 40 },
          grid: { rows: 3, columns: 1, pattern: 'independent' } // Helps align them
        };

        // If Volume is hidden, adjust layout to give space back to Price/Score
        if (!showVolume) {
            layoutConfig.yaxis = { domain: [0.25, 1.0], title: 'Price' };
            layoutConfig.yaxis2 = { domain: [0.00, 0.20], title: 'Score' };
            // layoutConfig.yaxis3 is ignored
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
          // Add Volume to Sidebar
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
  }, [ticker, searchParams, period, interval, chartType, showVolume]); // Added showVolume dependency

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
              <div><span>Open</span><strong>{sidebarData.open?.toFixed(2)}</strong></div>
              <div><span>High</span><strong>{sidebarData.high?.toFixed(2)}</strong></div>
              <div><span>Low</span><strong>{sidebarData.low?.toFixed(2)}</strong></div>
              <div><span>Close</span><strong>{sidebarData.close?.toFixed(2)}</strong></div>
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
        {/* --- TOOLBAR --- */}
        <div className="chart-toolbar">
            <div className="toolbar-group">
                <span className="toolbar-label">Range:</span>
                {['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y'].map(p => (
                    <button 
                        key={p} 
                        className={`toolbar-btn ${period === p ? 'active' : ''}`}
                        onClick={() => handlePeriodChange(p)}
                    >
                        {p.toUpperCase()}
                    </button>
                ))}
            </div>
            <div className="toolbar-group">
                <span className="toolbar-label">Type:</span>
                <button 
                    className={`toolbar-btn ${chartType === 'candlestick' ? 'active' : ''}`}
                    onClick={() => setChartType('candlestick')}
                >
                    Candles
                </button>
                <button 
                    className={`toolbar-btn ${chartType === 'line' ? 'active' : ''}`}
                    onClick={() => setChartType('line')}
                >
                    Line
                </button>
                 {/* --- VOLUME TOGGLE --- */}
                <button 
                    className={`toolbar-btn ${showVolume ? 'active' : ''}`}
                    onClick={() => setShowVolume(!showVolume)}
                >
                    Vol
                </button>
            </div>
        </div>
        
        {isLoading && <div className="loading-overlay">Loading Chart Data...</div>}
        {error && <div className="error-overlay">Error: {error}</div>}
        {!isLoading && !error && (
          <> 
            <Plot
              data={data}
              layout={layout}
              style={{ width: '100%', flex: 1 }}
              useResizeHandler={true}
              config={{ responsive: true, displayModeBar: false }} 
            />
          </> 
        )}
      </main>
    </div>
  );
}