import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Package, AlertTriangle,
  ShoppingCart, Banknote, Cog, RefreshCw
} from 'lucide-react';
import { reportsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const MONTH_NAMES = {
  '01':'Yan','02':'Fev','03':'Mar','04':'Apr','05':'May','06':'Iyn',
  '07':'Iyl','08':'Avg','09':'Sen','10':'Okt','11':'Noy','12':'Dek'
};

function KpiCard({ icon: Icon, iconBg, title, value, sub, trend }) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon ${iconBg}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`ml-auto flex items-center gap-1 text-sm font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsAPI.getDashboard().then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
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

  const profit = parseFloat(d.month?.profit || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Xush kelibsiz, {user?.full_name?.split(' ')[0]}!</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Yangilash
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={ShoppingCart} iconBg="bg-blue-500"
          title="Bugungi sotuv"
          value={`${fmt(d.today?.sales?.total)} so'm`}
          sub={`${d.today?.sales?.count || 0} ta sotuv`}
        />
        <KpiCard
          icon={TrendingUp} iconBg={profit >= 0 ? 'bg-green-500' : 'bg-red-500'}
          title="Bu oylik foyda"
          value={`${fmt(profit)} so'm`}
          sub={`Daromad: ${fmt(d.month?.sales?.total)} so'm`}
        />
        <KpiCard
          icon={Users} iconBg="bg-purple-500"
          title="Faol xodimlar"
          value={d.employees?.active || 0}
          sub={`Jami: ${d.employees?.total || 0} nafar`}
        />
        <KpiCard
          icon={Package} iconBg="bg-orange-500"
          title="Kam ombordagi"
          value={d.low_stock || 0}
          sub="mahsulot kamayib ketgan"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sotuv trendi */}
        <div className="card xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">6 Oylik Sotuv Trendi</h2>
          {salesTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000000).toFixed(0)}M`} />
                <Tooltip formatter={(v) => [`${fmt(v)} so'm`, 'Sotuv']} />
                <Area type="monotone" dataKey="sotuv" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Ma'lumot yo'q</div>
          )}
        </div>

        {/* Mashinalar holati */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Mashinalar Holati</h2>
          {machineData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={machineData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {machineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {machineData.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600">{m.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{m.value}</span>
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
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Bu Oylik Top Mahsulotlar</h2>
          {(d.top_products || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.top_products} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => [`${fmt(v)} so'm`]} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Bu oyda sotuv yo'q</div>
          )}
        </div>

        {/* Moliyaviy xulosa */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Bu Oylik Moliyaviy Xulosa</h2>
          <div className="space-y-3">
            {[
              { label: 'Jami daromad', value: fmt(d.month?.sales?.total), color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'To\'langan', value: fmt(d.month?.sales?.paid), color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Jami xarajat', value: fmt(d.month?.expenses), color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Sof foyda', value: fmt(profit), color: profit >= 0 ? 'text-green-700' : 'text-red-700', bg: profit >= 0 ? 'bg-green-50' : 'bg-red-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`flex items-center justify-between px-4 py-3 rounded-lg ${bg}`}>
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`font-bold text-sm ${color}`}>{value} so'm</span>
              </div>
            ))}
          </div>

          {d.low_stock > 0 && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-orange-50 rounded-lg border border-orange-200">
              <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700">
                {d.low_stock} ta mahsulot omborda kam!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
