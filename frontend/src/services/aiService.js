// AI insights API: Express /api/ai only (never the internal ML service). Uses the shared Axios client (JWT attached).
import api from './api';

export const getAiStatus          = ()                 => api.get('/ai/status');
export const getAiDashboard       = ()                 => api.get('/ai/dashboard');

// Viewing an assessment may store a new snapshot (only when its content changed); recompute is Admin/Investigator only.
export const getClaimAssessment   = (claimId)          => api.get(`/ai/claims/${claimId}/assessment`);
export const recomputeAssessment  = (claimId)          => api.post(`/ai/claims/${claimId}/assessment`);
export const getAssessmentHistory = (claimId)          => api.get(`/ai/claims/${claimId}/assessments`);

export const getClaimOutcomes     = (claimId)          => api.get(`/ai/claims/${claimId}/outcomes`);
// assessmentId must be the exact snapshot displayed to the investigator. It is never substituted.
export const recordOutcome        = (claimId, { outcome, outcomeBasis, notes, assessmentId }) =>
  api.post(`/ai/claims/${claimId}/outcomes`, {
    outcome,
    outcome_basis: outcomeBasis || null,
    notes: notes || null,
    assessment_id: assessmentId,
  });

export const getProviderProfile   = (providerId, asOf) =>
  api.get(`/ai/providers/${providerId}/profile`, { params: asOf ? { as_of: asOf } : {} });

// Research (public Kaggle / US Medicare data). Never applied to application claims.
export const getResearchModels    = ()                 => api.get('/ai/research/models');
export const getResearchShap      = ()                 => api.get('/ai/research/shap/global');
export const getResearchProvider  = (kaggleId)         => api.get(`/ai/research/providers/${encodeURIComponent(kaggleId)}/explanation`);
export const getResearchFigure    = (name)             => api.get(`/ai/research/figures/${encodeURIComponent(name)}`, { responseType: 'blob' });
