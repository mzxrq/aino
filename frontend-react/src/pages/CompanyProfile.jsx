import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TimezoneSelect from '../components/TimezoneSelect';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import EchartsCard from '../components/EchartsCard';
import FinancialsTable from '../components/FinancialsTable';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import '../css/CompanyProfile.css';
import { AuthContext } from '../context/contextBase';
import { useLoginPrompt } from '../context/LoginPromptContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
const PY_API = `${API_URL}/py`;

async function fetchJsonWithFallback(path) {
  // Call Python service directly (default port 5000)
  const url = `${PY_DIRECT}/py${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}
export default function CompanyProfile() {
  const { ticker: param } = useParams();
  const ticker = (param || '').toUpperCase();

  const [meta, setMeta] = useState({});
  const [chartData, setChartData] = useState(null);
  const [financials, setFinancials] = useState({});
  const [holders, setHolders] = useState({});
  const [insiders, setInsiders] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [schemas, setSchemas] = useState({});
  const [companyInfo, setCompanyInfo] = useState(null);
  const [news, setNews] = useState([]);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPageSize] = useState(10);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsTotalPages, setNewsTotalPages] = useState(0);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [descExpanded, setDescExpanded] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const { user, isLoggedIn } = useContext(AuthContext);
  const navigate = useNavigate();
  const promptLogin = useLoginPrompt();
  const [finOverlayOpen, setFinOverlayOpen] = useState(false);
  const [finOverlayTitle, setFinOverlayTitle] = useState('');
  const [finOverlayData, setFinOverlayData] = useState(null);

  function limitedObject(obj, max) {
    if (!obj || typeof obj !== 'object') return {};
    const keys = Object.keys(obj || {});
    const pick = keys.slice(0, max);
    const out = {};
    pick.forEach(k => out[k] = obj[k]);
    return out;
  }

  function openFinancialsOverlay(title, data) {
    setFinOverlayTitle(title);
    setFinOverlayData(data);
    setFinOverlayOpen(true);
  }

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        let m = {};
        try { m = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(ticker)}`); } catch (e) { }
        let chosen = Array.isArray(m) && m.length ? (m.find(x => x.ticker === ticker) || m[0]) : (m || {});
        if (!(chosen && (chosen.companyName || (chosen.yfinance && chosen.yfinance.description)))) {
          try { const r = await fetch(`${API_URL}/node/marketlists/ticker/${encodeURIComponent(ticker)}`); if (r.ok) { const body = await r.json(); if (body && body.success && body.data) chosen = body.data; } } catch (e) { }
        }
        if (!cancelled) setMeta(chosen || {});

        try { const c = await fetchJsonWithFallback(`/chart?ticker=${encodeURIComponent(ticker)}&period=3mo&interval=1d`); if (!cancelled) setChartData(c && (c[ticker] || c[Object.keys(c || {})[0]] || c)); } catch (e) { if (!cancelled) setChartData(null); }

        try {
          const f = await fetchJsonWithFallback(`/financials?ticker=${encodeURIComponent(ticker)}`);
          if (!cancelled) {
            setFinancials({ income_stmt: f.income_stmt || {}, balance_sheet: f.balance_sheet || {}, cash_flow: f.cash_flow || f.cashflow || {}, fetched_at: f.fetched_at || f.fetchedAt || null });
            setHolders({ major: f.major_holders || {}, institutional: f.institutional_holders || {}, mutualfund: f.mutualfund_holders || {} });
            setInsiders({ purchases: f.insider_purchases || {}, transactions: f.insider_transactions || {}, roster: f.insider_roster_holders || {} });
            setRecommendations(f.recommendations || {});
            setSchemas(f.schema || {});
            // keep financials.news only as fallback; primary news fetched via /py/news
            if (!Array.isArray(f.news)) {
              // leave news alone
            } else if (!f.news || f.news.length === 0) {
              // nothing
            } else {
              // lightweight fallback mapping
              const mapped = f.news.map(n => ({
                title: n.title || n.headline || n.summary || '',
                link: n.link || n.url || (n.canonicalUrl && n.canonicalUrl.url) || '#',
                pubDate: n.pubDate || n.providerPublishTime || null,
                source: n.source || (n.provider && n.provider.displayName) || n.publisher || ''
              }));
              setNews(mapped);
                // Cache provider metadata (thumbnail/pubDate) with ticker context so backend top endpoint can serve thumbnails
                try {
                  const toCache = mapped.map(a => ({ articleId: a.articleKey || a.link, url: a.link, title: a.title, source: a.source, pubDate: a.pubDate, thumbnail: a.thumbnail, sourceTicker: ticker || null })).filter(x => x.url && x.url !== '#');
                  if (toCache.length) {
                    try {
                      const cacheResp = await fetch(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
                      if (cacheResp.ok) {
                        const cacheJson = await cacheResp.json();
                        const map = (cacheJson.items || []).reduce((acc, it) => { if (it && it.articleKey) acc[it.articleKey] = it; return acc; }, {});
                        mapped.forEach(m => { const key = m.articleKey || m.link; const cached = map[key]; if (cached) { m.cacheId = cached.id; m.thumbnail = m.thumbnail || cached.thumbnail || null; m.pubDate = m.pubDate || cached.pubDate || null; } });
                      }
                    } catch (err) { console.debug('CompanyProfile cache post failed', err); }
                  }
                } catch (err) { console.debug('CompanyProfile cache post failed', err); }
            }
          }
        } catch (e) { console.warn('financials fetch failed', e); }

        // fetch news via py/news (yfinance)
        try {
          // initial page
          loadNews(1);
        } catch (e) { console.warn('news fetch failed', e); }

        // fetch company info (yf.get_info())
        try {
          const info = await fetchJsonWithFallback(`/company/info?ticker=${encodeURIComponent(ticker)}`);
          if (!cancelled) setCompanyInfo(info || null);
        } catch (e) { console.warn('company info fetch failed', e); }

      } catch (e) { console.error('loadAll err', e); }
      finally { if (!cancelled) setLoading(false); }
    }
    loadAll();
    return () => { cancelled = true; };
  }, [ticker]);

  async function loadNews(page = 1) {
    if (!ticker) return;
    setNewsLoading(true);
    try {
      const path = `/news?ticker=${encodeURIComponent(ticker)}&page=${page}&pageSize=${newsPageSize}`;
      const res = await fetchJsonWithFallback(path);
      // support multiple response shapes: { items: [...] } or [...] or { news: [...] }
      let rawItems = [];
      if (!res) rawItems = [];
      else if (Array.isArray(res)) rawItems = res;
      else if (Array.isArray(res.items)) rawItems = res.items;
      else if (Array.isArray(res.news)) rawItems = res.news;
      else rawItems = [];

      const items = rawItems.map((it, idx) => {
        // item may be normalized { content: { ... } } or legacy shape
        const c = (it && it.content) ? it.content : it || {};
        const raw = (c.raw && typeof c.raw === 'object') ? c.raw : (it.raw || it || {});

        const title = c.title || c.headline || c.summary || raw.title || raw.headline || raw.headlineText || '';

        const lookup = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.clickThroughUrl && (obj.clickThroughUrl.url || obj.clickThroughUrl)) return (obj.clickThroughUrl.url || obj.clickThroughUrl);
          if (obj.canonicalUrl && (obj.canonicalUrl.url || obj.canonicalUrl)) return (obj.canonicalUrl.url || obj.canonicalUrl);
          if (obj.link) return obj.link;
          if (obj.url) return obj.url;
          if (obj.href) return obj.href;
          return null;
        };

        let link = lookup(c) || lookup(raw) || lookup(raw.content) || lookup(it) || '#';

        const thumbnail = (c.thumbnail && (c.thumbnail.originalUrl || c.thumbnail.url)) || raw.image || raw.thumbnail || raw.summary_img || raw.mediaUrl || null;
        const contentType = (c.contentType || c.type || raw.type || 'STORY').toString().toUpperCase();
        const source = (c.source) || (raw.provider && raw.provider.displayName) || raw.source || raw.publisher || '';

        return {
          id: it.id || it.content?.id || `${ticker}-news-${page}-${idx}`,
          title: title || 'Untitled',
          description: c.description || c.summary || raw.summary || raw.description || '',
          pubDate: c.pubDate || raw.pubDate || raw.providerPublishTime || null,
          displayTime: c.displayTime || null,
          thumbnail,
          contentType,
          source,
          link
        };
      });

      // attach stored view counts where available
      try {
        const keys = items.map(a => a.link).filter(Boolean);
        if (keys.length) {
          const lookup = await fetch(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
          if (lookup.ok) {
            const pl = await lookup.json();
            const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
            for (let i = 0; i < items.length; i++) { const k = items[i].link; items[i].views = (map[k] && map[k].views) ? map[k].views : 0; }
          }
        }
      } catch (err) { console.debug('views lookup failed', err); }

      setNews(items);
      setNewsPage(page);
      setNewsTotal((res && res.total) || items.length);
      setNewsTotalPages((res && res.totalPages) || (items.length ? 1 : 0));
    } catch (e) { console.warn('loadNews error', e); }
    finally { setNewsLoading(false); }
  }

  // Report a news view to backend then open link
  async function handleNewsClick(e, item) {
      try {
      if (e && e.preventDefault) e.preventDefault();
      const link = item.link || item.url || '#';
        let articleId = item.cacheId || item.articleKey || item.id || link;
        if (!item.cacheId) {
          try {
            const toCache = [{ articleId: item.articleKey || item.link, url: item.link || null, title: item.title || null, source: item.source || null, pubDate: item.pubDate || null, thumbnail: item.thumbnail || null, sourceTicker: ticker }];
            const cr = await fetch(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
            if (cr.ok) {
              const cj = await cr.json();
              const found = (cj.items || []).find(i => i && i.articleKey === (item.articleKey || item.link));
              if (found) {
                articleId = found.id || found.articleKey || articleId;
                item.cacheId = found.id || null;
                if (!item.thumbnail && found.thumbnail) item.thumbnail = found.thumbnail;
              }
            }
          } catch (e) { }
        }
      // fire-and-forget POST to backend
        const payload = { url: link, articleId, title: item.title, ticker, thumbnail: item.thumbnail || null, pubDate: item.pubDate || null };
        fetch(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => { });
      // open the article
      window.open(link, '_blank', 'noopener');
    } catch (err) {
      const link = item.link || item.url || '#';
      window.open(link, '_blank', 'noopener');
    }
  }

  const dates = useMemo(() => (chartData?.dates || []).map(d => d), [chartData]);
  const close = useMemo(() => chartData?.close || [], [chartData]);
  const open = chartData?.open || [];
  const high = chartData?.high || [];
  const low = chartData?.low || [];
  const volume = chartData?.volume || [];

  function formatNumber(v) { if (v == null) return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); const abs = Math.abs(n); if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`; if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`; if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`; return n.toLocaleString(); }
  function isEmptyObj(x) { if (!x) return true; try { if (Array.isArray(x)) return x.length === 0; if (typeof x === 'object') return Object.keys(x).length === 0; } catch (e) { return true } return false; }
  function formatPre(x) { try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); } }
  function parseMajorHolders(obj) { if (!obj) return {}; if (obj.Value && typeof obj.Value === 'object') return obj.Value; return obj; }
  function parseColumnTable(colObj) { if (!colObj || typeof colObj !== 'object') return []; const cols = Object.keys(colObj || {}); if (cols.length === 0) return []; const idxs = new Set(); cols.forEach(c => { const col = colObj[c] || {}; Object.keys(col).forEach(k => idxs.add(k)); }); const rows = Array.from(idxs).sort((a, b) => Number(a) - Number(b)).map(i => { const row = {}; cols.forEach(c => { const col = colObj[c] || {}; row[c] = col[i] != null ? col[i] : ''; }); return row; }); return rows; }
  function formatPercent(v) { if (v == null || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); if (Math.abs(n) <= 1) return `${(n * 100).toFixed(2)}%`; return `${n.toFixed(2)}%`; }
  function formatCurrency(v) { if (v == null || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); try { if (meta && meta.yfinance && meta.yfinance.currency) return new Intl.NumberFormat(undefined, { style: 'currency', currency: meta.yfinance.currency }).format(n); } catch (e) { } return formatNumber(n); }
  function formatCell(header, value) { if (value == null || value === '') return '-'; const h = (header || '').toLowerCase(); if (typeof value === 'string' && value.trim().endsWith('%')) return value; if (h.includes('pct') || h.includes('percent') || h.includes('%') || h.includes('pctheld')) return formatPercent(value); if (h.includes('value') || h.includes('market') || h.includes('amt') || h.includes('price') || h.includes('amount')) return formatCurrency(value); if (h.includes('share')) return formatNumber(value); if (!Number.isNaN(Number(value))) return formatNumber(value); return String(value); }

  const latestPrice = (close && close.length) ? Number(close[close.length - 1]) : null;
  const prevPrice = (close && close.length > 1) ? Number(close[close.length - 2]) : null;
  const priceChange = (latestPrice != null && prevPrice != null) ? (latestPrice - prevPrice) : null;
  const priceChangePct = (priceChange != null && prevPrice) ? (priceChange / prevPrice) : null;

  function toggleFollow() {
    if (!isLoggedIn) {
      promptLogin({ title: 'Please log in', text: 'You must be logged in to follow tickers.', confirmLabel: 'Log in', cancelLabel: 'Cancel' }).then(ok => {
        if (ok) navigate(`/login?next=/company/${encodeURIComponent(ticker)}`);
      });
      return;
    }
    setFollowed(f => !f);
  }
  function toggleFavorite() { setFavorited(f => !f); }

  function toggleFavoriteProtected() {
    if (!isLoggedIn) {
      promptLogin({ title: 'Please log in', text: 'You must be logged in to favorite tickers.', confirmLabel: 'Log in', cancelLabel: 'Cancel' }).then(ok => {
        if (ok) navigate(`/login?next=/company/${encodeURIComponent(ticker)}`);
      });
      return;
    }
    setFavorited(f => !f);
  }

  const logoUrl = (companyInfo && companyInfo.logo) || (meta && meta.yfinance && meta.yfinance.logo) || meta.logo || null;

  return (
    <div className="company-shell container-centered">
      <div className="company-header">
        <div className="company-left">
          {logoUrl ? (
            <img src={logoUrl} alt={`${meta?.displayTicker || getDisplayFromRaw(ticker)} logo`} className="company-logo" />
          ) : (
            <div className="company-logo placeholder" aria-hidden="true"></div>
          )}
          <div className="company-text">
            <h1 className="company-ticker">{meta?.displayTicker || getDisplayFromRaw(ticker)}</h1>
            <div className="company-name">{meta?.companyName || ""}</div>
            <div className="company-meta">
              {meta?.primaryExchange || ""}
              {meta?.yfinance?.currency ? ` · ${meta.yfinance.currency}` : ""}
            </div>
          </div>
        </div>

        <div className="company-actions">
          <button
            className={`btn btn-follow ${followed ? 'followed' : ''}`}
            onClick={toggleFollow}
            aria-pressed={followed}
            title={followed ? 'Following' : 'Follow'}
          >
            <span className="icon plus">+</span>
            <span className="icon check">✓</span>
            <span className="icon minus">−</span>
            <span className="label">{followed ? 'Following' : 'Follow'}</span>
          </button>

          <button
            className={`btn btn-fav ${favorited ? 'favorited' : ''}`}
            onClick={toggleFavoriteProtected}
            aria-pressed={favorited}
            title={favorited ? 'Favorited' : 'Favorite'}
          >
            <span className="icon star">☆</span>
            <span className="icon star-filled">★</span>
            <span className="label">Favorite</span>
          </button>
        </div>
      </div>

      <Dialog open={finOverlayOpen} onClose={() => setFinOverlayOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{finOverlayTitle}</DialogTitle>
        <DialogContent>
          <div style={{ paddingTop: 8 }}>
            {finOverlayTitle === 'All Financials' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <h5 style={{ marginTop: 0 }}>Income Statement</h5>
                  <FinancialsTable title="Income Statement" data={financials.income_stmt || {}} transpose={true} />
                </div>
                <div>
                  <h5 style={{ marginTop: 0 }}>Balance Sheet</h5>
                  <FinancialsTable title="Balance Sheet" data={financials.balance_sheet || {}} transpose={true} />
                </div>
              </div>
            ) : (
              <FinancialsTable title={finOverlayTitle} data={finOverlayData || {}} transpose={true} />
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinOverlayOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <div className="company-grid">
        <div className="card meta-card">
          <div className="meta-grid">
            <div className="meta-left">
              <h2 className="meta-name">{meta?.companyName || ""}</h2>
              <div className="meta-sub">
                {meta?.displayTicker || ticker} · {meta?.primaryExchange || ""}
              </div>
              <div
                className={`meta-desc ${descExpanded ? "expanded" : "collapsed"
                  }`}
              >
                {meta?.yfinance?.description || ""}
              </div>
              {meta?.yfinance?.description &&
                meta.yfinance.description.length > 200 && (
                  <button
                    className="meta-toggle"
                    onClick={() => setDescExpanded((v) => !v)}
                  >
                    {descExpanded ? "Show less" : "Show more"}
                  </button>
                )}
            </div>
            <div className="meta-right">
              <div className="meta-stats">
                <div>
                  Market Cap:{" "}
                  <strong>
                    {meta?.yfinance?.marketCap
                      ? formatNumber(meta.yfinance.marketCap)
                      : "-"}
                  </strong>
                </div>
              </div>
              <div className="meta-price">
                <div className="price-now">
                  {latestPrice != null
                    ? meta?.yfinance?.currency
                      ? new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: meta.yfinance.currency,
                      }).format(latestPrice)
                      : formatNumber(latestPrice)
                    : "-"}
                </div>
                <div
                  className={`price-change ${priceChange > 0 ? "up" : priceChange < 0 ? "down" : ""
                    }`}
                >
                  {priceChange != null
                    ? `${priceChange >= 0 ? "+" : ""}${formatNumber(
                      priceChange
                    )} (${priceChangePct != null
                      ? (priceChangePct * 100).toFixed(2) + "%"
                      : "-"
                    })`
                    : "-"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="company-side">
          <div className="card company-card">
            <div className="company-info">
              <table className="">
                <tbody>
                  <tr>
                    <strong>Industry</strong>
                  </tr>
                  {companyInfo?.industry || meta?.yfinance?.industry || "-"}
                  <tr>
                    <strong>Sector</strong>
                  </tr>
                  {companyInfo?.sector || meta?.yfinance?.sector || "-"}
                  <tr>
                    <strong>Website</strong>
                  </tr>
                  {companyInfo?.website ? (
                    <a
                      href={companyInfo.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {companyInfo.website}
                    </a>
                  ) : (
                    "-"
                  )}
                  <tr>
                    <strong>Phone</strong>
                  </tr>
                  {companyInfo?.phone || "-"}
                </tbody>
              </table>
              <div className="company-address">
                {companyInfo?.address1 || ""}
                {companyInfo?.address2 ? `, ${companyInfo.address2}` : ""}
                {companyInfo?.city ? `, ${companyInfo.city}` : ""}
                {companyInfo?.zip ? ` ${companyInfo.zip}` : ""}
                {companyInfo?.country ? `, ${companyInfo.country}` : ""}
              </div>
            </div>
            {companyInfo &&
              Array.isArray(companyInfo.companyOfficers) &&
              companyInfo.companyOfficers.length > 0 && (
                <div className="company-officers">
                  <table
                    className="officers-table"
                    style={{ marginTop: "6px" }}
                  >
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Name</th>
                        <th>Fiscal Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyInfo.companyOfficers.slice(0, 8).map((o, idx) => (
                        <tr key={idx}>
                          <td>{o.title || "-"}</td>
                          <td>{o.name || "-"}</td>
                          <td>{o.fiscalYear || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="card financials">
            <div className="card-header">
              <h4>Financials</h4>
              <Button size="small" onClick={() => { setFinOverlayTitle('All Financials'); setFinOverlayData(null); setFinOverlayOpen(true); }}>Show more</Button>
            </div>
            <div className="financial-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="fin-section">
                <h5>Income</h5>
                {Object.entries(financials.income_stmt || {}).length === 0 && (
                  <div className="lc-table-empty">No data</div>
                )}
                <FinancialsTable title="Income Statement" data={financials.income_stmt || {}} compact importantMetrics={["totalRevenue", "netIncome", "operatingIncome", "ebitda", "basicEPS"]} />
              </div>
              <div className="fin-section">
                <h5>Balance</h5>
                {Object.entries(financials.balance_sheet || {}).length === 0 && (
                  <div className="lc-table-empty">No data</div>
                )}
                <FinancialsTable title="Balance Sheet" data={financials.balance_sheet || {}} compact importantMetrics={["totalAssets", "totalLiab", "totalLiabilities", "totalCurrentAssets", "totalCurrentLiabilities"]} />
              </div>
            </div>
          </div>
        </aside>

        <section className="company-chart card">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Chart</h3>
            
            {financials.fetched_at ? (
              <div
                style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}
              >{`Updated: ${new Date(
                financials.fetched_at
              ).toLocaleDateString()}`}</div>
            ) : null}
            <div className="company-right">
              <Link to={`/chart/u/${encodeURIComponent(ticker)}`} className="btn-outline">
                Open Chart
              </Link>
            </div>
          </div>

          {loading && !chartData && <div className="muted">Loading chart…</div>}
          {!loading && chartData && (
            <EchartsCard
              ticker={ticker}
              dates={dates}
              open={open}
              high={high}
              low={low}
              close={close}
              volume={volume}
              timezone={timezone}
              period={"6mo"}
              interval={"1d"}
              chartMode={"candlestick"}
              height={320}
              showVolume
            />
          )}

          <div className="card news" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h4>News</h4>
            </div>
            <div className="news-list">
              {newsLoading && (
                <div className="news-skeleton">
                  <div className="news-skel-item">
                    <div className="news-skel-thumb" />
                    <div className="news-skel-lines">
                      <div
                        className="news-skel-line"
                        style={{ width: "70%" }}
                      ></div>
                      <div
                        className="news-skel-line"
                        style={{ width: "45%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="news-skel-item">
                    <div className="news-skel-thumb" />
                    <div className="news-skel-lines">
                      <div
                        className="news-skel-line"
                        style={{ width: "60%" }}
                      ></div>
                      <div
                        className="news-skel-line"
                        style={{ width: "30%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="news-skel-item">
                    <div className="news-skel-thumb" />
                    <div className="news-skel-lines">
                      <div
                        className="news-skel-line"
                        style={{ width: "80%" }}
                      ></div>
                      <div
                        className="news-skel-line"
                        style={{ width: "50%" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
              {!newsLoading && news.length === 0 && (
                <div className="lc-table-empty">No news</div>
              )}
              {news.map((n, i) => (
                <a
                  className="news-item"
                  key={n.id || i}
                  href={n.link || "#"}
                  onClick={(e) => handleNewsClick(e, n)}
                  rel="noreferrer"
                >
                  {n.thumbnail ? (
                    <img className="news-thumb" src={n.thumbnail} alt="thumb" />
                  ) : null}
                  <div className="news-body">
                    <div className="news-title">{n.title}</div>
                    <div className="news-meta">
                      <span className="news-badge">{n.contentType}</span>
                      {n.source ? ` ${n.source} · ` : " "}
                      <span className="news-time">
                        {n.displayTime ||
                          (n.pubDate
                            ? new Date(n.pubDate).toLocaleString()
                            : "")}
                      </span>
                      {n.views ? <span className="news-views" style={{ marginLeft: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.views} views</span> : null}
                    </div>
                  </div>
                </a>
              ))}

              {/* pagination controls */}
              {newsTotalPages > 1 && (
                <div className="news-pagination">
                  <button
                    className="btn"
                    disabled={newsPage <= 1 || newsLoading}
                    onClick={() => loadNews(newsPage - 1)}
                  >
                    Prev
                  </button>
                  <span style={{ padding: "0 8px" }}>
                    {newsPage} / {newsTotalPages}
                  </span>
                  <button
                    className="btn"
                    disabled={newsPage >= newsTotalPages || newsLoading}
                    onClick={() => loadNews(newsPage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
