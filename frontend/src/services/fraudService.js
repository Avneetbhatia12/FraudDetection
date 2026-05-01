import api from './api';

export const getFraudFlags     = (params) => api.get('/fraud-flags', { params });
export const getFraudFlag      = (id)     => api.get(`/fraud-flags/${id}`);
export const getFraudRules     = ()       => api.get('/fraud-rules');
export const createFraudRule   = (data)   => api.post('/fraud-rules', data);
export const updateFraudRule   = (id, data) => api.put(`/fraud-rules/${id}`, data);
export const getHighRiskClaims = ()       => api.get('/high-risk-claims');
export const getDashboardStats = ()       => api.get('/dashboard/stats');
export const getReports        = ()       => api.get('/reports');
