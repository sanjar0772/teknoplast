import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import { reportsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function ReportsPage() {
  const { isOwner, isAccountant } = useAuthStore();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-report', month],
    queryFn: () => reportsAPI.getMonthly({ month }).then(r => r.data),
  });

  const downloadPDF = async () => {
    try {
      const res = await reportsAPI.downloadPDF(month);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `teknoplast-${month}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF yuklab olindi');
    } catch { toast.error('PDF yaratishda xato'); }
  };

  const downloadSalesExcel = async () => {
    try {
      const res = await reportsAPI.downloadSalesExcel(month);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `sotuv-${month}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Excel yuklab bo\'lmadi'); }
  };

  const downloadSalaryExcel = async () => {
    try {
      const res = await reportsAPI.downloadSalaryExcel(month);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `maoshlar-${month}.xlsx`; a.click();
    } catch { toast.error('Excel yuklab bo\'lmadi'); }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Yuklanmoqda...</div>
  );

  const pl = data?.profit_loss || {};
  const isProfit = parseFloat(pl.profit || 0) >= 0;

  const expenseChart = (data?.expenses?.by_category || []).map(c => ({
    name: c.category.replace('_', ' '),
    amount: parseFloat(c.total),
  }));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Hisobotlar</h1>
        <div className="flex gap-2 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
          {(isOwner() || isAccountant()) && (
            <>
              <button onClick={downloadPDF} className="btn-secondary btn-sm">
                <FileText size={14} /> PDF
              </button>
              <button onClick={downloadSalesExcel} className="btn-secondary btn-sm">
                <Download size={14} /> Sotuv Excel
              </button>
              <button onClick={downloadSalaryExcel} className="btn-secondary btn-sm">
                <Download size={14} /> Maosh Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profit/Loss banner */}
      <div className={`rounded-xl p-6 ${isProfit ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isProfit ? 'bg-green-100' : 'bg-red-100'}`}>
            {isProfit ? <TrendingUp className="text-green-600" /> : <TrendingDown className="text-red-600" />}
          </div>
          <div>
            <p className="text-sm text-gray-600">{month} — Sof {isProfit ? 'Foyda' : 'Zarar'}</p>
            <p className={`text-3xl font-bold ${isProfit ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(Math.abs(pl.profit))} so'm
            </p>
            <p className="text-sm text-gray-500">
              Foyda ulushi: <strong>{pl.margin || 0}%</strong>
            </p>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Jami daromad', value: fmt(pl.revenue), color: 'text-blue-600' },
          { label: 'Jami xarajat', value: fmt(pl.expenses), color: 'text-red-600' },
          { label: 'Sotuvlar soni', value: data?.sales?.count || 0, color: 'text-gray-900' },
          { label: 'Ishlab chiqarildi', value: `${fmt(data?.production?.total_qty)} dona`, color: 'text-purple-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Daromad vs Xarajat */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Daromad vs Xarajat</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[{ name: month, daromad: parseFloat(pl.revenue || 0), xarajat: parseFloat(pl.expenses || 0), foyda: parseFloat(pl.profit || 0) }]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={v => `${(v/1000000).toFixed(0)}M`} />
              <Tooltip formatter={v => `${fmt(v)} so'm`} />
              <Legend />
              <Bar dataKey="daromad" fill="#3b82f6" radius={4} />
              <Bar dataKey="xarajat" fill="#ef4444" radius={4} />
              <Bar dataKey="foyda" fill="#10b981" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Xarajatlar breakdown */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Xarajatlar Tarkibi</h2>
          {expenseChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={expenseChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `${fmt(v)} so'm`} />
                <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-gray-400">Xarajat yo'q</div>}
        </div>
      </div>

      {/* Detailed tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Sotuv xulosasi */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sotuv Xulosasi</h2>
          <div className="space-y-3">
            {[
              { label: 'Jami sotuv', value: fmt(data?.sales?.total) },
              { label: "To'langan", value: fmt(data?.sales?.paid) },
              { label: 'Sotuvlar soni', value: data?.sales?.count },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="font-semibold text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Oylik xulosasi */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Oylik Xulosasi</h2>
          <div className="space-y-3">
            {[
              { label: 'Jami oylik', value: fmt(data?.salaries?.total) },
              { label: "To'langan oyliklar", value: data?.salaries?.paid_count },
              { label: 'Xodimlar soni', value: data?.salaries?.count },
              { label: 'Ishlab chiqarildi', value: `${fmt(data?.production?.total_qty)} dona` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="font-semibold text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
