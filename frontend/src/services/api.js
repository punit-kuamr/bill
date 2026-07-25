import axios from 'axios';

export const getApiUrl = () => {
  return localStorage.getItem('BACKEND_API_URL') || process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
};

const api = axios.create({
  baseURL: getApiUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Response interceptor for error normalization
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Unknown error';
    return Promise.reject(new Error(message));
  }
);

export const setApiUrl = (url) => {
  if (url) {
    localStorage.setItem('BACKEND_API_URL', url);
    api.defaults.baseURL = url;
  } else {
    localStorage.removeItem('BACKEND_API_URL');
    api.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
  }
};

// ============================================================
// CLIENT API
// ============================================================
export const clientAPI = {
  getAll:   (params) => api.get('/clients', { params }),
  getById:  (id)     => api.get(`/clients/${id}`),
  create:   (data)   => api.post('/clients', data),
  update:   (id, data) => api.put(`/clients/${id}`, data),
  delete:   (id)     => api.delete(`/clients/${id}`),
  getInvoices: (id)  => api.get(`/clients/${id}/invoices`),
};

// ============================================================
// INVOICE API
// ============================================================
export const invoiceAPI = {
  getAll:      (params) => api.get('/invoices', { params }),
  getById:     (id)     => api.get(`/invoices/${id}`),
  create:      (data)   => api.post('/invoices', data),
  bulkImport:  (data)   => api.post('/invoices/bulk-import', data),
  update:      (id, data) => api.put(`/invoices/${id}`, data),
  delete:      (id)     => api.delete(`/invoices/${id}`),
  duplicate:   (id)     => api.post(`/invoices/${id}/duplicate`),
  markPaid:    (id, data) => api.post(`/invoices/${id}/mark-paid`, data),
  markUnpaid:  (id)     => api.post(`/invoices/${id}/mark-unpaid`),
  nextNumber:  ()       => api.get('/invoices/next-number'),
  downloadPDF: (id)     => `${api.defaults.baseURL}/invoices/${id}/pdf`,
  getRecycleBin: ()     => api.get('/invoices/recycle-bin'),
  restore:     (id)     => api.post(`/invoices/${id}/restore`),
  permanentDelete: (id) => api.delete(`/invoices/${id}/permanent`),
};

// ============================================================
// REPORTS API
// ============================================================
export const reportAPI = {
  dashboard:       () => api.get('/reports/dashboard'),
  monthlyRevenue:  (params) => api.get('/reports/monthly-revenue', { params }),
  topClients:      (params) => api.get('/reports/top-clients', { params }),
  unpaidInvoices:  (params) => api.get('/reports/unpaid-invoices', { params }),
  paidInvoices:    (params) => api.get('/reports/paid-invoices', { params }),
  taxSummary:      (params) => api.get('/reports/tax-summary', { params }),
  itemSales:       (params) => api.get('/reports/item-sales', { params }),
};

// ============================================================
// EMAIL API
// ============================================================
export const emailAPI = {
  sendInvoice:  (data) => api.post('/emails/send-invoice', data),
  sendReminder: (data) => api.post('/emails/send-reminder', data),
};

// ============================================================
// SETTINGS API
// ============================================================
export const settingsAPI = {
  get:         () => api.get('/settings'),
  update:      (data) => api.put('/settings', data),
  uploadImage: (field, dataUrl) => api.post('/settings/upload', { field, dataUrl }),
  removeImage: (field) => api.delete('/settings/upload', { data: { field } }),
  getEnv:      () => api.get('/settings/env'),
  updateEnv:   (data) => api.post('/settings/env', data),
};

export default api;
