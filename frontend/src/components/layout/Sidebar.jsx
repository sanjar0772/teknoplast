import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, Factory,
  Banknote, Package, Warehouse, Cog, FileBarChart, Bot,
  LogOut, ChevronRight, UserSquare2, Wallet, ShieldCheck, PackagePlus, Truck, KeyRound, X, Sparkles, ShoppingBag, Boxes, History, RotateCcw
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { authAPI } from '../../services/api';
import clsx from 'clsx';

const ROLE_LABELS = {
  OWNER: 'Ega / Rahbar',
  ACCOUNTANT: 'Buxgalter',
  SALES_HEAD: 'Sotuv Boshlig\'i',
  PRODUCTION_HEAD: 'Ishlab Chiqarish Boshlig\'i',
  KIRIMCHI: 'Mahsulot Kirimchi',
  OMBORCHI: 'Omborchi',
  TAMINOTCHI: "Ta'minotchi",
};

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Bosh Sahifa',      roles: null },
  { to: '/history',    icon: History,         label: 'Tarix',            roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/customers',  icon: UserSquare2,     label: 'Mijozlar',         roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/debts',      icon: Wallet,          label: 'Qarzlar',          roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/vozvrat',    icon: RotateCcw,       label: 'Vozvratlar',       roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/expenses',   icon: Receipt,         label: 'Xarajatlar',       roles: ['OWNER','ACCOUNTANT','TAMINOTCHI'] },
  { to: '/employees',  icon: Users,           label: 'Xodimlar',         roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/production', icon: Factory,         label: 'Ishlab Chiqarish', roles: ['OWNER','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/intake',     icon: PackagePlus,     label: 'Kirim',            roles: ['OWNER','KIRIMCHI','SALES_HEAD','PRODUCTION_HEAD'] },
  { to: '/fulfillment',icon: Truck,           label: 'Ombor berish',     roles: ['OWNER','OMBORCHI','SALES_HEAD'] },
  { to: '/salaries',   icon: Banknote,        label: 'Maoshlar',         roles: ['OWNER','ACCOUNTANT'] },
  { to: '/products',   icon: Package,         label: 'Mahsulotlar',      roles: ['OWNER','PRODUCTION_HEAD','SALES_HEAD','KIRIMCHI'] },
  { to: '/components', icon: Boxes,           label: 'Komponentlar',     roles: ['OWNER','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/quick-sale', icon: ShoppingBag,     label: 'Savdo qilish',     roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/inventory',  icon: Warehouse,       label: 'Ombor',            roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD','KIRIMCHI','OMBORCHI','TAMINOTCHI','SALES_HEAD'] },
  { to: '/machines',   icon: Cog,             label: 'Mashinalar',       roles: ['OWNER','PRODUCTION_HEAD'] },
  { to: '/reports',    icon: FileBarChart,    label: 'Hisobotlar',       roles: ['OWNER','ACCOUNTANT'] },
  { to: '/users',      icon: ShieldCheck,     label: 'Foydalanuvchilar', roles: ['OWNER'] },
  { to: '/ai',         icon: Bot,             label: 'Lola',             roles: null },
  { to: '/worker',     icon: Sparkles,        label: 'AI Ishchi',        roles: ['OWNER','ACCOUNTANT'] },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', confirm: '' });
  const pwdMutation = useMutation({
    mutationFn: (d) => authAPI.changePassword(d),
    onSuccess: () => {
      toast.success('Parol o\'zgartirildi');
      setShowPwd(false);
      setPwd({ old_password: '', new_password: '', confirm: '' });
    },
    onError: (e) => toast.error(e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || 'Xato'),
  });
  const submitPwd = () => {
    if (pwd.new_password.length < 6) return toast.error('Yangi parol kamida 6 belgi');
    if (pwd.new_password !== pwd.confirm) return toast.error('Parollar mos kelmadi');
    pwdMutation.mutate({ old_password: pwd.old_password, new_password: pwd.new_password });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(user?.role)
  );

  return (
    <>
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
        {visibleItems.map(({ to, icon: Icon, label }, idx) => (
          <NavLink
            key={`${to}-${idx}`}
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
          onClick={() => setShowPwd(true)}
          className="sidebar-link w-full text-gray-600 hover:bg-gray-100 mb-1"
        >
          <KeyRound size={16} />
          <span>Parolni o'zgartirish</span>
        </button>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={16} />
          <span>Chiqish</span>
        </button>
      </div>
    </aside>

    {/* Parolni o'zgartirish oynasi */}
    {showPwd && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowPwd(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Parolni o'zgartirish</h3>
            <button onClick={() => setShowPwd(false)}><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Eski parol</label>
              <input type="password" value={pwd.old_password}
                onChange={e => setPwd(p => ({ ...p, old_password: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Yangi parol (kamida 6 belgi)</label>
              <input type="password" value={pwd.new_password}
                onChange={e => setPwd(p => ({ ...p, new_password: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Yangi parolni takrorlang</label>
              <input type="password" value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} className="input"
                onKeyDown={e => e.key === 'Enter' && submitPwd()} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowPwd(false)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitPwd} disabled={pwdMutation.isPending} className="btn-primary flex-1">
                {pwdMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
