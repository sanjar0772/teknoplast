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
  resetPassword: (id) => api.put(`/auth/users/${id}/reset-password`),
};

// Sales
export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  downloadInvoicePdf: (id) => api.get(`/sales/${id}/invoice-pdf`, { responseType: 'blob' }),
  getSummary: (params) => api.get('/sales/summary', { params }),
  create: (data) => api.post('/sales', data),
  createBulk: (data) => api.post('/sales/bulk', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  updateStatus: (id, data) => api.put(`/sales/${id}/status`, data),
  getPayments: (id) => api.get(`/sales/${id}/payments`),
  addPayment: (id, data) => api.post(`/sales/${id}/payments`, data),
  returnSale: (id, data) => api.post(`/sales/${id}/return`, data),
  getReturns: (id) => api.get(`/sales/${id}/returns`),
  getAllReturns: (params) => api.get('/sales/returns/all', { params }),
  resetReturns: () => api.post('/sales/returns/reset'),
  resetSales: () => api.post('/sales/reset'),
  delete: (id) => api.delete(`/sales/${id}`),
};

// Customers (CRM)
export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getSummary: () => api.get('/customers/summary'),
  getById: (id, params) => api.get(`/customers/${id}`, { params }),
  downloadExcel: (id) => api.get(`/customers/${id}/excel`, { responseType: 'blob' }),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// Intakes (Mahsulot kirim)
export const intakesAPI = {
  getAll: (params) => api.get('/intakes', { params }),
  getById: (id) => api.get(`/intakes/${id}`),
  downloadExcel: (params) => api.get('/intakes/excel', { params, responseType: 'blob' }),
  downloadPdf: (params) => api.get('/intakes/pdf', { params, responseType: 'blob' }),
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
  remove: (id) => api.delete(`/employees/${id}`),        // bitta xodimni butunlay o'chirish
  removeAll: () => api.delete('/employees/all'),          // hamma xodimni o'chirish
};

// Production
export const productionAPI = {
  getAll: (params) => api.get('/production', { params }),
  getSummary: (params) => api.get('/production/summary', { params }),
  getRangeSummary: (params) => api.get('/production/range-summary', { params }),
  getRangeSummaryExcel: (params) => api.get('/production/range-summary/excel', { params, responseType: 'blob' }),
  create: (data) => api.post('/production', data),
  bulk: (data) => api.post('/production/bulk', data),
  remove: (id) => api.delete(`/production/${id}`),
  removeAll: () => api.delete('/production/all'),
  getPending: () => api.get('/production/pending'),
  approveDay: (employee_id, production_date) => api.put('/production/approve-day', { employee_id, production_date }),
};

// Salaries
export const salariesAPI = {
  getAll: (params) => api.get('/salaries', { params }),
  calculate: (data) => api.post('/salaries/calculate', data),
  adjust: (id, data) => api.put(`/salaries/${id}/adjust`, data),
  approve: (id) => api.put(`/salaries/${id}/approve`),
  pay: (id) => api.put(`/salaries/${id}/pay`),
  getPlan: (params) => api.get('/salaries/plan', { params }),
  setPlan: (plan) => api.put('/salaries/plan', { plan }),
};

// Products
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getHistory: (id, params) => api.get(`/products/${id}/history`, { params }),
  exportHistoryExcel: (params) => api.get('/products/history/export/excel', { params, responseType: 'blob' }),
  exportHistoryPdf: (params) => api.get('/products/history/export/pdf', { params, responseType: 'blob' }),
  turnoverExcel: (params) => api.get('/products/turnover/excel', { params, responseType: 'blob' }),
  turnoverPdf: (params) => api.get('/products/turnover/pdf', { params, responseType: 'blob' }),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  updateBulk: (updates) => api.put('/products/bulk', { updates }),
  bulkDelete: (ids) => api.post('/products/bulk-delete', { ids }),
  resetAll: () => api.post('/products/reset-all'),
  resetStock: () => api.post('/products/reset-stock'),
  resetComponents: () => api.post('/products/components/reset'),
  updateStock: (id, data) => api.put(`/products/${id}/stock`, data),
  setPricing: (id, data) => api.put(`/products/${id}/pricing`, data),
  getRawMaterials: () => api.get('/products/raw-materials/list'),
  createRawMaterial: (data) => api.post('/products/raw-materials', data),
  updateRawMaterial: (id, data) => api.put(`/products/raw-materials/${id}`, data),
  updateRawMaterialStock: (id, data) => api.put(`/products/raw-materials/${id}/stock`, data),
  deleteRawMaterial: (id) => api.delete(`/products/raw-materials/${id}`),
  getRawMaterialRangeSummary: (params) => api.get('/products/raw-materials/range-summary', { params }),
  getRawMaterialRangeExcel: (params) => api.get('/products/raw-materials/range-summary/excel', { params, responseType: 'blob' }),
  getBom: (id) => api.get(`/products/${id}/bom`),
  addBomItem: (id, data) => api.post(`/products/${id}/bom`, data),
  removeBomItem: (id, componentId) => api.delete(`/products/${id}/bom/${componentId}`),
  importPricelist: () => api.post('/products/import-pricelist'),
};

// Machines
export const machinesAPI = {
  getAll: () => api.get('/machines'),
  create: (data) => api.post('/machines', data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  updateStatus: (id, data) => api.put(`/machines/${id}/status`, data),
  setRunning: (id, data) => api.put(`/machines/${id}/running`, data),
  getCycleTimes: (id) => api.get(`/machines/${id}/cycle-times`),
  setCycleTime: (id, data) => api.post(`/machines/${id}/cycle-times`, data),
  deleteCycleTime: (id, productId) => api.delete(`/machines/${id}/cycle-times/${productId}`),
  getDowntime: (id) => api.get(`/machines/${id}/downtime`),
  addDowntime: (id, data) => api.post(`/machines/${id}/downtime`, data),
};

// Reports
export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getMonthly: (params) => api.get('/reports/monthly', { params }),
  getDebts: (params) => api.get('/reports/debts', { params }),
  addDebt: (data) => api.post('/reports/debts', data),
  getDebtPayments: (params) => api.get('/reports/debt-payments', { params }),
  downloadPDF: (month) => api.get('/reports/pdf/monthly', { params: { month }, responseType: 'blob' }),
  downloadSalesExcel: (params) => api.get('/reports/excel/sales', { params: typeof params === 'string' ? { month: params } : params, responseType: 'blob' }),
  downloadSalaryExcel: (month) => api.get('/reports/excel/salaries', { params: { month }, responseType: 'blob' }),
  downloadInventory: (type, format) => api.get('/reports/inventory', { params: { type, format }, responseType: 'blob' }),
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
  tts: (text, language) => api.post('/ahmad/tts', { text, language }),
  dailyReport: (language) => api.get('/ahmad/daily-report', { params: { language } }),
  confirmAction: (action) => api.post('/ahmad/confirm-action', { action }),
  workerBriefing: (language) => api.post('/ahmad/worker-briefing', { language }),
  debtReminder: (data) => api.post('/ahmad/debt-reminder', data),
  auto: (task, language) => api.post('/ahmad/auto', { task, language }),
};

export default api;
