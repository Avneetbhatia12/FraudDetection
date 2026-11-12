import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import ProviderRiskPanel from '../../components/ai/ProviderRiskPanel';
import { COLORS, Card } from '../../components/ai/AiUi';
import { getProviders } from '../../services/claimService';
import useFetch from '../../hooks/useFetch';

const ProviderRiskPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const providerId = Number(id);
  const { data } = useFetch(() => getProviders({ limit: 500 }), []);
  const providers = data?.data || [];
  const current = providers.find((p) => p.PROVIDER_ID === providerId);

  return (
    <PageLayout title="AI Provider Risk Profile">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: COLORS.text }}>{current ? current.PROVIDER_NAME : `Provider #${id}`}</h2>
              {current && <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: COLORS.muted }}>{current.PROVIDER_TYPE} · {current.total_claims} claims</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.8rem', color: COLORS.muted }}>Provider{' '}
                <select value={providerId || ''} onChange={(e) => navigate(`/ai-insights/providers/${e.target.value}`)} aria-label="Select provider"
                  style={{ padding: '0.45rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.45rem', fontSize: '0.85rem', maxWidth: 260 }}>
                  {!current && <option value={providerId || ''}>#{id}</option>}
                  {providers.map((p) => <option key={p.PROVIDER_ID} value={p.PROVIDER_ID}>{p.PROVIDER_NAME}</option>)}
                </select>
              </label>
              <Link to={`/providers/${id}`} style={{ padding: '0.5rem 0.95rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', color: '#374151', fontSize: '0.85rem', textDecoration: 'none' }}>
                ← Provider details
              </Link>
            </div>
          </div>
        </Card>
        {Number.isInteger(providerId) && providerId > 0 && <ProviderRiskPanel key={providerId} providerId={providerId} />}
      </div>
    </PageLayout>
  );
};

export default ProviderRiskPage;
