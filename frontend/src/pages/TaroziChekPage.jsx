import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, ChevronLeft, ChevronRight, Truck, RefreshCw, Package } from 'lucide-react';
import { taroziAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Toshkent bo'yicha bugun (UTC bug'siz)
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// SQLite created_at UTC ('YYYY-MM-DD HH:MM:SS') — Z qo'shib mahalliy vaqtga
const timeLabel = (s) => {
  if (!s) return '';
  const d = typeof s === 'string' && !s.includes('T') && !s.includes('Z')
    ? new Date(s.replace(' ', 'T') + 'Z') : new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

const shiftDate = (date, days) => {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const dayLabel = (date) =>
  new Date(date + 'T12:00:00').toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' });

// Tarozi cheklari — ADMIN (EGA) tarozidan tushayotgan cheklarni ko'radi (kun bo'yicha).
export default function TaroziChekPage() {
  const [date, setDate] = useState(localToday());
  const isToday = date === localToday();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['tarozi-cheklar', date],
    queryFn: () => taroziAPI.getAll({ date }).then(r => r.data),
    refetchInterval: 60 * 1000,
  });

  const receipts = data?.receipts || [];
  const totals = data?.totals || { count: 0, netto: 0, brutto: 0, narx: 0 };

  return (
    <div className="space-y-5">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title flex items-center gap-2"><Scale size={22} className="text-blue-600" /> Tarozi cheklari</h1>
          <p className="text-sm text-gray-500">Tarozidan tushgan cheklar — kun bo'yicha</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm flex items-center gap-1.5">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yangilash
        </button>
      </div>

      {/* Kun almashtirish */}
      <div className="flex items-center justify-between gap-2 no-print">
        <button onClick={() => setDate(d => shiftDate(d, -1))} className="btn-secondary btn-sm">
          <ChevronLeft size={16} /> Oldingi
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-800 capitalize">{dayLabel(date)}</div>
          <input type="date" value={date} max={localToday()} onChange={e => setDate(e.target.value)}
            className="text-xs text-gray-400 bg-transparent text-center cursor-pointer" />
        </div>
        <button onClick={() => setDate(d => shiftDate(d, 1))} disabled={isToday}
          className="btn-secondary btn-sm disabled:opacity-40">
          Keyingi <ChevronRight size={16} />
        </button>
      </div>

      {/* Jami kartalar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-sm text-center">
          <p className="text-[11px] text-gray-500">Cheklar soni</p>
          <p className="text-lg font-bold text-gray-900">{totals.count}</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[11px] text-gray-500">Jami brutto</p>
          <p className="text-lg font-bold text-gray-600">{fmt(totals.brutto)} kg</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[11px] text-gray-500">Jami sof (netto)</p>
          <p className="text-lg font-bold text-blue-700">{fmt(totals.netto)} kg</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[11px] text-gray-500">Jami to'lov</p>
          <p className="text-lg font-bold text-emerald-700">{fmt(totals.narx)} so'm</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Yuklanmoqda...</div>
      ) : !receipts.length ? (
        <div className="text-center py-16 text-gray-400">
          <Scale size={40} className="mx-auto mb-3 opacity-30" />
          Bu kunда tarozi cheki yo'q
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left py-2">№</th>
                <th className="text-left py-2">Vaqt</th>
                <th className="text-left py-2">Mashina</th>
                <th className="text-left py-2">Mahsulot</th>
                <th className="text-left py-2">Haydovchi</th>
                <th className="text-right py-2">Brutto</th>
                <th className="text-right py-2">Tara</th>
                <th className="text-right py-2">Jami (sof)</th>
                <th className="text-right py-2">To'lov</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-400">{String(r.receipt_no || 0).padStart(4, '0')}</td>
                  <td className="py-2 text-gray-500 whitespace-nowrap">{timeLabel(r.created_at)}</td>
                  <td className="py-2 font-medium flex items-center gap-1"><Truck size={12} className="text-gray-300" /> {r.mashina}</td>
                  <td className="py-2 text-gray-600">{r.mahsulot || '—'}</td>
                  <td className="py-2 text-gray-600">{r.haydovchi || '—'}</td>
                  <td className="py-2 text-right">{fmt(r.brutto)}</td>
                  <td className="py-2 text-right text-gray-500">{fmt(r.tara)}</td>
                  <td className="py-2 text-right font-bold text-blue-700">{fmt(r.netto)} kg</td>
                  <td className="py-2 text-right font-bold text-emerald-700">{fmt(r.narx || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="py-2 text-gray-500" colSpan={5}>Jami — {totals.count} ta</td>
                <td className="py-2 text-right text-gray-600">{fmt(totals.brutto)}</td>
                <td className="py-2 text-right text-gray-400">—</td>
                <td className="py-2 text-right text-blue-700">{fmt(totals.netto)} kg</td>
                <td className="py-2 text-right text-emerald-700">{fmt(totals.narx)} so'm</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
