// Restored previous AnomalyChart implementation (from backupAnomaly.jsx / history)
import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../pages/AnomalyChart.css";

// --- CONFIGURATION: Allowed Intervals per Range ---
const ALLOWED_INTERVALS = {
  "1d": ["1m", "5m", "15m", "30m", "1h"],
  "5d": ["5m", "15m", "30m", "1h", "1d"],
  "1mo": ["30m", "1h", "1d", "1wk"],
  "6mo": ["1d", "1wk", "1mo"],
  ytd: ["1d", "1wk", "1mo"],
  "1y": ["1d", "1wk", "1mo"],
  "5y": ["1d", "1wk", "1mo"],
};

export default function AnomalyChart() {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialTicker =
    (location && location.state && location.state.ticker) ||
    searchParams.get("ticker") ||
    searchParams.get("symbol") ||
    "AAPL";
  const [ticker, setTicker] = useState(initialTicker);

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

  const ML_API_URL = "http://127.0.0.1:5000";
  const NODE_API_URL = "http://127.0.0.1:5050";

  // Simple in-memory cache:
  // raw data cached at key `${ticker}|${period}|raw`
  // resampled/cached renders at key `${ticker}|${period}|${interval}`
  const cacheRef = React.useRef({});

  const isHighFrequency = (intv) => intv.endsWith("m") || intv.endsWith("h");

  const shouldForceLine = (p, i) => {
    // For very short periods + fine intervals, candlesticks are messy
    if (p === "1d" && (i === "1m" || i === "5m")) return true;
    return false;
  };

  const getRangeBreaks = (symbol, interval) => {
    // Always skip weekends
    const breaks = [{ bounds: ["sat", "mon"] }];

    // Only apply hour-breaks for intraday charts
    if (!interval || !(interval.endsWith("m") || interval.endsWith("h")))
      return breaks;

    const s = (symbol || "").toUpperCase();
    // Japan tickers (.T)
    if (s.endsWith(".T")) {
      // Tokyo: market hours ~ 9:00-11:30 and 12:30-15:00 — skip overnight and lunch
      breaks.push({ bounds: [15, 9], pattern: "hour" });
      breaks.push({ bounds: [11.5, 12.5], pattern: "hour" });
      return breaks;
    }

    // Thailand tickers (.BK)
    if (s.includes(".BK")) {
      // Thailand: market hours ~ 9:30-16:30 — skip overnight
      breaks.push({ bounds: [16.5, 9.5], pattern: "hour" });
      return breaks;
    }

    // Default: assume US hours 9:30-16:00
    breaks.push({ bounds: [16, 9.5], pattern: "hour" }); // US Overnight
    return breaks;
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    // choose a safe default interval for the chosen period
    const allowed = ALLOWED_INTERVALS[newPeriod] || ["1d"];
    if (!allowed.includes(interval)) setInterval(allowed[0]);
  };

  useEffect(() => {
    // When interval/period change, we may force chart type
    if (shouldForceLine(period, interval)) setChartType("line");
  }, [interval, period]);

  useEffect(() => {
    // react to search params or navigation state (ticker changes)
    const stateTicker =
      (location && location.state && location.state.ticker) || null;
    const paramTicker =
      searchParams.get("ticker") || searchParams.get("symbol");
    if (stateTicker) setTicker(stateTicker);
    else if (paramTicker) setTicker(paramTicker);
  }, [searchParams, location]);

  // --- FETCH DATA ---
  useEffect(() => {
    let cancelled = false;
    const rawKey = `${ticker}|${period}|raw`;
    const resampledKey = `${ticker}|${period}|${interval}`;

    // helpers: convert interval string to milliseconds
    const intervalToMs = (intv) => {
      if (!intv) return 24 * 60 * 60 * 1000;
      if (intv.endsWith("m")) return parseInt(intv.slice(0, -1), 10) * 60 * 1000;
      if (intv.endsWith("h")) return parseInt(intv.slice(0, -1), 10) * 60 * 60 * 1000;
      if (intv === "1d") return 24 * 60 * 60 * 1000;
      if (intv === "1wk") return 7 * 24 * 60 * 60 * 1000;
      if (intv === "1mo") return 30 * 24 * 60 * 60 * 1000;
      return 24 * 60 * 60 * 1000;
    };

    const computeBollinger = (closeArr, window = 20) => {
      const sma = [];
      const upper = [];
      const lower = [];
      for (let i = 0; i < closeArr.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = closeArr.slice(start, i + 1).filter((v) => typeof v === 'number');
        if (slice.length === 0) {
          sma.push(null);
          upper.push(null);
          lower.push(null);
          continue;
        }
        const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
        const sd = Math.sqrt(variance);
        sma.push(mean);
        upper.push(mean + 2 * sd);
        lower.push(mean - 2 * sd);
      }
      return { sma, upper, lower };
    };

    const resampleRawData = (raw, targetInterval) => {
      try {
        const ms = intervalToMs(targetInterval);
        const buckets = new Map();
        const n = (raw.dates && raw.dates.length) || 0;
        for (let i = 0; i < n; i++) {
          const dt = new Date(raw.dates[i]);
          if (isNaN(dt)) continue;
          const ts = dt.getTime();
          const idx = Math.floor(ts / ms);
          const key = idx * ms;
          if (!buckets.has(key)) {
            buckets.set(key, {
              date: new Date(key).toISOString(),
              open: raw.open ? raw.open[i] : null,
              high: raw.high ? raw.high[i] : raw.close ? raw.close[i] : null,
              low: raw.low ? raw.low[i] : raw.close ? raw.close[i] : null,
              close: raw.close ? raw.close[i] : null,
              volume: raw.volume ? (raw.volume[i] || 0) : 0,
              VWAPs: raw.VWAP ? [raw.VWAP[i]] : [],
              RSIvals: raw.RSI ? [raw.RSI[i]] : [],
            });
          } else {
            const b = buckets.get(key);
            b.high = Math.max(b.high ?? -Infinity, raw.high ? raw.high[i] : raw.close ? raw.close[i] : -Infinity);
            b.low = Math.min(b.low ?? Infinity, raw.low ? raw.low[i] : raw.close ? raw.close[i] : Infinity);
            b.close = raw.close ? raw.close[i] : b.close;
            b.volume = b.volume + (raw.volume ? (raw.volume[i] || 0) : 0);
            if (raw.VWAP) b.VWAPs.push(raw.VWAP[i]);
            if (raw.RSI) b.RSIvals.push(raw.RSI[i]);
          }
        }

        const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
        const out = { dates: [], open: [], high: [], low: [], close: [], volume: [], VWAP: [], RSI: [], anomaly_markers: { dates: [], y_values: [] } };
        for (const k of keys) {
          const b = buckets.get(k);
          out.dates.push(b.date);
          out.open.push(typeof b.open === 'number' ? b.open : null);
          out.high.push(typeof b.high === 'number' ? b.high : null);
          out.low.push(typeof b.low === 'number' ? b.low : null);
          out.close.push(typeof b.close === 'number' ? b.close : null);
          out.volume.push(b.volume || 0);
          out.VWAP.push(b.VWAPs && b.VWAPs.length ? (b.VWAPs.reduce((a, c) => a + (c || 0), 0) / b.VWAPs.length) : null);
          out.RSI.push(b.RSIvals && b.RSIvals.length ? (b.RSIvals.reduce((a, c) => a + (c || 0), 0) / b.RSIvals.length) : null);
        }

        // map anomalies into buckets if available
        if (raw.anomaly_markers && raw.anomaly_markers.dates && raw.anomaly_markers.dates.length) {
          for (let i = 0; i < raw.anomaly_markers.dates.length; i++) {
            const adt = new Date(raw.anomaly_markers.dates[i]);
            if (isNaN(adt)) continue;
            const ats = Math.floor(adt.getTime() / ms) * ms;
            const iso = new Date(ats).toISOString();
            // find index in out.dates
            const idx = out.dates.indexOf(iso);
            if (idx !== -1) {
              out.anomaly_markers.dates.push(out.dates[idx]);
              out.anomaly_markers.y_values.push(raw.anomaly_markers.y_values ? raw.anomaly_markers.y_values[i] : (out.close[idx] || null));
            }
          }
        }

        // recompute bollinger bands on resampled close
        if (out.close && out.close.length) {
          out.bollinger_bands = computeBollinger(out.close, 20);
        }

        return out;
      } catch (e) {
        return raw; // fallback
      }
    };

    const buildTracesFromData = (d, useInterval) => {
      const t = [];
      if (chartType === "candlestick") {
        t.push({ x: d.dates, open: d.open, high: d.high, low: d.low, close: d.close, type: "candlestick", name: `${ticker} Price`, xaxis: "x", yaxis: "y" });
      } else {
        t.push({ x: d.dates, y: d.close, type: "scatter", mode: "lines", name: `${ticker} Close`, line: { shape: "spline", width: 2 }, fill: "", xaxis: "x", yaxis: "y" });
      }

      if (d.VWAP && d.VWAP.length) {
        t.push({ x: d.dates, y: d.VWAP, type: "scatter", mode: "lines", name: "VWAP", line: { dash: "dash" }, xaxis: "x", yaxis: "y" });
      }

      if (showBollinger && d.bollinger_bands && d.bollinger_bands.sma) {
        const bb = d.bollinger_bands;
        t.push({ x: d.dates, y: bb.lower, type: "scatter", mode: "lines", name: "BB Lower", line: { color: "rgba(86, 119, 164, 0.4)", width: 0 }, fill: "none", xaxis: "x", yaxis: "y" });
        t.push({ x: d.dates, y: bb.upper, type: "scatter", mode: "lines", name: "BB Upper", line: { color: "rgba(86, 119, 164, 0.4)", width: 0 }, fill: "tonexty", fillcolor: "rgba(86, 119, 164, 0.1)", xaxis: "x", yaxis: "y" });
        t.push({ x: d.dates, y: bb.sma, type: "scatter", mode: "lines", name: "SMA (20)", line: { color: "rgba(86,119,164,0.9)", width: 1 }, xaxis: "x", yaxis: "y" });
      }

      if (d.anomaly_markers && d.anomaly_markers.dates && d.anomaly_markers.dates.length) {
        t.push({ x: d.anomaly_markers.dates, y: d.anomaly_markers.y_values, type: "scatter", mode: "markers", marker: { color: "red", size: 8 }, name: "Anomalies", xaxis: "x", yaxis: "y" });
      }

      if (showVolume && d.volume && d.volume.length) {
        t.push({ x: d.dates, y: d.volume, type: "bar", name: "Volume", xaxis: "x", yaxis: "y3", marker: { color: "rgba(100,100,100,0.6)" } });
      }

      if (d.RSI && d.RSI.length) {
        t.push({ x: d.dates, y: d.RSI, type: "scatter", mode: "lines", name: "RSI", xaxis: "x", yaxis: "y2", line: { color: "#f39c12" } });
      }

      return t;
    };

    async function chart() {
      setIsLoading(true);
      setError(null);

      // If we already computed the resampled view, reuse it
      const cachedResampled = cacheRef.current[resampledKey];
      if (cachedResampled) {
        setData(cachedResampled.traces);
        setLayout(cachedResampled.layout);
        setSidebarData(cachedResampled.sidebarData);
        setIsLoading(false);
        return;
      }

      try {
        // If raw is cached, resample locally; otherwise fetch raw once
        let raw = cacheRef.current[rawKey];
        if (!raw) {
          const body = { ticker, period };
          const res = await fetch(`${ML_API_URL}/chart_full`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          raw = json[ticker] || json[Object.keys(json)[0]] || json;
          if (!raw || !raw.dates) {
            setError("No data returned");
            setIsLoading(false);
            return;
          }
          cacheRef.current[rawKey] = raw;
        }

        // resample raw into requested interval
        const resampled = resampleRawData(raw, interval);

        const traces = buildTracesFromData(resampled, interval);
        const layoutObj = {
          margin: { t: 10, r: 10, l: 40, b: 40 },
          xaxis: { rangeslider: { visible: false }, rangebreaks: getRangeBreaks(ticker, interval) },
          yaxis: { domain: [0.2, 1], title: "Price" },
          yaxis2: { domain: [0.05, 0.18], title: "RSI/Score" },
          yaxis3: { domain: [0, 0.15], anchor: "x" },
          legend: { orientation: "h", y: -0.1, x: 0.5, xanchor: "center" },
          hovermode: "x unified",
          plot_bgcolor: "#0f0f0f",
          paper_bgcolor: "#0f0f0f",
          font: { color: "#E0E0E0" },
        };

        const sidebar = {
          displayTicker: raw.displayTicker || ticker,
          companyName: raw.companyName || null,
          market: raw.market || null,
          open: resampled.open ? resampled.open[resampled.open.length - 1] : null,
          high: resampled.high ? resampled.high[resampled.high.length - 1] : null,
          low: resampled.low ? resampled.low[resampled.low.length - 1] : null,
          close: resampled.close ? resampled.close[resampled.close.length - 1] : null,
          volume: resampled.volume ? resampled.volume[resampled.volume.length - 1] : "N/A",
        };

        if (!cancelled) {
          setData(traces);
          setLayout(layoutObj);
          setSidebarData(sidebar);
          // cache resampled render for quick reuse
          cacheRef.current[resampledKey] = { traces, layout: layoutObj, sidebarData: sidebar };
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unknown error");
          setIsLoading(false);
        }
      }
    }

    chart();
    return () => {
      cancelled = true;
    };
  }, [ticker, period, interval, chartType, showVolume, showBollinger]);

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
            body: JSON.stringify({ lineID: user.userId, ticker }),
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
    setSubLoading(true);

    const body = { lineID: user?.userId || "anonymous", tickers: [ticker] };

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
    <div className="chart-page-container">
      <aside className="chart-sidebar">
        <div className="sidebar-header">
          <h3>{sidebarData ? sidebarData.displayTicker : ticker}</h3>
          {sidebarData && (
            <p className="company-name">
              <strong>{sidebarData.companyName}</strong>
            </p>
          )}
          {sidebarData && (
            <p className="market-name">
              <strong>Market:</strong> {sidebarData.market}
            </p>
          )}
        </div>
        <div className="sidebar-data">
          {sidebarData ? (
            <>
              <div>
                <span>Open</span>
                <strong>{sidebarData.open?.toFixed?.(2)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>{sidebarData.high?.toFixed?.(2)}</strong>
              </div>
              <div>
                <span>Low</span>
                <strong>{sidebarData.low?.toFixed?.(2)}</strong>
              </div>
              <div>
                <span>Close</span>
                <strong>{sidebarData.close?.toFixed?.(2)}</strong>
              </div>
              <div>
                <span>Volume</span>
                <strong>
                  {sidebarData.volume !== "N/A"
                    ? sidebarData.volume
                      ? new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          compactDisplay: "short",
                        }).format(sidebarData.volume)
                      : "N/A"
                    : "N/A"}
                </strong>
              </div>
            </>
          ) : (
            <p>Loading data...</p>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSubscribe}
          disabled={isSubscribed || subLoading}
          style={{ backgroundColor: isSubscribed ? "#28a745" : "" }}
        >
          {subLoading
            ? "..."
            : isSubscribed
            ? "Subscribed ✓"
            : "Subscribe to Alerts"}
        </button>
      </aside>

      <main className="chart-main">
        <div className="chart-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Range:</span>
            {["1d", "5d", "1mo", "6mo", "ytd", "1y", "5y"].map((p) => (
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
            <span className="toolbar-label">Interval:</span>
            {["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"].map((i) => {
              const isDisabled = !ALLOWED_INTERVALS[period].includes(i);
              return (
                <button
                  key={i}
                  className={`toolbar-btn ${interval === i ? "active" : ""}`}
                  onClick={() => setInterval(i)}
                  disabled={isDisabled}
                  style={{
                    opacity: isDisabled ? 0.3 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    textDecoration: isDisabled ? "line-through" : "none",
                  }}
                >
                  {i.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="toolbar-group">
            <span className="toolbar-label">Type:</span>
            <button
              className={`toolbar-btn ${
                chartType === "candlestick" ? "active" : ""
              }`}
              onClick={() => setChartType("candlestick")}
              disabled={forcedLineMode}
              title={
                forcedLineMode ? "Candlesticks unavailable for intraday" : ""
              }
              style={{
                opacity: forcedLineMode ? 0.3 : 1,
                cursor: forcedLineMode ? "not-allowed" : "pointer",
              }}
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
              className={`toolbar-btn ${showBollinger ? "active" : ""}`}
              onClick={() => setShowBollinger(!showBollinger)}
            >
              BB
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
            style={{ width: "100%", height: "100%" }}
            useResizeHandler={true}
            config={{ responsive: true, displayModeBar: false }}
          />
        )}
      </main>
    </div>
  );
}
