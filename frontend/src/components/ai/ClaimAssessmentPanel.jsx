import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getAssessmentHistory, getClaimAssessment, recomputeAssessment } from '../../services/aiService';
import { describeAiError, shortDigest } from '../../utils/aiFormat';
import { CLAIM_INDICATORS } from '../../utils/aiIndicators';
import IndicatorList, { RuleHitsList } from './IndicatorList';
import { AI_DISCLAIMER, AiErrorNotice, Button, COLORS, Card, Notice, Pill, PriorityBadge, SkeletonCard, Table, Timestamp } from './AiUi';

const CAN_RECOMPUTE = ['Admin', 'Investigator'];

const Meta = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.72rem', color: COLORS.muted, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: '0.85rem', color: COLORS.text, fontWeight: 600, marginTop: '0.1rem', overflowWrap: 'anywhere' }}>{children}</div>
  </div>
);

const History = ({ claimId, currentId }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    getAssessmentHistory(claimId).then((r) => setRows(r.data.data)).catch((e) => setError(describeAiError(e)));
  }, [claimId]);
  if (error) return <AiErrorNotice error={error} />;
  if (!rows) return <p style={{ color: COLORS.muted, fontSize: '0.85rem' }}>Loading history…</p>;
  return (
    <Table rowKey={(r) => r.assessment_id} rows={rows} empty="No stored assessments yet."
      columns={[
        { key: 'assessment_id', label: 'Snapshot', render: (r) => <span>#{r.assessment_id}{r.assessment_id === currentId && <> <Pill color="#4338ca" bg="#e0e7ff">shown</Pill></>}</span> },
        { key: 'assessed_at', label: 'Assessed (IST)', render: (r) => <Timestamp value={r.assessed_at} /> },
        { key: 'assessment_status', label: 'Status', render: (r) => (r.assessment_status === 'failed'
          ? <Pill color="#991b1b" bg="#fee2e2" title={r.error_message || ''}>failed attempt</Pill> : r.assessment_status.replace('_', ' ')) },
        { key: 'review_priority', label: 'Priority', render: (r) => (r.review_priority ? <PriorityBadge priority={r.review_priority} /> : '—') },
        { key: 'triggered_count', label: 'Raised', align: 'right', render: (r) => (r.triggered_count ?? '—') },
        { key: 'trigger_source', label: 'Source', render: (r) => r.trigger_source.replace('_', ' ') },
        { key: 'indicator_set_version', label: 'Version', render: (r) => r.indicator_set_version || '—' },
      ]} />
  );
};

/**
 * Claim-level AI assessment. Displays exactly what Express returned (the stored snapshot); nothing is computed in the browser.
 * onDisplayed(assessment|null) reports the snapshot actually shown, so outcomes can be linked to that exact assessment_id.
 */
