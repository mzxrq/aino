import React, { useRef, useState } from 'react';
import PortalDropdown from './PortalDropdown';
// Use flag-icons package for consistent SVG flags
import 'flag-icons/css/flag-icons.min.css';

// Map timezone keys to 2-letter country codes used by flag-icons
function tzToCountryCode(key) {
  switch (key) {
    case 'America/New_York': return 'us';
    case 'Europe/London': return 'gb';
    case 'Europe/Paris': return 'fr';
    case 'Asia/Tokyo': return 'jp';
    case 'Asia/Bangkok': return 'th';
    case 'UTC': return 'gb';
    default: return 'gb';
  }
}

export default function FlagSelect({ value, onChange, options = [], className = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);

  const currentLabel = value || (options[0] || '');
  const country = tzToCountryCode(currentLabel);

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
        <span className={`fi fi-${country}`} aria-hidden style={{ marginRight: 8 }} />
        <span className="flag-label">{currentLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{marginLeft:8}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && btnRef.current && (
        <PortalDropdown anchorRect={btnRef.current.getBoundingClientRect()} align="left" onClose={() => setOpen(false)} className="mode-dropdown indicators-dropdown flag-dropdown">
          <div role="listbox" aria-label="Timezone" tabIndex={0}>
            {options.map(opt => (
              <div
                key={opt}
                role="option"
                tabIndex={0}
                aria-selected={opt === value}
                className={`flag-option ${opt === value ? 'active' : ''}`}
                onClick={() => { onChange(opt); setOpen(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt); setOpen(false); } }}
              >
                <span className={`fi fi-${tzToCountryCode(opt)}`} aria-hidden style={{ marginRight: 8 }} />
                <span className="flag-label">{opt}</span>
              </div>
            ))}
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
