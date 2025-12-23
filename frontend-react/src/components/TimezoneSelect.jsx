import React, { useRef, useState, useEffect, useMemo } from 'react';
import PortalDropdown from './DropdownSelect/PortalDropdown';

export default function TimezoneSelect({ value, onChange, options = [], currentTimezone, formatLabel, displayTime, sortFn, className = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);

  useEffect(() => {
    if (open && btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    function onResize() {
      if (open && btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
    };
  }, [open]);

  const sortedOptions = useMemo(() => {
    const src = Array.isArray(options) ? options.slice() : [];
    let sorted = src;
    if (sortFn) sorted = sortFn(sorted);
    if (!currentTimezone) return sorted;
    const current = sorted.filter(opt => opt === currentTimezone);
    const others = sorted.filter(opt => opt !== currentTimezone);
    return [...current, ...others];
  }, [options, currentTimezone, sortFn]);

  const displayLabel = displayTime || (formatLabel ? formatLabel(value) : value || 'Timezone');

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

      {open && anchorRect && (
        <PortalDropdown anchorRect={anchorRect} align="right" offsetY={8} onClose={() => setOpen(false)} className="timezone-portal-dropdown">
          <ul className="timezone-options" role="listbox" aria-activedescendant={value}>
            {sortedOptions.map(opt => (
              <li
                key={opt}
                id={opt}
                role="option"
                aria-selected={opt === value}
                className={`timezone-option ${opt === value ? 'selected' : ''}`}
                onClick={() => { onChange && onChange(opt); setOpen(false); }}
              >
                {formatLabel ? formatLabel(opt) : opt}
              </li>
            ))}
          </ul>
        </PortalDropdown>
      )}
    </div>
  );
}
