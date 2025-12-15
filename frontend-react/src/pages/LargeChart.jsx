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

const TIMEZONES = [
  { offset: 0, label: 'UTC', name: 'UTC' },
  { offset: 1, label: 'UTC+1', name: 'Europe/London' },
  { offset: 2, label: 'UTC+2', name: 'Europe/Paris' },
  { offset: 3, label: 'UTC+3', name: 'Europe/Moscow' },
  { offset: 5.5, label: 'UTC+5:30', name: 'Asia/Kolkata' },
  { offset: 8, label: 'UTC+8', name: 'Asia/Singapore' },
  { offset: 9, label: 'UTC+9', name: 'Asia/Tokyo' },
  { offset: -5, label: 'UTC-5', name: 'America/New_York' },
  { offset: -8, label: 'UTC-8', name: 'America/Los_Angeles' }
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
  const [period, setPeriod] = useState('1d');
  const [interval, setInterval] = useState('1m');
  const [payload, setPayload] = useState({});
  const [financials, setFinancials] = useState({ net_income: [], news: [], balance_sheet: {}, income_stmt: {}, cash_flow: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCandles, setShowCandles] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [financialTab, setFinancialTab] = useState('income');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (!paramTicker) return;
    setTicker(paramTicker.toUpperCase());
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

  const netIncome = useMemo(() => {
    const data = financials.income_stmt || {};
    return Object.entries(data).slice(0, 4).map(([key, value]) => ({
      period: key,
      value: value || 0
    }));
  }, [financials.income_stmt]);

  const balanceSheetData = useMemo(() => {
    const data = financials.balance_sheet || {};
    return Object.entries(data).slice(0, 8).map(([key, value]) => ({
      period: key,
      value: value || 0
    }));
  }, [financials.balance_sheet]);

  const cashFlowData = useMemo(() => {
    const data = financials.cash_flow || {};
    return Object.entries(data).slice(0, 4).map(([key, value]) => ({
      period: key,
      value: value || 0
    }));
  }, [financials.cash_flow]);

  const news = useMemo(() => Array.isArray(financials.news) ? financials.news.slice(0, 5) : [], [financials.news]);

  const handlePreset = (p) => {
    setPeriod(p.period);
    setInterval(p.interval);
  };

  const downloadFinancialsCSV = () => {
    const currentData = financialTab === 'income' ? netIncome : financialTab === 'balance' ? balanceSheetData : cashFlowData;
    if (!currentData.length) return;

    const header = ['Period', 'Value'];
    const rows = currentData.map(item => [item.period, item.value]);
    const csv = [header, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}-${financialTab}-financials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lc-shell">
      {/* Navbar with period controls only */}
      <div className="lc-navbar">
        <div className="lc-ticker-display">{ticker}</div>
        <div className="lc-preset-row">
          {PERIOD_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              className={`lc-pill ${period === p.period && interval === p.interval ? 'active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lc-body">
        {/* Sidebar with ticker info, financials, news */}
        <aside className="lc-sidebar">
          {/* Ticker Card */}
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

          {/* Financials Card - TradingView Style */}
          <div className="lc-card">
            <div className="lc-card-header">
              <span>Financials</span>
            </div>
            <div className="lc-financial-tabs">
              <button
                className={`lc-tab ${financialTab === 'income' ? 'active' : ''}`}
                onClick={() => setFinancialTab('income')}
              >
                Income
              </button>
              <button
                className={`lc-tab ${financialTab === 'balance' ? 'active' : ''}`}
                onClick={() => setFinancialTab('balance')}
              >
                Balance
              </button>
              <button
                className={`lc-tab ${financialTab === 'cash' ? 'active' : ''}`}
                onClick={() => setFinancialTab('cash')}
              >
                Cash Flow
              </button>
            </div>
            <div className="lc-financials-content">
              {financialTab === 'income' && (
                <div className="lc-financial-table">
                  {netIncome.length === 0 ? (
                    <div className="lc-muted">No income data available</div>
                  ) : (
                    netIncome.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">${(item.value / 1_000_000_000).toFixed(2)}B</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {financialTab === 'balance' && (
                <div className="lc-financial-table">
                  {balanceSheetData.length === 0 ? (
                    <div className="lc-muted">No balance sheet data available</div>
                  ) : (
                    balanceSheetData.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">${(item.value / 1_000_000_000).toFixed(2)}B</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {financialTab === 'cash' && (
                <div className="lc-financial-table">
                  {cashFlowData.length === 0 ? (
                    <div className="lc-muted">No cash flow data available</div>
                  ) : (
                    cashFlowData.map(item => (
                      <div key={item.period} className="lc-fin-row">
                        <div className="lc-fin-label">{item.period}</div>
                        <div className="lc-fin-value">${(item.value / 1_000_000_000).toFixed(2)}B</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* News Card */}
          <div className="lc-card">
            <div className="lc-card-header">
              <span>News</span>
            </div>
            <div className="lc-news-list">
              {news.length === 0 && <div className="lc-muted">No recent news</div>}
              {news.map((n, idx) => (
                <a
                  key={idx}
                  className="lc-news-item"
                  href={n.link || n.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="lc-news-source">{n.source || 'News'}</div>
                  <div className="lc-news-title">{n.title || 'Headline'}</div>
                  <div className="lc-news-date">{n.date || n.providerPublishTime || ''}</div>
                </a>
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="lc-footer">
            <button
              type="button"
              className="lc-btn ghost"
              onClick={downloadFinancialsCSV}
              title="Download financial data as CSV"
            >
              CSV
            </button>
            <div className="lc-more-menu">
              <button
                type="button"
                className="lc-btn ghost"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
              >
                More
              </button>
              {showMoreMenu && (
                <div className="lc-more-options">
                  <button className="lc-menu-item">Subscribe</button>
                  <button className="lc-menu-item">Share</button>
                  <button className="lc-menu-item">Settings</button>
                </div>
              )}
            </div>
            <div className="lc-timezone-selector">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="lc-tz-select"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.name} value={tz.name}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* Main chart area */}
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
