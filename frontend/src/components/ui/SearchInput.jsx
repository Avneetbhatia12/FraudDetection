import React from 'react';

const SearchInput = ({ value, onChange, placeholder = 'Search...', style }) => (
  <div style={{ position: 'relative', ...style }}>
    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '1rem' }}>🔍</span>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem',
        border: '1px solid #d1d5db', borderRadius: '0.5rem',
        fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
        background: '#fff',
      }}
    />
  </div>
);

export default SearchInput;
