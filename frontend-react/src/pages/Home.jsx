// src/pages/Home.jsx
import React, { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import { AuthContext } from '../context/contextBase';
import '../css/Home.css';
import logoSvg from '../assets/aino.svg';
import Footer from '../components/Footer';

// --- Constants & Fallbacks ---
const fallbacka_loading = [
  { id: '1', ticker: '#', company: '########', price: 1000, change: 0.1, anomalies: 0 },
  { id: '2', ticker: '#', company: '########', price: 1000, change: 0.2, anomalies: 1 },
  { id: '3', ticker: '#', company: '########', price: 1000, change: -0.1, anomalies: 2 },
  { id: '4', ticker: '#', company: '########', price: 1000, change: -0.2, anomalies: 3 }
];

const fallbackn_loading = [
  { id: 1, title: '############', source: '########' },
  { id: 2, title: '############', source: '########' },
  { id: 3, title: '############', source: '########' }
];

const PY_CACHE_TTL = 300000; // 5 minutes

// --- Optimized News Fetch Logic ---
function useNewsFetch(ticker, apiBase) {
  const [news, setNews] = useState(null);

  useEffect(() => {
    if (!ticker || ticker === '#') return;
    let isMounted = true;

    const fetchNewsData = async () => {
      try {
        // Attempt Top Viewed News
        const topRes = await fetch(`${apiBase}/node/news/views/top?limit=6`);
        if (topRes.ok) {
          const payload = await topRes.json();
          const items = (payload.items || []).map((it, idx) => ({
            id: it.articleKey || idx,
            title: it.title || 'Market Update',
            source: it.source || 'News',
            link: it.url || null,
            thumbnail: it.thumbnail || null,
            views: it.views || 0
          }));
          if (isMounted && items.length) return setNews(items);
        }

        // Fallback to Node Proxy News
        const res = await fetch(`${apiBase}/node/news?q=${encodeURIComponent(ticker)}&pageSize=6`);
        if (res.ok) {
          const j = await res.json();
          const articles = (j.articles || []).map((n, idx) => ({
            id: idx,
            title: n.title || 'Market Update',
            source: n.source?.name || 'News',
            link: n.url || null,
            thumbnail: n.urlToImage || null,
            views: 0
          }));
          if (isMounted) setNews(articles.length ? articles : fallbackn_loading);
        }
      } catch (e) {
        if (isMounted) setNews(fallbackn_loading);
      }
    };

    fetchNewsData();
    return () => { isMounted = false; };
  }, [ticker, apiBase]);

  return news;
}

export default function Home() {
  const navigate = useNavigate();
  const { isLoggedIn } = useContext(AuthContext);

  // States
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [topAnomalies, setTopAnomalies] = useState([]);
  const [tickerInfoMap, setTickerInfoMap] = useState(new Map());
  const [loadingMap, setLoadingMap] = useState({});
  const [masterTickersMap, setMasterTickersMap] = useState(null);

  // Refs for API safety
  const hasInitialFetched = useRef(false);
  const pyCacheRef = useRef(new Map());

  const API_URL = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
  const PY_URL = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';

  // Derived stable key for news trigger
  const topTickerSymbol = topAnomalies?.[0]?.ticker || recentAnomalies?.[0]?.ticker || null;
  const news = useNewsFetch(topTickerSymbol, API_URL);

  // --- Helpers ---
  const fetchPyJson = useCallback(async (path) => {
    const url = `${PY_URL}/py${path}`;
    const now = Date.now();

    if (pyCacheRef.current.has(url)) {
      const entry = pyCacheRef.current.get(url);
      if (now - entry.ts < PY_CACHE_TTL) return entry.data;
    }

    const r = await fetch(url);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const json = await r.json();
    pyCacheRef.current.set(url, { ts: now, data: json });
    return json;
  }, [PY_URL]);

  const fetchTickerInfos = useCallback(async (tickers = []) => {
    const uniqueTickers = [...new Set(tickers)].filter(t => t && t !== '#');
    const TTL = 24 * 60 * 60 * 1000; // 1 day cache
    const now = Date.now();

    uniqueTickers.forEach(async (t) => {
      const key = t.toUpperCase();
      const storageKey = `ticker_info_${key}`;
      
      // Check LocalStorage first to skip network
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (now - parsed.ts < TTL) {
          setTickerInfoMap(prev => new Map(prev).set(key, parsed.info));
          return;
        }
      }

      setLoadingMap(prev => ({ ...prev, [key]: true }));
      try {
        const json = await fetchPyJson(`/stock/info?ticker=${encodeURIComponent(t)}`);
        localStorage.setItem(storageKey, JSON.stringify({ ts: now, info: json }));
        setTickerInfoMap(prev => new Map(prev).set(key, json));
      } catch (e) {
        console.error(`Failed info for ${t}`);
      } finally {
        setLoadingMap(prev => ({ ...prev, [key]: false }));
      }
    });
  }, [fetchPyJson]);

  // --- Effects ---

  // 1. Load Master Tickers once
  useEffect(() => {
    fetch('/master_tickers.json')
      .then(res => res.json())
      .then(data => {
        const map = new Map();
        data.forEach(item => map.set(item.symbol?.toUpperCase(), item.displayTicker || item.name));
        setMasterTickersMap(map);
      })
      .catch(() => {});
  }, []);

  // 2. Fetch Anomalies (Guarded against double-execution)
  useEffect(() => {
    if (hasInitialFetched.current) return;
    hasInitialFetched.current = true;

    const loadAnomalies = async () => {
      try {
        const res = await fetch(`${API_URL}/node/anomalies/recent?limit=200`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        const list = json?.data || json || [];

        // Process data into Top and Recent
        const aggMap = new Map();
        list.forEach(a => {
          const t = (a.ticker || '').toString().toUpperCase();
          if (!t) return;
          const current = aggMap.get(t) || { ticker: t, anomalies: 0, latest: a };
          current.anomalies = (current.anomalies || 0) + 1;
          const aTs = Date.parse(a.datetime) || 0;
          const curTs = Date.parse(current.latest?.datetime) || 0;
          if (aTs > curTs) current.latest = a;
          aggMap.set(t, current);
        });

        const sortedTop = Array.from(aggMap.values())
          .sort((a, b) => {
            if (b.anomalies !== a.anomalies) return b.anomalies - a.anomalies;
            const at = Date.parse(a.latest?.datetime) || 0;
            const bt = Date.parse(b.latest?.datetime) || 0;
            return bt - at;
          })
          .slice(0, 6)
          .map(item => ({
            id: item.ticker,
            ticker: item.ticker,
            company: item.latest?.companyName || item.latest?.company || item.ticker,
            price: item.latest?.close || 0,
            anomalies: item.anomalies,
            datetime: item.latest?.datetime
          }));

        // sort overall anomalies by datetime desc for "recent" list
        const sortedByDate = [...list].sort((x, y) => {
          const tx = Date.parse(x.datetime) || 0;
          const ty = Date.parse(y.datetime) || 0;
          return ty - tx;
        });

        const sortedRecent = sortedByDate.slice(0, 6).map((a, idx) => ({
          id: `${(a.ticker||'').toUpperCase()}-${idx}-${a.datetime || ''}`,
          ticker: (a.ticker || '').toUpperCase(),
          company: a.companyName || a.company || a.ticker,
          price: a.close || 0,
          datetime: a.datetime,
          anomalies: 1
        }));

        setRecentAnomalies(sortedRecent);
        setTopAnomalies(sortedTop);

        // Fetch extra info (logos/real-time price)
        fetchTickerInfos([...new Set([...sortedRecent, ...sortedTop].map(i => i.ticker))]);
      } catch (e) {
        setRecentAnomalies(fallbacka_loading);
        setTopAnomalies(fallbacka_loading);
      }
    };

    loadAnomalies();
  }, [API_URL, fetchTickerInfos]);

  // Handlers
  const handleChart = () => navigate(topTickerSymbol ? `/chart/u/${encodeURIComponent(topTickerSymbol)}` : '/chart');
  
  const handleNewsClick = (item) => {
    if (item.link) window.open(item.link, '_blank');
    fetch(`${API_URL}/node/news/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: item.id, ticker: topTickerSymbol })
    }).catch(() => {});
  };

  return (
    <div className="home-container">
      <section className="hero-section-full">
        <div className="hero-content-centered">
          <img src={logoSvg} alt="Logo" className="hero-logo website-logo" />
          <p className="hero-motto"><Trans>Stock Trading Anomaly Detector</Trans></p>
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={handleChart}><Trans>Get Started</Trans></button>
            {!isLoggedIn && <button className="btn btn-line" onClick={() => navigate('/login')}><Trans>LINE Login</Trans></button>}
          </div>
        </div>
      </section>

      <div className="homepage-grid">
        {/* Left Column: Recent Anomalies */}
        <div className="left-column">
          <div className="card anomaly-card">
            <div className="card-header">
              <h3><Trans>Recent anomaly found</Trans></h3>
              <Link to="/list" className="show-more"><Trans>Show more ›</Trans></Link>
            </div>
            <div className="card-body">
              {recentAnomalies.map(a => (
                <AnomalyRow 
                  key={a.id} 
                  data={a} 
                  info={tickerInfoMap.get(a.ticker)} 
                  loading={loadingMap[a.ticker]}
                  onClick={() => navigate(`/chart/u/${encodeURIComponent(a.ticker)}`)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Top Anomalies & News */}
        <div className="right-column">
          <div className="card anomaly-card">
            <div className="card-header"><h3><Trans>Most anomaly found</Trans></h3></div>
            <div className="card-body">
              {topAnomalies.slice(0, 3).map(a => (
                <AnomalyRow 
                  key={a.id} 
                  data={a} 
                  info={tickerInfoMap.get(a.ticker)} 
                  loading={loadingMap[a.ticker]}
                  onClick={() => navigate(`/chart/u/${encodeURIComponent(a.ticker)}`)}
                />
              ))}
            </div>
          </div>

          <div className="news-card card">
            <div className="card-header"><h3><Trans>News</Trans></h3></div>
            <ul className="news-list">
              {(news || fallbackn_loading).map(n => (
                <li key={n.id} className="news-item" onClick={() => handleNewsClick(n)}>
                  {n.thumbnail ? <img src={n.thumbnail} className="news-thumb" alt="" /> : <div className="news-thumb--placeholder" />}
                  <div className="news-details">
                    <div className="news-title">{n.title}</div>
                    <div className="news-source">
                      {n.source} {n.views > 0 && <span>· {n.views} views</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// Sub-component for cleaner rendering
function AnomalyRow({ data, info, loading, onClick }) {
  const { i18n } = useLingui();
  const ticker = data.ticker?.toUpperCase();
  const price = info?.price ?? data.price;
  const pct = info?.change_pct ?? 0;
  
  function formatTimestamp(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const locale = (i18n && i18n.locale) ? i18n.locale : 'en';
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        year: 'numeric', month: 'short', day: 'numeric'
      }).format(d);
    } catch (e) {
      return iso;
    }
  }
  
  return (
    <div className="anomaly-row" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="logo-circle">
        {loading ? <div className="ticker-loader" /> : (
          <img 
            src={info?.logo || `https://assets.parqet.com/logos/symbol/${ticker}?format=png`} 
            alt="" 
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>
      <div className="anomaly-meta">
        <div className="ticker">{getDisplayFromRaw(ticker)}</div>
        <div className="company">{data.company}</div>
      </div>
      <div className="anomaly-stats">
        <div className={`price ${pct >= 0 ? 'up' : 'down'}`}>
          {pct >= 0 ? '↑' : '↓'} {Number(price).toLocaleString()} 
          <span className="percent"> {pct > 0 ? '+' : ''}{Number(pct).toFixed(2)}%</span>
        </div>
        <div className="anomaly-time">{formatTimestamp(data.datetime)}</div>
        <div className="anomaly-count">Found {data.anomalies} anomalies</div>
      </div>
    </div>
  );
}