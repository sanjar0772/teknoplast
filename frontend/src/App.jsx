import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import useThemeStore from './store/themeStore';
import useAutoUpdate from './hooks/useAutoUpdate';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';

// SAHIFALARNI BO'LIB YUKLASH (v233 upgrade): butun dastur bitta katta fayl
// o'rniga har sahifa alohida kichik bo'lak (chunk) bo'lib yuklanadi —
// birinchi ochilish ancha tez, keyingi sahifalar bosilganda yuklanadi.
// Yangi deploydan keyin eski bo'lak topilmasa — sahifa BIR MARTA avtomatik
// yangilanadi (cheksiz reload'dan sessionStorage bayrog'i saqlaydi).
const lazyPage = (loader) => lazy(() =>
  loader().catch(() => {
    if (!sessionStorage.getItem('chunk_reload')) {
      sessionStorage.setItem('chunk_reload', '1');
      window.location.reload();
    }
    return new Promise(() => {}); // reload ketmoqda — hech narsa render qilmaymiz
  })
);

const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const SalesPage = lazyPage(() => import('./pages/SalesPage'));
const VozvratlarPage = lazyPage(() => import('./pages/VozvratlarPage'));
const HistoryPage = lazyPage(() => import('./pages/HistoryPage'));
const InvoicePage = lazyPage(() => import('./pages/InvoicePage'));
const QuickSalePage = lazyPage(() => import('./pages/QuickSalePage'));
const CustomersPage = lazyPage(() => import('./pages/CustomersPage'));
const DebtsPage = lazyPage(() => import('./pages/DebtsPage'));
const UsersPage = lazyPage(() => import('./pages/UsersPage'));
const IntakePage = lazyPage(() => import('./pages/IntakePage'));
const FulfillmentPage = lazyPage(() => import('./pages/FulfillmentPage'));
const ExpensesPage = lazyPage(() => import('./pages/ExpensesPage'));
const EmployeesPage = lazyPage(() => import('./pages/EmployeesPage'));
const ProductionPage = lazyPage(() => import('./pages/ProductionPage'));
const SalariesPage = lazyPage(() => import('./pages/SalariesPage'));
const ProductsPage = lazyPage(() => import('./pages/ProductsPage'));
const ComponentsPage = lazyPage(() => import('./pages/ComponentsPage'));
const SmartProductsPage = lazyPage(() => import('./pages/SmartProductsPage'));
const InventoryPage = lazyPage(() => import('./pages/InventoryPage'));
const MachinesPage = lazyPage(() => import('./pages/MachinesPage'));
const DrobilkaPage = lazyPage(() => import('./pages/DrobilkaPage'));
const DrobilkaOmborPage = lazyPage(() => import('./pages/DrobilkaOmborPage'));
const BranchesPage = lazyPage(() => import('./pages/BranchesPage'));
const TaroziPage = lazyPage(() => import('./pages/TaroziPage'));
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'));
const AIPage = lazyPage(() => import('./pages/AIPage'));
const WorkerPage = lazyPage(() => import('./pages/WorkerPage'));
const AgentProfilePage = lazyPage(() => import('./pages/AgentProfilePage'));
const DeliveriesPage = lazyPage(() => import('./pages/DeliveriesPage'));
const VozvratKartaPage = lazyPage(() => import('./pages/VozvratKartaPage'));
const AgentLocationsPage = lazyPage(() => import('./pages/AgentLocationsPage'));
const MijozlarKartaPage = lazyPage(() => import('./pages/MijozlarKartaPage'));
const TaroziChekPage = lazyPage(() => import('./pages/TaroziChekPage'));

// Sahifa bo'lagi yuklanayotganda ko'rinadigan yengil indikator
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Yuklanmoqda...
    </div>
  );
}

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

useThemeStore.getState().initTheme();

export default function App() {
  useAutoUpdate();
  // Dastur muvaffaqiyatli ochildi — chunk-reload bayrog'ini tozalaymiz
  useEffect(() => { sessionStorage.removeItem('chunk_reload'); }, []);
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
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
            <Route path="drobilka" element={<DrobilkaPage />} />
            <Route path="drobilka-ombori" element={<DrobilkaOmborPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="tarozi" element={<TaroziPage />} />
            <Route path="tarozi-cheklar" element={<TaroziChekPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="agent-profile" element={<AgentProfilePage />} />
            <Route path="deliveries" element={<DeliveriesPage />} />
            <Route path="vozvrat-karta" element={<VozvratKartaPage />} />
            <Route path="agent-locations" element={<AgentLocationsPage />} />
            <Route path="mijozlar-karta" element={<MijozlarKartaPage />} />
            <Route path="ai" element={<AIPage />} />
            <Route path="worker" element={<WorkerPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
