import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, Warehouse, AlertTriangle, Coins, X, Search, Printer } from 'lucide-react';
import { salesAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function VozvratlarPage() {
  const [dateFilter, setDateFilter] = useState({ date_from: '', date_to: '' });
  const [datePreset, setDatePreset] = useState('all');
  const [search, setSearch] = useState('');

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const iso = d => d.toISOString().slice(0, 10);
    if (preset === 'today') {
      setDateFilter({ date_from: iso(today), date_to: iso(today) });
    } else if (preset === 'week') {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      setDateFilter({ date_from: iso(mon), date_to: iso(today) });
    } else if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFilter({ date_from: iso(first), date_to: iso(today) });
    } else if (preset === 'lastmonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFilter({ date_from: iso(first), date_to: iso(last) });
    } else {
      setDateFilter({ date_from: '', date_to: '' });
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['returns-all', dateFilter],
    queryFn: () => salesAPI.getAllReturns(dateFilter.date_from || dateFilter.date_to ? dateFilter : undefined).then(r => r.data),
  });

  const summary = data?.summary || {};
  const all = data?.returns || [];
  const q = search.trim().toLowerCase();
  const returns = !q ? all : all.filter(r =>
    String(r.product_name || '').toLowerCase().includes(q) ||
    String(r.customer_name || '').toLowerCase().includes(q) ||
    String(r.reason || '').toLowerCase().includes(q)
  );

  const cards = [
    { label: 'Omborga qaytgan', value: `${fmt(summary.good_qty)} dona`, cls: 'text-emerald-600', bg: 'bg-emerald-50', Icon: Warehouse },
    { label: 'Brak (ziyon)',    value: `${fmt(summary.defective_qty)} dona`, cls: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
    { label: 'Ziyon summasi',   value: `${fmt(summary.total_loss)} so'm`, cls: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
    { label: 'Qaytarilgan pul', value: `${fmt(summary.total_refund)} so'm`, cls: 'text-blue-600', bg: 'bg-blue-50', Icon: Coins },
  ];

  return (
    <div className="space-y-6">
      <div id="vozvrat-print" className="space-y-6">
        <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-2 mb-2">
          <span className="font-bold text-gray-900">TEKNOPLAST — Vozvratlar (Qaytarishlar) hisoboti</span>
          <span className="text-sm text-gray-600">{new Date().toLocaleDateString('uz-UZ')}</span>
        </div>

        <div className="page-header">
          <h1 className="page-title flex items-center gap-2"><RotateCcw size={20} /> Vozvratlar (Qaytarishlar)</h1>
          <button onClick={() => window.print()} className="btn-secondary btn-sm no-print">
            <Printer size={14} /> Chop etish
          </button>
        </div>

        {/* Summary kartalar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c, i) => (
            <div key={i} className={`card-sm ${c.bg}`}>
              <div className="flex items-center gap-2">
                <c.Icon size={14} className={c.cls} />
                <p className="text-xs text-gray-600">{c.label}</p>
              </div>
              <p className={`text-lg font-bold mt-1 ${c.cls}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Qidiruv + sana filtri */}
        <div className="no-print card p-4 space-y-3">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Mahsulot, mijoz yoki sabab bo'yicha qidirish..."
              className="input pl-9 pr-9 w-full" />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {[
              { key: 'all',       label: 'Barchasi' },
              { key: 'today',     label: 'Bugun' },
              { key: 'week',      label: 'Bu hafta' },
              { key: 'month',     label: 'Bu oy' },
              { key: 'lastmonth', label: "O'tgan oy" },
            ].map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  datePreset === p.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}>
                {p.label}
              </button>
            ))}
            <span className="text-gray-300 text-xs">|</span>
            <input type="date" value={dateFilter.date_from}
              onChange={e => { setDatePreset('custom'); setDateFilter(f => ({ ...f, date_from: e.target.value })); }}
              className="input text-xs py-1.5 w-36" title="Dan" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={dateFilter.date_to}
              onChange={e => { setDatePreset('custom'); setDateFilter(f => ({ ...f, date_to: e.target.value })); }}
              className="input text-xs py-1.5 w-36" title="Gacha" />
            {(dateFilter.date_from || dateFilter.date_to) && (
              <button onClick={() => applyPreset('all')} className="text-gray-400 hover:text-red-500" title="Tozalash">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Jadval */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Sana</th><th>Mahsulot</th><th>Mijoz</th><th>Miqdor</th>
                <th>Holati</th><th>Summa</th><th>Ziyon</th><th>Sabab</th><th>Xodim</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
              ) : !all.length ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                  <RotateCcw size={28} className="mx-auto mb-2 text-gray-300" />
                  Hali vozvrat (qaytarish) yo'q
                </td></tr>
              ) : !returns.length ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                  <Search size={24} className="mx-auto mb-2 text-gray-300" />
                  "{search}" bo'yicha topilmadi
                </td></tr>
              ) : returns.map(r => {
                const defective = r.condition === 'DEFECTIVE';
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{new Date(r.return_date || r.created_at).toLocaleDateString('uz-UZ')}</td>
                    <td>
                      <div className="font-medium text-gray-900">{r.product_name || 'Mahsulot'}</div>
                      {r.rang && <div className="text-xs text-gray-400">{r.rang}</div>}
                    </td>
                    <td className="text-gray-600">{r.customer_name || '—'}</td>
                    <td className="whitespace-nowrap">{fmt(r.quantity)} {r.unit || 'dona'}</td>
                    <td>
                      {defective
                        ? <span className="badge bg-red-50 text-red-600 flex items-center gap-1 w-fit"><AlertTriangle size={11} /> Brak / Ziyon</span>
                        : <span className="badge bg-emerald-50 text-emerald-600 flex items-center gap-1 w-fit"><Warehouse size={11} /> Omborga qaytdi</span>}
                    </td>
                    <td className="whitespace-nowrap">{fmt(r.amount)} so'm</td>
                    <td className={`whitespace-nowrap font-semibold ${defective ? 'text-red-600' : 'text-gray-300'}`}>
                      {defective ? `${fmt(r.loss_amount)} so'm` : '—'}
                    </td>
                    <td className="max-w-[200px]"><span className="text-sm text-gray-600">{r.reason}</span></td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">{r.created_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
