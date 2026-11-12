import axios from 'axios';

const api = axios.create({
  // REACT_APP_API_URL: backend origin for split deployments (set at build time). Unset/empty: same-origin '/api'
  // (local development uses the package.json proxy).
  baseURL: process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL.replace(/\/+$/, '')}/api`
    : '/api',
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
