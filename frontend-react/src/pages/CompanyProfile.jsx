import { useEffect, useMemo, useState, useContext } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import { getLocalizedCompanyName } from '../utils/companyNameUtils';
import { getFinancialLabel } from '../utils/financialLabels';
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
import { i18n } from '@lingui/core';

const API_URL = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';

// Global in-flight request map to deduplicate identical concurrent requests.
// Keeps the promise so multiple mounts/strict-mode remounts reuse the same network call.
const _inFlightRequests = new Map();

async function fetchJsonWithFallback(path) {
  // Call Python service directly (default port 5000)
  const url = `${PY_DIRECT}/py${path}`;
  // Deduplicate concurrent requests for the same URL
  if (_inFlightRequests.has(url)) {
    return _inFlightRequests.get(url);
  }
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  })();
  _inFlightRequests.set(url, p);
  // Ensure entry is removed when settled so future fresh requests can occur
  p.finally(() => { try { _inFlightRequests.delete(url); } catch (_) {} });
  return p;
}

// Generic fetch helper that deduplicates requests (GET and identical POSTs)
async function fetchWithDedup(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let key = `${method} ${url}`;
  if (method !== 'GET' && options.body) {
    try {
      key += ' ' + (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    } catch (_e) {
      // ignore serialization errors
    }
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
export default function CompanyProfile() {
  const { ticker: param } = useParams();
  const ticker = (param || '').toUpperCase();

  const [meta, setMeta] = useState({});
  const [chartData, setChartData] = useState(null);
  const [financials, setFinancials] = useState({});
  const [_holders, setHolders] = useState({});
  const [_insiders, setInsiders] = useState({});
  const [_recommendations, setRecommendations] = useState({});
  const [_schemas, setSchemas] = useState({});
  const [companyInfo, setCompanyInfo] = useState(null);
  const [news, setNews] = useState([]);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPageSize] = useState(10);
  const [_newsTotal, setNewsTotal] = useState(0);
  const [newsTotalPages, setNewsTotalPages] = useState(0);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timezone, _setTimezone] = useState('UTC');
  const [descExpanded, setDescExpanded] = useState(false);
  const [followed, setFollowed] = useState(false);
  const { isLoggedIn } = useContext(AuthContext);
  const navigate = useNavigate();
  const promptLogin = useLoginPrompt();
  const { i18n: lingui } = useLingui();
  const [finOverlayOpen, setFinOverlayOpen] = useState(false);
  const [finOverlayTitle, setFinOverlayTitle] = useState('');
  const [finOverlayData, setFinOverlayData] = useState(null);


  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        let m = {};
        try { m = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(ticker)}`); } catch (_e) { /* ignore */ }
        let chosen = Array.isArray(m) && m.length ? (m.find(x => x.ticker === ticker) || m[0]) : (m || {});
        if (!(chosen && (chosen.companyName || (chosen.yfinance && chosen.yfinance.description)))) {
          try { const body = await fetchWithDedup(`${API_URL}/node/marketlists/ticker/${encodeURIComponent(ticker)}`); if (body && body.success && body.data) chosen = body.data; } catch (_e) { /* ignore */ }
        }
        if (!cancelled) setMeta(chosen || {});

        try { const c = await fetchJsonWithFallback(`/chart?ticker=${encodeURIComponent(ticker)}&period=3mo&interval=1d`); if (!cancelled) setChartData(c && (c[ticker] || c[Object.keys(c || {})[0]] || c)); } catch (_e) { if (!cancelled) setChartData(null); }

        // Fetch income statement from MongoDB (via Node backend)
        try {
          const incomeStmtData = await fetchWithDedup(`${API_URL}/node/financials/incomeStmt?ticker=${encodeURIComponent(ticker)}`);
          // Transform array of documents to table format: { fieldName: { date: value, ... }, ... }
          const incomeTableFormat = {};
          if (Array.isArray(incomeStmtData)) {
            incomeStmtData.forEach(doc => {
              Object.entries(doc.metrics || {}).forEach(([metricName, value]) => {
                if (!incomeTableFormat[metricName]) incomeTableFormat[metricName] = {};
                incomeTableFormat[metricName][doc.fiscalDate] = value;
              });
            });
          }
          if (!cancelled) setFinancials(prev => ({ ...prev, income_stmt: incomeTableFormat, fetched_at: new Date().toISOString() }));
        } catch (e) { console.warn('incomeStmt fetch failed', e); }

        // Fetch balance sheet from MongoDB (via Node backend)
        try {
          const balSheetData = await fetchWithDedup(`${API_URL}/node/financials/balSheet?ticker=${encodeURIComponent(ticker)}`);
          // Transform to table format, combining assets, liabilities, equity sections
          const balSheetTableFormat = {};
          if (Array.isArray(balSheetData)) {
            balSheetData.forEach(doc => {
              // Flatten nested sections
              const allMetrics = {
                ...doc.assets,
                ...doc.liabilities,
                ...doc.equity
              };
              Object.entries(allMetrics || {}).forEach(([metricName, value]) => {
                if (!balSheetTableFormat[metricName]) balSheetTableFormat[metricName] = {};
                balSheetTableFormat[metricName][doc.fiscalDate] = value;
              });
            });
          }
          if (!cancelled) setFinancials(prev => ({ ...prev, balance_sheet: balSheetTableFormat }));
        } catch (e) { console.warn('balSheet fetch failed', e); }

        // Fetch news via yfinance
        try {
          loadNews(1);
        } catch (_e) { console.warn('news fetch failed', _e); }

        // Fetch company info from MongoDB or fallback to yfinance
        try {
          const info = await fetchJsonWithFallback(`/company/info?ticker=${encodeURIComponent(ticker)}`);
          if (!cancelled) setCompanyInfo(info || null);
        } catch (_e) { console.warn('company info fetch failed', _e); }

      } catch (_e) { console.error('loadAll err', _e); }
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

      // attach stored view counts where available (cached POST lookup, 5min TTL)
      try {
        const keys = items.map(a => a.link).filter(Boolean);
        if (keys.length) {
          try {
            const pl = await fetchWithDedup(`${API_URL}/node/news/views/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
            const map = (pl.items || []).reduce((acc, it) => { acc[it.articleKey || it.url] = it; return acc; }, {});
            for (let i = 0; i < items.length; i++) { const k = items[i].link; items[i].views = (map[k] && map[k].views) ? map[k].views : 0; }
          } catch (err) { console.debug('views lookup failed', err); }
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
              try {
                const cj = await fetchWithDedup(`${API_URL}/node/news/views/cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: toCache }) });
                const found = (cj.items || []).find(i => i && i.articleKey === (item.articleKey || item.link));
                if (found) {
                  articleId = found.id || found.articleKey || articleId;
                  item.cacheId = found.id || null;
                  if (!item.thumbnail && found.thumbnail) item.thumbnail = found.thumbnail;
                }
              } catch (e) { }
            } catch (e) { }
        }
      // fire-and-forget POST to backend
        const payload = { url: link, articleId, title: item.title, ticker, thumbnail: item.thumbnail || null, pubDate: item.pubDate || null };
        fetchWithDedup(`${API_URL}/node/news/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => { });
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

  const latestPrice = (close && close.length) ? Number(close[close.length - 1]) : null;
  const prevPrice = (close && close.length > 1) ? Number(close[close.length - 2]) : null;
  const priceChange = (latestPrice != null && prevPrice != null) ? (latestPrice - prevPrice) : null;
  const priceChangePct = (priceChange != null && prevPrice) ? (priceChange / prevPrice) : null;

  function toggleFollow() {
    if (!isLoggedIn) {
      promptLogin({ title: i18n._('Please log in'), text: i18n._('You must be logged in to follow tickers.'), confirmLabel: i18n._('Log in'), cancelLabel: i18n._('Cancel') }).then(ok => {
        if (ok) navigate(`/login?next=/company/${encodeURIComponent(ticker)}`);
      });
      return;
    }
    setFollowed(f => !f);
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
            <div className="company-name">{getLocalizedCompanyName(meta, lingui?.locale || 'en')}</div>
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
            <span className="label"><Trans>{followed ? 'Following' : 'Follow'}</Trans></span>
          </button>
        </div>
      </div>

      <Dialog 
        open={finOverlayOpen} 
        onClose={() => setFinOverlayOpen(false)} 
        maxWidth="lg" 
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogTitle-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#252525' : '#f5f5f5',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
            borderBottom: document.body.classList.contains('dark') ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiDialogContent-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogActions-root': {
            backgroundColor: document.body.classList.contains('dark') ? '#1a1a1a' : '#ffffff',
            borderTop: document.body.classList.contains('dark') ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiButton-root': {
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#333',
          },
        }}
      >
        <DialogTitle>{finOverlayTitle}</DialogTitle>
        <DialogContent>
          <div style={{ paddingTop: 8 }}>
            {finOverlayTitle === 'All Financials' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <h5 style={{ marginTop: 0 }}><Trans>Income Statement</Trans></h5>
                  <FinancialsTable title="Income Statement" data={financials.income_stmt || {}} />
                </div>
                <div>
                  <h5 style={{ marginTop: 0 }}><Trans>Balance Sheet</Trans></h5>
                  <FinancialsTable title="Balance Sheet" data={financials.balance_sheet || {}} />
                </div>
              </div>
            ) : (
              <FinancialsTable title={finOverlayTitle} data={finOverlayData || {}} />
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinOverlayOpen(false)}><Trans>Close</Trans></Button>
        </DialogActions>
      </Dialog>

      <div className="company-grid">
        <div className="card meta-card">
          <div className="meta-grid">
            <div className="meta-left">
              <h2 className="meta-name">{getLocalizedCompanyName(meta, lingui?.locale || 'en')}</h2>
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
                    <Trans>{descExpanded ? "Show less" : "Show more"}</Trans>
                  </button>
                )}
            </div>
            <div className="meta-right">
              <div className="meta-stats">
                <div>
                  <Trans>Market Cap:</Trans>{" "}
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
                    <td><strong>{getFinancialLabel('industry')}</strong></td>
                    <td>{companyInfo?.industry || meta?.yfinance?.industry || "-"}</td>
                  </tr>
                  <tr>
                    <td><strong>{getFinancialLabel('sector')}</strong></td>
                    <td>{companyInfo?.sector || meta?.yfinance?.sector || "-"}</td>
                  </tr>
                  <tr>
                    <td><strong>{getFinancialLabel('website')}</strong></td>
                    <td>
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
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{getFinancialLabel('phone')}</strong></td>
                    <td>{companyInfo?.phone || "-"}</td>
                  </tr>
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
                        <th>{getFinancialLabel('title')}</th>
                        <th>{getFinancialLabel('name')}</th>
                        <th>{getFinancialLabel('fiscalYear')}</th>
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
              <h4><Trans>Financials</Trans></h4>
              <Button size="small" onClick={() => { setFinOverlayTitle('All Financials'); setFinOverlayData(null); setFinOverlayOpen(true); }}><Trans>Show more</Trans></Button>
            </div>
            <div className="financial-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="fin-section">
                <h5>{getFinancialLabel('incomeStatement')}</h5>
                {Object.entries(financials.income_stmt || {}).length === 0 && (
                  <div className="lc-table-empty"><Trans>No data</Trans></div>
                )}
                <FinancialsTable title={getFinancialLabel('incomeStatement')} data={financials.income_stmt || {}} compact importantMetrics={["totalRevenue", "netIncome", "operatingIncome", "ebitda", "basicEPS"]} />
              </div>
              <div className="fin-section">
                <h5>{getFinancialLabel('balanceSheet')}</h5>
                {Object.entries(financials.balance_sheet || {}).length === 0 && (
                  <div className="lc-table-empty"><Trans>No data</Trans></div>
                )}
                <FinancialsTable title={getFinancialLabel('balanceSheet')} data={financials.balance_sheet || {}} compact importantMetrics={["totalAssets", "totalLiab", "totalLiabilities", "totalCurrentAssets", "totalCurrentLiabilities"]} />
              </div>
            </div>
          </div>
        </aside>

        <section className="company-chart card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
              <h3 style={{ margin: 0 }}><Trans>Chart</Trans></h3>
              {financials.fetched_at ? (
                <div
                  style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}
                >{<Trans>Updated:</Trans>} {new Date(
                  financials.fetched_at
                ).toLocaleDateString()}</div>
              ) : null}
            </div>
            <Link to={`/chart/u/${encodeURIComponent(ticker)}`} className="btn-outline">
              <Trans>Open Chart</Trans>
            </Link>
          </div>

          {loading && !chartData && <div className="muted"><Trans>Loading chart…</Trans></div>}
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
              <h4><Trans>News</Trans></h4>
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
                <div className="lc-table-empty"><Trans>No news</Trans></div>
              )}
              {news.map((n, i) => (
                <a
                  className="news-item"
                  key={n.id || i}
                  href={n.link || "#"}
                  onClick={(e) => handleNewsClick(e, n)}
                  onMouseDown={(e) => {
                    // Track views for middle-click (button 1) and any click that opens new tab
                    if (e.button === 1 || e.button === 2) {
                      handleNewsClick(null, n);
                    }
                  }}
                  onAuxClick={(e) => {
                    // Catch middle-click if onMouseDown missed it
                    if (e.button === 1) {
                      handleNewsClick(null, n);
                    }
                  }}
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
                    <Trans>Prev</Trans>
                  </button>
                  <span style={{ padding: "0 8px" }}>
                    {newsPage} / {newsTotalPages}
                  </span>
                  <button
                    className="btn"
                    disabled={newsPage >= newsTotalPages || newsLoading}
                    onClick={() => loadNews(newsPage + 1)}
                  >
                    <Trans>Next</Trans>
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
