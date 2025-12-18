import React, { useRef, useState, useEffect } from 'react';
import PortalDropdown from './PortalDropdown';

export default function DropdownSelect({ value, onChange, options = [], className = '', placeholder = '', searchable = false, searchPlaceholder = 'Search...' }) {
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const current = options.find(o => o.value === value) || null;

  const filtered = q ? options.filter(o => (o.label || '').toLowerCase().includes(q.toLowerCase())) : options;

  useEffect(() => {
    if (open && searchable && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) setQ('');
  }, [open, searchable]);

  return (
    <div className={`dropdown-select ${className}`}>
      <button ref={btnRef} type="button" className={`flag-button btn-sm ${current ? 'has-value' : ''}`} onClick={() => setOpen(v => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="flag-label">{current ? current.label : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{marginLeft:8}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && btnRef.current && (
        <PortalDropdown anchorRect={btnRef.current.getBoundingClientRect()} align="left" onClose={() => setOpen(false)} className="mode-dropdown indicators-dropdown">
          <div role="listbox" aria-label="Select" tabIndex={0}>
            {searchable && (
              <div style={{ padding: '8px' }}>
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="dropdown-search-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setOpen(false);
                    }
                  }}
                />
              </div>
            )}
            {filtered.map(opt => (
              <div key={opt.value} role="option" tabIndex={0} aria-selected={opt.value === value} className={`flag-option ${opt.value === value ? 'active' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value); setOpen(false); } }}>
                <span className="flag-text">{opt.label}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="flag-empty" style={{ padding: '8px 12px', color: '#666' }}>No results</div>
            )}
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
