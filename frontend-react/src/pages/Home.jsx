// src/pages/Home.jsx
import React, { useEffect, useState, useCallback, useContext, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import { getLocalizedCompanyName } from '../utils/companyNameUtils';
import { AuthContext } from '../context/contextBase';
import '../css/Home.css';
import logoSvg from '../assets/aino.svg';
import Footer from '../components/Footer';

// --- Constants & Fallbacks ---
const FALLBACK_ANOMALIES = [
  { id: '1', ticker: '#', company: '########', price: 1000, change: 0.1, anomalies: 0 },
  { id: '2', ticker: '#', company: '########', price: 1000, change: 0.2, anomalies: 1 },
  { id: '3', ticker: '#', company: '########', price: 1000, change: -0.1, anomalies: 2 },
  { id: '4', ticker: '#', company: '########', price: 1000, change: -0.2, anomalies: 3 }
];

const FALLBACK_NEWS = [
  { id: 1, title: '############', source: '########' },
  { id: 2, title: '############', source: '########' },
  { id: 3, title: '############', source: '########' }
];

const TICKER_SUFFIXES = ['.T', '.TO', '.BK', '.KS', '.PA', '.L', '.V', '.SA', '.AX', '.MI', '.SS', '.SZ'];

// --- External Helpers ---
const _inFlightRequests = new Map();

async function fetchWithDedup(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let key = `${method} ${url}`;
  if (method !== 'GET' && options.body) {
    try { key += ' ' + (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)); } catch (_e) { }
  }
  if (_inFlightRequests.has(key)) return _inFlightRequests.get(key);

  const p = (async () => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? await res.json() : await res.text();
  })();

  _inFlightRequests.set(key, p);
  p.finally(() => _inFlightRequests.delete(key));
  return p;
}

const normalizeTickerVariants = (sym) => {
  if (!sym) return [];
  const s = String(sym).toUpperCase().trim();
  const variants = new Set([s]);
  if (s.includes('.')) variants.add(s.split('.')[0]);
  if (s.includes('-')) variants.add(s.split('-')[0]);
  if (s.includes(':')) variants.add(s.split(':')[0]);
  variants.add(s.replace(/[^A-Z0-9]/g, ''));
  TICKER_SUFFIXES.forEach(suf => { if (s.endsWith(suf)) variants.add(s.slice(0, -suf.length)); });
  return Array.from(variants).filter(Boolean);
};

// --- Sub-Components ---

