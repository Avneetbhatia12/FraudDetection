import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageLayout from '../../components/layout/PageLayout';
import {
  AiErrorNotice, Button, COLORS, Card, Grid, Notice, Pill, PRIORITY_STYLE, PriorityBadge, SkeletonCard, StatTile, Table, Timestamp,
} from '../../components/ai/AiUi';
import { getAiDashboard, getAiStatus } from '../../services/aiService';
import { describeAiError, formatCalendarDate } from '../../utils/aiFormat';
import { formatCurrency } from '../../utils/formatters';

const REASON_TEXT = {
  not_configured: 'Live AI is not enabled: the server has no ML service key configured.',
  disabled: 'Live AI is switched off on the server.',
  circuit_open: 'The AI service is temporarily paused after repeated failures.',
  network_error: 'The AI service cannot be reached.',
  timeout: 'The AI service is not responding in time.',
  auth_rejected: 'The AI service rejected the server’s credentials.',
};

const ServiceBanner = ({ status }) => {
  if (!status) return null;
  if (status.ready) {
    return <Notice type="info" title="AI service available" testId="ai-ready">
      Indicator set {status.registry.model_key} v{status.registry.version} is registered and the AI service is reachable.
    </Notice>;
  }
  const reason = status.ml_service && status.ml_service.reason;
  return (
    <Notice type="warning" title="New AI assessments are currently unavailable" testId="ai-not-ready">
      {REASON_TEXT[reason] || 'The AI service is not ready.'} Stored results below remain available, and the existing rule-based
      fraud detection works as usual.
    </Notice>
  );
};

const Progress = ({ label, value, target }) => {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#374151' }}>
        <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{value} / {target}</span>
      </div>
      <div style={{ height: 8, background: '#f3f4f6', borderRadius: 9999, marginTop: 4 }} role="progressbar" aria-valuenow={value} aria-valuemax={target}>
        <div style={{ width: `${pct}%`, height: '100%', background: COLORS.accent, borderRadius: 9999 }} />
      </div>
    </div>
  );
};

