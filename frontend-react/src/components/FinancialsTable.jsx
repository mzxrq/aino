import React, { useMemo } from 'react';

function humanizeLabel(key){
  if (!key) return '';
  // Replace camelCase / PascalCase / underscores with spaces and split on case change
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');
  // Insert spaces before numbers (e.g., SharesNumber -> Shares Number)
  return spaced.replace(/([0-9])/g, ' $1').replace(/\s+/g,' ').trim().replace(/(^|\s)\w/g, c=>c.toUpperCase());
}

function formatNumeric(v){
  if (v === null || v === undefined) return '--';
  // handle NaN and empty
  const n = Number(v);
  if (!isFinite(n)) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n/1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n/1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n/1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n/1e3).toFixed(0)}K`;
  // small numbers: show with up to 2 decimals, but drop trailing zeros
  const fixed = Math.abs(n) < 1 ? n.toFixed(4) : n.toFixed(2);
  return Number(fixed).toString();
}

export default function FinancialsTable({ title, data, compact = false, transpose = false, importantMetrics = [] }){
  const { columns, rows } = useMemo(()=>{
    if (!data || typeof data !== 'object') return { columns: [], rows: [] };
    // Data expected as { metricName: { date1: val, date2: val, ... }, ... }
    const colSet = new Set();
    const metrics = Object.keys(data || {});
    metrics.forEach(m => {
      const inner = data[m] || {};
      if (inner && typeof inner === 'object') Object.keys(inner).forEach(d=>colSet.add(d));
    });
    const cols = Array.from(colSet).sort((a,b)=> b.localeCompare(a)); // newest first
    const rows = metrics.map(m => ({ key: m, label: humanizeLabel(m), values: cols.map(c => {
      const v = (data[m] && (data[m][c] !== undefined ? data[m][c] : (data[m][c] === 0 ? 0 : (data[m][c] || null)))) ;
      return v !== undefined ? v : null;
    }) }));
    return { columns: cols, rows };
  }, [data]);

  if (!rows || rows.length === 0) return <div className="lc-table-empty">No data</div>;
  // Compact mode: show a slim table with only two most recent columns and a curated set of metrics
  if (compact){
    const yearCols = columns.slice(0,2);
    const defaults = ['totalRevenue','netIncome','ebitda','operatingIncome','basicEPS','totalAssets','totalLiab'];
    const want = (importantMetrics && importantMetrics.length) ? importantMetrics : defaults;
    const pickedMetrics = rows.filter(r => want.includes(r.key)).slice(0,6);
    // fallback to first few metrics if none matched
    const finalMetrics = pickedMetrics.length ? pickedMetrics : rows.slice(0,6);
    return (
      <div className="financial-table-wrapper compact">
        {title && <h5 style={{marginBottom:8}}>{title}</h5>}
        <div style={{overflowX:'auto'}}>
          <table className="financials-table compact" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:'8px 12px',minWidth:160}}>Metric</th>
                {yearCols.map(c => <th key={c} style={{textAlign:'right',padding:'8px 12px',whiteSpace:'nowrap'}}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {finalMetrics.map(r => (
                <tr key={r.key} style={{borderTop:'1px solid rgba(0,0,0,0.04)'}}>
                  <td style={{padding:'8px 12px',fontWeight:600,whiteSpace:'nowrap'}}>{r.label}</td>
                  {yearCols.map((c,idx) => {
                    const v = (data[r.key] && (data[r.key][c] !== undefined ? data[r.key][c] : null));
                    return <td key={idx} style={{padding:'8px 12px',textAlign:'right'}}>{v === null || v === undefined || (typeof v === 'number' && isNaN(v)) ? '--' : formatNumeric(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Transpose mode: render dates as rows and metrics as columns (good for overlay where many columns existed)
  if (transpose){
    // metrics are rows currently; create metric keys and labels
    const metrics = rows.map(r => ({ key: r.key, label: r.label }));
    return (
      <div className="financial-table-wrapper transposed">
        {title && <h5 style={{marginBottom:8}}>{title}</h5>}
        <div style={{overflowX:'auto'}}>
          <table className="financials-table transposed" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:'8px 12px',minWidth:140}}>Period</th>
                {metrics.map(m => <th key={m.key} style={{textAlign:'right',padding:'8px 12px'}}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {columns.map(period => (
                <tr key={period} style={{borderTop:'1px solid rgba(0,0,0,0.04)'}}>
                  <td style={{padding:'8px 12px',fontWeight:600}}>{period}</td>
                  {metrics.map(m => {
                    const v = (data[m.key] && (data[m.key][period] !== undefined ? data[m.key][period] : null));
                    return <td key={m.key} style={{padding:'8px 12px',textAlign:'right'}}>{v === null || v === undefined || (typeof v === 'number' && isNaN(v)) ? '--' : formatNumeric(v)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Default full table
  return (
    <div className="financial-table-wrapper">
      {title && <h5 style={{marginBottom:8}}>{title}</h5>}
      <div style={{overflowX:'auto'}}>
        <table className="financials-table" style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:'8px 12px',minWidth:180}}>Metric</th>
              {columns.map(c=> (
                <th key={c} style={{textAlign:'right',padding:'8px 12px',whiteSpace:'nowrap'}}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r=> (
              <tr key={r.key} style={{borderTop:'1px solid rgba(0,0,0,0.04)'}}>
                <td style={{padding:'8px 12px',fontWeight:600,whiteSpace:'nowrap'}}>{r.label}</td>
                {r.values.map((v,idx)=> (
                  <td key={idx} style={{padding:'8px 12px',textAlign:'right'}}>{v === null || v === undefined || (typeof v === 'number' && isNaN(v)) ? '--' : formatNumeric(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
