import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const LABELS = {
  dashboard: 'Dashboard', patients: 'Patients', policies: 'Policies',
  providers: 'Providers', claims: 'Claims', 'fraud-flags': 'Fraud Flags',
  'fraud-rules': 'Fraud Rules', reports: 'Reports', users: 'Users',
  new: 'New', details: 'Details',
};

const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
      <Link to="/dashboard" style={{ color: '#6366f1', textDecoration: 'none' }}>Home</Link>
      {parts.map((part, i) => {
        const path = '/' + parts.slice(0, i + 1).join('/');
        const label = LABELS[part] || (isNaN(part) ? part : `#${part}`);
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={path}>
            <span>›</span>
            {isLast
              ? <span style={{ color: '#374151', fontWeight: 500 }}>{label}</span>
              : <Link to={path} style={{ color: '#6366f1', textDecoration: 'none' }}>{label}</Link>
            }
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
