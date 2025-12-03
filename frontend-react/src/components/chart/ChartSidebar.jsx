import React from 'react';
import { EditableTicker } from './EditableTicker';

export function ChartSidebar({
  sidebarData,
  collapsed,
  overlay,
  dockSide = 'left',
  setCollapsed,
  setSidebarOverlay,
  onTickerChange,
  stripSuffix,
  footerExtra,
  livePrice,
  prevClose,
  marketInfo
}) {
  return (
    <>
      {/* Floating hamburger menu when collapsed */}
      {collapsed && (
        <button className="sidebar-fab" onClick={() => setCollapsed(false)} aria-label="Open sidebar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" fill="currentColor"/>
          </svg>
        </button>
      )}
      
      <aside className={`chart-sidebar ${collapsed ? 'collapsed' : ''} ${overlay ? 'overlay' : ''} ${overlay && dockSide === 'right' ? 'right' : ''}`}>
        <div className="sidebar-header">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width: collapsed && overlay ? '100%' : (collapsed ? '100%' : 'auto')}}>
            <EditableTicker
              value={sidebarData ? stripSuffix(sidebarData.displayTicker) : ''}
              onChange={onTickerChange}
              collapsed={collapsed}
              overlay={overlay}
            />
            {typeof setSidebarOverlay === 'function' && !collapsed && (
              <button className="overlay-toggle-btn" onClick={() => setSidebarOverlay(s => !s)} title={overlay ? 'Disable overlay' : 'Enable overlay'} aria-label="Toggle sidebar overlay">
                {overlay ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12h18M12 3v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M7 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                )}
              </button>
            )}
            {!collapsed && (
              <button className="collapse-btn small" onClick={() => setCollapsed(true)} aria-label="Close sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)" />
                </svg>
              </button>
            )}
          </div>
          {sidebarData && !collapsed && <p className="company-name"><strong>{sidebarData.companyName}</strong></p>}
          {sidebarData && !collapsed && <p className="market-name"><strong>Market:</strong> {sidebarData.market}</p>}
        </div>
      {!collapsed && (
        <div className="live-price-section">
          <div className="live-line">
            <span className="live-label">Current Price</span>
          </div>
          <div className="live-value-line">
            <strong className="live-value">{(typeof window !== 'undefined' && window.__formatPrice) ? window.__formatPrice(livePrice ?? sidebarData?.close) : (livePrice?.toFixed?.(2) ?? (sidebarData?.close?.toFixed?.(2) ?? '—'))}</strong>
          </div>
          <div className="change-line">
            {(() => {
              const last = livePrice ?? sidebarData?.close ?? null;
              const prev = prevClose ?? null;
              if (last == null || prev == null) return <span className="price-change neutral">—</span>;
              const diff = last - prev;
              const pct = prev ? (diff / prev) * 100 : 0;
              const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
              const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
              return <span className={`price-change ${cls}`}>{sign}{Math.abs(diff).toFixed(2)} ({Math.abs(pct).toFixed(2)}%)</span>;
            })()}
          </div>
          <div className="market-hours">
            <span className={`status-dot ${marketInfo?.isOpen ? 'open' : 'closed'}`}>{marketInfo?.isOpen ? 'Open' : 'Closed'}</span>
            <div className="hours-tooltip">
              <button className="help-dot" aria-label="Market hours info">?</button>
              <div className="tooltip-card" role="tooltip">
                <div><strong>{marketInfo?.label || 'Market'} Hours</strong></div>
                <div>{marketInfo?.openLocal} – {marketInfo?.closeLocal} (your local time)</div>
                <div style={{fontSize:'12px',color:'var(--muted)'}}>Times may vary on holidays.</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {!collapsed && (
      <div className="historical-data">
        <h4>Historical Data</h4>
        <div className="hist-grid">
          <div className="hist-card"><strong>Balance Sheet</strong><div className="hist-placeholder"></div></div>
          <div className="hist-card"><strong>Income Statement</strong><div className="hist-placeholder"></div></div>
          <div className="hist-card"><strong>Price Change</strong><div className="hist-placeholder"></div></div>
        </div>
      </div>
      )}
      {!collapsed && (
      <div className="top-news">
        <h4>Top News</h4>
        <div className="news-placeholder">No news loaded. Add API integration here.</div>
      </div>
      )}
      {footerExtra && <div className="sidebar-footer fixed-bottom">{footerExtra}</div>}
    </aside>
    </>
  );
}