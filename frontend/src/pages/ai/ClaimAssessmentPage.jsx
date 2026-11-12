import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import ClaimAssessmentPanel from '../../components/ai/ClaimAssessmentPanel';
import OutcomePanel from '../../components/ai/OutcomePanel';
import { COLORS, Card, Skeleton } from '../../components/ai/AiUi';
import StatusBadge from '../../components/tables/StatusBadge';
import { getClaim } from '../../services/claimService';
import useFetch from '../../hooks/useFetch';
import { formatCurrency, formatDate } from '../../utils/formatters';

/** Claim AI assessment + investigation outcomes. The snapshot shown here is the one an outcome is linked to. */
const ClaimAssessmentPage = () => {
  const { id } = useParams();
  const claimId = Number(id);
  const { data, loading, error } = useFetch(() => getClaim(id), [id]);
  const c = data?.data;
  const [displayed, setDisplayed] = useState(null);

  return (
    <PageLayout title="AI Claim Assessment">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Card>
          {loading ? <Skeleton height={20} width="50%" /> : !c ? (
            <p style={{ margin: 0, color: COLORS.muted }}>{error || 'Claim not found'}</p>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: COLORS.text }}>Claim #{c.CLAIM_ID}</h2>
                  <StatusBadge status={c.STATUS} />
                </div>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: COLORS.muted }}>
                  {formatDate(c.CLAIM_DATE)} · {formatCurrency(c.CLAIM_AMOUNT)} · {c.DIAGNOSIS} · {c.PROVIDER_NAME}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Link to={`/claims/${c.CLAIM_ID}`} style={{ padding: '0.5rem 0.95rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: '#fff', color: '#374151', fontSize: '0.85rem', textDecoration: 'none' }}>
                  ← Claim details
                </Link>
                <Link to={`/ai-insights/providers/${c.PROVIDER_ID}`} style={{ padding: '0.5rem 0.95rem', border: '1px solid #c7d2fe', borderRadius: '0.5rem', background: COLORS.accentBg, color: '#4338ca', fontSize: '0.85rem', textDecoration: 'none' }}>
                  Provider risk profile →
                </Link>
              </div>
            </div>
          )}
        </Card>

        {Number.isInteger(claimId) && claimId > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: '1rem', alignItems: 'start' }}>
            <ClaimAssessmentPanel claimId={claimId} onDisplayed={setDisplayed} />
            <OutcomePanel claimId={claimId} assessment={displayed} />
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default ClaimAssessmentPage;
