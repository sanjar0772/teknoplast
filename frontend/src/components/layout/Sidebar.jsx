import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, Factory,
  Banknote, Package, Warehouse, Cog, FileBarChart, Bot,
  LogOut, ChevronRight, UserSquare2, Zap, Sheet, Wallet, ShieldCheck, PackagePlus, Truck
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

const ROLE_LABELS = {
  OWNER: 'Ega / Rahbar',
  ACCOUNTANT: 'Buxgalter',
  SALES_HEAD: 'Sotuv Boshlig\'i',
  PRODUCTION_HEAD: 'Ishlab Chiqarish Boshlig\'i',
  KIRIMCHI: 'Mahsulot Kirimchi',
  OMBORCHI: 'Omborchi',
};

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Bosh Sahifa',      roles: null },
  { to: '/quick-sale', icon: Zap,             label: 'Tezkor Savdo',     roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/sales',      icon: ShoppingCart,    label: 'Sotuv tarixi',     roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/customers',  icon: UserSquare2,     label: 'Mijozlar',         roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/debts',      icon: Wallet,          label: 'Qarzlar',          roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/expenses',   icon: Receipt,         label: 'Xarajatlar',       roles: ['OWNER','ACCOUNTANT'] },
  { to: '/employees',  icon: Users,           label: 'Xodimlar',         roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD'] },
  { to: '/production', icon: Factory,         label: 'Ishlab Chiqarish', roles: ['OWNER','PRODUCTION_HEAD'] },
  { to: '/intake',     icon: PackagePlus,     label: 'Kirim',            roles: ['OWNER','KIRIMCHI','SALES_HEAD','PRODUCTION_HEAD'] },
  { to: '/fulfillment',icon: Truck,           label: 'Ombor berish',     roles: ['OWNER','OMBORCHI','SALES_HEAD'] },
  { to: '/salaries',   icon: Banknote,        label: 'Maoshlar',         roles: ['OWNER','ACCOUNTANT'] },
  { to: '/products',   icon: Package,         label: 'Mahsulotlar',      roles: ['OWNER','PRODUCTION_HEAD','SALES_HEAD','KIRIMCHI'] },
  { to: '/products-grid', icon: Sheet,        label: 'Smart Grid',       roles: ['OWNER','PRODUCTION_HEAD','SALES_HEAD','ACCOUNTANT'] },
  { to: '/inventory',  icon: Warehouse,       label: 'Ombor',            roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD','KIRIMCHI','OMBORCHI'] },
  { to: '/machines',   icon: Cog,             label: 'Mashinalar',       roles: ['OWNER','PRODUCTION_HEAD'] },
  { to: '/reports',    icon: FileBarChart,    label: 'Hisobotlar',       roles: ['OWNER','ACCOUNTANT'] },
  { to: '/users',      icon: ShieldCheck,     label: 'Foydalanuvchilar', roles: ['OWNER'] },
  { to: '/ai',         icon: Bot,             label: 'AI Yordamchi',     roles: null },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(user?.role)
  );

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-tight">TEKNOPLAST</h1>
            <p className="text-xs text-gray-400">Boshqaruv Tizimi</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx('sidebar-link', isActive && 'active')
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            <span className="flex-1">{label}</span>
            <ChevronRight size={12} className="opacity-40" />
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 mb-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 font-semibold text-sm">
              {user?.full_name?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role]}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={16} />
          <span>Chiqish</span>
        </button>
      </div>
    </aside>
  );
}
