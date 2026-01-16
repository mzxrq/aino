// src/pages/Home.jsx
import React, { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import { getLocalizedCompanyName } from '../utils/companyNameUtils';
import { AuthContext } from '../context/contextBase';
import '../css/Home.css';
import logoSvg from '../assets/aino.svg';
import Footer from '../components/Footer';

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

export default function Home() {
  const navigate = useNavigate();
  const { i18n: lingui } = useLingui();
  const [anomalies, setAnomalies] = useState([]);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [topAnomalies, setTopAnomalies] = useState([]);
  const [_allAnomalies, setAllAnomalies] = useState([]);
  const [news, setNews] = useState(null);
  const [masterTickersMap, setMasterTickersMap] = useState(null);
  const [tickerInfoMap, setTickerInfoMap] = useState(new Map());
  const [loadingMap, setLoadingMap] = useState({});
  const lastFetchedNewsTicker = useRef(null);
  const { isLoggedIn } = useContext(AuthContext);
  const API_URL = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
  const PY_URL = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
  const PY_BASE = `${PY_URL}/py`;
  async function fetchPyJson(path, init) {
    // call Python service directly on configured port (default 5000)
    const url = `${PY_BASE}${path}`;
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return await r.json();
  }

  // Deduplicating fetch helper for Node API calls (GET + identical POSTs)
  const _inFlightRequests = new Map();
  async function fetchWithDedup(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    let key = `${method} ${url}`;
    if (method !== 'GET' && options.body) {
      try { key += ' ' + (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)); } catch (_e) {}
    }
    if (_inFlightRequests.has(key)) return _inFlightRequests.get(key);
    const p = (async () => {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return await res.json();
      return await res.text();
    })();
    _inFlightRequests.set(key, p);
    p.finally(() => { try { _inFlightRequests.delete(key); } catch (_) {} });
    return p;
  }

  // Helpers: normalize ticker variants and lookup company name from master map
  const normalizeTickerVariants = useCallback((sym) => {
    if (!sym) return [];
    const s = String(sym).toUpperCase().trim();
    const variants = new Set();
    variants.add(s);
    // strip common separators
    if (s.includes('.')) variants.add(s.split('.')[0]);
    if (s.includes('-')) variants.add(s.split('-')[0]);
    if (s.includes(':')) variants.add(s.split(':')[0]);
    // remove non-alphanumeric characters
    variants.add(s.replace(/[^A-Z0-9]/g, ''));
    // common exchange suffixes to strip
    const suffixes = ['.T', '.TO', '.BK', '.KS', '.PA', '.L', '.V', '.SA', '.AX', '.MI', '.SS', '.SZ'];
    for (const suf of suffixes) {
      if (s.endsWith(suf)) variants.add(s.slice(0, -suf.length));
    }
    return Array.from(variants).filter(Boolean);
  }, []);

  const findCompanyName = useCallback((sym) => {
    if (!sym) return null;
    if (!masterTickersMap) return null;
    const variants = normalizeTickerVariants(sym);
    for (const v of variants) {
      const name = masterTickersMap.get(v);
      if (name) return name;
    }
    return null;
  }, [masterTickersMap, normalizeTickerVariants]);

  const fetchTickerInfos = useCallback(async (tickers = []) => {
    if (!Array.isArray(tickers) || tickers.length === 0) return;
    const map = new Map(tickerInfoMap || []);
    const newLoading = { ...(loadingMap || {}) };
    const requests = [];
    const TTL = 24 * 60 * 60 * 1000; // 1 day cache
    const now = Date.now();

    for (const t of tickers) {
      if (!t) continue;
      const key = `ticker_info_${String(t).toUpperCase()}`;
      try {
        const cachedRaw = localStorage.getItem(key);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.ts && (now - parsed.ts) < TTL && parsed.info) {
            map.set(String(t).toUpperCase(), parsed.info);
            continue; // skip network fetch
          }
        }
      } catch (_e) {
        // ignore localStorage parse errors
      }

      newLoading[String(t).toUpperCase()] = true;

      const p = (async () => {
        try {
          const json = await fetchPyJson(`/stock/info?ticker=${encodeURIComponent(t)}`);
          map.set(String(t).toUpperCase(), json);
          try {
            localStorage.setItem(key, JSON.stringify({ ts: Date.now(), info: json }));
          } catch (_e) { /* ignore storage errors */ }
          return { ticker: String(t).toUpperCase(), info: json };
        } catch (_e) {
          return null;
        }
      })();
      requests.push(p);
    }

    setLoadingMap(newLoading);

    if (requests.length) {
      await Promise.allSettled(requests);
      const cleared = { ...newLoading };
      for (const t of tickers) cleared[String(t).toUpperCase()] = false;
      setLoadingMap(cleared);
    }

    setTickerInfoMap(map);
  }, [tickerInfoMap, loadingMap]);

  // Fetch recent anomalies and compute top tickers by anomaly count
  useEffect(() => {
    let isMounted = true;
    const fetchAnomalies = async () => {
      try {
        // Fetch anomalies from the past 6 months and aggregate by ticker
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);

        // Try server-side recent anomalies first
        let list = [];
        try {
          const json = await fetchWithDedup(`${API_URL}/node/anomalies/recent?limit=200`);
          list = json?.data || json || [];
        } catch (_e) {
          list = [];
        }

        // Fallback: extract anomalies from cache entries
        if (!list || list.length === 0) {
          try {
            const cjson = await fetchWithDedup(`${API_URL}/node/cache?limit=200`);
            const items = cjson?.data || cjson || [];
            for (const c of items) {
              const payload = c.payload || c;
              if (!payload) continue;
              const candidates = payload.anomalies || payload.anomaly_markers || (payload.payload && (payload.payload.anomalies || payload.payload.anomaly_markers)) || null;
              if (!Array.isArray(candidates) || candidates.length === 0) continue;
              for (const a of candidates) {
                const ticker = (a.ticker || payload.ticker || payload.Ticker || payload.tickerSymbol || '').toString().toUpperCase();
                if (!ticker) continue;
                list.push({ ticker, datetime: a.date || a.datetime || a.Datetime || payload.fetched_at, close: a.y || a.close || payload.close || 0, volume: a.volume || payload.volume || 0, companyName: payload.companyName || payload.company || payload.name, companyNameLocal: payload.companyNameLocal || null });
              }
            }
          } catch (_e) {
            console.debug('Cache fallback failed', _e);
          }
        }

        // Aggregate counts and keep latest metadata per ticker
        const map = new Map();
        for (const a of list) {
          const t = (a.ticker || '').toUpperCase();
          if (!t) continue;
          const existing = map.get(t) || { ticker: t, company: a.companyName || a.name || t, companyNameLocal: a.companyNameLocal || null, price: a.close || a.price || 0, change: 0, anomalies: 0, latestDatetime: null };
          existing.anomalies = (existing.anomalies || 0) + 1;
          const dt = a.datetime || a.Datetime || a.createdAt || null;
          if (dt && (!existing.latestDatetime || new Date(dt) > new Date(existing.latestDatetime))) {
            existing.latestDatetime = dt;
            existing.price = a.close || a.price || existing.price;
          }
          map.set(t, existing);
        }

        const sortedList = (list || []).slice().sort((a, b) => {
          const da = new Date(a.datetime || a.Datetime || a.createdAt || a.fetched_at || 0).getTime();
          const db = new Date(b.datetime || b.Datetime || b.createdAt || b.fetched_at || 0).getTime();
          return db - da;
        });

        const recent = [];
        const seen = new Set();
        for (const d of sortedList) {
          const ticker = (d.ticker || d.Ticker || d.tickerSymbol || '').toUpperCase();
          if (!ticker) continue;
          if (seen.has(ticker)) continue;
          seen.add(ticker);
          recent.push({
            id: `${ticker}-${String(d.datetime || d.date || d.Datetime || d.fetched_at || Math.random())}`,
            ticker,
            company: findCompanyName(ticker) || d.companyName || d.company || ticker,
            companyNameLocal: d.companyNameLocal || null,
            price: d.close || d.price || 0,
            change: d.change || 0,
            anomalies: 1,
            datetime: d.datetime || d.Datetime || d.createdAt || d.fetched_at,
            source_payload: d
          });
          if (recent.length >= 6) break;
        }

        const allInstances = sortedList.slice(0, 200).map((d, idx) => {
          const ticker = (d.ticker || d.Ticker || d.tickerSymbol || '').toUpperCase();
          return {
            id: `${ticker}-${idx}-${String(d.datetime || d.date || d.Datetime || d.fetched_at || idx)}`,
            ticker,
            company: findCompanyName(ticker) || d.companyName || d.company || ticker,
            companyNameLocal: d.companyNameLocal || null,
            price: d.close || d.price || 0,
            change: d.change || 0,
            datetime: d.datetime || d.Datetime || d.createdAt || d.fetched_at,
            source_payload: d
          };
        });

        const mapped = Array.from(map.values()).sort((x, y) => y.anomalies - x.anomalies).slice(0, 6).map((d, idx) => ({
          id: `${d.ticker}-${idx}`,
          ticker: d.ticker,
          company: findCompanyName(d.ticker) || d.company,
          companyNameLocal: d.companyNameLocal || null,
          price: typeof d.price === 'number' ? d.price : 0,
          change: typeof d.change === 'number' ? d.change : 0,
          anomalies: d.anomalies || 1,
        }));

        if (isMounted) {
          const finalRecent = recent.length ? recent : fallbacka_loading.slice(0, 6);
          const finalTop = mapped.length ? mapped : fallbacka_loading;
          setRecentAnomalies(finalRecent);
          setTopAnomalies(finalTop);
          setAllAnomalies(allInstances);
          setAnomalies(finalTop);
          try {
            const tickersToFetch = Array.from(new Set([...(finalRecent || []).map(r => r.ticker), ...(finalTop || []).map(r => r.ticker)])).filter(Boolean).slice(0, 48);
            if (tickersToFetch.length) fetchTickerInfos(tickersToFetch);
          } catch (_e) { console.debug('ticker info fetch schedule failed', _e) }
        }
      } catch (_e) {
        console.debug('Anomaly fetch error, using sample:', _e);
        if (isMounted) setAnomalies(fallbacka_loading);
      }
    };
    fetchAnomalies();
    return () => { isMounted = false; };
  }, [API_URL, findCompanyName, fetchTickerInfos]);

  // Load master tickers (client-public copy) once and build a symbol->name map
  useEffect(() => {
    let mounted = true;
    const loadMaster = async () => {
      try {
        const res = await fetch('/master_tickers.json');
        if (!res.ok) return;
        const data = await res.json();
        const map = new Map();
        for (const item of data) {
          if (!item || !item.symbol) continue;
          // prefer displayTicker for UI when present
          map.set(item.symbol.toUpperCase(), item.displayTicker || item.name || item.companyName || item.company || item.ticker || item.symbol);
        }
        if (mounted) setMasterTickersMap(map);
      } catch (e) {
        console.debug('Failed to load master_tickers.json', e);
      }
    };
    loadMaster();
    return () => { mounted = false; };
  }, []);

  // Fetch news for the top anomaly ticker. Try backend news proxy first, then fall back to Python financials
  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      try {
        const topTicker = anomalies?.[0]?.ticker || topAnomalies?.[0]?.ticker || 'AAPL';
        
        // Skip if we've already fetched for this ticker
        if (lastFetchedNewsTicker.current === topTicker) {
          return;
        }
        lastFetchedNewsTicker.current = topTicker;

        // 1) Try top-viewed cached articles
        try {
          const payload = await fetchWithDedup(`${API_URL}/node/news/views/top?limit=6`);
          const items = (payload.items || []).slice(0, 6).map((it, idx) => ({
            id: it.articleKey || it.id || idx,
            articleKey: it.articleKey || null,
            title: it.title || it.cachedTitle || it.urlTitle || 'Market Update',
            source: it.source || it.sourceTicker || 'News',
            link: it.url || null,
            thumbnail: it.thumbnail || null,
            pubDate: it.pubDate || null,
            views: it.views || 0
          }));
          if (isMounted && items.length) { setNews(items); return; }
        } catch (e) { console.debug('top-viewed news fetch failed, falling back', e && e.message); }

        // 2) Try Node news proxy
        try {
          const j = await fetchWithDedup(`${API_URL}/node/news?q=${encodeURIComponent(topTicker)}&pageSize=6`);
          let articles = (j.articles || []).slice(0, 6).map((n, idx) => ({
            id: idx,
            articleKey: n.articleKey || n.id || n.guid || null,
            title: n.title || n.headline || n.description || n.summary || n.subtitle || 'Market Update',
            source: (n.source && n.source.name) || n.source || n.author || 'News',
            link: n.url || n.link || n.articleUrl || n.canonical_url || n.guid || null,
            thumbnail: n.urlToImage || n.image || n.thumbnail || n.thumbnailUrl || null,
            pubDate: n.publishedAt || n.pubDate || null,
            views: 0
          }));

          // cache provider metadata
          try {
            const toCache = articles.map(a => ({ articleId: a.articleKey || a.link, url: a.link, title: a.title, source: a.source, pubDate: a.pubDate, thumbnail: a.thumbnail, sourceTicker: topTicker || null })).filter(x => x.url && x.url !== '#');
            if (toCache.length) await fetchWithDedup(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
          } catch (err) { console.debug('cache post failed', err); }

          // lookup stored view counts
          try {
            const keys = articles.map(a => a.articleKey || a.link).filter(Boolean);
            if (keys.length) {
              try {
                const pl = await fetchWithDedup(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
                const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
                articles = articles.map(a => ({ ...a, views: (map[a.articleKey || a.link] && map[a.articleKey || a.link].views) ? map[a.articleKey || a.link].views : 0, thumbnail: a.thumbnail || (map[a.articleKey || a.link] && map[a.articleKey || a.link].thumbnail) || null }));
              } catch (err) { console.debug('views lookup failed', err); }
            }
          } catch (err) { console.debug('views lookup failed', err); }

          if (isMounted && articles.length) { setNews(articles); return; }
        } catch (e) { console.debug('Node news proxy failed, will fall back to Python news', e && e.message); }

        // 3) Fallback to Python financials
        try {
          const data = await fetchPyJson(`/financials?ticker=${topTicker}`);
          let newsData = (data?.news || []).slice(0, 6).map((n, idx) => ({
            id: idx,
            articleKey: n.articleKey || n.id || n.guid || null,
            title: n.title || n.headline || 'Market Update',
            source: n.source || n.publisher || 'Financial News',
            link: n.link || n.url || n.articleUrl || n.canonical_url || n.guid || null,
            thumbnail: n.urlToImage || n.image || n.thumbnail || null,
            pubDate: n.publishedAt || n.pubDate || null,
            views: 0
          }));

          try {
            const keys = newsData.map(a => a.articleKey || a.link).filter(Boolean);
            if (keys.length) {
              try {
                const pl = await fetchWithDedup(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
                const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
                newsData = newsData.map(a => ({ ...a, views: (map[a.articleKey || a.link] && map[a.articleKey || a.link].views) ? map[a.articleKey || a.link].views : 0, thumbnail: a.thumbnail || (map[a.articleKey || a.link] && map[a.articleKey || a.link].thumbnail) || null }));
              } catch (err) { console.debug('views lookup failed', err); }
            }
          } catch (err) { console.debug('views lookup failed', err); }

          if (isMounted && newsData.length > 0) { setNews(newsData); return; }
        } catch (e) {
          console.debug('Python news fetch failed', e && e.message);
          if (isMounted) setNews(fallbackn_loading);
        }
      } catch (_e) {
        console.debug('News fetch error, using sample:', _e);
        if (isMounted) setNews(fallbackn_loading);
      }
    };

    if ((anomalies && anomalies.length > 0) || (topAnomalies && topAnomalies.length > 0)) {
      fetchNews();
    }

    return () => { isMounted = false; };
  }, [anomalies, topAnomalies, PY_URL, API_URL]);

  const handleChart = () => {
    const first = (anomalies && anomalies.length > 0) ? anomalies[0] : null;
    if (first && first.ticker) navigate(`/chart/u/${encodeURIComponent(first.ticker)}`);
    else navigate('/chart');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleChart();
      }
    };
    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [anomalies]);

  // Record view and open news link in new tab
  const handleNewsClick = async (item) => {
    // don't record or open items without a real link or articleKey
    if ((!item.link || item.link === '#') && !item.articleKey) return;
    try {
      // If cache not present, create cache entry first so thumbnail/pubDate are stored
      let articleId = item.cacheId || item.articleKey || item.link;
      if (!item.cacheId) {
          try {
          const toCache = [{ articleId: item.articleKey || item.link, url: item.link || null, title: item.title || null, source: item.source || null, pubDate: item.pubDate || null, thumbnail: item.thumbnail || null, sourceTicker: (anomalies && anomalies[0] && anomalies[0].ticker) || null }];
          try {
            const cj = await fetchWithDedup(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
            const found = (cj.items || []).find(i => i && i.articleKey === (item.articleKey || item.link));
            if (found) {
              articleId = found.id || found.articleKey || articleId;
              // attach to item for future clicks in this session
              item.cacheId = found.id || null;
              if (!item.thumbnail && found.thumbnail) item.thumbnail = found.thumbnail;
            }
          } catch (_e) { /* ignore cache errors */ }
        } catch (_e) { /* ignore cache errors */ }
      }

      const payload = { articleId, url: item.link || null, title: item.title || null, ticker: (anomalies && anomalies[0] && anomalies[0].ticker) || null, source: item.source || null, thumbnail: item.thumbnail || null, pubDate: item.pubDate || null };
      // fire-and-forget view post
      fetchWithDedup(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => { });
    } catch (_e) { /* ignore */ }
    try { if (item.link) window.open(item.link, '_blank'); } catch (_e) { if (item.link) window.location.href = item.link; }
  };

  return (
    <div className="home-container">
      {/* Hero Section - Appears First */}
      <section className="hero-section-full">
        <div className="hero-content-centered">
          <img src={logoSvg} alt="Logo" className="hero-logo website-logo" />
          <p className="hero-motto"><Trans>Stock Trading Anomaly Detector</Trans></p>
          {/*<p className="hero-subtitle">Real-time market monitoring with alerts and easy subscription via LINE.</p> */}
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={handleChart}><Trans>Get Started</Trans></button>
            {!isLoggedIn && <button className="btn btn-line" onClick={handleLogin}><Trans>LINE Login</Trans></button>}
          </div>
        </div>
      </section>

      {/* Anomalies and News Grid */}
      <div className="homepage-grid">
        <div className="left-column">
          <div className="card anomaly-card">
            <div className="card-header">
              <h3><Trans>Recent anomaly found</Trans></h3>
              <Link to="/list" className="show-more"><Trans>Show more ›</Trans></Link>
            </div>
            <div className="card-body">
              {(recentAnomalies.length ? recentAnomalies : fallbacka_loading).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => { if (a && a.ticker) navigate(`/chart/u/${encodeURIComponent(a.ticker)}`); }} style={{ cursor: 'pointer' }}>
                  <div className="logo-circle" title={a.company}>
                    {(() => {
                      const key = String(a.ticker || '').toUpperCase();
                      const info = tickerInfoMap.get(key);
                      const loading = !!loadingMap[key];
                      if (loading) return <div className="ticker-loader" />;
                      const logo = info && (info.logo || info?.logo_url);
                      const parqetLogo = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(key)}?format=png`;
                      const src = logo || parqetLogo;
                      return (
                        <img
                          src={src}
                          alt={getDisplayFromRaw(key) || a.company}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                        />
                      );
                    })()}
                  </div>
                  <div className="anomaly-meta">
                    <div className="ticker">{getDisplayFromRaw(a.ticker)}</div>
                    <div className="company">{getLocalizedCompanyName({ ticker: a.ticker, companyName: a.company, companyNameLocal: a.companyNameLocal }, lingui?.locale || 'en')}</div>
                  </div>
                  <div className="anomaly-stats">
                    {(() => {
                      const key = String(a.ticker || '').toUpperCase();
                      const info = tickerInfoMap.get(key) || {};
                      const loading = !!loadingMap[key];
                      if (loading) return <div className={`price`}>Loading…</div>;
                      const price = (info.price !== undefined && info.price !== null) ? info.price : a.price || 0;
                      const pct = (info.change_pct !== undefined && info.change_pct !== null) ? info.change_pct : (a.change || 0);
                      const up = pct > 0;
                      const cls = `price ${up ? 'up' : 'down'}`;
                      return (
                        <div className={cls}>
                          {up ? '↑' : '↓'} {Number(price || 0).toLocaleString()} <span className="percent">{pct > 0 ? '+' : ''}{(pct !== null ? Number(pct).toFixed(2) : '0')}%</span>
                        </div>
                      );
                    })()}
                    <div className="anomaly-time">
                      {a.datetime ? (new Date(a.datetime).toLocaleString()) : (a.date || a.Datetime ? String(a.date || a.Datetime) : 'Unknown')}
                    </div>
                    <div className="anomaly-count">
                      <span className="count-number">{a.anomalies}</span>
                      <span className="count-text">Found {a.anomalies} anomalies</span>
                    </div>
                  </div>
                </div>
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
              {(topAnomalies.length ? topAnomalies.slice(0, 3) : fallbacka_loading).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => { if (a && a.ticker) navigate(`/chart/u/${encodeURIComponent(a.ticker)}`); }} style={{ cursor: 'pointer' }}>
                  <div className="logo-circle" title={a.company}>
                    {(() => {
                      const key = String(a.ticker || '').toUpperCase();
                      const info = tickerInfoMap.get(key);
                      const logo = info && (info.logo || info?.logo_url);
                      const parqetLogo = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(key)}?format=png`;
                      const src = logo || parqetLogo;
                      return (
                        <img
                          src={src}
                          alt={getDisplayFromRaw(key) || a.company}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                        />
                      );
                    })()}
                  </div>
                  <div className="anomaly-meta">
                    <div className="ticker">{getDisplayFromRaw(a.ticker)}</div>
                    <div className="company">{a.company}</div>
                  </div>
                  <div className="anomaly-stats">
                    {(() => {
                      const info = tickerInfoMap.get(a.ticker) || {};
                      const price = (info.price !== undefined && info.price !== null) ? info.price : a.price || 0;
                      const pct = (info.change_pct !== undefined && info.change_pct !== null) ? info.change_pct : (a.change || 0);
                      const up = pct > 0;
                      const cls = `price ${up ? 'up' : 'down'}`;
                      return (
                        <div className={cls}>
                          {up ? '↑' : '↓'} {Number(price || 0).toLocaleString()} <span className="percent">{pct > 0 ? '+' : ''}{(pct !== null ? Number(pct).toFixed(2) : '0')}%</span>
                        </div>
                      );
                    })()}
                    <div className="anomaly-count">
                      <span className="count-number">{a.anomalies}</span>
                      <span className="count-text">{a.anomalies} anml</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="news-card card">
            <div className="card-header">
              <h3><Trans>News</Trans></h3>
            </div>
            
            <ul className="news-list">
              {((news === null) ? fallbackn_loading : (news.length ? news : [{ id: 'none', title: "Doesn't have new right now", source: '' }]))
                .map(n => (
                <li key={n.id} className="news-item" style={{ display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer' }} onClick={() => handleNewsClick(n)} onMouseDown={(e) => { if (e.button === 1 || e.button === 2) handleNewsClick(n); }} onAuxClick={(e) => { if (e.button === 1) handleNewsClick(n); }}>
                  {n.thumbnail ? (
                    <img src={n.thumbnail} alt={n.title} className="news-thumb" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }} />
                  ) : (
                    <div className="news-thumb--placeholder" />
                  )}
                  <div style={{ flex: 1 }}>
                    {n.link ? (
                      <a
                        href={n.link}
                        className="news-title-link"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleNewsClick(n); }}
                      >
                        <div className="news-title" style={{ fontWeight: 600 }}>{n.title}</div>
                      </a>
                    ) : (
                      <div className="news-title" style={{ fontWeight: 600 }}>{n.title}</div>
                    )}
                    <div className="news-source" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {n.source}{n.views ? <span className="news-views" style={{ marginLeft: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>· {n.views} views</span> : null}
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