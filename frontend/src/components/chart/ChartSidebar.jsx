import React from 'react';
import { EditableTicker } from './EditableTicker';

export function ChartSidebar({
  sidebarData,
  collapsed,
  overlay,
  setCollapsed,
  onTickerChange,
  stripSuffix,
  footerExtra
}) {
  return (
    <>
      {/* Floating hamburger menu when collapsed */}
      {collapsed && (
        <button className="collapse-btn" onClick={() => setCollapsed(false)} aria-label="Open sidebar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" fill="currentColor"/>
          </svg>
        </button>
      )}
      
      <aside className={`chart-sidebar ${collapsed ? 'collapsed' : ''} ${overlay ? 'overlay' : ''}`}>
        <div className="sidebar-header">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width: collapsed && overlay ? '100%' : (collapsed ? '100%' : 'auto')}}>
            <EditableTicker
              value={sidebarData ? stripSuffix(sidebarData.displayTicker) : ''}
              onChange={onTickerChange}
              collapsed={collapsed}
              overlay={overlay}
            />
            {!collapsed && (
              <button className="collapse-btn" onClick={() => setCollapsed(true)} aria-label="Close sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)" />
                </svg>
              </button>
            )}
          </div>
          {sidebarData && !collapsed && <p className="company-name"><strong>{sidebarData.companyName}</strong></p>}
          {sidebarData && !collapsed && <p className="market-name"><strong>Market:</strong> {sidebarData.market}</p>}
        </div>
      <div className="sidebar-data">
        {sidebarData ? (
          <>
            {!collapsed && (
              <>
                <div><span>Open</span><strong>{sidebarData.open?.toFixed?.(2)}</strong></div>
                <div><span>High</span><strong>{sidebarData.high?.toFixed?.(2)}</strong></div>
                <div><span>Low</span><strong>{sidebarData.low?.toFixed?.(2)}</strong></div>
                <div><span>Close</span><strong>{sidebarData.close?.toFixed?.(2)}</strong></div>
                <div><span>Volume</span><strong>{sidebarData.volume !== 'N/A' ? (sidebarData.volume ? new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(sidebarData.volume) : 'N/A') : 'N/A'}</strong></div>
              </>
            )}
            {collapsed && <div style={{height:'64px'}} aria-hidden></div>}
          </>
        ) : <p>Loading data...</p>}
      </div>
      <div className="historical-data">
        <h4>Historical Data</h4>
        <div className="hist-grid">
          <div className="hist-card"><strong>Balance Sheet</strong><div className="hist-placeholder"></div></div>
          <div className="hist-card"><strong>Income Statement</strong><div className="hist-placeholder"></div></div>
          <div className="hist-card"><strong>Price Change</strong><div className="hist-placeholder"></div></div>
        </div>
      </div>
      <div className="top-news">
        <h4>Top News</h4>
        <div className="news-placeholder">No news loaded. Add API integration here.</div>
      </div>
      {footerExtra && <div className="sidebar-footer">{footerExtra}</div>}
    </aside>
    </>
  );
}
