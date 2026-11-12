// Plain-language explanations of the application-native indicators (indicator set app-indicators-v2 / 2.0.0).
// Source of truth: ml_service/app_risk/indicators.py (CLAIM_SPEC, PROVIDER_SPEC) and docs/APP_INDICATORS.md.
// These are transparent statistics with configured thresholds, not machine-learning predictions.

const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const times = (v) => `${Number(v).toFixed(2)}×`;
const count = (v) => String(Math.round(v));
const days = (v) => `${Math.round(v)} day${Math.round(v) === 1 ? '' : 's'}`;
const dec = (v) => Number(v).toFixed(2);

export const CLAIM_INDICATORS = {
  coverage_share: {
    what: 'How much of the policy’s total coverage this single claim uses.',
    why: 'One claim consuming a large part of the coverage is unusual.', format: pct },
  outside_policy_period: {
    what: 'Whether the service date falls before the policy started or after it ended.',
    why: 'Services dated while the policy was not in force should not be billed to it.', format: days },
  amount_vs_diagnosis_median: {
    what: 'The claim amount compared with the typical (median) amount of earlier claims for the same diagnosis.',
    why: 'Billing far above what a diagnosis usually costs here may need a closer look.', format: times },
  diagnosis_new_for_provider_type: {
    what: 'How often this diagnosis was seen before from providers of the same type.',
    why: 'A diagnosis never seen for this kind of provider can indicate a mismatch.', format: count },
  patient_claims_prior_30d: {
    what: 'The patient’s other claims dated in the 30 days up to this claim.',
    why: 'Bursts of claims for one patient can indicate over-billing.', format: count },
  days_since_patient_previous_claim: {
    what: 'Days between this claim and the patient’s previous claim.',
    why: 'Very frequent repeat visits may need review.', format: days },
  near_duplicate_claims: {
    what: 'Other claims with the same patient, provider and diagnosis, a near-identical amount and a date within 7 days.',
    why: 'These may be duplicate or re-submitted bills.', format: count },
  provider_volume_surge: {
    what: 'The provider’s claims in the last 30 days compared with its own usual 30-day volume.',
    why: 'A sudden increase in a provider’s billing can be worth reviewing.', format: times },
};

export const PROVIDER_INDICATORS = {
  claim_count: { what: 'Claims dated on or before the as-of date.', format: count },
  distinct_patients: { what: 'Different patients with at least one claim.', format: count },
  active_months: { what: 'Calendar months with at least one claim.', format: count },
  claims_per_patient: { what: 'Average number of claims per patient.', why: 'Unusually many claims per patient compared with other providers.', format: dec },
  claims_per_active_month: { what: 'Average claims per active month.', why: 'Unusually high monthly volume compared with other providers.', format: dec },
  share_same_day_repeat: { what: 'Share of claims where the same patient has another claim here on the same day.', why: 'Same-day repeats can indicate split billing.', format: pct },
  median_days_between_patient_claims: { what: 'Typical gap between a patient’s consecutive claims at this provider.', why: 'Unusually short gaps compared with other providers.', format: days },
  share_patients_3plus_claims: { what: 'Share of patients with three or more claims here.', why: 'Many frequently returning patients compared with other providers.', format: pct },
  patient_mean_other_providers: { what: 'How many other providers this provider’s patients also claimed through, on average.', why: 'Patients shared across many providers can indicate coordinated activity.', format: dec },
  rule_flag_rate: { what: 'Share of this provider’s claims flagged by the existing SQL fraud rules.', why: 'A high rate of rule hits compared with other providers.', format: pct },
};

export const STATUS_TEXT = {
  ok: 'Computed',
  insufficient_history: 'Not enough history',
  not_applicable: 'Not applicable',
};

/** Plain-language note for indicators that could not be judged. Depends on the level and on whether a value exists. */
export const statusHelp = (ind) => {
  const provider = ind.level === 'provider';
  const hasValue = ind.value !== null && ind.value !== undefined;
  if (ind.status === 'insufficient_history') {
    if (provider) {
      return hasValue
        ? 'The value is shown, but there are too few claims or comparable providers to tell whether it is unusual, so it is neither raised nor cleared.'
        : 'There are too few claims for this provider to compute this measure yet. No value is guessed.';
    }
    return hasValue
      ? 'The value is shown, but there is not enough earlier data to judge it, so it is neither raised nor cleared.'
      : 'There is not enough earlier data to judge this indicator yet, so it is neither raised nor cleared. No value is guessed.';
  }
  if (ind.status === 'not_applicable') {
    return provider
      ? 'This measure is not defined for this provider (for example, no patient has a repeat claim here).'
      : 'This check does not apply to this claim (for example, the patient has no earlier claim).';
  }
  return null;
};

export const formatIndicatorValue = (ind, catalogue) => {
  if (ind.value === null || ind.value === undefined) return '—';
  const spec = catalogue[ind.code];
  return spec && spec.format ? spec.format(ind.value) : String(ind.value);
};
