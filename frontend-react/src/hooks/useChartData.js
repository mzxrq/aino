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

export function useChartData({ ticker, period, interval, chartType, showVolume, showBollinger, showRSI, showVWAP, showSMA, isDarkTheme, ML_API_URL, showLegend, plotlyLegendPos }) {
  const [data, setData] = useState([]);
  const [layout, setLayout] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCore, setSidebarCore] = useState(null);
  const [traceList, setTraceList] = useState([]);
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
          // Primary: POST /chart_full
          let json;
          let res;
          try {
            res = await fetch(`${ML_API_URL}/chart_full`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker, period, interval })
            });
          } catch (e) {
            res = null;
          }
          if (res && res.ok) {
            json = await res.json();
          } else {
            // If POST failed with a status, log body to help diagnose 422/validation errors
            if (res && !res.ok) {
              try {
                const bodyText = await res.text();
                console.warn('chart_full POST failed', res.status, bodyText);
              } catch (e) {
                console.warn('chart_full POST failed', res.status);
              }
            }
            // Fallback: GET /chart
            try {
              const res2 = await fetch(`${ML_API_URL}/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`);
              if (res2.ok) {
                json = await res2.json();
              } else {
                // propagate error with status
                const detail = await (async () => { try { return await res2.json(); } catch { return null; } })();
                throw new Error(`Backend error ${res2.status}${detail && detail.detail ? `: ${detail.detail}` : ''}`);
              }
            } catch (e) {
              const status = res ? res.status : 'network';
              const errDetail = await (async () => { try { return res ? await res.json() : null; } catch { return null; } })();
              throw new Error(`Backend error ${status}${errDetail && errDetail.detail ? `: ${errDetail.detail}` : ''}`);
            }
          }
          chartDataRaw = json ? (json[ticker] || json[Object.keys(json)[0]] || json) : null;
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
        const useCategoryAxis = String(period).toLowerCase() === '5d';

        if (finalChartType === 'candlestick') {
          traces.push({
            x: chartDataRaw.dates,
            open: chartDataRaw.open,
            high: chartDataRaw.high,
            low: chartDataRaw.low,
            close: chartDataRaw.close,
            type: 'candlestick',
            name: `${ticker} Price`,
            traceId: 'price',
            xaxis: 'x',
            yaxis: 'y',
            hovertemplate: /m|h$/.test(String(interval)) ? '<b>%{x|%Y-%m-%d %H:%M}</b><extra></extra>' : '<b>%{x|%b %d}</b><extra></extra>'
          });
        } else {
          traces.push({
            x: chartDataRaw.dates,
            y: chartDataRaw.close,
            type: 'scatter',
            mode: 'lines',
            name: `${ticker} Close`,
            traceId: 'price',
            line: { shape: 'spline', width: 2 },
            fill: '',
            xaxis: 'x',
            yaxis: 'y',
            hovertemplate: /m|h$/.test(String(interval)) ? '<b>%{x|%Y-%m-%d %H:%M}</b><extra></extra>' : '<b>%{x|%b %d}</b><extra></extra>'
          });
        }

        if (showVWAP && chartDataRaw.VWAP?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.VWAP, type: 'scatter', mode: 'lines', name: 'VWAP', traceId: 'vwap', line: { dash: 'dash' }, xaxis: 'x', yaxis: 'y', hoverinfo: 'skip' });
        }

        if (chartDataRaw.bollinger_bands?.sma) {
          const bb = chartDataRaw.bollinger_bands;
          if (showBollinger) {
            traces.push({ x: chartDataRaw.dates, y: bb.lower, type: 'scatter', mode: 'lines', name: 'BB Lower', traceId: 'bb_lower', line: { color: 'rgba(86,119,164,0.4)', width: 0 }, fill: 'none', xaxis: 'x', yaxis: 'y', hoverinfo: 'skip' });
            traces.push({ x: chartDataRaw.dates, y: bb.upper, type: 'scatter', mode: 'lines', name: 'BB Upper', traceId: 'bb_upper', line: { color: 'rgba(86,119,164,0.4)', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(86,119,164,0.1)', xaxis: 'x', yaxis: 'y', hoverinfo: 'skip' });
          }
          if (showSMA) {
            traces.push({ x: chartDataRaw.dates, y: bb.sma, type: 'scatter', mode: 'lines', name: 'SMA (20)', traceId: 'bb_sma', line: { color: 'rgba(86,119,164,0.9)', width: 1 }, xaxis: 'x', yaxis: 'y', hoverinfo: 'skip' });
          }
        }

        if (chartDataRaw.anomaly_markers?.dates?.length) {
          traces.push({ x: chartDataRaw.anomaly_markers.dates, y: chartDataRaw.anomaly_markers.y_values, type: 'scatter', mode: 'markers', marker: { color: 'red', size: 8 }, name: 'Anomalies', traceId: 'anomalies', xaxis: 'x', yaxis: 'y', hoverinfo: 'skip' });
        }

        if (showVolume && chartDataRaw.volume?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.volume, type: 'bar', name: 'Volume', traceId: 'volume', xaxis: 'x', yaxis: 'y3', marker: { color: 'rgba(100,100,100,0.6)' }, hovertemplate: '%{y}<extra></extra>' });
        }

        if (showRSI && chartDataRaw.RSI?.length) {
          traces.push({ x: chartDataRaw.dates, y: chartDataRaw.RSI, type: 'scatter', mode: 'lines', name: 'RSI', traceId: 'rsi', xaxis: 'x', yaxis: 'y2', line: { color: '#f39c12' }, hoverinfo: 'skip' });
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

        const legendPosMap = {
          'top-left':   { x: 0.01, y: 0.99, xanchor: 'left',  yanchor: 'top',    orientation: 'v' },
          'top-right':  { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top',    orientation: 'v' },
          'bottom-left':{ x: 0.01, y: 0.01, xanchor: 'left',  yanchor: 'bottom', orientation: 'h' },
          'bottom-right':{x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', orientation: 'h' },
        };
        const legendCfg = legendPosMap[plotlyLegendPos || 'bottom-left'];

        const layoutObj = {
          // Extra right margin to keep right-side y-axis readable
          margin: { t: 10, r: 56, l: 40, b: 28 },
          xaxis: { 
            rangeslider: { visible: false },
            showspikes: true,
            spikemode: 'across',
            spikesnap: 'cursor',
            spikecolor: isDarkTheme ? 'rgba(150,150,150,0.5)' : 'rgba(100,100,100,0.5)',
            spikethickness: 1,
            spikedash: 'dot',
            type: useCategoryAxis ? 'category' : 'date'
          },
          yaxis: { 
            domain: yDomain, 
            title: 'Price',
            side: 'right',
            showspikes: true,
            spikemode: 'across',
            spikesnap: 'cursor',
            spikecolor: isDarkTheme ? 'rgba(150,150,150,0.5)' : 'rgba(100,100,100,0.5)',
            spikethickness: 1,
            spikedash: 'dot'
          },
          yaxis2: { domain: y2Domain, title: 'RSI/Score' },
          yaxis3: { domain: y3Domain, anchor: 'x' },
          showlegend: !!showLegend,
          legend: !!showLegend ? { ...legendCfg } : undefined,
          hovermode: 'x',
          plot_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          paper_bgcolor: !isDarkTheme ? '#ffffff' : '#0f0f0f',
          font: { color: !isDarkTheme ? '#111111' : '#E0E0E0' }
        };

        if (!cancelled) {
          setData(traces);
          // Build a simple traceList mapping traceId -> index and name for robust toggling
          const traceList = traces.map((t, i) => ({ id: t.traceId || `trace_${i}`, name: t.name || `trace_${i}`, index: i }));
          setTraceList && setTraceList(traceList);
          setLayout(layoutObj);
          // Include last values for indicators so legend can show them
          setSidebarCore({
            displayTicker: chartDataRaw.displayTicker || ticker,
            rawTicker: chartDataRaw.rawTicker || ticker,
            companyName: chartDataRaw.companyName || null,
            market: chartDataRaw.market || null,
            open: chartDataRaw.open ? chartDataRaw.open[chartDataRaw.open.length - 1] : null,
            high: chartDataRaw.high ? chartDataRaw.high[chartDataRaw.high.length - 1] : null,
            low: chartDataRaw.low ? chartDataRaw.low[chartDataRaw.low.length - 1] : null,
            close: chartDataRaw.close ? chartDataRaw.close[chartDataRaw.close.length - 1] : null,
            volume: chartDataRaw.volume ? chartDataRaw.volume[chartDataRaw.volume.length - 1] : 'N/A',
            VWAP: chartDataRaw.VWAP ? chartDataRaw.VWAP[chartDataRaw.VWAP.length - 1] : null,
            RSI: chartDataRaw.RSI ? chartDataRaw.RSI[chartDataRaw.RSI.length - 1] : null,
            BB_upper: chartDataRaw.bollinger_bands?.upper ? chartDataRaw.bollinger_bands.upper[chartDataRaw.bollinger_bands.upper.length - 1] : null,
            BB_lower: chartDataRaw.bollinger_bands?.lower ? chartDataRaw.bollinger_bands.lower[chartDataRaw.bollinger_bands.lower.length - 1] : null,
            BB_sma: chartDataRaw.bollinger_bands?.sma ? chartDataRaw.bollinger_bands.sma[chartDataRaw.bollinger_bands.sma.length - 1] : null,
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

  return { data, layout, error, isLoading, sidebarCore, refresh, shouldForceLine, traceList };
}