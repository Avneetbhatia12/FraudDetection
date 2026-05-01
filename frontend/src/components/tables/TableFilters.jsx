import React from 'react';
import SearchInput from '../ui/SearchInput';

const TableFilters = ({ search, onSearch, filters = [], children }) => (
  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
    {onSearch && (
      <SearchInput value={search} onChange={onSearch} style={{ minWidth: '220px', flex: 1 }} />
    )}
    {filters.map((f, i) => (
      <select key={i} value={f.value} onChange={e => f.onChange(e.target.value)}
        style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: '#fff', color: '#374151' }}>
        <option value="">{f.placeholder || 'All'}</option>
        {f.options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ))}
    {children}
  </div>
);

export default TableFilters;