const ClaimAssessmentPanel = ({ claimId, onDisplayed }) => {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, result: null, stale: null, error: null });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const cb = useRef(onDisplayed);
  cb.current = onDisplayed;

  const apply = useCallback((promise) => promise
    .then((r) => setState({ loading: false, result: r.data, stale: null, error: null }))
    .catch((e) => {
      const d = describeAiError(e);
      const last = d.data && d.data.last_valid_assessment;
      setState({ loading: false, result: null, stale: last || null, error: d });
    }), []);

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return apply(getClaimAssessment(claimId));
  }, [apply, claimId]);

  useEffect(() => { load(); }, [load]);

  const shown = state.result ? state.result.assessment : state.stale;
  useEffect(() => { if (cb.current) cb.current(shown || null); }, [shown]);

  const recompute = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await recomputeAssessment(claimId);
      setState({ loading: false, result: r.data, stale: null, error: null });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      const d = describeAiError(e);
      if (d.kind === 'unavailable' && d.data && d.data.last_valid_assessment) {
        setState({ loading: false, result: null, stale: d.data.last_valid_assessment, error: d });
      } else {
        setActionError(d);
      }
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <SkeletonCard lines={6} />;

  const canRecompute = user && CAN_RECOMPUTE.includes(user.role);
  const a = shown;
  const raised = a && Array.isArray(a.indicators) ? a.indicators.filter((i) => i.triggered === true).length : 0;
  const judged = a && Array.isArray(a.indicators) ? a.indicators.filter((i) => i.triggered !== null && i.triggered !== undefined).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="claim-assessment">
      {state.error && (
        <AiErrorNotice error={state.error} onRetry={load} />
      )}
      {state.stale && (
        <Notice type="warning" title="Showing the last stored assessment" testId="stale-notice">
          A current assessment could not be computed. The snapshot below was stored at <Timestamp value={state.stale.assessed_at} /> and
          may not reflect claims entered since then.
        </Notice>
      )}
      {actionError && <AiErrorNotice error={actionError} />}

      {!a ? (
        state.error ? null : <Notice type="info">No assessment is available for this claim.</Notice>
      ) : (
        <>
          <Card
            title="AI review priority"
            subtitle="Ordering aid for the review queue, based on the SQL rule hits and the application indicators below. Not a score, not a decision."
            actions={canRecompute && (
              <Button variant="secondary" onClick={recompute} disabled={busy} data-testid="recompute-button">
                {busy ? 'Recomputing…' : '↻ Recompute'}
              </Button>
            )}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <PriorityBadge priority={a.review_priority} size="lg" />
              <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                <strong>{raised}</strong> of {a.indicators?.length || 0} indicators raised ({judged} could be judged) ·{' '}
                <strong>{a.rule_hits?.length || 0}</strong> SQL rule hit{(a.rule_hits?.length || 0) === 1 ? '' : 's'}
              </span>
              {state.result && (
                <Pill color={state.result.snapshot === 'new' ? '#1d4ed8' : COLORS.muted} bg={state.result.snapshot === 'new' ? '#dbeafe' : '#f3f4f6'}
                  title="A new snapshot is stored only when the indicator content changes">
                  {state.result.snapshot === 'new' ? 'new snapshot stored' : 'unchanged: stored snapshot reused'}
                </Pill>
              )}
              {state.stale && <Pill color="#92400e" bg="#fef3c7">stale</Pill>}
            </div>
            {Array.isArray(a.priority_reasons) && a.priority_reasons.length > 0 && (
              <ul style={{ margin: '0 0 1rem', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#374151' }}>
                {a.priority_reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '0.75rem',
              background: '#f9fafb', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
              <Meta label="Assessment snapshot"><span data-testid="assessment-id">#{a.assessment_id}</span></Meta>
              <Meta label="Assessed at (IST)"><Timestamp value={a.assessed_at} /></Meta>
              <Meta label="Indicator set">{a.model_key} · v{a.indicator_set_version}</Meta>
              <Meta label="Claims in snapshot">{a.snapshot_claim_count ?? '—'}</Meta>
              <Meta label="Content digest"><span title={a.indicators_digest} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{shortDigest(a.indicators_digest)}</span></Meta>
            </div>
          </Card>

          <Card title="SQL rule engine (existing)" subtitle="Rules evaluated by the database trigger when the claim was created. Unchanged by the AI features.">
            <RuleHitsList ruleHits={a.rule_hits || []} />
          </Card>

          <Card title="Application indicators" subtitle="Transparent statistics from this application's own data, with configured thresholds.">
            <IndicatorList indicators={a.indicators || []} catalogue={CLAIM_INDICATORS} />
            <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', color: COLORS.muted, lineHeight: 1.5 }}>{AI_DISCLAIMER}</p>
          </Card>
        </>
      )}

      <Card title="Assessment history" subtitle="Append-only: snapshots are never changed or deleted. Failed attempts are listed but never replace a valid snapshot."
        actions={<Button variant="secondary" onClick={() => setShowHistory((s) => !s)} data-testid="history-toggle">{showHistory ? 'Hide' : 'Show history'}</Button>}>
        {showHistory ? <History key={historyKey} claimId={claimId} currentId={a && a.assessment_id} />
          : <p style={{ margin: 0, fontSize: '0.8rem', color: COLORS.muted }}>Every stored snapshot of this claim, newest first.</p>}
      </Card>
    </div>
  );
};

export default ClaimAssessmentPanel;
