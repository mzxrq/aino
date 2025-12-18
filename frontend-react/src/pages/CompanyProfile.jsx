import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import TimezoneSelect from '../components/TimezoneSelect';
import EchartsCard from '../components/EchartsCard';
import '../css/CompanyProfile.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
const PY_API = `${API_URL}/py`;

async function fetchJsonWithFallback(path){
  const primary = `${PY_DIRECT}/py${path}`;
  const fallback = `${PY_API}${path}`;
  try{ const r = await fetch(primary); if (r.ok) return await r.json(); }catch(e){}
  const r2 = await fetch(fallback);
  if (!r2.ok) throw new Error('request failed');
  return await r2.json();
}

export default function CompanyProfile(){
  const { ticker: param } = useParams();
  const ticker = (param || '').toUpperCase();

  const [meta, setMeta] = useState({});
  const [chartData, setChartData] = useState(null);
  const [financials, setFinancials] = useState({});
  const [holders, setHolders] = useState({});
  const [insiders, setInsiders] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [schemas, setSchemas] = useState({});
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState('UTC');

  useEffect(()=>{
    if (!ticker) return;
    let cancelled = false;
    async function loadAll(){
      setLoading(true);
      try{
        let m = {};
        try{ m = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(ticker)}`); }catch(e){}
        let chosen = Array.isArray(m) && m.length ? (m.find(x=>x.ticker===ticker) || m[0]) : (m || {});
        if (!(chosen && (chosen.companyName || (chosen.yfinance && chosen.yfinance.description)))){
          try{ const r = await fetch(`${API_URL}/node/marketlists/ticker/${encodeURIComponent(ticker)}`); if (r.ok){ const body = await r.json(); if (body && body.success && body.data) chosen = body.data; } }catch(e){}
        }
        if (!cancelled) setMeta(chosen || {});

        try{ const c = await fetchJsonWithFallback(`/chart?ticker=${encodeURIComponent(ticker)}&period=3mo&interval=1d`); if (!cancelled) setChartData(c && (c[ticker] || c[Object.keys(c||{})[0]] || c)); }catch(e){ if (!cancelled) setChartData(null); }

        try{
          const f = await fetchJsonWithFallback(`/financials?ticker=${encodeURIComponent(ticker)}`);
          if (!cancelled){
            setFinancials({ income_stmt: f.income_stmt || {}, balance_sheet: f.balance_sheet || {}, cash_flow: f.cash_flow || f.cashflow || {}, fetched_at: f.fetched_at || f.fetchedAt || null });
            setHolders({ major: f.major_holders || {}, institutional: f.institutional_holders || {}, mutualfund: f.mutualfund_holders || {} });
            setInsiders({ purchases: f.insider_purchases || {}, transactions: f.insider_transactions || {}, roster: f.insider_roster_holders || {} });
            setRecommendations(f.recommendations || {});
            setSchemas(f.schema || {});
            setNews(Array.isArray(f.news) ? f.news : []);
          }
        }catch(e){ console.warn('financials fetch failed', e); }

      }catch(e){ console.error('loadAll err', e); }
      finally{ if (!cancelled) setLoading(false); }
    }
    loadAll();
    return ()=>{ cancelled = true; };
  }, [ticker]);

  const dates = useMemo(()=> (chartData?.dates || []).map(d=>d), [chartData]);
  const close = useMemo(()=> chartData?.close || [], [chartData]);
  const open = chartData?.open || [];
  const high = chartData?.high || [];
  const low = chartData?.low || [];
  const volume = chartData?.volume || [];

  function formatNumber(v){ if (v == null) return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); const abs = Math.abs(n); if (abs >= 1e12) return `${(n/1e12).toFixed(2)}T`; if (abs >= 1e9) return `${(n/1e9).toFixed(2)}B`; if (abs >= 1e6) return `${(n/1e6).toFixed(2)}M`; return n.toLocaleString(); }
  function isEmptyObj(x){ if (!x) return true; try{ if (Array.isArray(x)) return x.length === 0; if (typeof x === 'object') return Object.keys(x).length === 0; }catch(e){return true} return false; }
  function formatPre(x){ try{ return JSON.stringify(x,null,2); }catch(e){ return String(x);} }
  function parseMajorHolders(obj){ if (!obj) return {}; if (obj.Value && typeof obj.Value === 'object') return obj.Value; return obj; }
  function parseColumnTable(colObj){ if (!colObj || typeof colObj !== 'object') return []; const cols = Object.keys(colObj || {}); if (cols.length === 0) return []; const idxs = new Set(); cols.forEach(c=>{ const col = colObj[c] || {}; Object.keys(col).forEach(k=>idxs.add(k)); }); const rows = Array.from(idxs).sort((a,b)=>Number(a)-Number(b)).map(i=>{ const row = {}; cols.forEach(c=>{ const col = colObj[c]||{}; row[c] = col[i] != null ? col[i] : ''; }); return row; }); return rows; }
  function formatPercent(v){ if (v == null || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); if (Math.abs(n) <= 1) return `${(n*100).toFixed(2)}%`; return `${n.toFixed(2)}%`; }
  function formatCurrency(v){ if (v == null || v === '') return '-'; const n = Number(v); if (Number.isNaN(n)) return String(v); try{ if (meta && meta.yfinance && meta.yfinance.currency) return new Intl.NumberFormat(undefined,{style:'currency',currency:meta.yfinance.currency}).format(n); }catch(e){} return formatNumber(n); }
  function formatCell(header, value){ if (value == null || value === '') return '-'; const h = (header||'').toLowerCase(); if (typeof value === 'string' && value.trim().endsWith('%')) return value; if (h.includes('pct') || h.includes('percent') || h.includes('%') || h.includes('pctheld')) return formatPercent(value); if (h.includes('value') || h.includes('market') || h.includes('amt') || h.includes('price') || h.includes('amount')) return formatCurrency(value); if (h.includes('share')) return formatNumber(value); if (!Number.isNaN(Number(value))) return formatNumber(value); return String(value); }

  const latestPrice = (close && close.length) ? Number(close[close.length-1]) : null;
  const prevPrice = (close && close.length>1) ? Number(close[close.length-2]) : null;
  const priceChange = (latestPrice != null && prevPrice != null) ? (latestPrice - prevPrice) : null;
  const priceChangePct = (priceChange != null && prevPrice) ? (priceChange / prevPrice) : null;

  return (
    <div className="company-shell">
      <div className="company-header">
        <div className="company-left">
          <h1 className="company-ticker">{ticker}</h1>
          <div className="company-name">{meta?.companyName || ''}</div>
          <div className="company-meta">{meta?.primaryExchange || ''}{meta?.yfinance?.currency ? ` · ${meta.yfinance.currency}` : ''}</div>
        </div>
        <div className="company-right">
          <TimezoneSelect value={timezone} onChange={v=>setTimezone(v)} options={['UTC','America/New_York','Asia/Tokyo','Asia/Bangkok','Europe/London']} currentTimezone={timezone} formatLabel={v=>v} displayTime={null} />
          <Link to="/chart" className="btn-outline">Open Chart</Link>
        </div>
      </div>

      <div className="company-grid">
        <aside className="company-side">
          <div className="card meta-card">
            <div className="meta-grid">
              <div className="meta-left">
                <h2 className="meta-name">{meta?.companyName || ''}</h2>
                <div className="meta-sub">{meta?.displayTicker || ticker} · {meta?.primaryExchange || ''}</div>
                <div className="meta-desc">{meta?.yfinance?.description || ''}</div>
              </div>
              <div className="meta-right">
                <div className="meta-stats">
                  <div>Market Cap: <strong>{meta?.yfinance?.marketCap ? formatNumber(meta.yfinance.marketCap) : '-'}</strong></div>
                </div>
                <div className="meta-price">
                  <div className="price-now">{latestPrice != null ? (meta?.yfinance?.currency ? new Intl.NumberFormat(undefined,{style:'currency',currency:meta.yfinance.currency}).format(latestPrice) : formatNumber(latestPrice)) : '-'}</div>
                  <div className={`price-change ${priceChange>0 ? 'up' : priceChange<0 ? 'down' : ''}`}>{priceChange != null ? `${priceChange>=0?'+':''}${formatNumber(priceChange)} (${priceChangePct!=null? (priceChangePct*100).toFixed(2)+'%':'-'})` : '-'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card financials">
            <div className="card-header"><h4>Financials</h4></div>
            <div className="financial-tabs">
              <div className="fin-column">
                <h5>Income</h5>
                {Object.entries(financials.income_stmt || {}).length === 0 && <div className="lc-table-empty">No data</div>}
                {Object.entries(financials.income_stmt || {}).slice(0,6).map(([p,v])=> (
                  <div key={p} className="fin-row"><div className="fin-period">{p}</div><div className="fin-val">{formatNumber(v)}</div></div>
                ))}
              </div>
              <div className="fin-column">
                <h5>Balance</h5>
                {Object.entries(financials.balance_sheet || {}).slice(0,6).map(([p,v])=> (
                  <div key={p} className="fin-row"><div className="fin-period">{p}</div><div className="fin-val">{formatNumber(v)}</div></div>
                ))}
              </div>
            </div>
          </div>

        </aside>

        <section className="company-chart card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Price (3M)</h3>
            {financials.fetched_at ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{`Updated: ${new Date(financials.fetched_at).toLocaleDateString()}`}</div>
            ) : null}
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
              period={'3mo'}
              interval={'1d'}
              chartMode={'candlestick'}
              height={320}
              showVolume
            />
          )}

          <div className="card news" style={{marginTop:12}}>
            <div className="card-header"><h4>News</h4></div>
            <div className="news-list">
              {news.length === 0 && <div className="lc-table-empty">No news</div>}
              {news.slice(0,6).map((n,i)=> (
                <a className="news-item" key={i} href={n.link || '#'} target="_blank" rel="noreferrer">
                  <div className="news-title">{n.title || n.headline || n.summary}</div>
                  <div className="news-meta">{n.source || n.publisher || ''} · {n.pubDate ? new Date(n.pubDate).toLocaleDateString() : ''}</div>
                </a>
              ))}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
