import { useCallback, useEffect, useMemo, useState } from 'react';

// TTL categories mirroring original logic
const LOCAL_CACHE_TTLS = {
  intraday: 300,
  short: 900,
  medium: 3600,
  long: 86400
};

function ttlForPeriod(period) {
  if (!period) return LOCAL_CACHE_TTLS.short;
  const p = String(period).toLowerCase();
  if (p === '1d' || p === '5d' || p.endsWith('m') || p.endsWith('h')) return LOCAL_CACHE_TTLS.intraday;
  if (p === '1mo' || p === '6mo') return LOCAL_CACHE_TTLS.medium;
  return LOCAL_CACHE_TTLS.long;
}

function cacheKey(ticker, period, interval) {
  return `chart_local::${String(ticker).toUpperCase()}::${period}::${interval}`;
}

export function useChartData({ ticker, period, interval, chartType, showVolume, showBollinger, showRSI, showVWAP, showSMA, isDarkTheme, ML_API_URL }) {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCore, setSidebarCore] = useState(null);
  const [cacheBypassKey, setCacheBypassKey] = useState(null);

  const key = useMemo(() => cacheKey(ticker, period, interval), [ticker, period, interval]);

  const loadLocalCache = useCallback((k, ttlSeconds) => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.payload || !obj.fetchedAt) return null;
      const fetched = new Date(obj.fetchedAt);
      if ((Date.now() - fetched.getTime()) / 1000 > ttlSeconds) {
        localStorage.removeItem(k);
        return null;
      }
      return obj.payload;
    } catch {
      try { localStorage.removeItem(k); } catch {}
      return null;
    }
  }, []);

  const saveLocalCache = useCallback((k, payload) => {
    try { localStorage.setItem(k, JSON.stringify({ payload, fetchedAt: new Date().toISOString() })); } catch {}
  }, []);

  const shouldForceLine = useCallback((p, i) => (p === '1d' && (i === '1m' || i === '5m')), []);

  const refresh = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setCacheBypassKey(key);
    setIsLoading(true);
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    async function fetchChart() {
      setIsLoading(true);
      setError(null);
      try {
        const ttl = ttlForPeriod(period);
        let chartDataRaw = null;
        if (cacheBypassKey !== key) {
          chartDataRaw = loadLocalCache(key, ttl);
        }
        if (!chartDataRaw) {
          const res = await fetch(`${ML_API_URL}/chart_full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, period, interval })
          });
          const json = await res.json();
          chartDataRaw = json[ticker] || json[Object.keys(json)[0]] || json;
          if (chartDataRaw && chartDataRaw.dates) {
            saveLocalCache(key, chartDataRaw);
            setCacheBypassKey(null);
          }
        }
        if (!chartDataRaw || !chartDataRaw.dates) {
          if (!cancelled) {
            setError('No data returned');
            setIsLoading(false);
          }
          return;
        }

        // Build traces
        const traces = [];
        const finalChartType = shouldForceLine(period, interval) ? 'line' : chartType;

        if (finalChartType === 'candlestick') {
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
          traces.push({
            x: chartDataRaw.dates,
            y: chartDataRaw.close,
            type: 'scatter',
            mode: 'lines',
            name: `${ticker} Close`,
            line: { shape: 'spline', width: 2 },
            fill: '',
            xaxis: 'x',
            yaxis: 'y'
          });
        }

        if (showVWAP && chartDataRaw.VWAP?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.VWAP, type: 'scatter', mode: 'lines', name: 'VWAP', line: { dash: 'dash' }, xaxis: 'x', yaxis: 'y' });
        }

        if (chartDataRaw.bollinger_bands?.sma) {
          const bb = chartDataRaw.bollinger_bands;
          if (showBollinger) {
            traces.push({ x: chartDataRaw.dates, y: bb.lower, type: 'scatter', mode: 'lines', name: 'BB Lower', line: { color: 'rgba(86,119,164,0.4)', width: 0 }, fill: 'none', xaxis: 'x', yaxis: 'y' });
            traces.push({ x: chartDataRaw.dates, y: bb.upper, type: 'scatter', mode: 'lines', name: 'BB Upper', line: { color: 'rgba(86,119,164,0.4)', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(86,119,164,0.1)', xaxis: 'x', yaxis: 'y' });
          }
          if (showSMA) {
            traces.push({ x: chartDataRaw.dates, y: bb.sma, type: 'scatter', mode: 'lines', name: 'SMA (20)', line: { color: 'rgba(86,119,164,0.9)', width: 1 }, xaxis: 'x', yaxis: 'y' });
          }
        }

        if (chartDataRaw.anomaly_markers?.dates?.length) {
          traces.push({ x: chartDataRaw.anomaly_markers.dates, y: chartDataRaw.anomaly_markers.y_values, type: 'scatter', mode: 'markers', marker: { color: 'red', size: 8 }, name: 'Anomalies', xaxis: 'x', yaxis: 'y' });
        }

        if (showVolume && chartDataRaw.volume?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.volume, type: 'bar', name: 'Volume', xaxis: 'x', yaxis: 'y3', marker: { color: 'rgba(100,100,100,0.6)' } });
        }

        if (showRSI && chartDataRaw.RSI?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.RSI, type: 'scatter', mode: 'lines', name: 'RSI', xaxis: 'x', yaxis: 'y2', line: { color: '#f39c12' } });
        }

        // Domains computation
        const reserves = { volume: showVolume, rsi: showRSI };
        let y3Domain = [0, 0];
        let y2Domain = [0, 0];
        let yDomain = [0, 1];
        if (reserves.volume && reserves.rsi) {
          y3Domain = [0, 0.18];
          y2Domain = [0.18, 0.28];
          yDomain = [0.28, 1];
        } else if (reserves.volume && !reserves.rsi) {
          y3Domain = [0, 0.18];
          yDomain = [0.18, 1];
        } else if (!reserves.volume && reserves.rsi) {
          y2Domain = [0, 0.18];
          yDomain = [0.18, 1];
        }

        const layoutObj = {
          margin: { t: 10, r: 8, l: 40, b: 28 },
          xaxis: { rangeslider: { visible: false } },
          yaxis: { domain: yDomain, title: 'Price' },
          yaxis2: { domain: y2Domain, title: 'RSI/Score' },
          yaxis3: { domain: y3Domain, anchor: 'x' },
          legend: { orientation: 'v', x: 0.99, xanchor: 'right', y: 0.98 },
          hovermode: 'x unified',
          plot_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          paper_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          font: { color: !isDarkTheme ? '#111111' : '#E0E0E0' }
        };

        if (!cancelled) {
          setData(traces);
          setLayout(layoutObj);
          setSidebarCore({
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
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Unknown error');
          setIsLoading(false);
        }
      }
    }
    fetchChart();
    return () => { cancelled = true; };
  }, [ticker, period, interval, chartType, showVolume, showBollinger, showRSI, showVWAP, showSMA, isDarkTheme, ML_API_URL, key, cacheBypassKey, shouldForceLine]);

  return { data, layout, error, isLoading, sidebarCore, refresh, shouldForceLine };
}
