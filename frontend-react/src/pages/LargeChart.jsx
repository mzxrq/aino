import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EchartsCard from '../components/EchartsCard';
import '../css/LargeChart.css';

const PY_API = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:8000';

const PERIOD_PRESETS = [
  { label: '1d', period: '1d', interval: '1m' },
  { label: '5d', period: '5d', interval: '30m' },
  { label: '1mo', period: '1mo', interval: '30m' },
  { label: '6mo', period: '6mo', interval: '1d' },
  { label: '1y', period: '1y', interval: '1d' },
  { label: '5y', period: '5y', interval: '1wk' }
];

function enforceIntervalRules(period, interval) {
  const p = (period || '').toLowerCase();
  if (p === '1d') return ['1m', '5m', '30m', '1h'].includes(interval) ? interval : '1m';
  if (p === '5d') return ['30m', '1h', '1d', '1wk'].includes(interval) ? interval : '30m';
  return ['30m', '1h', '1d', '1wk'].includes(interval) ? interval : '1d';
}

export default function LargeChart() {
  const { ticker: paramTicker } = useParams();
  const navigate = useNavigate();
  const [ticker, setTicker] = useState((paramTicker || 'AAPL').toUpperCase());
  const [tickerInput, setTickerInput] = useState((paramTicker || 'AAPL').toUpperCase());
  const [period, setPeriod] = useState('1d');
  const [interval, setInterval] = useState('1m');
  const [payload, setPayload] = useState({});
  const [financials, setFinancials] = useState({ net_income: [], news: [], balance_sheet: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCandles, setShowCandles] = useState(true);
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    if (!paramTicker) return;
    setTicker(paramTicker.toUpperCase());
    setTickerInput(paramTicker.toUpperCase());
  }, [paramTicker]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const enforced = enforceIntervalRules(period, interval);
      try {
        const url = `${PY_API}/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(enforced)}`;
        const res = await fetch(url);
        const json = await res.json();
        const resolved = (json && typeof json === 'object') ? (
          json[ticker.toUpperCase()] || json[ticker] || (Object.values(json || {})[0]) || json
        ) : json;
        const finalPayload = resolved && typeof resolved === 'object' ? { ...resolved } : {};
        if (!cancelled) setPayload(finalPayload);
      } catch (e) {
        if (!cancelled) setError('Unable to load chart data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ticker, period, interval]);

  useEffect(() => {
    let cancelled = false;
    async function loadFinancials() {
      try {
        const finUrl = `${PY_API}/financials?ticker=${encodeURIComponent(ticker)}`;
        const fres = await fetch(finUrl);
        if (!fres.ok) throw new Error('financials');
        const fj = await fres.json();
        if (!cancelled) setFinancials(fj || {});
      } catch (e) {
        if (!cancelled) setFinancials({ net_income: [], news: [], balance_sheet: {} });
      }
    }
    loadFinancials();
    return () => { cancelled = true; };
  }, [ticker]);

  const dates = useMemo(() => (payload.dates || []), [payload.dates]);
  const open = useMemo(() => payload.open || [], [payload.open]);
  const high = useMemo(() => payload.high || [], [payload.high]);
  const low = useMemo(() => payload.low || [], [payload.low]);
  const close = useMemo(() => payload.close || [], [payload.close]);
  const volume = useMemo(() => payload.volume || [], [payload.volume]);
  const anomalies = useMemo(() => (payload.anomaly_markers?.dates || []).map((d, i) => ({
    date: d,
    y: (payload.anomaly_markers?.y_values || [])[i]
  })).filter(x => x.date && (x.y !== undefined && x.y !== null)), [payload.anomaly_markers]);
  const VWAP = useMemo(() => payload.VWAP || [], [payload.VWAP]);
  const bollinger_bands = useMemo(() => payload.bollinger_bands || { lower: [], upper: [], sma: [] }, [payload.bollinger_bands]);

  const lastClose = close.length ? close[close.length - 1] : null;
  const prevClose = close.length > 1 ? close[close.length - 2] : null;
  const change = (lastClose !== null && prevClose !== null) ? (lastClose - prevClose) : null;
  const changePct = (change !== null && prevClose) ? (change / prevClose) * 100 : null;

  const netIncome = useMemo(() => (financials.net_income || []).slice(0, 4), [financials.net_income]);
  const news = useMemo(() => Array.isArray(financials.news) ? financials.news.slice(0, 3) : [], [financials.news]);

  const handlePreset = (p) => {
    setPeriod(p.period);
    setInterval(p.interval);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = (tickerInput || '').trim().toUpperCase() || 'AAPL';
    setTicker(next);
    navigate(`/chart/u/${next}`);
  };

  return (
    <div className="lc-shell">
      <div className="lc-navbar">
        <form className="lc-ticker-form" onSubmit={handleSubmit}>
          <input
            className="lc-ticker-input"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Ticker"
          />
          <button type="submit" className="lc-btn">Go</button>
        </form>
        <div className="lc-preset-row">
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              className={`lc-pill ${period === p.period ? 'active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </button>
          ))}
          <div className="lc-field">
            <label>Period</label>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="lc-field">
            <label>Interval</label>
            <input value={interval} onChange={(e) => setInterval(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="lc-body">
        <aside className="lc-sidebar">
          <div className="lc-card lc-ticker-card">
            <div className="lc-row">
              <div className="lc-ticker-name">{ticker}</div>
              <div className="lc-status">
                <span className="lc-dot" />
                <span>OPEN</span>
              </div>
            </div>
            <div className="lc-price-row">
              <div className="lc-price">{lastClose ? lastClose.toFixed(2) : '--'}</div>
              <div className={`lc-change ${change && change < 0 ? 'down' : 'up'}`}>
                {change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct ? changePct.toFixed(2) : '0.00'}%)` : '--'}
              </div>
            </div>
            <div className="lc-market">{payload.market || 'US (NASDAQ)'}</div>
            <button className="lc-btn follow" type="button">Follow</button>
          </div>

          <div className="lc-card">
            <div className="lc-card-header">
              <span>Financials</span>
            </div>
            <div className="lc-mini-bars">
              {netIncome.length === 0 && <div className="lc-muted">No net income data</div>}
              {netIncome.map((item) => (
                <div key={item.period} className="lc-bar-row">
                  <span className="lc-bar-label">{item.period}</span>
                  <div className="lc-bar-track">
                    <div
                      className="lc-bar-fill"
                      style={{ width: `${Math.min(100, Math.abs(item.value) / 1_000_000 * 10)}%` }}
                    />
                  </div>
                  <span className="lc-bar-value">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lc-card">
            <div className="lc-card-header">
              <span>News</span>
            </div>
            <div className="lc-news-list">
              {news.length === 0 && <div className="lc-muted">No recent news</div>}
              {news.map((n, idx) => (
                <a key={idx} className="lc-news-item" href={n.link || n.url || '#'} target="_blank" rel="noreferrer">
                  <div className="lc-news-title">{n.title || 'Headline'}</div>
                  <div className="lc-news-summary">{n.summary || n.text || ''}</div>
                  <div className="lc-news-date">{n.date || n.providerPublishTime || ''}</div>
                </a>
              ))}
            </div>
          </div>

          <div className="lc-footer">
            <button type="button" className="lc-btn ghost">CSV</button>
            <button type="button" className="lc-btn ghost">More</button>
            <button type="button" className="lc-btn ghost">Follow</button>
            <button type="button" className="lc-btn ghost" onClick={() => setTimezone(timezone === 'UTC' ? 'Asia/Tokyo' : 'UTC')}>
              {timezone === 'UTC' ? 'UTC' : 'UTC+9'}
            </button>
          </div>
        </aside>

        <main className="lc-main">
          {loading && <div className="lc-muted">Loading chart…</div>}
          {error && <div className="lc-error">{error}</div>}
          {!loading && !error && (
            <EchartsCard
              ticker={ticker}
              dates={dates}
              open={open}
              high={high}
              low={low}
              close={close}
              volume={volume}
              VWAP={VWAP}
              bollinger_bands={bollinger_bands}
              anomalies={anomalies}
              timezone={timezone}
              period={period}
              interval={interval}
              chartMode={showCandles ? 'candlestick' : 'line'}
              showVolume
              showVWAP
              showBB
              showRSI={false}
              showMACD={false}
            />
          )}
        </main>
      </div>
    </div>
  );
}
