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
    marginBottom: 10,
  },
  label: {
    color: '#00FFBB',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  select: {
    marginLeft: 8,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(0,255,200,0.12)'
  }
};
