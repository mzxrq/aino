import React, { useRef, useState } from 'react';
import PortalDropdown from '../PortalDropdown/PortalDropdown';

export default function DropdownSelect({ value, onChange, options = [], className = '', placeholder = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);

  const current = options.find(o => o.value === value) || null;

  return (
    <div className={`dropdown-select ${className}`}>
      <button ref={btnRef} type="button" className="flag-button btn-sm" onClick={() => setOpen(v => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="flag-label">{current ? current.label : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{marginLeft:8}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && btnRef.current && (
        <PortalDropdown anchorRect={btnRef.current.getBoundingClientRect()} align="left" onClose={() => setOpen(false)} className="mode-dropdown indicators-dropdown">
          <div role="listbox" aria-label="Select" tabIndex={0}>
            {options.map(opt => (
              <div key={opt.value} role="option" tabIndex={0} aria-selected={opt.value === value} className={`flag-option ${opt.value === value ? 'active' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value); setOpen(false); } }}>
                <span className="flag-label">{opt.label}</span>
              </div>
            ))}
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
