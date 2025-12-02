import React, { useEffect, useRef, useState } from 'react';

export function EditableTicker({ value, onChange, collapsed, overlay }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    const newT = (draft || '').trim().toUpperCase();
    setEditing(false);
    if (newT && newT !== value) {
      onChange(newT);
    } else {
      setDraft(value);
    }
  }

  if (collapsed && overlay) return null;

  return (
    <div className="editable-ticker-wrapper">
      <input
        ref={inputRef}
        className="editable-ticker-input"
        value={editing ? draft : value}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setEditing(false); setDraft(value); inputRef.current?.blur(); }
        }}
      />
      <svg className="editable-ticker-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
