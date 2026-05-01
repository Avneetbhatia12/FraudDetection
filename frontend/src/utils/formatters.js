export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatDateInput = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
};

export const getRiskLevel = (flagCount) => {
  if (flagCount === 0) return 'LOW';
  if (flagCount === 1) return 'MEDIUM';
  return 'HIGH';
};

export const truncate = (str, n = 50) =>
  str && str.length > n ? str.slice(0, n) + '…' : str;
