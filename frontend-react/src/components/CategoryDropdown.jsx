import React from 'react';
import PropTypes from 'prop-types';

export default function CategoryDropdown({ value = 'All', onChange = () => {}, items = ['All'], label = 'Category' }) {
  return (
    <div style={styles.wrapper}>
      <label style={styles.label}>
        {label}:
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.select}
        >
          {items.map((it, idx) => (
            <option key={idx} value={String(it)}>
              {String(it)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

CategoryDropdown.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  items: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
  label: PropTypes.string,
};

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
  },
  label: {
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.92rem',
    fontWeight: 600,
  },
  select: {
    marginLeft: 8,
    padding: '8px 12px',
    borderRadius: 8,
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }
};
