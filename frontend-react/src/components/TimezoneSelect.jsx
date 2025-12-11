import React, { useRef, useState } from 'react';
import PortalDropdown from './PortalDropdown';

export default function TimezoneSelect({ value, onChange, options = [], currentTimezone, formatLabel, displayTime, sortFn, className = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Sort options: apply custom sort function, then put current timezone first
  const sortedOptions = React.useMemo(() => {
    let sorted = options;
    if (sortFn) {
      sorted = sortFn(options);
    }
    // Pin current timezone to the top
    if (!currentTimezone) return sorted;
    const current = sorted.filter(opt => opt === currentTimezone);
    const others = sorted.filter(opt => opt !== currentTimezone);
    return [...current, ...others];
  }, [options, currentTimezone, sortFn]);

  const displayLabel = displayTime || (formatLabel ? formatLabel(value) : value);

  return (
    <div className={`timezone-select ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="timezone-select-button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={displayLabel}
      >
        {displayTime ? (
          <span className="timezone-button-content">
            <svg className="timezone-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/>
              <path d="M2 12h20" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="timezone-time-display">{displayTime}</span>
          </span>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/>
            <path d="M2 12h20" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )}
      </button>

      {open && btnRef.current && (
        <PortalDropdown anchorRect={btnRef.current.getBoundingClientRect()} align="left" onClose={() => setOpen(false)} className="mode-dropdown indicators-dropdown timezone-dropdown">
          <div role="listbox" aria-label="Timezone" tabIndex={0} style={{ maxHeight: '320px', overflowY: 'auto', overflowX: 'hidden' }}>
            {sortedOptions.map((opt, idx) => {
              const label = formatLabel ? formatLabel(opt) : opt;
              const isCurrent = opt === currentTimezone;
              return (
                <React.Fragment key={opt}>
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={opt === value}
                    className={`timezone-option ${opt === value ? 'active' : ''} ${isCurrent ? 'current-tz' : ''}`}
                    onClick={() => { onChange(opt); setOpen(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt); setOpen(false); } }}
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    <span className="timezone-label">{label}</span>
                  </div>
                  {isCurrent && idx === 0 && sortedOptions.length > 1 && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', margin: '4px 0' }}></div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
