import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, Factory,
  Banknote, Package, Warehouse, Cog, FileBarChart, Bot,
  LogOut, ChevronRight, UserSquare2, Wallet, ShieldCheck, PackagePlus, Truck, KeyRound, X, Sparkles, ShoppingBag, Boxes, History, RotateCcw, Scale, Store, MapPin, Recycle
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { authAPI } from '../../services/api';
import clsx from 'clsx';

const THEMES = [
  { id: 'white-red', label: 'Oq-Qizil', color: '#dc2626' },
  { id: 'indigo', label: 'Zangori', color: '#6366f1' },
];

const ROLE_LABELS = {
  OWNER: 'Ega / Rahbar',
  ACCOUNTANT: 'Buxgalter',
  SALES_HEAD: 'Sotuv Boshlig\'i',
  PRODUCTION_HEAD: 'Ishlab Chiqarish Boshlig\'i',
  KIRIMCHI: 'Mahsulot Kirimchi',
  OMBORCHI: 'Omborchi',
  TAMINOTCHI: "Ta'minotchi",
  AGENT: 'Sotuv agenti',
  SHOPIR: 'Haydovchi',
};

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Bosh Sahifa',      roles: null },
  { to: '/history',    icon: History,         label: 'Tarix',            roles: ['OWNER','ACCOUNTANT','SALES_HEAD','AGENT'] },
  { to: '/customers',  icon: UserSquare2,     label: 'Mijozlar',         roles: ['OWNER','ACCOUNTANT','SALES_HEAD','AGENT'] },
  { to: '/debts',      icon: Wallet,          label: 'Qarzlar',          roles: ['OWNER','ACCOUNTANT','SALES_HEAD'] },
  { to: '/vozvrat',    icon: RotateCcw,       label: 'Vozvratlar',       roles: ['OWNER','ACCOUNTANT','SALES_HEAD','AGENT'] },
  { to: '/deliveries', icon: Truck,           label: 'Yetkazib berish',  roles: ['OWNER','SALES_HEAD','SHOPIR'] },
  { to: '/vozvrat-karta', icon: RotateCcw,    label: 'Vozvrat kartasi',  roles: ['OWNER','SALES_HEAD','SHOPIR'] },
  { to: '/agent-locations', icon: MapPin,     label: 'Xodimlar joyi',    roles: ['OWNER','SALES_HEAD'] },
  { to: '/mijozlar-karta', icon: MapPin,      label: 'Mijozlar xaritasi', roles: ['OWNER','ACCOUNTANT','SALES_HEAD','AGENT'] },
  { to: '/expenses',   icon: Receipt,         label: 'Xarajatlar',       roles: ['OWNER','ACCOUNTANT','TAMINOTCHI'] },
  { to: '/employees',  icon: Users,           label: 'Xodimlar',         roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/production', icon: Factory,         label: 'Ishlab Chiqarish', roles: ['OWNER','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/intake',     icon: PackagePlus,     label: 'Kirim',            roles: ['OWNER','KIRIMCHI','SALES_HEAD','PRODUCTION_HEAD'] },
  { to: '/fulfillment',icon: Truck,           label: 'Ombor berish',     roles: ['OWNER','OMBORCHI','SALES_HEAD'] },
  { to: '/salaries',   icon: Banknote,        label: 'Maoshlar',         roles: ['OWNER','ACCOUNTANT'] },
  { to: '/products',   icon: Package,         label: 'Mahsulotlar',      roles: ['OWNER','PRODUCTION_HEAD','SALES_HEAD','KIRIMCHI'] },
  { to: '/components', icon: Boxes,           label: 'Komponentlar',     roles: ['OWNER','PRODUCTION_HEAD','KIRIMCHI'] },
  { to: '/quick-sale', icon: ShoppingBag,     label: 'Savdo qilish',     roles: ['OWNER','ACCOUNTANT','SALES_HEAD','AGENT'] },
  { to: '/inventory',  icon: Warehouse,       label: 'Ombor',            roles: ['OWNER','ACCOUNTANT','PRODUCTION_HEAD','KIRIMCHI','OMBORCHI','TAMINOTCHI','SALES_HEAD'] },
  { to: '/machines',   icon: Cog,             label: 'Mashinalar',       roles: ['OWNER','PRODUCTION_HEAD','CYCLE_TIME','KIRIMCHI'] },
  { to: '/branches',   icon: Store,           label: 'Filiallar',        roles: ['OWNER'] },
  // Tarozi — asosiy tizimda TAMINOTCHI chek chiqaradi; EGA cheklarni ko'radi
  { to: '/tarozi',        icon: Scale,        label: 'Tarozi',           roles: ['OWNER','TAMINOTCHI'] },
  { to: '/tarozi-cheklar', icon: Scale,       label: 'Tarozi cheklari',  roles: ['OWNER'] },
  { to: '/reports',    icon: FileBarChart,    label: 'Hisobotlar',       roles: ['OWNER','ACCOUNTANT'] },
  { to: '/users',      icon: ShieldCheck,     label: 'Foydalanuvchilar', roles: ['OWNER'] },
  { to: '/agent-profile', icon: UserSquare2,  label: 'Mening profilim',  roles: ['AGENT'] },
  { to: '/ai',         icon: Bot,             label: 'Lola',             roles: null },
  { to: '/worker',     icon: Sparkles,        label: 'AI Ishchi',        roles: ['OWNER','ACCOUNTANT'] },
];