const AiDashboard = () => {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, dash: null, status: null, error: null });
  const [lookup, setLookup] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    Promise.allSettled([getAiDashboard(), getAiStatus()]).then(([d, s]) => {
      setState({
        loading: false,
        dash: d.status === 'fulfilled' ? d.value.data : null,
        status: s.status === 'fulfilled' ? s.value.data : null,
        error: d.status === 'rejected' ? describeAiError(d.reason) : null,
      });
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const d = state.dash;
  const assessed = d ? d.claims.with_valid_assessment : 0;
  const chart = d ? ['High', 'Elevated', 'Routine'].map((p) => ({ priority: p, claims: d.review_priority[p] || 0 })) : [];
  const outcomesTotal = d ? Object.values(d.latest_outcomes).reduce((a, b) => a + b, 0) : 0;

  return (
    <PageLayout title="AI Insights">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: COLORS.text }}>AI-assisted review</h2>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: COLORS.muted, maxWidth: 720 }}>
              Transparent indicators computed from this application&apos;s own data help order the review queue. They do not
              approve, reject or score claims, and they run alongside the existing SQL fraud rules.
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(lookup)) navigate(`/ai-insights/claims/${lookup}`); }}
            style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={lookup} onChange={(e) => setLookup(e.target.value.trim())} placeholder="Claim ID" inputMode="numeric" aria-label="Claim ID"
              style={{ width: 120, padding: '0.5rem 0.65rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.85rem' }} />
            <Button type="submit" disabled={!/^\d+$/.test(lookup)}>Assess claim</Button>
          </form>
        </div>

        {state.loading ? (
          <Grid min={300}><SkeletonCard /><SkeletonCard /><SkeletonCard /></Grid>
        ) : state.error ? (
          <AiErrorNotice error={state.error} onRetry={load} />
        ) : d && (
          <>
            <ServiceBanner status={state.status} />
            <Grid min={180}>
              <StatTile label="Claims" value={d.claims.total} hint="in the application" />
              <StatTile label="Claims with a valid assessment" value={assessed}
                hint={d.claims.total ? `${Math.round((assessed / d.claims.total) * 100)}% of claims` : undefined} accent="#10b981" />
              <StatTile label="Failed attempts (24 h)" value={d.claims.failed_attempts_last_24h} accent="#f59e0b" hint="never replace a valid snapshot" />
              <StatTile label="Providers profiled" value={`${d.provider_overview.profiled_providers} / ${d.provider_overview.total_providers}`} accent="#8b5cf6" />
              <StatTile label="Claims with an outcome" value={outcomesTotal} accent="#0ea5e9" />
            </Grid>

            <Grid min={340}>
              <Card title="Review priority distribution" subtitle="Latest valid assessment per claim.">
                {assessed === 0 ? (
                  <p data-testid="priority-empty" style={{ margin: 0, color: COLORS.muted, fontSize: '0.85rem' }}>
                    No claim has been assessed yet. Open a claim&apos;s AI assessment to create its first snapshot.
                  </p>
                ) : (
                  <div style={{ width: '100%', height: 200 }} data-testid="priority-chart">
                    <ResponsiveContainer>
                      <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} fontSize={12} />
                        <YAxis type="category" dataKey="priority" width={70} fontSize={12} />
                        <Tooltip formatter={(v) => [v, 'claims']} />
                        <Bar dataKey="claims" radius={[0, 4, 4, 0]}>
                          {chart.map((c) => <Cell key={c.priority} fill={PRIORITY_STYLE[c.priority].color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: COLORS.faint }}>{d.note}</p>
              </Card>

              <Card title="Investigation outcomes" subtitle="Latest recorded outcome per claim.">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {Object.entries(d.latest_outcomes).map(([o, n]) => <Pill key={o}>{o}: {n}</Pill>)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <Progress label="Final outcomes linked to a valid snapshot" value={d.future_supervised_model.eligible_final_outcomes}
                    target={d.future_supervised_model.review_checkpoint.final_outcomes} />
                  <Progress label="…of which confirmed fraud" value={d.future_supervised_model.eligible_confirmed_fraud}
                    target={d.future_supervised_model.review_checkpoint.confirmed_fraud} />
                </div>
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: COLORS.faint }}>{d.future_supervised_model.note}</p>
              </Card>
            </Grid>

            <Card title="Review queue" subtitle="Claims whose latest assessment is High or Elevated priority.">
              <Table rowKey={(r) => r.assessment_id} rows={d.review_queue} empty="No claim currently has High or Elevated priority."
                columns={[
                  { key: 'claim', label: 'Claim', render: (r) => <Link to={`/ai-insights/claims/${r.claim_id}`} style={{ color: COLORS.accent, fontWeight: 600 }}>#{r.claim_id}</Link> },
                  { key: 'p', label: 'Priority', render: (r) => <PriorityBadge priority={r.review_priority} /> },
                  { key: 't', label: 'Indicators raised', align: 'right', render: (r) => r.triggered_count },
                  { key: 'd', label: 'Claim date', render: (r) => formatCalendarDate(r.claim_date) },
                  { key: 'a', label: 'Amount', align: 'right', render: (r) => formatCurrency(r.claim_amount) },
                  { key: 's', label: 'Claim status', render: (r) => r.claim_status },
                  { key: 'at', label: 'Assessed (IST)', render: (r) => <Timestamp value={r.assessed_at} /> },
                ]} />
            </Card>

            <Card title="Recent assessments" subtitle="Most recently stored valid snapshots and the indicators they raised.">
              <Table rowKey={(r) => r.assessment_id} rows={d.recent_assessments} empty="No assessments stored yet."
                columns={[
                  { key: 'claim', label: 'Claim', render: (r) => <Link to={`/ai-insights/claims/${r.claim_id}`} style={{ color: COLORS.accent, fontWeight: 600 }}>#{r.claim_id}</Link> },
                  { key: 'p', label: 'Priority', render: (r) => <PriorityBadge priority={r.review_priority} /> },
                  { key: 'i', label: 'Indicators raised', render: (r) => (r.triggered_indicators.length
                    ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.triggered_indicators.map((i) => <Pill key={i.code} color="#92400e" bg="#fef3c7">{i.name}</Pill>)}</div>
                    : <span style={{ color: COLORS.faint }}>none</span>) },
                  { key: 'r', label: 'SQL rule hits', align: 'right', render: (r) => r.rule_hit_count },
                  { key: 'at', label: 'Assessed (IST)', render: (r) => <Timestamp value={r.assessed_at} /> },
                ]} />
            </Card>

            <Card title="Provider risk overview" subtitle="Latest stored profile per provider, most indicators raised first.">
              <Table rowKey={(r) => r.profile_id} rows={d.provider_overview.providers} empty="No provider profile stored yet. Open a provider's risk profile to create one."
                columns={[
                  { key: 'n', label: 'Provider', render: (r) => <Link to={`/ai-insights/providers/${r.provider_id}`} style={{ color: COLORS.accent, fontWeight: 600 }}>{r.provider_name}</Link> },
                  { key: 'ty', label: 'Type', render: (r) => r.provider_type },
                  { key: 'c', label: 'Claims', align: 'right', render: (r) => r.claim_count },
                  { key: 'i', label: 'Indicators raised', render: (r) => (r.profile_status === 'insufficient_data'
                    ? <Pill title="Too few claims or comparable providers">insufficient data</Pill>
                    : r.triggered_indicators.length
                      ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.triggered_indicators.map((i) => <Pill key={i.code} color="#92400e" bg="#fef3c7">{i.name}</Pill>)}</div>
                      : <span style={{ color: COLORS.faint }}>none</span>) },
                  { key: 'a', label: 'As of', render: (r) => formatCalendarDate(r.as_of_date) },
                  { key: 'at', label: 'Computed (IST)', render: (r) => <Timestamp value={r.computed_at} /> },
                ]} />
            </Card>

            {d.indicator_set && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: COLORS.faint }}>
                Indicator set {d.indicator_set.model_key} v{d.indicator_set.version}{d.indicator_set.active ? ' (active)' : ''}. Times are shown in IST.
              </p>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default AiDashboard;