const TickerLogo = ({ ticker, company, tickerInfoMap, loadingMap }) => {
  const key = String(ticker || '').toUpperCase();
  const info = tickerInfoMap.get(key);
  const loading = !!loadingMap[key];

  if (loading) return <div className="ticker-loader" />;

  const logo = info?.logo || info?.logo_url;
  const parqetLogo = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(key)}?format=png`;
  const src = logo || parqetLogo;

  return (
    <div className="logo-circle" title={company}>
      <img
        src={src}
        alt={getDisplayFromRaw(key) || company}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        loading="lazy"
        decoding="async"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    </div>
  );
};

const AnomalyRow = ({ item, tickerInfoMap, loadingMap, locale, onClick, isMini = false }) => {
  const info = tickerInfoMap.get(item.ticker) || {};
  const loading = !!loadingMap[item.ticker];
  const price = info.price ?? item.price ?? 0;
  const pct = info.change_pct ?? item.change ?? 0;
  const isUp = pct > 0;

  return (
    <div className="anomaly-row" onClick={onClick} style={{ cursor: 'pointer' }}>
      <TickerLogo ticker={item.ticker} company={item.company} tickerInfoMap={tickerInfoMap} loadingMap={loadingMap} />
      
      <div className="anomaly-meta">
        <div className="ticker">{getDisplayFromRaw(item.ticker)}</div>
        <div className="company">
          {isMini ? item.company : getLocalizedCompanyName({ ticker: item.ticker, companyName: item.company, companyNameLocal: item.companyNameLocal }, locale)}
        </div>
      </div>

      <div className="anomaly-stats">
        {loading ? (
          <div className="price">Loading…</div>
        ) : (
          <div className={`price ${isUp ? 'up' : 'down'}`}>
            {isUp ? '↑' : '↓'} {Number(price).toLocaleString()} 
            <span className="percent">{isUp ? '+' : ''}{Number(pct).toFixed(2)}%</span>
          </div>
        )}
        
        {!isMini && (
          <div className="anomaly-time">
            {item.datetime ? new Date(item.datetime).toLocaleString() : (item.date || 'Unknown')}
          </div>
        )}

        <div className="anomaly-count">
          <span className="count-number">{item.anomalies}</span>
          <span className="count-text">{isMini ? 'anml' : `Found ${item.anomalies} anomalies`}</span>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function Home() {
  const navigate = useNavigate();
  const { i18n: lingui } = useLingui();
  const { isLoggedIn } = useContext(AuthContext);

  const [anomalies, setAnomalies] = useState([]);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [topAnomalies, setTopAnomalies] = useState([]);
  const [news, setNews] = useState(null);
  const [newsDebug, setNewsDebug] = useState(null);
  const [masterTickersMap, setMasterTickersMap] = useState(null);
  const [tickerInfoMap, setTickerInfoMap] = useState(new Map());
  const [loadingMap, setLoadingMap] = useState({});
  
  const lastFetchedNewsTicker = useRef(null);

  const API_URL = useMemo(() => import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050', []);
  const PY_BASE = useMemo(() => `${import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000'}/py`, []);

  const fetchPyJson = useCallback(async (path, init) => {
    const r = await fetch(`${PY_BASE}${path}`, init);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return r.json();
  }, [PY_BASE]);

  const findCompanyName = useCallback((sym) => {
    if (!sym || !masterTickersMap) return null;
    const variants = normalizeTickerVariants(sym);
    for (const v of variants) {
      const name = masterTickersMap.get(v);
      if (name) return name;
    }
    return null;
  }, [masterTickersMap]);

  const fetchTickerInfos = useCallback(async (tickers = []) => {
    if (!tickers.length) return;
    const TTL = 86400000; // 1 day
    const now = Date.now();

    const newInfos = new Map();
    const loadingSet = {};

    const fetchTasks = tickers.filter(Boolean).map(async (t) => {
      const tickerKey = String(t).toUpperCase();
      const cacheKey = `ticker_info_${tickerKey}`;

      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached?.ts && (now - cached.ts) < TTL) {
          newInfos.set(tickerKey, cached.info);
          return;
        }
      } catch {}

      loadingSet[tickerKey] = true;
      try {
        const json = await fetchPyJson(`/stock/info?ticker=${encodeURIComponent(t)}`);
        newInfos.set(tickerKey, json);
        localStorage.setItem(cacheKey, JSON.stringify({ ts: now, info: json }));
      } catch {}
    });

    // mark loading flags
    setLoadingMap(prev => ({ ...prev, ...loadingSet }));
    await Promise.allSettled(fetchTasks);

    // clear loading flags for requested tickers
    setLoadingMap(prev => {
      const copy = { ...prev };
      tickers.forEach(t => copy[String(t).toUpperCase()] = false);
      return copy;
    });

    // merge new infos into state
    setTickerInfoMap(prev => {
      const m = new Map(prev);
      newInfos.forEach((v, k) => m.set(k, v));
      return m;
    });
  }, [fetchPyJson]);

  // Effects: Anomalies
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      let list = [];
      try {
        const json = await fetchWithDedup(`${API_URL}/node/anomalies/recent?limit=200`);
        list = json?.data || json || [];
      } catch {
        try {
          const cjson = await fetchWithDedup(`${API_URL}/node/cache?limit=200`);
          const items = cjson?.data || cjson || [];
          items.forEach(c => {
            const payload = c.payload || c;
            const candidates = payload.anomalies || payload.anomaly_markers || payload.payload?.anomalies || [];
            candidates.forEach(a => {
              const ticker = (a.ticker || payload.ticker || '').toUpperCase();
              if (ticker) list.push({ ...a, ticker, datetime: a.date || a.datetime || payload.fetched_at, close: a.y || a.close || payload.close });
            });
          });
        } catch {}
      }

      if (!isMounted) return;

      const tickerMap = new Map();
      list.forEach(a => {
        const t = a.ticker.toUpperCase();
        const existing = tickerMap.get(t) || { ticker: t, company: a.companyName || t, anomalies: 0, latestDatetime: null };
        existing.anomalies++;
        if (!existing.latestDatetime || new Date(a.datetime) > new Date(existing.latestDatetime)) {
          existing.latestDatetime = a.datetime;
          existing.price = a.close || a.price || existing.price;
        }
        tickerMap.set(t, existing);
      });

      const sortedRaw = [...list].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
      
      const recent = [];
      const seen = new Set();
      for (const d of sortedRaw) {
        const t = d.ticker.toUpperCase();
        if (seen.has(t)) continue;
        seen.add(t);
        recent.push({
          id: `${t}-${d.datetime}`,
          ticker: t,
          company: findCompanyName(t) || d.companyName || t,
          companyNameLocal: d.companyNameLocal,
          price: d.close || 0,
          anomalies: 1,
          datetime: d.datetime
        });
        if (recent.length >= 6) break;
      }

      const top = Array.from(tickerMap.values())
        .sort((x, y) => y.anomalies - x.anomalies)
        .slice(0, 6)
        .map((d, i) => ({ ...d, id: `${d.ticker}-${i}`, company: findCompanyName(d.ticker) || d.company }));

      setRecentAnomalies(recent.length ? recent : FALLBACK_ANOMALIES.slice(0, 6));
      setTopAnomalies(top.length ? top : FALLBACK_ANOMALIES);
      setAnomalies(top.length ? top : FALLBACK_ANOMALIES);

      const toFetch = [...new Set([...recent.map(r => r.ticker), ...top.map(t => t.ticker)])].slice(0, 48);
      fetchTickerInfos(toFetch);
    };

    loadData();
    return () => { isMounted = false; };
  }, [API_URL, findCompanyName, fetchTickerInfos]);

  // Effects: Master Tickers
  useEffect(() => {
    // Defer loading the large master_tickers.json until the browser is idle
    const load = async () => {
      try {
        const res = await fetch('/master_tickers.json');
        if (!res.ok) return;
        const data = await res.json();
        const map = new Map();
        data.forEach(item => {
          if (item?.symbol) map.set(item.symbol.toUpperCase(), item.displayTicker || item.name || item.symbol);
        });
        setMasterTickersMap(map);
      } catch (e) {
        // ignore
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2000 });
      return () => window.cancelIdleCallback && window.cancelIdleCallback(id);
    } else {
      const t = setTimeout(load, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  // Effects: News
  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      const topTickerRaw = anomalies?.[0]?.ticker || topAnomalies?.[0]?.ticker || 'AAPL';
      const topTicker = String(topTickerRaw || 'AAPL').toUpperCase();
      if (lastFetchedNewsTicker.current === topTicker) return;
      lastFetchedNewsTicker.current = topTicker;

      const processArticles = (raw) => (raw || []).slice(0, 6).map((n, idx) => {
        const content = n?.content || n;
        const id = n?.articleKey || n?.id || n?.guid || content?.id || idx;
        const title = n?.title || n?.headline || content?.title || content?.summary || content?.description || 'Market Update';
        const source = (n?.source && (n.source.name || n.source)) || (content?.provider && (content.provider.displayName || content.provider)) || n?.publisher || 'News';
        const link = n?.url || n?.link || (content && (content.clickThroughUrl?.url || content.canonicalUrl?.url)) || null;
        const thumbnail = n?.urlToImage || n?.image || n?.thumbnail || content?.thumbnail?.originalUrl || (content?.thumbnail?.resolutions && content.thumbnail.resolutions[0]?.url) || null;
        const pubDate = n?.publishedAt || n?.pubDate || content?.displayTime || content?.pubDate || null;
        const views = n?.views || content?.views || 0;

        return { id, articleKey: id, title, source, link, thumbnail, pubDate, views };
      });

      // Try several ticker variants (e.g., KTB, KTB.BK) to match data shape
      const candidates = normalizeTickerVariants(topTicker);

      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          // 1) Try python financials (may contain news.content array)
          try {
            const url = `${PY_BASE}/financials?ticker=${encodeURIComponent(candidate)}`;
            const data = await fetchWithDedup(url);
            console.debug('news fetch python:', url, data);
            const articles = processArticles(data?.news || []);
            if (articles && articles.length) { if (isMounted) { setNews(articles); setNewsDebug({ source: 'python', url, payload: data }); } return; }
          } catch (e) { console.debug('python news no-data for', candidate, e); }

          // 2) Try node news proxy
          try {
            const url = `${API_URL}/node/news?q=${encodeURIComponent(candidate)}&pageSize=6`;
            const j = await fetchWithDedup(url);
            console.debug('news fetch node:', url, j);
            const articles = processArticles(j?.articles || j || []);
            if (articles && articles.length) { if (isMounted) { setNews(articles); setNewsDebug({ source: 'node', url, payload: j }); } return; }
          } catch (e) { console.debug('node news no-data for', candidate, e); }
        } catch (e) {
          // continue to next candidate
        }
      }

      // 3) Try node top views as fallback
      try {
        const url = `${API_URL}/node/news/views/top?limit=6`;
        const payload = await fetchWithDedup(url);
        console.debug('news fetch node views:', url, payload);
        const articles = processArticles(payload?.items || payload || []);
        if (isMounted && articles.length) { setNews(articles); setNewsDebug({ source: 'node-views', url, payload }); return; }
      } catch (e) { console.debug('node views fetch failed', e); }

      if (isMounted) setNews(FALLBACK_NEWS);
    };
    fetchNews();
    return () => { isMounted = false; };
  }, [anomalies, topAnomalies, PY_BASE, API_URL]);

  // Event Handlers
  const handleChart = () => {
    const ticker = anomalies[0]?.ticker;
    navigate(ticker ? `/chart/u/${encodeURIComponent(ticker)}` : '/chart');
  };

  const handleNewsClick = async (item) => {
    if (!item.link || item.link === '#') return;
    const ticker = anomalies[0]?.ticker;
    const payload = { articleId: item.articleKey || item.link, url: item.link, title: item.title, ticker, source: item.source, thumbnail: item.thumbnail, pubDate: item.pubDate };
    
    fetchWithDedup(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
    window.open(item.link, '_blank');
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter') handleChart(); };
    window.addEventListener('keypress', onKey);
    return () => window.removeEventListener('keypress', onKey);
  }, [anomalies]);

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
                  item={a} 
                  tickerInfoMap={tickerInfoMap} 
                  loadingMap={loadingMap} 
                  locale={lingui?.locale}
                  onClick={() => navigate(`/chart/u/${encodeURIComponent(a.ticker)}`)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="card anomaly-card">
            <div className="card-header">
              <h3><Trans>Most anomaly found</Trans></h3>
            </div>
            <div className="card-body">
              {topAnomalies.slice(0, 3).map(a => (
                <AnomalyRow 
                  key={a.id} 
                  item={a} 
                  isMini 
                  tickerInfoMap={tickerInfoMap} 
                  loadingMap={loadingMap} 
                  onClick={() => navigate(`/chart/u/${encodeURIComponent(a.ticker)}`)}
                />
              ))}
            </div>
          </div>

          <div className="news-card card">
            <div className="card-header"><h3><Trans>News</Trans></h3></div>
              <ul className="news-list">
              {(news ?? FALLBACK_NEWS).map(n => (
                <li key={n.id} className="news-item" onClick={() => handleNewsClick(n)}>
                  {n.thumbnail ? <img src={n.thumbnail} alt="" className="news-thumb" loading="lazy" decoding="async" onError={(e) => e.target.style.display='none'} /> : <div className="news-thumb--placeholder" />}
                  <div style={{ flex: 1 }}>
                    <div className="news-title" style={{ fontWeight: 600 }}>{n.title}</div>
                    <div className="news-source" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {n.source}{!!n.views && <span className="news-views"> · {n.views} views</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
              {/* {newsDebug && (
                <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div><strong>News Debug:</strong> {newsDebug.source} — <span style={{ wordBreak: 'break-all' }}>{newsDebug.url}</span></div>
                  <pre style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>{JSON.stringify(newsDebug.payload, null, 2).slice(0, 2000)}</pre>
                </div>
              )} */}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}