export default function Sidebar() {
  const { user, logout, activeBranch, exitBranch } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const isIndigo = theme === 'indigo';

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

  // Filial konteksti: filial xodimi (branch_id) YOKI EGA filialga "admin sifatida" kirgan (activeBranch)
  const inBranchContext = !!(user?.branch_id || activeBranch);
  // Filialda ishlab chiqarish YO'Q — bu bo'limlar filialdan olib tashlanadi (zavodda qoladi)
  const HIDE_IN_BRANCH = ['/production', '/components', '/tarozi', '/tarozi-cheklar', '/ai', '/worker', '/machines', '/employees'];
  // Faqat FILIALDA ko'rinadi (asosiy tizim/zavodda YO'Q):
  // xodimlar joyi (GPS kuzatuv) va yetkazib berish (dostavka/shopir) — bular filial tizimi.
  const ONLY_IN_BRANCH = ['/agent-locations', '/deliveries', '/vozvrat-karta', '/mijozlar-karta'];
  const visibleItems = NAV_ITEMS.filter(item =>
    (!item.roles || item.roles.includes(user?.role)) &&
    !(inBranchContext && HIDE_IN_BRANCH.includes(item.to)) &&
    !(!inBranchContext && ONLY_IN_BRANCH.includes(item.to))
  );

  return (
    <>
    <aside className={clsx(
      "w-64 h-screen flex flex-col fixed left-0 top-0 z-30",
      isIndigo
        ? "bg-gradient-to-b from-[#1e1b4b] via-[#1e1b4b] to-[#0f0d2e] border-r border-indigo-900/50 shadow-[8px_0_30px_-15px_rgba(2,6,23,0.6)]"
        : "bg-white border-r border-gray-200 shadow-[2px_0_12px_-4px_rgba(0,0,0,0.08)]"
    )}>
      {/* Logo — 14-chi variant: Qizil qalqon */}
      <div className={clsx("px-5 py-4 border-b", isIndigo ? "border-white/5" : "border-gray-100")}>
        <div className="flex items-center gap-3">
          <svg width="38" height="38" viewBox="0 0 100 100" className="flex-shrink-0">
            {isIndigo ? (<>
              <path d="M50 5 L90 28 L90 72 L50 95 L10 72 L10 28Z" fill="#4338ca"/>
              <path d="M50 15 L82 34 L82 66 L50 85 L18 66 L18 34Z" fill="#6366f1"/>
              <path d="M38 42 L50 28 L62 42 L62 58 L50 68 L38 58Z" fill="#a5b4fc" opacity="0.3"/>
              <text x="35" y="60" fontFamily="system-ui" fontSize="32" fontWeight="900" fill="#fff">T</text>
            </>) : (<>
              <path d="M50 5 L90 28 L90 72 L50 95 L10 72 L10 28Z" fill="#b91c1c"/>
              <path d="M50 15 L82 34 L82 66 L50 85 L18 66 L18 34Z" fill="#dc2626"/>
              <path d="M38 42 L50 28 L62 42 L62 58 L50 68 L38 58Z" fill="#fca5a5" opacity="0.3"/>
              <text x="35" y="60" fontFamily="system-ui" fontSize="32" fontWeight="900" fill="#fff">T</text>
            </>)}
          </svg>
          <div>
            <h1 className={clsx("font-bold text-sm leading-tight tracking-wide", isIndigo ? "text-white" : "text-gray-900")}>TEKNOPLAST</h1>
            <p className={clsx("text-[11px]", isIndigo ? "text-indigo-300" : "text-gray-400")}>Boshqaruv Tizimi</p>
          </div>
        </div>
      </div>

      {/* EGA filialga "admin sifatida" kirgan bo'lsa — ogohlantiruvchi banner + chiqish */}
      {activeBranch && (
        <div className={clsx("mx-3 mt-3 rounded-xl p-3", isIndigo ? "bg-amber-500/10 border border-amber-400/30" : "bg-amber-50 border border-amber-200")}>
          <div className={clsx("flex items-center gap-2", isIndigo ? "text-amber-200" : "text-amber-700")}>
            <Store size={15} className="flex-shrink-0" />
            <div className="min-w-0">
              <p className={clsx("text-xs font-bold truncate", isIndigo ? "text-amber-200" : "text-amber-800")}>{activeBranch.name}</p>
              <p className={clsx("text-[10px] leading-tight", isIndigo ? "text-amber-400" : "text-amber-600")}>Filial ichidasiz (admin)</p>
            </div>
          </div>
          <button
            onClick={() => exitBranch()}
            className="mt-2 w-full text-xs font-medium bg-amber-500 text-white rounded-lg py-1.5 hover:bg-amber-600 flex items-center justify-center gap-1"
          >
            <LogOut size={12} /> Zavodga qaytish
          </button>
        </div>
      )}

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
      <div className={clsx("px-3 py-4 border-t", isIndigo ? "border-white/5" : "border-gray-100")}>
        {/* Tema almashtirish */}
        <div className="flex gap-1.5 px-1 mb-3">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={clsx(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                theme === t.id
                  ? (isIndigo ? "bg-indigo-600 text-white" : "bg-red-50 text-red-700 ring-1 ring-red-200")
                  : (isIndigo ? "text-slate-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100")
              )}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className={clsx("flex items-center gap-3 px-3 py-2 rounded-xl mb-2", isIndigo ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-200")}>
          <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", isIndigo ? "bg-gradient-to-br from-indigo-400 to-indigo-700 shadow-[0_4px_10px_-3px_rgba(99,102,241,0.6)]" : "bg-gradient-to-br from-red-500 to-red-700 shadow-[0_4px_10px_-3px_rgba(220,38,38,0.5)]")}>
            <span className="text-white font-semibold text-sm">
              {user?.full_name?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className={clsx("text-sm font-medium truncate", isIndigo ? "text-white" : "text-gray-900")}>{user?.full_name}</p>
            <p className={clsx("text-xs", isIndigo ? "text-slate-400" : "text-gray-500")}>{ROLE_LABELS[user?.role]}</p>
            {user?.branch_name && (
              <p className={clsx("text-[11px] font-medium flex items-center gap-0.5 truncate", isIndigo ? "text-indigo-300" : "text-red-600")}>
                <Store size={10} /> {user.branch_name}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowPwd(true)}
          className="sidebar-link w-full mb-1"
        >
          <KeyRound size={16} />
          <span>Parolni o'zgartirish</span>
        </button>
        <button
          onClick={handleLogout}
          className={clsx("sidebar-link w-full", isIndigo ? "!text-red-300 hover:!bg-red-500/10 hover:!text-red-200" : "!text-red-500 hover:!bg-red-50 hover:!text-red-600")}
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
