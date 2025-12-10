import React, { useRef, useState } from 'react';
import PortalDropdown from './PortalDropdown';

export default function FlagSelect({ value, onChange, options = [], currentTimezone, formatLabel, className = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Sort options: current timezone first, then alphabetically by formatted label
  const sortedOptions = React.useMemo(() => {
    if (!currentTimezone) return options;
    const current = options.filter(opt => opt === currentTimezone);
    const others = options.filter(opt => opt !== currentTimezone);
    return [...current, ...others];
  }, [options, currentTimezone]);

  const displayLabel = formatLabel ? formatLabel(value) : value;

  return (
    <div className={`flag-select ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="flag-button btn-sm"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flag-label" style={{ fontSize: '0.85rem' }}>{displayLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{marginLeft:8}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && btnRef.current && (
        <PortalDropdown anchorRect={btnRef.current.getBoundingClientRect()} align="left" onClose={() => setOpen(false)} className="mode-dropdown indicators-dropdown flag-dropdown timezone-dropdown">
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
                    className={`flag-option ${opt === value ? 'active' : ''} ${isCurrent ? 'current-tz' : ''}`}
                    onClick={() => { onChange(opt); setOpen(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt); setOpen(false); } }}
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    <span className="flag-label">{label}</span>
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
