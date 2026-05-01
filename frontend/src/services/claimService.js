import api from './api';

export const getClaims      = (params) => api.get('/claims', { params });
export const getClaim       = (id)     => api.get(`/claims/${id}`);
export const createClaim    = (data)   => api.post('/claims', data);
export const updateClaimStatus = (id, data) => api.put(`/claims/${id}/status`, data);

export const getPolicies    = (params) => api.get('/policies', { params });
export const getPolicy      = (id)     => api.get(`/policies/${id}`);
export const createPolicy   = (data)   => api.post('/policies', data);
export const updatePolicy   = (id, data) => api.put(`/policies/${id}`, data);

export const getProviders   = (params) => api.get('/providers', { params });
export const getProvider    = (id)     => api.get(`/providers/${id}`);
export const createProvider = (data)   => api.post('/providers', data);
export const updateProvider = (id, data) => api.put(`/providers/${id}`, data);
