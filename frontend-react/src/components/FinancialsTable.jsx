import React, { useMemo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

// Financial field name translations (from yfinance API)
const FINANCIAL_FIELD_TRANSLATIONS = {
  'Total Revenue': '総収益',
  'Total Operating Income As Reported': '報告営業利益計',
  'Total Expenses': '総支出',
  'Tax Rate For Calcs': '税率',
  'Tax Provision': '税引当金',
  'Tax Effect Of Unusual Items': '異常項目の税効果',
  'Selling General And Administration': '売上高、一般及び管理費',
  'Research And Development': '研究開発費',
  'Reconciled Depreciation': '調整後減価償却費',
  'Reconciled Cost Of Revenue': '調整後売上原価',
  'Pretax Income': '税引前利益',
  'Other Non Operating Income Expenses': 'その他営業外収益費用',
  'Other Income Expense': 'その他収益費用',
  'Operating Revenue': '営業収益',
  'Operating Income': '営業利益',
  'Operating Expense': '営業費用',
  'Normalized Income': '正規化収入',
  'Normalized EITDA': '正規化EBITDA',
  'Net Non Operating Interest Income Expense': '非営業利息収入費用',
  'Net Interest Income': '利息収入',
  'Net Income Including Noncontrolling Interests': '非支配株式を含む純利益',
  'Net Income From Continuing Operation Net inority Interest': '継続事業からの純利益',
  'Net Income From Continuing And Discontinued Operation': '継続事業及び中止事業からの純利益',
  'Net Income Continuous Operations': '継続事業からの純利益',
  'Net Income Common Stockholders': '普通株主に帰属する純利益',
  'Net Income': '純利益',
  'Interest Income Non Operating': '非営業利息収入',
  'Interest Income': '利息収入',
  'Interest Expense Non Operating': '非営業利息費用',
  'Interest Expense': '利息費用',
  'Gross Profit': '売上総利益',
  'EITDA': 'EBITDA',
  'EIT': 'EBIT',
  'Diluted NI Availto Com Stockholders': '希薄化後普通株主帰属純利益',
  'Diluted EPS': '希薄化後EPS',
  'Diluted Average Shares': '希薄化後平均株数',
  'Cost Of Revenue': '売上原価',
  'asic EPS': '基本EPS',
  'asic Average Shares': '基本平均株数',
  'Working Capital': '運転資本',
  'Treasury Shares Number': '自己株式数',
  'Tradeand Other Payables Non Current': '長期買掛金及び支払債務',
  'Total Tax Payable': '支払税金合計',
  'Total Non Current Liabilities Net inority Interest': '長期負債合計',
  'Total Non Current Assets': '非流動資産合計',
  'Total Liabilities Net inority Interest': '負債合計',
  'Total Equity Gross inority Interest': '株主資本合計',
  'Total Debt': '総債務',
  'Total Capitalization': '総資本',
  'Total Assets': '総資産',
  'Tangible ook Value': '有形資産価値',
  'Stockholders Equity': '株主資本',
  'Share Issued': '発行済株式数',
  'Retained Earnings': '利益剰余金',
  'Receivables': '売掛金',
  'Properties': '有形固定資産',
  'Payables And Accrued Expenses': '支払債務及び未払費用',
  'Payables': '支払債務',
  'Other Short Term Investments': 'その他短期投資',
  'Other Receivables': 'その他売掛金',
  'Other Properties': 'その他有形固定資産',
  'Other Non Current Liabilities': 'その他長期負債',
  'Other Non Current Assets': 'その他非流動資産',
  'Other Investments': 'その他投資',
  'Other Equity Adjustments': 'その他資本調整',
  'Other Current Liabilities': 'その他流動負債',
  'Other Current orrowings': 'その他流動借入',
  'Other Current Assets': 'その他流動資産',
  'Ordinary Shares Number': '普通株式数',
  'Non Current Deferred Taxes Assets': '非流動繰延税資産',
  'Non Current Deferred Assets': '非流動繰延資産',
  'Net Tangible Assets': '正味有形資産',
  'Net PPE': '正味PPE',
  'Net Debt': '正味債務',
  'achinery Furniture Equipment': '機械装置及び家具',
  'Long Term Debt And Capital Lease Obligation': '長期債務及びリース債務',
  'Long Term Debt': '長期債務',
  'Long Term Capital Lease Obligation': '長期リース債務',
  'Leases': 'リース',
  'Land And Improvements': '土地及び改善',
  'Investments And Advances': '投資及び前払金',
  'Investmentin Financial Assets': '金融資産への投資',
  'Invested Capital': '投入資本',
  'Inventory': '棚卸資産',
  'Income Tax Payable': '所得税支払債務',
  'Gross PPE': '総PPE',
  'Gains Losses Not Affecting Retained Earnings': '利益剰余金に影響しない利益損失',
  'Current Liabilities': '流動負債',
  'Current Deferred Revenue': '当期繰延収益',
  'Current Deferred Liabilities': '当期繰延負債',
  'Current Debt And Capital Lease Obligation': '流動債務及びリース債務',
  'Current Debt': '流動債務',
  'Current Capital Lease Obligation': '流動リース債務',
  'Current Assets': '流動資産',
  'Current Accrued Expenses': '当期未払費用',
  'Common Stock Equity': '普通株式資本',
  'Common Stock': '普通株式',
  'Commercial Paper': 'コマーシャルペーパー',
  'Cash Financial': 'キャッシュ',
  'Cash Equivalents': '現金同等物',
  'Cash Cash Equivalents And Short Term Investments': '現金、現金同等物及び短期投資',
  'Cash And Cash Equivalents': '現金及び現金同等物',
  'Capital Stock': '資本金',
  'Capital Lease Obligations': 'リース債務',
  'Available For Sale Securities': '売却可能証券',
  'Accumulated Depreciation': '減価償却累計額',
  'Accounts Receivable': '売掛金',
  'Accounts Payable': '買掛金',
  // Balance sheet aliases
  'alance Sheet': 'バランスシート',
  'alance Sheet (most recent  periods)': 'バランスシート（最近期）',
};

// Title translations mapping
const TITLE_TRANSLATIONS = {
  'Income Statement': 'msgid-income-statement',
  'Balance Sheet': 'msgid-balance-sheet',
};

function getLocalizedFieldName(fieldKey, i18n) {
  if (!fieldKey) return '';
  
  // First, humanize the camelCase/PascalCase key to get readable English label
  const humanized = humanizeLabel(fieldKey);
  
  // Then try to translate the humanized English label using i18n
  if (i18n) {
    const translated = i18n._(humanized);
    // If i18n found a translation (returns different from input), use it
    if (translated && translated !== humanized) {
      return translated;
    }
  }
  
  // Try hardcoded FINANCIAL_FIELD_TRANSLATIONS with the humanized version
  if (FINANCIAL_FIELD_TRANSLATIONS[humanized]) {
    return FINANCIAL_FIELD_TRANSLATIONS[humanized];
  }
  
  // Fall back to humanized English label
  return humanized;
}

function humanizeLabel(key){
  if (!key) return '';
  // Replace camelCase / PascalCase / underscores with spaces and split on case change
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');
  return spaced.replace(/\s+/g,' ').trim().replace(/(^|\s)\w/g, c=>c.toUpperCase());
}

function formatPeriodLabel(p){
  if (!p) return '';
  const s = String(p).trim();
  
  // Try to extract YYYY from various formats
  // Dash-separated: "2025-09-30" or "2025-09-30T00:00:00Z" or "2025-09-30 00:00:00"
  const dashMatch = s.match(/^(\d{4})-(\d{2})/);
  if (dashMatch) return dashMatch[1];
  
  // Space-separated: "2025 09 30 00:00:00"
  const spaceMatch = s.match(/^(\d{4})\s+(\d{2})/);
  if (spaceMatch) return spaceMatch[1];
  
  // Slash-separated: "2025/09/30"
  const slashMatch = s.match(/^(\d{4})\/(\d{2})/);
  if (slashMatch) return slashMatch[1];
  
  // Compact numeric: "202509" or "20250930"
  const compactMatch = s.match(/^(\d{4})(\d{2})/);
  if (compactMatch) return compactMatch[1];
  
  // Fallback: try Date parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())){
    return String(d.getFullYear());
  }
  
  // Last resort: return as-is
  return s;
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
  const { i18n } = useLingui();
  
  // Localize title
  const localizedTitle = title ? i18n._(title) : '';
  
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
    const rows = metrics.map(m => ({ key: m, label: getLocalizedFieldName(m, i18n), values: cols.map(c => {
      const v = (data[m] && (data[m][c] !== undefined ? data[m][c] : (data[m][c] === 0 ? 0 : (data[m][c] || null)))) ;
      return v !== undefined ? v : null;
    }) }));
    return { columns: cols, rows };
  }, [data, i18n]);

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
        {localizedTitle && <h5 style={{marginBottom:8}}>{localizedTitle}</h5>}
        <div style={{overflowX:'auto'}}>
          <table className="financials-table compact" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:'8px 12px',minWidth:160}}></th>
                {yearCols.map(c => <th key={c} style={{textAlign:'right',padding:'8px 12px',whiteSpace:'nowrap'}}>{formatPeriodLabel(c)}</th>)}
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
        {localizedTitle && <h5 style={{marginBottom:8}}>{localizedTitle}</h5>}
        <div style={{overflowX:'auto'}}>
          <table className="financials-table transposed" style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:'8px 12px',minWidth:140}}><Trans>Period</Trans></th>
                {metrics.map(m => <th key={m.key} style={{textAlign:'right',padding:'8px 12px'}}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {columns.map(period => (
                <tr key={period} style={{borderTop:'1px solid rgba(0,0,0,0.04)'}}>
                  <td style={{padding:'8px 12px',fontWeight:600}}>{formatPeriodLabel(period)}</td>
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
      {localizedTitle && <h5 style={{marginBottom:8}}>{localizedTitle}</h5>}
      <div style={{overflowX:'auto'}}>
        <table className="financials-table" style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:'8px 12px',minWidth:180}}><Trans>Metric</Trans></th>
              {columns.map(c=> (
                <th key={c} style={{textAlign:'right',padding:'8px 12px',whiteSpace:'nowrap'}}>{formatPeriodLabel(c)}</th>
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

// String extraction helper (hidden component for translation extraction)
const _StringExtractor = () => (
  <>
    <Trans>Income Statement</Trans>
    <Trans>Balance Sheet</Trans>
    <Trans>Metric</Trans>
    <Trans>Period</Trans>
    {/* Financial field names for extraction */}
    <Trans>Total Revenue</Trans>
    <Trans>Total Operating Income As Reported</Trans>
    <Trans>Total Expenses</Trans>
    <Trans>Tax Rate For Calcs</Trans>
    <Trans>Tax Provision</Trans>
    <Trans>Tax Effect Of Unusual Items</Trans>
    <Trans>Selling General And Administration</Trans>
    <Trans>Research And Development</Trans>
    <Trans>Reconciled Depreciation</Trans>
    <Trans>Reconciled Cost Of Revenue</Trans>
    <Trans>Pretax Income</Trans>
    <Trans>Other Non Operating Income Expenses</Trans>
    <Trans>Other Income Expense</Trans>
    <Trans>Operating Revenue</Trans>
    <Trans>Operating Income</Trans>
    <Trans>Operating Expense</Trans>
    <Trans>Normalized Income</Trans>
    <Trans>Normalized EITDA</Trans>
    <Trans>Net Non Operating Interest Income Expense</Trans>
    <Trans>Net Interest Income</Trans>
    <Trans>Net Income Including Noncontrolling Interests</Trans>
    <Trans>Net Income From Continuing Operation Net inority Interest</Trans>
    <Trans>Net Income From Continuing And Discontinued Operation</Trans>
    <Trans>Net Income Continuous Operations</Trans>
    <Trans>Net Income Common Stockholders</Trans>
    <Trans>Net Income</Trans>
    <Trans>Interest Income Non Operating</Trans>
    <Trans>Interest Income</Trans>
    <Trans>Interest Expense Non Operating</Trans>
    <Trans>Interest Expense</Trans>
    <Trans>Gross Profit</Trans>
    <Trans>EITDA</Trans>
    <Trans>EIT</Trans>
    <Trans>Diluted NI Availto Com Stockholders</Trans>
    <Trans>Diluted EPS</Trans>
    <Trans>Diluted Average Shares</Trans>
    <Trans>Cost Of Revenue</Trans>
    <Trans>asic EPS</Trans>
    <Trans>asic Average Shares</Trans>
    <Trans>Working Capital</Trans>
    <Trans>Treasury Shares Number</Trans>
    <Trans>Tradeand Other Payables Non Current</Trans>
    <Trans>Total Tax Payable</Trans>
    <Trans>Total Non Current Liabilities Net inority Interest</Trans>
    <Trans>Total Non Current Assets</Trans>
    <Trans>Total Liabilities Net inority Interest</Trans>
    <Trans>Total Equity Gross inority Interest</Trans>
    <Trans>Total Debt</Trans>
    <Trans>Total Capitalization</Trans>
    <Trans>Total Assets</Trans>
    <Trans>Tangible ook Value</Trans>
    <Trans>Stockholders Equity</Trans>
    <Trans>Share Issued</Trans>
    <Trans>Retained Earnings</Trans>
    <Trans>Receivables</Trans>
    <Trans>Properties</Trans>
    <Trans>Payables And Accrued Expenses</Trans>
    <Trans>Payables</Trans>
    <Trans>Other Short Term Investments</Trans>
    <Trans>Other Receivables</Trans>
    <Trans>Other Properties</Trans>
    <Trans>Other Non Current Liabilities</Trans>
    <Trans>Other Non Current Assets</Trans>
    <Trans>Other Investments</Trans>
    <Trans>Other Equity Adjustments</Trans>
    <Trans>Other Current Liabilities</Trans>
    <Trans>Other Current orrowings</Trans>
    <Trans>Other Current Assets</Trans>
    <Trans>Ordinary Shares Number</Trans>
    <Trans>Non Current Deferred Taxes Assets</Trans>
    <Trans>Non Current Deferred Assets</Trans>
    <Trans>Net Tangible Assets</Trans>
    <Trans>Net PPE</Trans>
    <Trans>Net Debt</Trans>
    <Trans>achinery Furniture Equipment</Trans>
    <Trans>Long Term Debt And Capital Lease Obligation</Trans>
    <Trans>Long Term Debt</Trans>
    <Trans>Long Term Capital Lease Obligation</Trans>
    <Trans>Leases</Trans>
    <Trans>Land And Improvements</Trans>
    <Trans>Investments And Advances</Trans>
    <Trans>Investmentin Financial Assets</Trans>
    <Trans>Invested Capital</Trans>
    <Trans>Inventory</Trans>
    <Trans>Income Tax Payable</Trans>
    <Trans>Gross PPE</Trans>
    <Trans>Gains Losses Not Affecting Retained Earnings</Trans>
    <Trans>Current Liabilities</Trans>
    <Trans>Current Deferred Revenue</Trans>
    <Trans>Current Deferred Liabilities</Trans>
    <Trans>Current Debt And Capital Lease Obligation</Trans>
    <Trans>Current Debt</Trans>
    <Trans>Current Capital Lease Obligation</Trans>
    <Trans>Current Assets</Trans>
    <Trans>Current Accrued Expenses</Trans>
    <Trans>Common Stock Equity</Trans>
    <Trans>Common Stock</Trans>
    <Trans>Commercial Paper</Trans>
    <Trans>Cash Financial</Trans>
    <Trans>Cash Equivalents</Trans>
    <Trans>Cash Cash Equivalents And Short Term Investments</Trans>
    <Trans>Cash And Cash Equivalents</Trans>
    <Trans>Capital Stock</Trans>
    <Trans>Capital Lease Obligations</Trans>
    <Trans>Available For Sale Securities</Trans>
    <Trans>Accumulated Depreciation</Trans>
    <Trans>Accounts Receivable</Trans>
    <Trans>Accounts Payable</Trans>
  </>
);

// Export string extractor for translation extraction
export { _StringExtractor };
