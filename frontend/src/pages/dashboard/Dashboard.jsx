import React from 'react';
import PageLayout from '../../components/layout/PageLayout';
import StatsCard from '../../components/dashboard/StatsCard';
import RecentClaimsTable from '../../components/dashboard/RecentClaimsTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { getDashboardStats } from '../../services/fraudService';
import { formatCurrency } from '../../utils/formatters';
import useFetch from '../../hooks/useFetch';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { data, loading } = useFetch(getDashboardStats);
  const navigate = useNavigate();
  const d = data?.data;

  return (
    <PageLayout title="Dashboard">
      {loading ? <LoadingSpinner /> : !d ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <StatsCard title="Total Claims"    value={d.total_claims}    icon="📄" color="#6366f1" bg="#eef2ff" subtitle={formatCurrency(d.total_amount)} />
            <StatsCard title="Total Patients"  value={d.total_patients}  icon="👤" color="#0ea5e9" bg="#e0f2fe" />
            <StatsCard title="Providers"       value={d.total_providers} icon="🏥" color="#10b981" bg="#d1fae5" />
            <StatsCard title="Approved"        value={d.approved}        icon="✅" color="#16a34a" bg="#dcfce7" />
            <StatsCard title="Under Review"    value={d.under_review}    icon="🔍" color="#7c3aed" bg="#ede9fe" />
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <RecentClaimsTable claims={d.recent_claims} />

            {/* Top Flagged Providers */}
            <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Top Flagged Providers</h3>
                <button onClick={() => navigate('/providers')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>View all →</button>
              </div>
              {d.top_flagged_providers?.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No flagged providers</p>
              ) : (
                d.top_flagged_providers?.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>{p.PROVIDER_NAME}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.PROVIDER_TYPE} · {p.claim_count} claims</div>
                    </div>
                    <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                      🚨 {p.flag_count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default Dashboard;
