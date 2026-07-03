import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ShoppingBag, Coins, RotateCcw, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { reportsAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

const PAY_METHOD = { CASH: 'Naqd', CARD: 'Karta', TRANSFER: 'Bank', PAYME: 'Pay Me', CLICK: 'Click', DISCOUNT: 'Skidka', OTHER: 'Boshqa' };

// Toshkent bo'yicha bugungi sana (UTC emas!)
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// SQLite created_at UTC saqlanadi ('YYYY-MM-DD HH:MM:SS') — Z qo'shib to'g'ri
// mahalliy vaqtga aylantiramiz (aks holda 5 soat orqada ko'rinardi)
const timeLabel = (s) => {
  if (!s) return '';
  const d = typeof s === 'string' && !s.includes('T') && !s.includes('Z')
    ? new Date(s.replace(' ', 'T') + 'Z') : new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

const OP_BADGE = {
  SAVDO:      { label: '🛒 Savdo',          cls: 'bg-blue-50 text-blue-700' },
  QARZ_TOLOV: { label: '💵 Qarz to\'lovi',  cls: 'bg-emerald-50 text-emerald-700' },
  VOZVRAT:    { label: '↩️ Pul qaytarildi', cls: 'bg-red-50 text-red-600' },
};

// Kunlik KASSA — shu kundagi barcha pul operatsiyalari raqamlangan qisqa ro'yxat
export default function KassaPage() {
  const [date, setDate] = useState(localToday());

  const { data, isLoading } = useQuery({
    queryKey: ['kassa', date],
    queryFn: () => reportsAPI.getKassa({ date }).then(r => r.data),
    refetchInterval: 60 * 1000, // kassa jonli yangilanib turadi
  });

  const shiftDay = (delta) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const t = data?.totals || {};
  const ops = data?.ops || [];
  const m = data?.methods || {};
  const isToday = date === localToday();

  // To'lov usullari bo'yicha jamlanma (kassa oxirida) — faqat 0 dan katta usullar
  const METHODS = [
    { key: 'CASH',     label: 'Naqd',   emoji: '💵' },
    { key: 'CARD',     label: 'Karta',  emoji: '💳' },
    { key: 'TRANSFER', label: 'Bank',   emoji: '🏦' },
    { key: 'PAYME',    label: 'Pay Me', emoji: '📱' },
    { key: 'CLICK',    label: 'Click',  emoji: '📲' },
  ];
  const methodRows = METHODS.map(x => ({ ...x, value: parseFloat(m[x.key]) || 0 }));
  const methodsTotal = methodRows.reduce((s, x) => s + x.value, 0);

  const cards = [
    { label: 'Kassaga kirdi',  value: `${fmt(t.kirim)} so'm`,      sub: `Savdodan: ${fmt(t.savdo_naqd)} · Qarzdan: ${fmt(t.qarz_tolov)}`, cls: 'text-emerald-600', bg: 'bg-emerald-50', Icon: Wallet },
    { label: 'Kunlik savdo',   value: `${fmt(t.savdo_jami)} so'm`, sub: `${ops.filter(o => o.type === 'SAVDO').length} ta chek`,          cls: 'text-blue-600',    bg: 'bg-blue-50',    Icon: ShoppingBag },
    { label: 'Qarzga berildi', value: `${fmt(t.qarzga)} so'm`,     sub: 'keyin to\'lanadi',                                               cls: 'text-amber-600',   bg: 'bg-amber-50',   Icon: Coins },
    { label: 'Sof kassa',      value: `${fmt(t.sof)} so'm`,        sub: t.chiqim > 0 ? `Chiqim (vozvrat): −${fmt(t.chiqim)}` : 'chiqim yo\'q', cls: 'text-gray-900', bg: 'bg-gray-50',  Icon: Wallet },
  ];

  return (
    <div className="space-y-5">
      {/* Chop etish sarlavhasi */}
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-2">
        <span className="font-bold text-gray-900">TEKNOPLAST — Kunlik kassa</span>
        <span className="text-sm text-gray-600">{new Date(date + 'T12:00:00').toLocaleDateString('uz-UZ')}</span>
      </div>

      {/* Sana tanlash */}
      <div className="no-print flex items-center gap-2 flex-wrap">
        <button onClick={() => shiftDay(-1)} className="btn-secondary btn-sm" title="Oldingi kun">
          <ChevronLeft size={14} />
        </button>
        <input type="date" value={date} max={localToday()}
          onChange={e => e.target.value && setDate(e.target.value)}
          className="input text-sm py-1.5 w-40" />
        <button onClick={() => shiftDay(1)} disabled={isToday} className="btn-secondary btn-sm disabled:opacity-40" title="Keyingi kun">
          <ChevronRight size={14} />
        </button>
        {!isToday && (
          <button onClick={() => setDate(localToday())} className="btn-secondary btn-sm">Bugun</button>
        )}
        <span className="flex-1" />
        <button onClick={() => window.print()} className="btn-secondary btn-sm">
          <Printer size={14} /> Chop etish
        </button>
      </div>

      {/* Jami kartalar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} className={`card-sm ${c.bg}`}>
            <div className="flex items-center gap-2">
              <c.Icon size={14} className={c.cls} />
              <p className="text-xs text-gray-600">{c.label}</p>
            </div>
            <p className={`text-lg font-bold mt-1 ${c.cls}`}>{c.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Raqamlangan operatsiyalar ro'yxati */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th className="w-10">№</th><th>Vaqt</th><th>Mijoz</th><th>Operatsiya</th><th className="text-right">Summa</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !ops.length ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">
                <Wallet size={28} className="mx-auto mb-2 text-gray-300" />
                Bu kunda kassa operatsiyalari yo'q
              </td></tr>
            ) : ops.map(o => {
              const badge = OP_BADGE[o.type] || OP_BADGE.SAVDO;
              return (
                <tr key={`${o.type}-${o.n}`}>
                  <td className="font-semibold text-gray-500">{o.n}</td>
                  <td className="whitespace-nowrap text-gray-600">{timeLabel(o.time)}</td>
                  <td className="font-medium text-gray-900">{o.customer}</td>
                  <td>
                    <span className={`badge ${badge.cls} w-fit`}>{badge.label}</span>
                    {o.type === 'SAVDO' && o.debt > 0 && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Naqd: {fmt(o.paid)} · Qarzga: <span className="text-amber-600 font-medium">{fmt(o.debt)}</span>
                      </div>
                    )}
                    {o.type === 'QARZ_TOLOV' && o.method && (
                      <div className="text-[11px] text-gray-500 mt-0.5">{PAY_METHOD[o.method] || o.method}</div>
                    )}
                  </td>
                  <td className={`text-right whitespace-nowrap font-bold ${o.type === 'VOZVRAT' ? 'text-red-600' : 'text-gray-900'}`}>
                    {o.type === 'VOZVRAT' ? `−${fmt(o.amount)}` : fmt(o.amount)} so'm
                  </td>
                </tr>
              );
            })}
          </tbody>
          {ops.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={4} className="text-right text-gray-700">Kassaga kirdi (naqd):</td>
                <td className="text-right text-emerald-700 whitespace-nowrap">{fmt(t.kirim)} so'm</td>
              </tr>
              {t.chiqim > 0 && (
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={4} className="text-right text-gray-700">Chiqim (vozvrat):</td>
                  <td className="text-right text-red-600 whitespace-nowrap">−{fmt(t.chiqim)} so'm</td>
                </tr>
              )}
              <tr className="bg-gray-100 font-bold">
                <td colSpan={4} className="text-right text-gray-900">SOF KASSA:</td>
                <td className="text-right text-gray-900 whitespace-nowrap">{fmt(t.sof)} so'm</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* To'lov usullari bo'yicha qisqa jamlanma — eng tagida */}
      {ops.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <Wallet size={15} className="text-gray-500" /> To'lov usullari bo'yicha
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {methodRows.map(x => (
              <div key={x.key} className={`rounded-xl border p-3 ${x.value > 0 ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-white opacity-60'}`}>
                <p className="text-xs text-gray-500">{x.emoji} {x.label}</p>
                <p className={`text-base font-bold mt-0.5 ${x.value > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{fmt(x.value)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-600">Jami (barcha usullar):</span>
            <span className="text-lg font-bold text-emerald-700">{fmt(methodsTotal)} so'm</span>
          </div>
        </div>
      )}
    </div>
  );
}
