import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDisplayFromRaw } from '../utils/tickerUtils';
import PortalDropdown from './DropdownSelect/PortalDropdown';

/**
 * ChartCardButtons: Styled button group with SVG icons and smooth animations
 * Includes Follow/Unfollow toggle, Expanded view, and chart mode selector
 */
export default function ChartCardButtons({
  ticker,
  followed,
  onFollowToggle,
  onExpandView,
  chartMode = 'lines',
  onModeChange,
  globalChartMode = 'auto',
  isLoadingFollow = false
}) {
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const modeBtnRef = React.useRef(null);
  const [followHoverLocal, setFollowHoverLocal] = useState(false);

  const isOverridden = globalChartMode !== 'auto';
  const display = getDisplayFromRaw(ticker);

  return (
    <div className="chart-card-buttons">
      {/* Follow Button */}
      <button
        className={`chart-btn chart-btn-follow ${followed ? 'followed' : ''} ${isLoadingFollow ? 'loading' : ''}`}
        onClick={onFollowToggle}
        disabled={isLoadingFollow}
        title={followed ? (followHoverLocal ? 'Unfollow' : 'Following') : 'Follow'}
        aria-label={followed ? (followHoverLocal ? 'Unfollow' : 'Following') : 'Follow'}
        onMouseEnter={() => setFollowHoverLocal(true)}
        onMouseLeave={() => setFollowHoverLocal(false)}
      >
        <span className="icon-stack" aria-hidden>
          <svg className="icon-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg className="icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg className="icon-minus" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        {/* Text label shown next to icon - shows Following by default, Unfollow on hover */}
        <span className="chart-btn-label">{isLoadingFollow ? '...' : (followed ? (followHoverLocal ? 'Unfollow' : 'Following') : 'Follow')}</span>
      </button>

      {/* Expanded View Button */}
      <button
        className="chart-btn chart-btn-expand"
        onClick={onExpandView}
        title="View detailed analysis"
        aria-label="View detailed analysis"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Company Page Button */}
      <Link to={`/company/${ticker}`} className="chart-btn chart-btn-company" title="Open company profile" aria-label="Open company profile">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 21h18v-8H3v8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 21V10a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Link>

      {/* Chart Mode Button */}
      <div className="chart-btn-group">
        <button
          ref={modeBtnRef}
          className={`chart-btn chart-btn-mode ${chartMode === 'lines' ? 'mode-lines' : 'mode-candle'} ${isOverridden ? 'overridden' : ''}`}
          onClick={() => !isOverridden && setModeDropdownOpen(v => !v)}
          disabled={isOverridden}
          title={isOverridden ? `Overridden by toolbar (${globalChartMode})` : `Switch to ${chartMode === 'lines' ? 'Candlestick' : 'Line'} mode`}
          aria-label={isOverridden ? `Overridden by toolbar (${globalChartMode})` : `Switch to ${chartMode === 'lines' ? 'Candlestick' : 'Line'} mode`}
          aria-haspopup="true"
          aria-expanded={modeDropdownOpen}
        >
          {chartMode === 'lines' ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="3,15 9,9 13,12 21,6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="3" cy="15" r="1.2" fill="currentColor" />
                <circle cx="9" cy="9" r="1.2" fill="currentColor" />
                <circle cx="13" cy="12" r="1.2" fill="currentColor" />
                <circle cx="21" cy="6" r="1.2" fill="currentColor" />
              </svg>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="6" width="3" height="10" stroke="currentColor" fill="currentColor" opacity="0.6" rx="0.5" />
                <line x1="6.5" y1="4" x2="6.5" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6.5" y1="16" x2="6.5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                
                <rect x="13" y="8" width="3" height="8" stroke="currentColor" fill="currentColor" opacity="0.6" rx="0.5" />
                <line x1="14.5" y1="6" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14.5" y1="16" x2="14.5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </>
          )}
        </button>

        {modeDropdownOpen && !isOverridden && modeBtnRef.current && (
          <PortalDropdown
            anchorRect={modeBtnRef.current.getBoundingClientRect()}
            align="right"
            onClose={() => setModeDropdownOpen(false)}
            className="mode-dropdown-chart"
          >
            <div role="listbox" tabIndex={0} aria-label={`${display} chart mode`}>
              <div
                className={`mode-item ${chartMode === 'lines' ? 'active' : ''}`}
                role="option"
                tabIndex={0}
                aria-selected={chartMode === 'lines'}
                onClick={() => {
                  onModeChange('lines');
                  setModeDropdownOpen(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8 }}>
                  <polyline points="3,15 9,9 13,12 21,6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="3" cy="15" r="1.2" fill="currentColor" />
                  <circle cx="9" cy="9" r="1.2" fill="currentColor" />
                  <circle cx="13" cy="12" r="1.2" fill="currentColor" />
                  <circle cx="21" cy="6" r="1.2" fill="currentColor" />
                </svg>
                Line Mode
              </div>
              <div
                className={`mode-item ${chartMode === 'candlestick' ? 'active' : ''}`}
                role="option"
                tabIndex={0}
                aria-selected={chartMode === 'candlestick'}
                onClick={() => {
                  onModeChange('candlestick');
                  setModeDropdownOpen(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8 }}>
                  <rect x="5" y="6" width="3" height="10" stroke="currentColor" fill="currentColor" opacity="0.6" rx="0.5" />
                  <line x1="6.5" y1="4" x2="6.5" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="6.5" y1="16" x2="6.5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <rect x="13" y="8" width="3" height="8" stroke="currentColor" fill="currentColor" opacity="0.6" rx="0.5" />
                  <line x1="14.5" y1="6" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="14.5" y1="16" x2="14.5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Candlestick Mode
              </div>
            </div>
          </PortalDropdown>
        )}
      </div>
    </div>
  );
}
