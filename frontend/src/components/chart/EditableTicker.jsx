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

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: collapsed && !overlay ? 1 : 'none' }}>
      {!editing && !(collapsed && overlay) ? (
        <h3
          style={{ margin: 0, cursor: 'pointer', flex: collapsed && !overlay ? 1 : 'none' }}
          onClick={() => setEditing(true)}
        >{value}</h3>
      ) : editing ? (
        <input
          ref={inputRef}
          style={{ fontSize: collapsed && !overlay ? '0.9rem' : '1.5rem', fontWeight: 700, padding: '4px 6px', flex: collapsed && !overlay ? 1 : 'none' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setEditing(false); setDraft(value); }
          }}
        />
      ) : null}
    </div>
  );
}
