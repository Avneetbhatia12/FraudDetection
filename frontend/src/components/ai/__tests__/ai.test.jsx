/**
 * Phase 5 frontend tests (Jest + React Testing Library). The API modules are mocked: no network, no database.
 * Run: cd frontend && npx react-scripts test --watchAll=false
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '../../../context/AuthContext';
import * as ai from '../../../services/aiService';
import * as claims from '../../../services/claimService';
import ClaimAssessmentPanel from '../ClaimAssessmentPanel';
import OutcomePanel from '../OutcomePanel';
import ProviderRiskPanel from '../ProviderRiskPanel';
import AiDashboard from '../../../pages/ai/AiDashboard';
import ClaimAssessmentPage from '../../../pages/ai/ClaimAssessmentPage';
import ResearchPage from '../../../pages/ai/ResearchPage';
import Sidebar from '../../layout/Sidebar';
import { describeAiError, formatCalendarDate, formatIST } from '../../../utils/aiFormat';

// The shared Axios client is replaced by a stub (no network; also avoids loading axios' ESM build under CRA's Jest).
jest.mock('../../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../../../services/aiService');
jest.mock('../../../services/claimService');

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { jest.resetAllMocks(); localStorage.clear(); });

const asUser = (role, id = 9) => {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ id, username: role.toLowerCase(), role, email: `${role.toLowerCase()}@x` }));
};
const wrap = (ui, path = '/') => render(<AuthProvider><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></AuthProvider>);
const ok = (data) => Promise.resolve({ data });
const httpErr = (status, data = {}, headers = {}) => Promise.reject(Object.assign(new Error(`HTTP ${status}`), { response: { status, data, headers } }));

const ASSESSMENT = {
  assessment_id: 17, claim_id: 5, model_key: 'app-indicators-v2', indicator_set_version: '2.0.0', assessment_status: 'completed',
  snapshot_claim_count: 38, indicators_digest: 'a'.repeat(64), review_priority: 'High', triggered_count: 1, trigger_source: 'on_view',
  priority_reasons: ['SQL rule hit: High Claim Amount'], assessed_at: '2026-11-12T06:30:00.000Z',
  rule_hits: [{ rule_id: 1, rule_name: 'High Claim Amount' }],
  indicators: [
    { code: 'coverage_share', level: 'claim', name: 'Share of policy coverage', value: 0.62, reference: 'policy coverage', threshold: '>= 50%',
      status: 'ok', triggered: true, reason: 'Claim uses 62% of coverage', comparison_claim_ids: [] },
    { code: 'amount_vs_diagnosis_median', level: 'claim', name: 'Amount vs earlier-dated claims with the same diagnosis', value: null,
      reference: 'earlier claims, same diagnosis', threshold: '>= 3x', status: 'insufficient_history', triggered: null,
      reason: 'Only 1 earlier claim with this diagnosis (needs 5)', comparison_claim_ids: [3] },
  ],
};
const ASSESS_RESPONSE = { success: true, ai_status: 'available', snapshot: 'new', assessment: ASSESSMENT, current_computation: {}, disclaimer: 'd' };

describe('formatting and error mapping', () => {
  test('UTC timestamps are shown in IST; calendar dates are not shifted', () => {
    const s = formatIST('2026-11-12T06:30:00.000Z');
    expect(s).toMatch(/12 Nov 2026/);
    expect(s).toMatch(/12:00/);
    expect(s).toMatch(/IST$/);
    expect(formatIST('2026-11-11T18:30:00.000Z')).toMatch(/12 Nov 2026, 00:00/);   // IST midnight boundary
    expect(formatCalendarDate('2024-01-01')).toBe('01 Jan 2024');
  });

  test('HTTP statuses map to clear messages without internal details', async () => {
    const e429 = describeAiError({ response: { status: 429, data: { retry_after_seconds: 42 }, headers: {} } });
    expect(e429.kind).toBe('rate_limited');
    expect(e429.message).toMatch(/42 s/);
    const e503 = describeAiError({ response: { status: 503, data: { ai_status: 'unavailable', reason: 'not_configured' } } });
    expect(e503.kind).toBe('unavailable');
    expect(e503.message).toMatch(/not configured/);
    expect(e503.message).toMatch(/rule-based fraud detection is unaffected/);
    expect(describeAiError({ response: { status: 403, data: { message: 'This action requires one of the roles: Admin, Investigator' } } }).kind).toBe('forbidden');
    expect(describeAiError({ response: { status: 404, data: {} } }).kind).toBe('not_found');
    expect(describeAiError({}).kind).toBe('network');
  });

  test('help text for indicators that cannot be judged depends on level and on whether a value exists', () => {
    const { statusHelp } = require('../../../utils/aiIndicators');
    expect(statusHelp({ level: 'provider', status: 'insufficient_history', value: 1 })).toMatch(/value is shown.*comparable providers/);
    expect(statusHelp({ level: 'provider', status: 'not_applicable', value: null })).toMatch(/not defined for this provider/);
    expect(statusHelp({ level: 'claim', status: 'insufficient_history', value: null })).toMatch(/No value is guessed/);
    expect(statusHelp({ level: 'claim', status: 'not_applicable', value: null })).toMatch(/does not apply to this claim/);
    expect(statusHelp({ level: 'claim', status: 'ok', value: 2 })).toBeNull();
  });
});

describe('ClaimAssessmentPanel', () => {
  test('shows priority, SQL rule hits separately from indicators, insufficient history, IST time with UTC preserved, version', async () => {
    asUser('Analyst');
    ai.getClaimAssessment.mockReturnValue(ok(ASSESS_RESPONSE));
    const onDisplayed = jest.fn();
    wrap(<ClaimAssessmentPanel claimId={5} onDisplayed={onDisplayed} />);
    expect(await screen.findByTestId('assessment-id')).toHaveTextContent('#17');
    const rules = screen.getByTestId('rule-hits');
    expect(within(rules).getByText('High Claim Amount')).toBeInTheDocument();
    const list = screen.getByTestId('indicator-list');
    expect(within(list).queryByText('High Claim Amount')).toBeNull();               // rule hits are not mixed into indicators
    expect(within(screen.getByTestId('indicator-coverage_share')).getByText('62%')).toBeInTheDocument();
    const insufficient = screen.getByTestId('indicator-amount_vs_diagnosis_median');
    expect(within(insufficient).getByText('Not enough history')).toBeInTheDocument();
    expect(within(insufficient).getByText(/No value is guessed/)).toBeInTheDocument();
    expect(screen.getByText(/app-indicators-v2 · v2.0.0/)).toBeInTheDocument();
    const t = document.querySelector('time[data-utc="2026-11-12T06:30:00.000Z"]');
    expect(t).not.toBeNull();
    expect(t.textContent).toMatch(/12:00 IST/);
    expect(screen.getByText('new snapshot stored')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/fraud score|probability of fraud|\d+% (risk|fraud)/i);
    expect(screen.queryByTestId('recompute-button')).toBeNull();                    // Analyst cannot recompute
    await waitFor(() => expect(onDisplayed).toHaveBeenLastCalledWith(ASSESSMENT));
  });

  test('Investigator can recompute; the button calls the recompute endpoint', async () => {
    asUser('Investigator');
    ai.getClaimAssessment.mockReturnValue(ok(ASSESS_RESPONSE));
    ai.recomputeAssessment.mockReturnValue(ok({ ...ASSESS_RESPONSE, snapshot: 'unchanged' }));
    wrap(<ClaimAssessmentPanel claimId={5} />);
    fireEvent.click(await screen.findByTestId('recompute-button'));
    await screen.findByText('unchanged: stored snapshot reused');
    expect(ai.recomputeAssessment).toHaveBeenCalledWith(5);
  });

  test('AI not configured: clear unavailable message, nothing invented, no snapshot to link', async () => {
    asUser('Investigator');
    ai.getClaimAssessment.mockReturnValue(httpErr(503, { ai_status: 'unavailable', reason: 'not_configured', last_valid_assessment: null }));
    const onDisplayed = jest.fn();
    wrap(<ClaimAssessmentPanel claimId={5} onDisplayed={onDisplayed} />);
    const n = await screen.findByTestId('ai-error-unavailable');
    expect(n).toHaveTextContent(/not configured/);
    expect(screen.queryByTestId('assessment-id')).toBeNull();
    expect(screen.queryByTestId('indicator-list')).toBeNull();
    await waitFor(() => expect(onDisplayed).toHaveBeenLastCalledWith(null));
  });

  test('service down with a stored snapshot: shows it as stale and still reports it for linking', async () => {
    asUser('Investigator');
    ai.getClaimAssessment.mockReturnValue(httpErr(503, { ai_status: 'unavailable', reason: 'network_error', last_valid_assessment: { ...ASSESSMENT, stale: true } }));
    const onDisplayed = jest.fn();
    wrap(<ClaimAssessmentPanel claimId={5} onDisplayed={onDisplayed} />);
    expect(await screen.findByTestId('stale-notice')).toBeInTheDocument();
    expect(screen.getByTestId('assessment-id')).toHaveTextContent('#17');
    await waitFor(() => expect(onDisplayed).toHaveBeenLastCalledWith(expect.objectContaining({ assessment_id: 17 })));
  });

  test('shows a loading skeleton while the assessment is requested', async () => {
    asUser('Analyst');
    let resolve;
    ai.getClaimAssessment.mockReturnValue(new Promise((r) => { resolve = r; }));
    wrap(<ClaimAssessmentPanel claimId={5} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await act(async () => { resolve({ data: ASSESS_RESPONSE }); });
    expect(await screen.findByTestId('assessment-id')).toHaveTextContent('#17');
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  test('404 (claim not found) is shown clearly', async () => {
    asUser('Analyst');
    ai.getClaimAssessment.mockReturnValue(httpErr(404, { message: 'Claim not found' }));
    wrap(<ClaimAssessmentPanel claimId={999} />);
    expect(await screen.findByTestId('ai-error-not_found')).toHaveTextContent('Claim not found');
  });

  test('429 shows a rate-limit message with the retry time', async () => {
    asUser('Analyst');
    ai.getClaimAssessment.mockReturnValue(httpErr(429, { retry_after_seconds: 37 }, { 'retry-after': '37' }));
    wrap(<ClaimAssessmentPanel claimId={5} />);
    expect(await screen.findByTestId('ai-error-rate_limited')).toHaveTextContent(/37 s/);
  });

  test('history lists stored snapshots including failed attempts', async () => {
    asUser('Analyst');
    ai.getClaimAssessment.mockReturnValue(ok(ASSESS_RESPONSE));
    ai.getAssessmentHistory.mockReturnValue(ok({ data: [ASSESSMENT, { ...ASSESSMENT, assessment_id: 16, assessment_status: 'failed', review_priority: null,
      triggered_count: null, indicator_set_version: null, error_message: 'timeout' }] }));
    wrap(<ClaimAssessmentPanel claimId={5} />);
    fireEvent.click(await screen.findByTestId('history-toggle'));
    expect(await screen.findByText('failed attempt')).toBeInTheDocument();
    expect(screen.getByText('shown')).toBeInTheDocument();
  });
});

describe('OutcomePanel: strict snapshot linking and roles', () => {
  test('Investigator records an outcome linked to the EXACT displayed assessment_id', async () => {
    asUser('Investigator');
    ai.getClaimOutcomes.mockReturnValue(ok({ data: [] }));
    ai.recordOutcome.mockReturnValue(ok({ data: { outcome_id: 3, assessment_id: 17, decided_at: '2026-11-12T07:00:00.000Z' } }));
    wrap(<OutcomePanel claimId={5} assessment={ASSESSMENT} />);
    expect(await screen.findByTestId('linked-snapshot')).toHaveTextContent('assessment #17');
    fireEvent.click(screen.getByLabelText('Confirmed Fraud'));
    fireEvent.change(screen.getByLabelText(/Basis/), { target: { value: 'documentary_evidence' } });
    fireEvent.click(screen.getByTestId('outcome-submit'));
    expect(await screen.findByTestId('outcome-saved')).toHaveTextContent('linked to assessment #17');
    expect(ai.recordOutcome).toHaveBeenCalledTimes(1);
    expect(ai.recordOutcome).toHaveBeenCalledWith(5, { outcome: 'Confirmed Fraud', outcomeBasis: 'documentary_evidence', notes: '', assessmentId: 17 });
  });

  test('Analyst and Reviewer see the history only (no form)', async () => {
    for (const role of ['Analyst', 'Reviewer']) {
      asUser(role);
      ai.getClaimOutcomes.mockReturnValue(ok({ data: [] }));
      const { unmount } = wrap(<OutcomePanel claimId={5} assessment={ASSESSMENT} />);
      expect(await screen.findByTestId('outcome-readonly')).toBeInTheDocument();
      expect(screen.queryByTestId('outcome-form')).toBeNull();
      unmount();
    }
  });

  test('no displayed snapshot or a failed snapshot: recording is not offered (no substitution)', async () => {
    asUser('Admin');
    ai.getClaimOutcomes.mockReturnValue(ok({ data: [] }));
    const { unmount } = wrap(<OutcomePanel claimId={5} assessment={null} />);
    expect(await screen.findByTestId('outcome-no-snapshot')).toBeInTheDocument();
    unmount();
    wrap(<OutcomePanel claimId={5} assessment={{ ...ASSESSMENT, assessment_status: 'failed' }} />);
    expect(await screen.findByTestId('outcome-no-snapshot')).toBeInTheDocument();
    expect(ai.recordOutcome).not.toHaveBeenCalled();
  });

  test('server rejection (422) is shown and nothing else is tried', async () => {
    asUser('Investigator');
    ai.getClaimOutcomes.mockReturnValue(ok({ data: [] }));
    ai.recordOutcome.mockReturnValue(httpErr(422, { message: 'Linked assessment belongs to another claim', reason: 'linked_snapshot_other_claim' }));
    wrap(<OutcomePanel claimId={5} assessment={ASSESSMENT} />);
    fireEvent.click(await screen.findByLabelText('Legitimate'));
    fireEvent.click(screen.getByTestId('outcome-submit'));
    expect(await screen.findByTestId('ai-error-invalid')).toHaveTextContent('belongs to another claim');
    expect(ai.recordOutcome).toHaveBeenCalledTimes(1);
  });

  test('history shows the linked snapshot and training eligibility', async () => {
    asUser('Analyst');
    ai.getClaimOutcomes.mockReturnValue(ok({ data: [{ outcome_id: 1, claim_id: 5, outcome: 'Confirmed Fraud', outcome_basis: 'documentary_evidence', notes: null,
      decided_by: { user_id: 2, email: 'investigator@frauddetect.com', role: 'Investigator' }, assessment_id: 17, decided_at: '2026-11-12T07:00:00.000Z',
      training: { eligible: true, exclusion_reason: null } }] }));
    wrap(<OutcomePanel claimId={5} assessment={ASSESSMENT} />);
    const h = await screen.findByTestId('outcome-history');
    expect(h).toHaveTextContent('assessment #17');
    expect(h).toHaveTextContent('usable as a future training label');
  });
});

describe('Claim assessment page', () => {
  test('the snapshot displayed by the assessment panel is the one the outcome form links to', async () => {
    asUser('Investigator');
    claims.getClaim.mockReturnValue(ok({ data: { CLAIM_ID: 5, STATUS: 'Pending', CLAIM_DATE: '2024-05-01', CLAIM_AMOUNT: 5000, DIAGNOSIS: 'Flu', PROVIDER_NAME: 'City Clinic', PROVIDER_ID: 2 } }));
    ai.getClaimAssessment.mockReturnValue(ok(ASSESS_RESPONSE));
    ai.getClaimOutcomes.mockReturnValue(ok({ data: [] }));
    wrap(<Routes><Route path="/ai-insights/claims/:id" element={<ClaimAssessmentPage />} /></Routes>, '/ai-insights/claims/5');
    expect(await screen.findByTestId('linked-snapshot')).toHaveTextContent('assessment #17');
    expect(ai.getClaimAssessment).toHaveBeenCalledWith(5);
  });
});

describe('ProviderRiskPanel', () => {
  test('shows the effective as-of date and its source, and explains insufficient data', async () => {
    asUser('Analyst');
    ai.getProviderProfile.mockReturnValue(ok({ success: true, ai_status: 'available', snapshot: 'unchanged', as_of_source: 'default_today_ist', comparable_peers: 3,
      profile: { profile_id: 4, provider_id: 2, model_key: 'app-indicators-v2', profile_status: 'insufficient_data', as_of_date: '2026-11-12', claim_count: 2,
        computed_at: '2026-11-12T06:00:00.000Z', indicators: [{ code: 'claims_per_patient', level: 'provider', name: 'Claims per patient', value: null, reference: 'peers',
          threshold: null, status: 'insufficient_history', triggered: null, reason: 'Needs 5 claims', comparison_claim_ids: [] }] } }));
    wrap(<ProviderRiskPanel providerId={2} />);
    expect(await screen.findByTestId('as-of-date')).toHaveTextContent('12 Nov 2026');
    expect(screen.getByText('Today in IST (server default)')).toBeInTheDocument();
    expect(screen.getByTestId('insufficient-data')).toBeInTheDocument();
    expect(ai.getProviderProfile).toHaveBeenCalledWith(2, undefined);
  });

  test('selecting a date requests that as-of date', async () => {
    asUser('Analyst');
    ai.getProviderProfile.mockReturnValue(httpErr(503, { ai_status: 'unavailable', reason: 'not_configured', last_valid_profile: null }));
    wrap(<ProviderRiskPanel providerId={2} />);
    await screen.findByTestId('ai-error-unavailable');
    fireEvent.change(screen.getByLabelText('As-of date'), { target: { value: '2024-01-01' } });
    await act(async () => { fireEvent.click(screen.getByText('Apply')); });
    await waitFor(() => expect(ai.getProviderProfile).toHaveBeenLastCalledWith(2, '2024-01-01'));
    expect(await screen.findByTestId('ai-error-unavailable')).toBeInTheDocument();   // second response rendered
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull());
  });

  test('breadcrumbs on AI pages have unique keys and point to existing pages', async () => {
    asUser('Analyst');
    const Breadcrumbs = require('../../layout/Breadcrumbs').default;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    wrap(<Breadcrumbs />, '/ai-insights/claims/5');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(screen.getByRole('link', { name: 'AI Insights' })).toHaveAttribute('href', '/ai-insights');
    expect(screen.getByRole('link', { name: 'Claims' })).toHaveAttribute('href', '/ai-insights');
  });
});

const DASH = {
  success: true, indicator_set: { model_key: 'app-indicators-v2', version: '2.0.0', active: true }, ml_service: {},
  claims: { total: 38, with_valid_assessment: 0, failed_attempts_last_24h: 0 }, review_priority: { Routine: 0, Elevated: 0, High: 0 },
  review_queue: [], recent_assessments: [], provider_overview: { total_providers: 12, profiled_providers: 0, with_triggered_indicators: 0, insufficient_data: 0, providers: [] },
  latest_outcomes: { 'Confirmed Fraud': 0, Legitimate: 0, 'Requires Further Investigation': 0 },
  future_supervised_model: { eligible_final_outcomes: 0, eligible_confirmed_fraud: 0, review_checkpoint: { final_outcomes: 200, confirmed_fraud: 30 }, note: 'n' },
  note: 'Review priority is an ordering aid.',
};

describe('AI dashboard', () => {
  test('real empty state and a not-configured banner (no sample metrics)', async () => {
    asUser('Analyst');
    ai.getAiDashboard.mockReturnValue(ok(DASH));
    ai.getAiStatus.mockReturnValue(ok({ ready: false, ml_service: { reachable: false, reason: 'not_configured' }, registry: { model_key: 'app-indicators-v2', version: '2.0.0' } }));
    wrap(<AiDashboard />);
    expect(await screen.findByTestId('ai-not-ready')).toHaveTextContent(/no ML service key/);
    expect(screen.getByTestId('priority-empty')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('No claim currently has High or Elevated priority.')).toBeInTheDocument();
  });

  test('stored results: queue, recent assessments and provider overview link to the AI pages', async () => {
    asUser('Analyst');
    ai.getAiDashboard.mockReturnValue(ok({ ...DASH, claims: { total: 38, with_valid_assessment: 2, failed_attempts_last_24h: 1 },
      review_priority: { Routine: 1, Elevated: 0, High: 1 },
      review_queue: [{ assessment_id: 17, claim_id: 5, review_priority: 'High', triggered_count: 1, assessed_at: ASSESSMENT.assessed_at, claim_date: '2024-05-01', claim_amount: 5000, claim_status: 'Pending' }],
      recent_assessments: [{ assessment_id: 17, claim_id: 5, review_priority: 'High', triggered_count: 1, rule_hit_count: 1, triggered_indicators: [{ code: 'coverage_share', name: 'Share of policy coverage' }], indicator_set_version: '2.0.0', assessed_at: ASSESSMENT.assessed_at }],
      provider_overview: { ...DASH.provider_overview, profiled_providers: 1, providers: [{ profile_id: 4, provider_id: 2, provider_name: 'City Clinic', provider_type: 'Clinic', as_of_date: '2026-11-12', claim_count: 2, profile_status: 'insufficient_data', computed_at: ASSESSMENT.assessed_at, triggered_indicators: [] }] } }));
    ai.getAiStatus.mockReturnValue(ok({ ready: true, ml_service: { reachable: true }, registry: { model_key: 'app-indicators-v2', version: '2.0.0' } }));
    wrap(<AiDashboard />);
    expect(await screen.findByTestId('ai-ready')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '#5' })[0]).toHaveAttribute('href', '/ai-insights/claims/5');
    expect(screen.getByRole('link', { name: 'City Clinic' })).toHaveAttribute('href', '/ai-insights/providers/2');
    expect(screen.getByText('Share of policy coverage')).toBeInTheDocument();
    expect(screen.getByText('insufficient data')).toBeInTheDocument();
  });

  test('dashboard error (403) is shown clearly', async () => {
    asUser('Analyst');
    ai.getAiDashboard.mockReturnValue(httpErr(403, { message: 'Invalid or expired token' }));
    ai.getAiStatus.mockReturnValue(httpErr(403, {}));
    wrap(<AiDashboard />);
    expect(await screen.findByTestId('ai-error-forbidden')).toHaveTextContent('Invalid or expired token');
  });
});

describe('Research page', () => {
  test('is labelled as Kaggle research that is not used for live claims; Kaggle IDs only', async () => {
    asUser('Analyst');
    const scope = { dataset: 'Public US Medicare data', applies_to_live_application_data: false, label_note: 'PotentialFraud is not verified fraud.', score_note: 'Uncalibrated scores.' };
    ai.getResearchModels.mockReturnValue(ok({ kind: 'research_benchmark', scope, data: {
      run_id: 'run-x', selected_model: 'XGBoost', split: { n_test: 812, test_size: 0.15 },
      test: { XGBoost: { pr_auc: 0.808, pr_auc_95ci: [0.73, 0.87], roc_auc: 0.97, precision: 0.66, recall: 0.79, f1: 0.72 } },
      cross_validation: { XGBoost: { pr_auc_mean: 0.737, pr_auc_std: 0.017 } }, ablation: {}, app_compatible_feature_experiment: {} } }));
    wrap(<ResearchPage />);
    const banner = await screen.findByTestId('research-banner');
    expect(banner).toHaveTextContent('not used to score live application claims');
    expect(await screen.findByText(/0.808 \(0.730–0.870\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Provider explanations' }));
    fireEvent.change(screen.getByLabelText('Kaggle provider ID'), { target: { value: '5' } });
    expect(screen.getByText('Explain')).toBeDisabled();
  });
});

describe('Navigation', () => {
  test('sidebar includes AI Insights and Research without removing existing entries', () => {
    asUser('Analyst');
    wrap(<Sidebar collapsed={false} onToggle={() => {}} />);
    for (const name of ['Dashboard', 'Claims', 'Fraud Rules', 'AI Insights', 'Research', 'Users']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText('AI Insights').closest('a')).toHaveAttribute('href', '/ai-insights');
  });
});
