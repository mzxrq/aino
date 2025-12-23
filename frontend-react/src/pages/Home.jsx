// src/pages/Home.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import '../css/Home.css';
import logoSvg from '../assets/aino.svg';
import Footer from '../components/Footer';

const SAMPLE_ANOMALIES = [
  { id: '1', ticker: 'TICK', company: 'CompanyName', price: 3768, change: -2.3, anomalies: 1 },
  { id: '2', ticker: 'ABCD', company: 'Another Co', price: 3785, change: 1.2, anomalies: 2 },
  { id: '3', ticker: 'XYZA', company: 'Xyza Ltd', price: 2585, change: 0.8, anomalies: 1 },
  { id: '4', ticker: 'LMNO', company: 'Lmno Plc', price: 1968, change: -0.6, anomalies: 3 }
];

const SAMPLE_NEWS = [
  { id: 1, title: 'Market tumbles as tech stocks correct sharply', source: 'Daily Finance' },
  { id: 2, title: 'Oil prices push energy sector higher', source: 'Global News' },
  { id: 3, title: 'Central bank signals rate pause', source: 'MarketWatch' }
];

export default function Home() {
  const navigate = useNavigate();
  const [anomalies, setAnomalies] = useState([]);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [topAnomalies, setTopAnomalies] = useState([]);
  const [allAnomalies, setAllAnomalies] = useState([]);
  const [news, setNews] = useState([]);
  const [masterTickersMap, setMasterTickersMap] = useState(null);
  const [tickerInfoMap, setTickerInfoMap] = useState(new Map());
  const [loadingMap, setLoadingMap] = useState({});
  const API_URL = import.meta.env.VITE_API_URL;
  const PY_URL = import.meta.env.VITE_LINE_PY_URL;
  const GATEWAY_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
  const PY_BASE = `${GATEWAY_URL}/py`;
  async function fetchPyJson(path, init) {
    try {
      const r = await fetch(`${PY_BASE}${path}`, init);
      if (r.ok) return await r.json();
    } catch (_) { /* ignore */ }
    const r2 = await fetch(`${(PY_URL || 'http://localhost:5000')}/py${path}`, init);
    if (!r2.ok) throw new Error(`status ${r2.status}`);
    return await r2.json();
  }

  // Fetch recent anomalies and compute top tickers by anomaly count
  useEffect(() => {
    let isMounted = true;
    const fetchAnomalies = async () => {
      try {
        // Fetch anomalies from the past 6 months and aggregate by ticker
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6);
        const res = await fetch(`${API_URL}/node/anomalies?limit=200&startDate=${encodeURIComponent(startDate.toISOString())}&endDate=${encodeURIComponent(endDate.toISOString())}`);
        let list = [];
        if (res.ok) {
          const json = await res.json();
          list = json?.data || json || [];
        }

        // If anomalies API returned nothing usable, try cache fallback
        if (!list || list.length === 0) {
          try {
            const cres = await fetch(`${API_URL}/node/cache?limit=200`);
            if (cres.ok) {
              const cjson = await cres.json();
              const items = cjson?.data || cjson || [];
              // Extract anomalies from cache payloads (look for anomaly_markers or anomaly list)
              for (const c of items) {
                const payload = c.payload || c;
                if (!payload) continue;
                // payload may contain an 'anomalies' array or 'anomaly_markers'
                const candidates = payload.anomalies || payload.anomaly_markers || (payload.payload && (payload.payload.anomalies || payload.payload.anomaly_markers)) || null;
                if (Array.isArray(candidates) && candidates.length) {
                  for (const a of candidates) {
                    // try to shape a similar anomaly document
                    const ticker = (a.ticker || payload.ticker || payload.Ticker || payload.tickerSymbol || '').toString().toUpperCase();
                    if (!ticker) continue;
                    list.push({ ticker, datetime: a.date || a.datetime || a.Datetime || payload.fetched_at, close: a.y || a.close || payload.close || 0, volume: a.volume || payload.volume || 0, companyName: payload.companyName || payload.company || payload.name });
                  }
                }
              }
            }
          } catch (e) {
            console.debug('Cache fallback failed', e);
          }
        }

        // Aggregate counts and keep latest metadata per ticker
        const map = new Map();
        for (const a of list) {
          const t = (a.ticker || '').toUpperCase();
          if (!t) continue;
          const existing = map.get(t) || { ticker: t, company: a.companyName || a.name || t, price: a.close || a.price || 0, change: 0, anomalies: 0, latestDatetime: null };
          existing.anomalies = (existing.anomalies || 0) + 1;
          // track latest datetime for display
          const dt = a.datetime || a.Datetime || a.createdAt || null;
          if (dt && (!existing.latestDatetime || new Date(dt) > new Date(existing.latestDatetime))) {
            existing.latestDatetime = dt;
            existing.price = a.close || a.price || existing.price;
          }
          map.set(t, existing);
        }

        // recent anomalies: sort raw list by datetime desc and take latest 6
        const sortedList = (list || []).slice().sort((a, b) => {
          const da = new Date(a.datetime || a.Datetime || a.createdAt || a.fetched_at || 0).getTime();
          const db = new Date(b.datetime || b.Datetime || b.createdAt || b.fetched_at || 0).getTime();
          return db - da;
        });

        // recent per-ticker: take latest instance per unique ticker (preview only)
        const recent = [];
        const seen = new Set();
        for (const d of sortedList) {
          const ticker = (d.ticker || d.Ticker || d.tickerSymbol || '').toUpperCase();
          if (!ticker) continue;
          if (seen.has(ticker)) continue;
          seen.add(ticker);
          recent.push({
            id: `${ticker}-${String(d.datetime||d.date||d.Datetime||d.fetched_at||Math.random())}`,
            ticker,
            company: findCompanyName(ticker) || d.companyName || d.company || ticker,
            price: d.close || d.price || 0,
            change: d.change || 0,
            anomalies: 1,
            datetime: d.datetime || d.Datetime || d.createdAt || d.fetched_at,
            source_payload: d
          });
          if (recent.length >= 6) break;
        }

        // Build full per-instance anomalies list (limit to 200 for display)
        const allInstances = sortedList.slice(0, 200).map((d, idx) => {
          const ticker = (d.ticker || d.Ticker || d.tickerSymbol || '').toUpperCase();
          return {
            id: `${ticker}-${idx}-${String(d.datetime||d.date||d.Datetime||d.fetched_at||idx)}`,
            ticker,
            company: findCompanyName(ticker) || d.companyName || d.company || ticker,
            price: d.close || d.price || 0,
            change: d.change || 0,
            datetime: d.datetime || d.Datetime || d.createdAt || d.fetched_at,
            source_payload: d
          };
        });

        // top anomalies: aggregate counts and keep latest metadata per ticker
        const mapped = Array.from(map.values()).sort((x, y) => y.anomalies - x.anomalies).slice(0, 6).map((d, idx) => ({
          id: `${d.ticker}-${idx}`,
          ticker: d.ticker,
          company: findCompanyName(d.ticker) || d.company,
          price: typeof d.price === 'number' ? d.price : 0,
          change: typeof d.change === 'number' ? d.change : 0,
          anomalies: d.anomalies || 1,
        }));

        if (isMounted) {
          const finalRecent = recent.length ? recent : SAMPLE_ANOMALIES.slice(0,6);
          const finalTop = mapped.length ? mapped : SAMPLE_ANOMALIES;
          setRecentAnomalies(finalRecent);
          setTopAnomalies(finalTop);
          setAllAnomalies(allInstances);
          setAnomalies(finalTop);
          // Fetch logo/price info for displayed tickers (include recent + some from full list)
          try {
            const tickersToFetch = Array.from(new Set([...(finalRecent||[]).map(r=>r.ticker), ...(finalTop||[]).map(r=>r.ticker)])).filter(Boolean).slice(0,48);
            if (tickersToFetch.length) fetchTickerInfos(tickersToFetch);
          } catch(e){console.debug('ticker info fetch schedule failed', e)}
        }
      } catch (e) {
        console.debug('Anomaly fetch error, using sample:', e);
        if (isMounted) setAnomalies(SAMPLE_ANOMALIES);
      }
    };
    fetchAnomalies();
    return () => { isMounted = false; };
  }, [API_URL]);

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

  // Helpers: normalize ticker variants and lookup company name from master map
  const normalizeTickerVariants = (sym) => {
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
  };

  const findCompanyName = (sym) => {
    if (!sym) return null;
    if (!masterTickersMap) return null;
    const variants = normalizeTickerVariants(sym);
    for (const v of variants) {
      const name = masterTickersMap.get(v);
      if (name) return name;
    }
    // debug log for misses — can be removed later
    console.debug('master_tickers lookup miss', sym, variants);
    return null;
  };

  // Fetch /py/stock/info for a list of tickers and store results in tickerInfoMap
  const fetchTickerInfos = async (tickers) => {
    if (!Array.isArray(tickers) || tickers.length === 0) return;
    const map = new Map(tickerInfoMap);
    const newLoading = { ...loadingMap };

    const TTL = 1000 * 60 * 60 * 6; // 6 hours
    const now = Date.now();

    const requests = [];
    for (const t of tickers) {
      const key = `tickerInfo::${t.toUpperCase()}`;
      try {
        const cachedRaw = localStorage.getItem(key);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && parsed.ts && (now - parsed.ts) < TTL && parsed.info) {
            map.set(t.toUpperCase(), parsed.info);
            continue; // skip network fetch
          }
        }
      } catch (e) {
        // ignore localStorage parse errors
      }

      // mark loading
      newLoading[t.toUpperCase()] = true;

      // build a request promise
      const p = (async () => {
        try {
          const json = await fetchPyJson(`/stock/info?ticker=${encodeURIComponent(t)}`);
          map.set(t.toUpperCase(), json);
          try {
            localStorage.setItem(key, JSON.stringify({ ts: Date.now(), info: json }));
          } catch (e) {
            // ignore storage errors
          }
          return { ticker: t.toUpperCase(), info: json };
        } catch (e) {
          return null;
        }
      })();
      requests.push(p);
    }

    setLoadingMap(newLoading);

    if (requests.length) {
      await Promise.allSettled(requests);
      // clear loading flags for fetched tickers
      const cleared = { ...loadingMap };
      for (const t of tickers) cleared[t.toUpperCase()] = false;
      setLoadingMap(cleared);
    }

    setTickerInfoMap(map);
  };

  // Fetch news for the top anomaly ticker. Try backend news proxy first, then fall back to Python financials
  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      try {
        const topTicker = anomalies?.[0]?.ticker || 'AAPL';
        // Prefer top-viewed news from our backend if available
        try{
          const topRes = await fetch(`${API_URL}/node/news/views/top?limit=6`);
          if (topRes.ok){
            const payload = await topRes.json();
            const items = (payload.items || []).slice(0,6).map((it, idx) => ({
              id: it.articleKey || idx,
              articleKey: it.articleKey || null,
              title: it.title || it.cachedTitle || it.urlTitle || 'Market Update',
              source: it.source || it.sourceTicker || 'News',
              link: it.url || null,
              thumbnail: it.thumbnail || null,
              pubDate: it.pubDate || null,
              views: it.views || 0
            }));
            if (isMounted && items.length) return setNews(items);
          }
        }catch(e){
          console.debug('top-viewed news fetch failed, falling back', e);
        }

        // Try Node backend news proxy and attach stored view counts
        try {
          const res = await fetch(`${API_URL}/node/news?q=${encodeURIComponent(topTicker)}&pageSize=6`);
          if (res.ok) {
            const j = await res.json();
            let articles = (j.articles || []).slice(0, 6).map((n, idx) => ({
              id: idx,
              // attempt to capture any provider-side canonical id or guid
              articleKey: n.articleKey || n.id || n.guid || null,
              title: n.title || n.headline || n.description || n.summary || n.subtitle || 'Market Update',
              source: (n.source && n.source.name) || n.source || n.author || 'News',
              // try multiple possible url fields providers may use
              link: n.url || n.link || n.articleUrl || n.canonical_url || n.guid || null,
              thumbnail: n.urlToImage || n.image || n.thumbnail || n.thumbnailUrl || null,
              pubDate: n.publishedAt || n.pubDate || null,
              views: 0
            }));

            // cache provider metadata so backend can serve thumbnails / pubDate for top endpoint
            try {
              const toCache = articles.map(a => ({ articleId: a.articleKey || a.link, url: a.link, title: a.title, source: a.source, pubDate: a.pubDate, thumbnail: a.thumbnail }));
              if (toCache.length) {
                await fetch(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
              }
            } catch (err) { console.debug('cache post failed', err); }

            // lookup stored view counts for these article urls
            try{
              const keys = articles.map(a => a.articleKey || a.link).filter(Boolean);
              if (keys.length){
                const lookup = await fetch(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
                if (lookup.ok){
                  const pl = await lookup.json();
                  const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
                  articles = articles.map(a => ({ ...a, views: (map[a.articleKey || a.link] && map[a.articleKey || a.link].views) ? map[a.articleKey || a.link].views : 0, thumbnail: a.thumbnail || (map[a.articleKey || a.link] && map[a.articleKey || a.link].thumbnail) || null }));
                }
              }
            }catch(err){ console.debug('views lookup failed', err); }

            if (isMounted && articles.length) return setNews(articles);
          }
        } catch (e) {
          console.debug('Node news proxy failed, will fall back to Python news', e);
        }

        // Fallback: Python financials news
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
            try{
              const keys = newsData.map(a => a.articleKey || a.link).filter(Boolean);
              if (keys.length){
                const lookup = await fetch(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
                if (lookup.ok){
                  const pl = await lookup.json();
                  const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
                  newsData = newsData.map(a => ({ ...a, views: (map[a.articleKey || a.link] && map[a.articleKey || a.link].views) ? map[a.articleKey || a.link].views : 0, thumbnail: a.thumbnail || (map[a.articleKey || a.link] && map[a.articleKey || a.link].thumbnail) || null }));
                }
              }
            }catch(err){ console.debug('views lookup failed', err); }
            if (isMounted && newsData.length > 0) return setNews(newsData);
          
        } catch (e) {
          console.debug('Python news fetch failed', e);
        }

        if (isMounted) setNews(SAMPLE_NEWS);
      } catch (e) {
        console.debug('News overall fetch error, using sample:', e);
        if (isMounted) setNews(SAMPLE_NEWS);
      }
    };
    if (topAnomalies.length > 0) {
      fetchNews();
    }
    return () => { isMounted = false; };
  }, [anomalies, PY_URL, API_URL]);

  const handleDemoChart = () => {
    const first = (anomalies && anomalies.length > 0) ? anomalies[0] : SAMPLE_ANOMALIES[0];
    if (first && first.ticker) navigate(`/chart/u/${encodeURIComponent(first.ticker)}`);
    else navigate('/chart');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleDemoChart();
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
      const payload = {
        articleId: item.articleKey || item.link,
        url: item.link || null,
        title: item.title || null,
        ticker: (anomalies && anomalies[0] && anomalies[0].ticker) || null,
        source: item.source || null
      };
      // fire-and-forget
      fetch(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
    } catch (e) { /* ignore */ }
    try { if (item.link) window.open(item.link, '_blank'); } catch (e) { if (item.link) location.href = item.link; }
  };

  return (
    <div className="home-container">
      {/* Hero Section - Appears First */}
      <section className="hero-section-full">
        <div className="hero-content-centered">
          <img src={logoSvg} alt="Stock Dashboard Website Logo" className="hero-logo website-logo" />
          <p className="hero-motto">Stock Trading Anomaly Detector</p>
        {/*<p className="hero-subtitle">Real-time market monitoring with alerts and easy subscription via LINE.</p> */}
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={handleDemoChart}>Get Started</button>
            <button className="btn btn-line" onClick={handleLogin}>LINE Login</button>
          </div>
        </div>
      </section>

      {/* Anomalies and News Grid */}
      <div className="homepage-grid">
        <div className="left-column">
          <div className="card anomaly-card">
            <div className="card-header">
              <h3>Recent anomaly found</h3>
              <Link to="#" className="show-more">Show more ›</Link>
            </div>
            <div className="card-body">
              {(recentAnomalies.length ? recentAnomalies : SAMPLE_ANOMALIES).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => { if (a && a.ticker) navigate(`/chart/u/${encodeURIComponent(a.ticker)}`); }} style={{cursor: 'pointer'}}>
                  <div className="logo-circle" title={a.company}>
                    {(() => {
                        const key = String(a.ticker || '').toUpperCase();
                        const info = tickerInfoMap.get(key);
                        const loading = !!loadingMap[key];
                        if (loading) return <div className="ticker-loader" />;
                        const logo = info && (info.logo || info?.logo_url);
                        const parqetLogo = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(key)}?format=png`;
                        const fallbackLogo = `https://logo.clearbit.com/${key.replace(/[^A-Za-z]/g, '').toLowerCase()}.com`;
                        const src = logo || parqetLogo;
                        return (
                          <img
                            src={src}
                            alt={getDisplayFromRaw(key) || a.company}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            onError={(e) => {
                              if (e.target.src !== fallbackLogo) e.target.src = fallbackLogo;
                              else e.target.onerror = null;
                            }}
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
                            {up ? '↑' : '↓'} {Number(price || 0).toLocaleString()} <span className="percent">{pct>0?'+':''}{(pct!==null?Number(pct).toFixed(2):'0')}%</span>
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

          <div className="card anomaly-card">
            <div className="card-header">
              <h3>Top anomaly</h3>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <Link to="/marketlist" className="show-more">Show more ›</Link>
              </div>
            </div>
            <div className="card-body">
                {(topAnomalies.length ? topAnomalies : SAMPLE_ANOMALIES).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => { if (a && a.ticker) navigate(`/chart/u/${encodeURIComponent(a.ticker)}`); }} style={{cursor: 'pointer'}}>
                  <div className="logo-circle" title={a.company}>
                    {(() => {
                        const key = String(a.ticker || '').toUpperCase();
                        const info = tickerInfoMap.get(key);
                        const logo = info && (info.logo || info?.logo_url);
                        const parqetLogo = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(key)}?format=png`;
                        const fallbackLogo = `https://logo.clearbit.com/${key.replace(/[^A-Za-z]/g, '').toLowerCase()}.com`;
                        const src = logo || parqetLogo;
                        return (
                          <img
                            src={src}
                            alt={getDisplayFromRaw(key) || a.company}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            onError={(e) => {
                              if (e.target.src !== fallbackLogo) e.target.src = fallbackLogo;
                              else e.target.onerror = null;
                            }}
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
                            {up ? '↑' : '↓'} {Number(price || 0).toLocaleString()} <span className="percent">{pct>0?'+':''}{(pct!==null?Number(pct).toFixed(2):'0')}%</span>
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
          <div className="news-card card">
            <h4>Top News</h4>
            <ul className="news-list">
              {(news.length ? news : SAMPLE_NEWS).map(n => (
                <li key={n.id} className="news-item" style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={() => handleNewsClick(n)}>
                  {n.thumbnail ? (
                    <img src={n.thumbnail} alt={n.title} className="news-thumb" onError={(e)=>{e.target.onerror=null; e.target.style.display='none'}} />
                  ) : (
                    <div className="news-thumb--placeholder" />
                  )}
                  <div style={{flex:1}}>
                    {n.link ? (
                      <a
                        href={n.link}
                        className="news-title-link"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleNewsClick(n); }}
                      >
                        <div className="news-title" style={{fontWeight:600}}>{n.title}</div>
                      </a>
                    ) : (
                      <div className="news-title" style={{fontWeight:600}}>{n.title}</div>
                    )}
                    <div className="news-source" style={{fontSize:'0.9rem',color:'var(--text-secondary)'}}>
                      {n.source}{n.views ? <span className="news-views" style={{marginLeft:8,fontSize:'0.85rem',color:'var(--text-secondary)'}}>· {n.views} views</span> : null}
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