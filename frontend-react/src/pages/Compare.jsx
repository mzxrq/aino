import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EchartsCard from '../components/EchartsCard';
import '../css/Compare.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
const PY_API = `${API_URL}/py`;

async function fetchJsonWithFallback(path){
  const primary = `${PY_DIRECT}/py${path}`;
  const fallback = `${PY_API}${path}`;
  try{ const r = await fetch(primary); if (r.ok) return await r.json(); }catch(e){}
  const r2 = await fetch(fallback); if (!r2.ok) return null; return await r2.json();
}

function useTickerListFromQuery(){
  const [searchParams, setSearchParams] = useSearchParams();
  const list = (searchParams.get('tickers') || '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,4);
  return [list, (arr)=> setSearchParams({ tickers: arr.join(',') })];
}

export default function Compare(){
  const [tickers, setTickersParam] = useTickerListFromQuery();
  const [input, setInput] = useState('');
  const [items, setItems] = useState([]);
  const [loadingMap, setLoadingMap] = useState({});

  useEffect(()=>{
    let active = true;
    async function load(){
      const loaders = {};
      const results = await Promise.all(tickers.map(async t=>{
        loaders[t] = true;
        try{
          const meta = await fetchJsonWithFallback(`/chart/ticker?query=${encodeURIComponent(t)}`);
          const chosen = Array.isArray(meta) ? (meta.find(x=>x.ticker===t) || meta[0] || {}) : (meta || {});
          const fin = await fetchJsonWithFallback(`/financials?ticker=${encodeURIComponent(t)}`);
          return { ticker: t, meta: chosen, financials: fin || {} };
        }catch(e){ return { ticker: t, error: String(e) }; }
      }));
      if (!active) return;
      const map = {};
      results.forEach(r=>{ map[r.ticker] = r; });
      setItems(results);
      setLoadingMap(map);
    }
    if (tickers && tickers.length) load(); else setItems([]);
    return ()=>{ active = false; };
  }, [tickers]);

  function addTicker(){
    const t = (input||'').trim().toUpperCase();
    if (!t) return;
    const next = Array.from(new Set([t,...tickers])).slice(0,4);
    setTickersParam(next);
    setInput('');
  }
  function removeTicker(t){ const next = tickers.filter(x=>x!==t); setTickersParam(next); }

  return (
    <div className="compare-shell">
      <div className="compare-header">
        <h2>Compare (up to 4)</h2>
        <div className="compare-controls">
          <input placeholder="Add ticker (e.g. AAPL)" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=> e.key==='Enter' && addTicker()} />
          <button onClick={addTicker} className="btn">Add</button>
          <Link to="/" className="btn-outline">Back</Link>
        </div>
      </div>

      <div className="ticker-chips">
        {tickers.map(t=> (
          <div key={t} className="chip">
            <span>{t}</span>
            <button onClick={()=>removeTicker(t)} aria-label={`Remove ${t}`}>✕</button>
          </div>
        ))}
      </div>

      <div className="compare-grid">
        {tickers.length === 0 && <div className="muted">Add tickers to start comparing.</div>}
        {tickers.map((t, i)=>{
          const row = items.find(x=>x.ticker===t) || {};
          const meta = row.meta || {};
          const fin = row.financials || {};
          const chart = (fin && fin.chart) || null;
          const close = (chart && chart.close) || [];
          const latest = close.length ? close[close.length-1] : null;
          return (
            <div key={t} className="compare-col card">
              <div className="col-head">
                <div className="col-title">{meta.companyName || t}</div>
                <div className="col-sub">{meta?.yfinance?.industry || meta.industry || ''}</div>
              </div>
              <div className="col-price">{latest != null ? (meta?.yfinance?.currency ? new Intl.NumberFormat(undefined,{style:'currency',currency:meta.yfinance.currency}).format(latest) : String(latest)) : '-'}</div>
              <div className="col-marketcap">Market Cap: {meta?.yfinance?.marketCap ? formatNumber(meta.yfinance.marketCap) : '-'}</div>

              <div className="col-chart">
                {close && close.length ? (
                  <EchartsCard ticker={t} dates={chart?.dates||[]} open={chart?.open||[]} high={chart?.high||[]} low={chart?.low||[]} close={chart?.close||[]} volume={chart?.volume||[]} height={120} chartMode={'line'} showVolume={false} />
                ) : <div className="muted small">no chart</div>}
              </div>

              <div className="col-financials">
                <h5>Key</h5>
                <div>Employees: {meta?.yfinance?.employees ? formatNumber(meta.yfinance.employees) : '-'}</div>
                <div>Currency: {meta?.yfinance?.currency || '-'}</div>
                <div>Fetched: {fin?.fetched_at ? new Date(fin.fetched_at).toLocaleDateString() : '-'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatNumber(v){ if (v==null) return '-'; const n=Number(v); if (Number.isNaN(n)) return String(v); if (Math.abs(n)>=1e12) return (n/1e12).toFixed(2)+'T'; if (Math.abs(n)>=1e9) return (n/1e9).toFixed(2)+'B'; if (Math.abs(n)>=1e6) return (n/1e6).toFixed(2)+'M'; return n.toLocaleString(); }
