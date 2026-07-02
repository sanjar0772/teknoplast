import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import useAutoUpdate from './hooks/useAutoUpdate';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SalesPage from './pages/SalesPage';
import VozvratlarPage from './pages/VozvratlarPage';
import HistoryPage from './pages/HistoryPage';
import InvoicePage from './pages/InvoicePage';
import QuickSalePage from './pages/QuickSalePage';
import CustomersPage from './pages/CustomersPage';
import DebtsPage from './pages/DebtsPage';
import UsersPage from './pages/UsersPage';
import IntakePage from './pages/IntakePage';
import FulfillmentPage from './pages/FulfillmentPage';
import ExpensesPage from './pages/ExpensesPage';
import EmployeesPage from './pages/EmployeesPage';
import ProductionPage from './pages/ProductionPage';
import SalariesPage from './pages/SalariesPage';
import ProductsPage from './pages/ProductsPage';
import ComponentsPage from './pages/ComponentsPage';
import SmartProductsPage from './pages/SmartProductsPage';
import InventoryPage from './pages/InventoryPage';
import MachinesPage from './pages/MachinesPage';
import BranchesPage from './pages/BranchesPage';
import TaroziPage from './pages/TaroziPage';
import ReportsPage from './pages/ReportsPage';
import AIPage from './pages/AIPage';
import WorkerPage from './pages/WorkerPage';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

export default function App() {
  useAutoUpdate(); // yangi deploy chiqsa ilovani avtomatik yangilaydi
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />
        <Route path="/" element={
          <PrivateRoute><Layout /></PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="quick-sale" element={<QuickSalePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="vozvrat" element={<VozvratlarPage />} />
          <Route path="invoice/:id" element={<InvoicePage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="intake" element={<IntakePage />} />
          <Route path="fulfillment" element={<FulfillmentPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="production" element={<ProductionPage />} />
          <Route path="salaries" element={<SalariesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="components" element={<ComponentsPage />} />
          <Route path="products-grid" element={<SmartProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="machines" element={<MachinesPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="tarozi" element={<TaroziPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="ai" element={<AIPage />} />
          <Route path="worker" element={<WorkerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
