import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom'; // Import useSearchParams
import './AnomalyChart.css';

export default function AnomalyChart() {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('ticker') || 'CPALL.BK'); // Get from URL, or default

  const [sidebarData, setSidebarData] = useState(null);

  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setSidebarData(null); 

      try {
        const baseUrl = 'http://127.0.0.1:5000';
        const response = await fetch(`${baseUrl}/detect?symbol=${ticker}`);

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const chartData = await response.json();

        if (chartData.error) {
          throw new Error(`Server error: ${chartData.error}`);
        }
        
        const traces = [
          {
            type: 'candlestick',
            x: chartData.dates,
            open: chartData.open,
            high: chartData.high,
            low: chartData.low,
            close: chartData.close,
            name: `${ticker}`, // Shortened name
            xaxis: 'x',
            yaxis: 'y',
            hovertemplate:
              'Open: %{open:.2f}<br>' +
              'High: %{high:.2f}<br>' +
              'Low: %{low:.2f}<br>' +
              'Close: %{close:.2f}<extra></extra>',
            text: chartData.dates.map(() => ''), // Dummy text to prevent default behavior if needed
            hoverlabel: {
              bgcolor: '#1E1E1E', // Dark background for tooltip
              font: { color: '#E0E0E0', family: 'Inter, sans-serif' },
              bordercolor: '#333'
            }
          },
          
          {
            type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.lower,
            line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 },
            showlegend: false, hoverinfo: 'skip', xaxis: 'x', yaxis: 'y'
          },
          {
            type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.upper,
            line: { color: 'rgba(86, 119, 164, 0.4)', width: 1 },
            fill: 'tonexty', fillcolor: 'rgba(86, 119, 164, 0.1)',
            name: 'Bollinger Bands', hoverinfo: 'skip', xaxis: 'x', yaxis: 'y'
          },

          // --- MODIFIED (SMA) ---
          // We add a clean template for the SMA too
          {
            type: 'scatter', mode: 'lines', x: chartData.dates, y: chartData.bollinger_bands.sma,
            line: { color: '#5677a4', width: 1.5 },
            name: 'SMA (20)',
            hovertemplate: 'SMA: %{y:.2f}<extra></extra>', // Shows "SMA: 152.45"
            xaxis: 'x', yaxis: 'y'
          },

          // --- MODIFIED (Anomaly 'X') ---
          {
            type: 'scatter', mode: 'markers', x: chartData.anomaly_markers.dates, y: chartData.anomaly_markers.y_values,
            name: 'Anomaly',
            marker: { color: '#fff351ff', symbol: 'x', size: 8, line: { width: 1 } },
            hovertemplate: 'Anomaly Detected<extra></extra>', // Simple alert text
            xaxis: 'x', yaxis: 'y'
          },

          // --- MODIFIED (Score Bar) ---
          {
            type: 'bar', x: chartData.dates, y: chartData.anomaly_scores.values,
            marker: { color: chartData.anomaly_scores.colors, opacity: 0.6 },
            name: 'Anomaly Score',
            hovertemplate: 'Score: %{y:.3f}<extra></extra>', // Shows "Score: 0.955"
            xaxis: 'x2', yaxis: 'y2'
          }
        ];
        setData(traces);
        
        let rangebreaks = [
            { bounds: ["sat", "mon"] } // Always hide weekends
        ];

        // Build Layout
        setLayout({
          // ... existing layout code ...
          template: 'xgridoff',
          paper_bgcolor: 'rgba(0, 0, 0, 0)',
          plot_bgcolor: 'rgba(0, 0, 0, 0)',

          hovermode: 'x unified', // Keeps the "all in one box" behavior

          // --- ADDED HOVER LABEL STYLING TO LAYOUT ---
          hoverlabel: {
            bgcolor: 'rgba(30, 30, 30, 0.9)', // Semi-transparent dark background
            font: { size: 13, color: '#ffffff' },
            bordercolor: '#555'
          },

          yaxis: { domain: [0.35, 1.0], title: `${ticker} Price` },
          yaxis2: { domain: [0, 0.3], title: 'Anomaly Score' },
          xaxis: { 
            showticklabels: true,
            rangebreaks: rangebreaks,
            // rangebreaks: [{ bounds: ['sat', 'mon'] }],
            // range: [chartData.dates[0], chartData.dates[chartData.dates.length - 1]] },
          },
          xaxis2: { 
            anchor: 'y2',
            rangebreaks: rangebreaks,
            // rangebreaks: [{ bounds: ['sat', 'mon'] }],
            // range: [chartData.dates[0], chartData.dates[chartData.dates.length - 1]] },
          },
          xaxis_rangeslider_visible: false,
          legend: { orientation: 'h', y: -0.1, x: 0.5, xanchor: 'center' }
        });

        // --- UPDATE SIDEBAR DATA ---
        // Get the most recent data point
        setSidebarData({
          market: chartData.market || 'Unknown',
          companyName: chartData.companyName || 'N/A', // <-- ADDED THIS LINE
          open: chartData.open[chartData.open.length - 1],
          high: chartData.high[chartData.high.length - 1],
          low: chartData.low[chartData.low.length - 1],
          close: chartData.close[chartData.close.length - 1],
          volume: "N/A" // Your API doesn't send this yet, but it could
        });

      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [ticker]); // Re-fetch if the ticker in the URL changes

  const handleSubscribe = () => {
    if (!isLoggedIn) {
      alert("Please log in to subscribe to alerts!");
      navigate('/login');
    } else {
      // Logic for POST /subscription
      alert(`Subscribing to ${ticker}... (API call not implemented)`);
    }
  };

  return (
    <div className="chart-page-container">
      {/* --- Sidebar (matches wireframe) --- */}
      <aside className="chart-sidebar">
        {/* --- MODIFICATION START --- */}
        <div className="sidebar-header">
          <h3>{ticker.toUpperCase()}</h3>
          {sidebarData && <p className="company-name">{sidebarData.companyName}</p>}
          {sidebarData && <p className="market-name">Market: {sidebarData.market}</p>}
        </div>
        {/* --- MODIFICATION END --- */}

        {/* Show data once it's loaded */}
        <div className="sidebar-data">
          {sidebarData ? (
            <>
              <div><span>Open</span><strong>{sidebarData.open?.toFixed(2)}</strong></div>
              <div><span>High</span><strong>{sidebarData.high?.toFixed(2)}</strong></div>
              <div><span>Low</span><strong>{sidebarData.low?.toFixed(2)}</strong></div>
              <div><span>Close</span><strong>{sidebarData.close?.toFixed(2)}</strong></div>
              <div><span>Volume</span><strong>{sidebarData.volume}</strong></div>
            </>
          ) : (
            <p>Loading data...</p>
          )}
        </div>

        <button className="btn btn-primary" onClick={handleSubscribe}>
          Subscribe to Alerts
        </button>
      </aside>

      {/* --- Main Chart Area (matches wireframe) --- */}
      <main className="chart-main">
        {isLoading && <div className="loading-overlay">Loading Chart Data for {ticker}...</div>}
        {error && <div className="error-overlay">Error: {error}</div>}
        {!isLoading && !error && (
          <Plot
            data={data}
            layout={layout}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
            config={{ responsive: true }}
          />
        )}
      </main>
    </div>
  );
}