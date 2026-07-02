import { useState } from 'react';
import { History, ShoppingCart, UserSquare2, Package, Wallet } from 'lucide-react';
import SalesPage from './SalesPage';
import CustomersPage from './CustomersPage';
import ProductsPage from './ProductsPage';
import KassaPage from './KassaPage';
import useAuthStore from '../store/authStore';

const TABS = [
  { key: 'kassa',     label: 'Kassa',           icon: Wallet,      mainOnly: true },
  { key: 'sales',     label: 'Sotuv tarixi',    icon: ShoppingCart },
  { key: 'customers', label: 'Mijoz tarixi',    icon: UserSquare2 },
  { key: 'products',  label: 'Mahsulot tarixi', icon: Package },
];

// Tarix — bitta joyda barcha tarix: kassa, sotuv, mijoz va mahsulot
export default function HistoryPage() {
  const [tab, setTab] = useState('sales');
  const { user, activeBranch } = useAuthStore();
  // Kassa hozircha faqat asosiy tizimda (zavod) — filial kontekstida ko'rinmaydi
  const inBranch = !!(user?.branch_id || activeBranch);
  const visibleTabs = TABS.filter(t => !(t.mainOnly && inBranch));

  return (
    <div className="space-y-5">
      <div className="page-header no-print">
        <h1 className="page-title flex items-center gap-2"><History size={22} /> Tarix</h1>
      </div>

      {/* Tablar — Kassa / Sotuv / Mijoz / Mahsulot tarixi */}
      <div className="flex gap-2 flex-wrap no-print">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`btn-sm flex items-center gap-1.5 rounded-lg px-4 font-medium ${
              tab === key
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tanlangan tarix */}
      <div className="border-t border-gray-100 pt-4">
        {tab === 'kassa' && !inBranch && <KassaPage />}
        {tab === 'sales' && <SalesPage embedded />}
        {tab === 'customers' && <CustomersPage embedded />}
        {tab === 'products' && <ProductsPage embedded />}
      </div>
    </div>
  );
}
