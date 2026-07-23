import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Package, AlertTriangle,
  ShoppingCart, Banknote, Cog, RefreshCw, Target, Receipt, Wallet, Clock, X, ChevronRight
} from 'lucide-react';
import { reportsAPI, salariesAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const MONTH_NAMES = {
  '01':'Yan','02':'Fev','03':'Mar','04':'Apr','05':'May','06':'Iyn',
  '07':'Iyl','08':'Avg','09':'Sen','10':'Okt','11':'Noy','12':'Dek'
};

// Mashina holati bo'yicha rang (tartibga bog'liq emas)
const MACHINE_COLORS = { 'Ishlayapti': '#10b981', 'Buzilgan': '#ef4444', "Ta'mirda": '#f59e0b' };

// Raqam "o'sib chiqadi" — kuchli jonli effekt (v234 3D dashboard).
// MUHIM: oyna fon rejimida bo'lsa rAF ishlamaydi — setTimeout zaxirasi
// baribir oxirgi to'g'ri qiymatni qo'yadi (raqam 0 da qotib qolmaydi).
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = parseFloat(target) || 0;
    if (!t) { setVal(t); return; }
    let raf;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out
      setVal(t * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const safety = setTimeout(() => setVal(t), duration + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [target, duration]);
  return val;
}

// 3D KPI plitka — rangli shisha, gloss, hover'da nur o'tadi, raqam o'sib chiqadi
function Kpi3D({ icon: Icon, color, title, value, sub, isMoney = false }) {
  const n = useCountUp(value);
  return (
    <div className={`kpi3d kpi3d-${color}`}>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">{title}</p>
          <p className="text-2xl font-extrabold text-white truncate mt-1" style={{ textShadow: '0 2px 4px rgba(15,23,42,0.25)' }}>
            {fmt(n)}{isMoney ? <span className="text-sm font-semibold text-white/80"> so'm</span> : ''}
          </p>
          {sub && <p className="text-[11px] text-white/70 mt-1">{sub}</p>}
        </div>
        <div className="kpi3d-icon"><Icon size={22} className="text-white" /></div>
      </div>
    </div>
  );
}

// Qora "kokpit" hero panel — salomlashuv, jonli soat, yangilash
function Hero3D({ user, onRefresh }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hero3d">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
            Xush kelibsiz, {user?.full_name?.split(' ')[0]}! 👋
          </h1>
          <p className="text-sm text-white/60 mt-1 capitalize">
            {now.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-2xl px-4 py-2.5"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 20px -10px rgba(0,0,0,0.5)' }}>
            <Clock size={18} className="text-white/70" />
            <span className="font-mono text-xl font-bold tracking-widest tabular-nums">
              {now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 text-sm font-semibold bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl px-3.5 py-2.5 transition"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
            <RefreshCw size={14} /> Yangilash
          </button>
        </div>
      </div>
    </div>
  );
}

// Grafik kartasi sarlavhasi — rangli chip bilan. onClick berilsa bosiladigan bo'ladi
// ("Bu Oylik Top Mahsulotlar" — to'liq ro'yxatni ochish uchun).
function ChartTitle({ icon: Icon, color, children, onClick }) {
  return (
    <div className={`flex items-center justify-between gap-2 mb-4 ${onClick ? 'cursor-pointer group' : ''}`}
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}
          style={{ boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.5), 0 4px 10px -4px rgba(15,23,42,0.35)' }}>
          <Icon size={14} className="text-white" />
        </div>
        <h2 className={`text-sm font-bold text-gray-800 ${onClick ? 'group-hover:text-blue-700' : ''}`}>{children}</h2>
      </div>
      {onClick && (
        <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
          Barchasi <ChevronRight size={13} />
        </span>
      )}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12, border: '1px solid #e5e7eb',
  boxShadow: '0 12px 28px -12px rgba(15,23,42,0.3)', fontSize: 12,
};

// "Bu Oylik Top Mahsulotlar" bosilganda — to'liq ro'yxat (dashboard'da faqat 5 tasi ko'rinadi)
function TopProductsModal({ month, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['top-products-full', month],
    queryFn: () => reportsAPI.getTopProducts({ month }).then(r => r.data),
  });
  const products = data?.products || [];
  const totalRevenue = products.reduce((s, p) => s + (parseFloat(p.revenue) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Package size={18} className="text-indigo-500" /> Bu Oylik Top Mahsulotlar</h3>
            <p className="text-xs text-gray-400 mt-0.5">{month} · {products.length} ta mahsulot · jami {fmt(totalRevenue)} so'm</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5 pt-3">
          {isLoading ? (
            <p className="text-center text-gray-400 text-sm py-10">Yuklanmoqda...</p>
          ) : !products.length ? (
            <p className="text-center text-gray-400 text-sm py-10">Bu oyda sotuv yo'q</p>
          ) : (
            <div className="space-y-1.5">
              {products.map((p, i) => {
                const share = totalRevenue > 0 ? (parseFloat(p.revenue) / totalRevenue) * 100 : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                        <p className="font-bold text-gray-900 text-sm whitespace-nowrap">{fmt(p.revenue)} so'm</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(2, share)}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmt(p.qty)} {p.unit || 'dona'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isOwner } = useAuthStore();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsAPI.getDashboard().then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });
  const [showTopProducts, setShowTopProducts] = useState(false);

  // Oylik savdo reja (faqat EGA belgilaydi) — bosh sahifada ko'rinadi
  const planMonth = new Date().toISOString().slice(0, 7);
  const { data: planData } = useQuery({
    queryKey: ['salary-plan', planMonth],
    queryFn: () => salariesAPI.getPlan({ month: planMonth }).then(r => r.data),
    enabled: isOwner(),
  });
  const [planInput, setPlanInput] = useState('');
  useEffect(() => { if (planData) setPlanInput(planData.plan || ''); }, [planData]);
  const setPlanMutation = useMutation({
    mutationFn: (plan) => salariesAPI.setPlan(plan),
    onSuccess: () => { toast.success('✅ Oylik savdo reja saqlandi'); qc.invalidateQueries({ queryKey: ['salary-plan'] }); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Saqlashda xato'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="animate-spin mx-auto mb-2 text-blue-600" size={28} />
        <p className="text-gray-500 text-sm">Yuklanmoqda...</p>
      </div>
    </div>
  );

  const d = data || {};
  const salesTrend = (d.sales_trend || []).map(s => ({
    month: MONTH_NAMES[s.month?.slice(5, 7)] || s.month,
    sotuv: parseFloat(s.revenue || 0),
    count: parseInt(s.count || 0),
  }));

  const machineData = Object.entries(d.machines || {}).map(([k, v]) => ({
    name: k === 'WORKING' ? 'Ishlayapti' : k === 'BROKEN' ? 'Buzilgan' : 'Ta\'mirda',
    value: v,
  }));
  const machineTotal = machineData.reduce((s, m) => s + (parseInt(m.value) || 0), 0);

  const profit = parseFloat(d.month?.profit || 0);

  // ── SAVDO BOSHLIG'I (SALES_HEAD) — faqat sotuvga oid ko'rinish ──
  if (user?.role === 'SALES_HEAD') {
    const monthTotal = parseFloat(d.month?.sales?.total || 0);
    const monthPaid = parseFloat(d.month?.sales?.paid || 0);
    const monthDebt = Math.max(0, monthTotal - monthPaid);
    const topProducts = d.top_products || [];
    return (
      <div className="space-y-6">
        <Hero3D user={user} onRefresh={() => refetch()} />

        {/* Sotuv KPI'lari — 3D plitkalar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi3D icon={ShoppingCart} color="blue" title="Bugungi sotuv"
            value={d.today?.sales?.total} isMoney sub={`${d.today?.sales?.count || 0} ta sotuv`} />
          <Kpi3D icon={TrendingUp} color="green" title="Bu oylik sotuv"
            value={monthTotal} isMoney sub="jami daromad" />
          <Kpi3D icon={Banknote} color="purple" title="To'langan"
            value={monthPaid} isMoney sub="bu oy" />
          <Kpi3D icon={TrendingDown} color="orange" title="Qarz (kutilmoqda)"
            value={monthDebt} isMoney sub="to'lanmagan" />
        </div>

        {/* 6 oylik sotuv trendi (tarix) */}
        <div className="card">
          <ChartTitle icon={TrendingUp} color="bg-blue-500">6 Oylik Sotuv Tarixi</ChartTitle>
          {salesTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="shSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${fmt(v)} so'm`, 'Sotuv']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="sotuv" stroke="#3b82f6" fill="url(#shSalesGrad)" strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Ma'lumot yo'q</div>
          )}
        </div>

        {/* Top mahsulotlar — diagramma + jadval */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card">
            <ChartTitle icon={Package} color="bg-indigo-500" onClick={() => setShowTopProducts(true)}>Bu Oylik Top Mahsulotlar</ChartTitle>
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topProducts} layout="vertical">
                  <defs>
                    <linearGradient id="shBarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`${fmt(v)} so'm`]} contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" fill="url(#shBarGrad)" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Bu oyda sotuv yo'q</div>
            )}
          </div>

          <div className="card">
            <ChartTitle icon={Receipt} color="bg-emerald-500">Top Mahsulotlar — tafsilot</ChartTitle>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Mahsulot</th><th>Sotilgan</th><th>Daromad</th></tr>
                </thead>
                <tbody>
                  {topProducts.length > 0 ? topProducts.map((p, i) => (
                    <tr key={i}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td className="font-medium text-gray-900">{p.name}</td>
                      <td>{fmt(p.qty)}</td>
                      <td className="font-semibold text-blue-700">{fmt(p.revenue)} so'm</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Bu oyda sotuv yo'q</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showTopProducts && <TopProductsModal month={planMonth} onClose={() => setShowTopProducts(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero — qora kokpit panel, jonli soat */}
      <Hero3D user={user} onRefresh={() => refetch()} />

      {/* Oylik savdo reja — faqat EGA belgilaydi */}
      {isOwner() && (
        <div className="card p-5 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.4), 0 8px 16px -8px rgba(79,70,229,0.6)' }}>
                <Target size={22} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Oylik savdo reja (bonus uchun)</p>
                <p className="text-xs text-gray-500">Savdo rejadan oshsa — oylik/foizli xodimlar oyligiga shuncha % bonus qo'shiladi</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number" min="0" value={planInput}
                onChange={e => setPlanInput(e.target.value)}
                placeholder="Reja summasi (so'm)"
                className="input w-52" />
              <button onClick={() => setPlanMutation.mutate(Number(planInput) || 0)}
                disabled={setPlanMutation.isPending}
                className="btn-primary btn-sm whitespace-nowrap">
                {setPlanMutation.isPending ? 'Saqlanmoqda...' : 'Reja saqlash'}
              </button>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Bu oy savdo</p>
                <p className="font-bold text-gray-900">{fmt(planData?.actual_sales)} so'm</p>
              </div>
              <div className="text-gray-300">/</div>
              <div>
                <p className="text-xs text-gray-400">Reja</p>
                <p className="font-bold text-gray-900">{fmt(planData?.plan)} so'm</p>
              </div>
              <div className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                planData?.overage_pct > 0 ? 'bg-green-100 text-green-700' :
                planData?.plan > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                <TrendingUp size={14} />
                {planData?.overage_pct > 0
                  ? `+${planData.overage_pct}% bonus`
                  : (planData?.plan > 0 ? 'Reja bajarilmadi' : 'Reja belgilanmagan')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI 3D plitkalar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi3D
          icon={ShoppingCart} color="blue"
          title="Bugungi sotuv"
          value={d.today?.sales?.total} isMoney
          sub={`${d.today?.sales?.count || 0} ta sotuv`}
        />
        <Kpi3D
          icon={profit >= 0 ? TrendingUp : TrendingDown} color={profit >= 0 ? 'green' : 'red'}
          title="Bu oylik foyda"
          value={profit} isMoney
          sub={`Daromad: ${fmt(d.month?.sales?.total)} so'm`}
        />
        <Kpi3D
          icon={Users} color="purple"
          title="Faol xodimlar"
          value={d.employees?.active || 0}
          sub={`Jami: ${d.employees?.total || 0} nafar`}
        />
        <Kpi3D
          icon={Package} color="orange"
          title="Kam ombordagi"
          value={d.low_stock || 0}
          sub="mahsulot kamayib ketgan"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sotuv trendi */}
        <div className="card xl:col-span-2">
          <ChartTitle icon={TrendingUp} color="bg-blue-500">6 Oylik Sotuv Trendi</ChartTitle>
          {salesTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${fmt(v)} so'm`, 'Sotuv']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="sotuv" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Ma'lumot yo'q</div>
          )}
        </div>

        {/* Mashinalar holati — markazida jami soni */}
        <div className="card">
          <ChartTitle icon={Cog} color="bg-slate-600">Mashinalar Holati</ChartTitle>
          {machineData.length > 0 ? (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={machineData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                      paddingAngle={4} cornerRadius={6} dataKey="value">
                      {machineData.map((m, i) => <Cell key={i} fill={MACHINE_COLORS[m.name] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-extrabold text-gray-900 leading-none">{machineTotal}</p>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">stanok</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mt-2">
                {machineData.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-gray-50"
                    style={{ boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.04)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{
                        background: MACHINE_COLORS[m.name] || '#94a3b8',
                        boxShadow: `0 0 6px ${MACHINE_COLORS[m.name] || '#94a3b8'}66`,
                      }} />
                      <span className="text-gray-600">{m.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">{m.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-52 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Cog size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Mashinalar yo'q</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top products + Moliyaviy */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top mahsulotlar */}
        <div className="card">
          <ChartTitle icon={Package} color="bg-indigo-500" onClick={() => setShowTopProducts(true)}>Bu Oylik Top Mahsulotlar</ChartTitle>
          {(d.top_products || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.top_products} layout="vertical">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => [`${fmt(v)} so'm`]} contentStyle={tooltipStyle} />
                <Bar dataKey="revenue" fill="url(#barGrad)" radius={[0, 8, 8, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Bu oyda sotuv yo'q</div>
          )}
        </div>

        {/* Moliyaviy xulosa — 3D plitkali */}
        <div className="card">
          <ChartTitle icon={Wallet} color="bg-emerald-500">Bu Oylik Moliyaviy Xulosa</ChartTitle>
          <div className="space-y-3">
            {[
              { label: 'Jami daromad', value: fmt(d.month?.sales?.total), icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50', ibg: 'bg-blue-500' },
              { label: 'To\'langan', value: fmt(d.month?.sales?.paid), icon: Banknote, color: 'text-green-700', bg: 'bg-green-50', ibg: 'bg-green-500' },
              { label: 'Jami xarajat', value: fmt(d.month?.expenses), icon: Receipt, color: 'text-red-700', bg: 'bg-red-50', ibg: 'bg-red-500' },
            ].map(({ label, value, icon: Icon, color, bg, ibg }) => (
              <div key={label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${bg}`}
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 10px -6px rgba(15,23,42,0.15)' }}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ibg}`}
                    style={{ boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.5), 0 4px 8px -4px rgba(15,23,42,0.3)' }}>
                    <Icon size={13} className="text-white" />
                  </div>
                  <span className="text-sm text-gray-600 font-medium">{label}</span>
                </div>
                <span className={`font-bold text-sm ${color}`}>{value} so'm</span>
              </div>
            ))}
            {/* Sof foyda — katta 3D plitka */}
            <div className={`kpi3d ${profit >= 0 ? 'kpi3d-green' : 'kpi3d-red'} !p-4`}>
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="kpi3d-icon !w-9 !h-9 !rounded-xl">
                    {profit >= 0 ? <TrendingUp size={17} className="text-white" /> : <TrendingDown size={17} className="text-white" />}
                  </div>
                  <span className="text-sm font-bold text-white/90">Sof foyda</span>
                </div>
                <span className="text-xl font-extrabold text-white" style={{ textShadow: '0 2px 4px rgba(15,23,42,0.3)' }}>
                  {fmt(profit)} so'm
                </span>
              </div>
            </div>
          </div>

          {d.low_stock > 0 && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-orange-50 rounded-xl border border-orange-200"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px -8px rgba(245,158,11,0.4)' }}>
              <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700 font-medium">
                {d.low_stock} ta mahsulot omborda kam!
              </p>
            </div>
          )}
        </div>
      </div>

      {showTopProducts && <TopProductsModal month={planMonth} onClose={() => setShowTopProducts(false)} />}
    </div>
  );
}
