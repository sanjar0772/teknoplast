import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || 'Server xatosi';
    if (err.response?.status === 401) {
      // Sessiya tugagan/bekor — BARCHA auth holatini tozalaymiz (zikl bo'lmasligi uchun)
      localStorage.removeItem('token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('teknoplast-auth');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('auth_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    } else if (err.response?.status !== 404) {
      toast.error(msg);
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  register: (data) => api.post('/auth/register', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  getUsers: () => api.get('/auth/users'),
  toggleUser: (id) => api.put(`/auth/users/${id}/toggle`),
};

// Sales
export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  getSummary: (params) => api.get('/sales/summary', { params }),
  create: (data) => api.post('/sales', data),
  createBulk: (data) => api.post('/sales/bulk', data),
  updateStatus: (id, data) => api.put(`/sales/${id}/status`, data),
  getPayments: (id) => api.get(`/sales/${id}/payments`),
  addPayment: (id, data) => api.post(`/sales/${id}/payments`, data),
  delete: (id) => api.delete(`/sales/${id}`),
};

// Customers (CRM)
export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getSummary: () => api.get('/customers/summary'),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// Intakes (Mahsulot kirim)
export const intakesAPI = {
  getAll: (params) => api.get('/intakes', { params }),
  getById: (id) => api.get(`/intakes/${id}`),
  create: (data) => api.post('/intakes', data),
  approve: (id) => api.put(`/intakes/${id}/approve`),
  reject: (id) => api.put(`/intakes/${id}/reject`),
};

// Fulfillment (Omborchi — QR bo'yicha mahsulot berish)
export const fulfillmentAPI = {
  getAll: (params) => api.get('/fulfillment', { params }),
  getByRef: (ref) => api.get(`/fulfillment/${ref}`),
  deliver: (ref) => api.put(`/fulfillment/${ref}/deliver`),
  nakladnoy: (ref) => api.get(`/fulfillment/${ref}/nakladnoy`, { responseType: 'blob' }),
};

// Expenses
export const expensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getSummary: (params) => api.get('/expenses/summary', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// Employees
export const employeesAPI = {
  getAll: (params) => api.get('/employees', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
};

// Production
export const productionAPI = {
  getAll: (params) => api.get('/production', { params }),
  getSummary: (params) => api.get('/production/summary', { params }),
  create: (data) => api.post('/production', data),
  bulk: (data) => api.post('/production/bulk', data),
};

// Salaries
export const salariesAPI = {
  getAll: (params) => api.get('/salaries', { params }),
  calculate: (data) => api.post('/salaries/calculate', data),
  adjust: (id, data) => api.put(`/salaries/${id}/adjust`, data),
  approve: (id) => api.put(`/salaries/${id}/approve`),
  pay: (id) => api.put(`/salaries/${id}/pay`),
};

// Products
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  updateBulk: (updates) => api.put('/products/bulk', { updates }),
  bulkDelete: (ids) => api.post('/products/bulk-delete', { ids }),
  updateStock: (id, data) => api.put(`/products/${id}/stock`, data),
  setPricing: (id, data) => api.put(`/products/${id}/pricing`, data),
  getRawMaterials: () => api.get('/products/raw-materials/list'),
  createRawMaterial: (data) => api.post('/products/raw-materials', data),
  updateRawMaterialStock: (id, data) => api.put(`/products/raw-materials/${id}/stock`, data),
};

// Machines
export const machinesAPI = {
  getAll: () => api.get('/machines'),
  create: (data) => api.post('/machines', data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  updateStatus: (id, data) => api.put(`/machines/${id}/status`, data),
};

// Reports
export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getMonthly: (params) => api.get('/reports/monthly', { params }),
  getDebts: () => api.get('/reports/debts'),
  downloadPDF: (month) => api.get('/reports/pdf/monthly', { params: { month }, responseType: 'blob' }),
  downloadSalesExcel: (month) => api.get('/reports/excel/sales', { params: { month }, responseType: 'blob' }),
  downloadSalaryExcel: (month) => api.get('/reports/excel/salaries', { params: { month }, responseType: 'blob' }),
};

// AI
export const aiAPI = {
  getAlerts: () => api.get('/ai/alerts'),
  dismissAlert: (id) => api.put(`/ai/alerts/${id}/dismiss`),
  getSalaryAnalysis: (month) => api.get('/ai/salary-analysis', { params: { month } }),
  getSalesForecast: () => api.get('/ai/sales-forecast'),
  getExpenseOptimization: (month) => api.get('/ai/expense-optimization', { params: { month } }),
  chat: (question, language) => api.post('/ai/chat', { question, language }),
  getChatHistory: () => api.get('/ai/chat-history'),
};

// Ahmad — ovozli buyruq, hisobot, amal tasdiqlash
export const ahmadAPI = {
  command: (text, language, history) => api.post('/ahmad/command', { text, language, history }),
  dailyReport: (language) => api.get('/ahmad/daily-report', { params: { language } }),
  confirmAction: (action) => api.post('/ahmad/confirm-action', { action }),
};

export default api;
