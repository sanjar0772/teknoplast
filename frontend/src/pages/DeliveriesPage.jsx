import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Truck, MapPin, Phone, User, Package, CheckCircle2, Clock, RotateCcw, PackageCheck, Hand, FileText,
} from 'lucide-react';
import { deliveriesAPI, fulfillmentAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

// SQLite created_at UTC ('YYYY-MM-DD HH:MM:SS') — Z qo'shib mahalliy vaqtga aylantiramiz
const timeLabel = (s) => {
  if (!s) return '';
  const d = typeof s === 'string' && !s.includes('T') && !s.includes('Z')
    ? new Date(s.replace(' ', 'T') + 'Z') : new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const TABS = [
  { key: 'pending',   label: 'Yangi zakaz',  icon: Clock,        active: 'bg-amber-500 text-white hover:bg-amber-600' },
  { key: 'taken',     label: "Yo'lda",       icon: Truck,        active: 'bg-blue-600 text-white hover:bg-blue-700' },
  { key: 'delivered', label: 'Yetkazilgan',  icon: PackageCheck, active: 'bg-green-600 text-white hover:bg-green-700' },
];

// Dostavka (yetkazib berish) — SHOPIR (haydovchi) navbati.
// Oqim: PENDING (yangi) → shopir "Tovarni oldim" → TAKEN (yo'lda) → "Yetkazib berildi" → DELIVERED.
export default function DeliveriesPage() {
  const [tab, setTab] = useState('pending');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => deliveriesAPI.getAll({ status: 'all' }).then(r => r.data),
    refetchInterval: 30 * 1000, // yangi zakazlar tez ko'rinsin
  });

  const statusMutation = useMutation({
    mutationFn: ({ ref, status }) => deliveriesAPI.setStatus(ref, status),
    onSuccess: (res) => { toast.success(res.data?.message || 'Saqlandi ✅'); qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  const setStatus = (ref, status) => statusMutation.mutate({ ref, status });

  // Nakladnoy (yetkazish qog'ozi) PDF — yuklab olish
  const downloadNakladnoy = async (ref) => {
    try {
      const res = await fulfillmentAPI.nakladnoy(ref);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `nakladnoy-${ref}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Nakladnoy yuklab bo'lmadi"); }
  };

  const orders = data?.orders || [];
  const counts = data?.counts || { pending: 0, taken: 0, delivered: 0 };
  const list = orders.filter(o => o.delivery_status === tab.toUpperCase());

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Truck size={22} /> Yetkazib berish</h1>
        <p className="text-sm text-gray-500">Tovarni oling → mijozga yetkazing → "Yetkazib berildi" deb belgilang</p>
      </div>

      {/* Tablar — Yangi / Yo'lda / Yetkazilgan */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon, active }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`btn-sm flex items-center gap-1.5 rounded-lg px-4 font-medium ${
              tab === key ? active : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            <Icon size={15} /> {label}
            <span className={`ml-1 rounded-full px-1.5 text-xs ${tab === key ? 'bg-white/25' : 'bg-gray-100 text-gray-600'}`}>
              {counts[key] || 0}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Yuklanmoqda...</div>
      ) : !list.length ? (
        <div className="text-center py-16 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-30" />
          {tab === 'pending' ? 'Yangi zakaz yo\'q'
            : tab === 'taken' ? 'Yo\'lda tovar yo\'q'
            : 'Hali yetkazilgan zakaz yo\'q'}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => {
            const st = o.delivery_status;
            const hasLoc = o.latitude != null && o.longitude != null;
            return (
              <div key={o.order_ref}
                className={`rounded-2xl border p-4 space-y-3 ${
                  st === 'DELIVERED' ? 'border-green-200 bg-green-50/40'
                    : st === 'TAKEN' ? 'border-blue-200 bg-blue-50/30'
                    : 'border-amber-200 bg-white'}`}>
                {/* Mijoz */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                      <User size={15} className="text-gray-400" /> {o.customer_name || 'Nomsiz mijoz'}
                    </div>
                    {o.customer_phone && (
                      <a href={`tel:${o.customer_phone}`} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                        <Phone size={13} /> {o.customer_phone}
                      </a>
                    )}
                    {o.customer_address && (
                      <div className="text-sm text-gray-500 flex items-start gap-1 mt-0.5">
                        <MapPin size={13} className="mt-0.5 flex-shrink-0" /> {o.customer_address}
                      </div>
                    )}
                  </div>
                  {st === 'DELIVERED' ? (
                    <span className="badge-green flex items-center gap-1 whitespace-nowrap"><CheckCircle2 size={12} /> Yetkazildi</span>
                  ) : st === 'TAKEN' ? (
                    <span className="badge-blue flex items-center gap-1 whitespace-nowrap"><Truck size={12} /> Yo'lda</span>
                  ) : (
                    <span className="badge-yellow flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> Yangi</span>
                  )}
                </div>

                {/* Xaritada ochish */}
                {hasLoc && (
                  <a href={`https://maps.google.com/?q=${o.latitude},${o.longitude}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                    <MapPin size={14} /> Xaritada ko'rish (navigatsiya)
                  </a>
                )}

                {/* Mahsulotlar */}
                <div className="border-t border-gray-100 pt-2 space-y-1">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 flex items-center gap-1.5">
                        <Package size={13} className="text-gray-300" />
                        {it.product_name} <span className="text-gray-400">· {rangLabel(it.rang)}</span>
                      </span>
                      <span className="text-gray-500 whitespace-nowrap">{fmt(it.quantity)} {it.unit || 'dona'}</span>
                    </div>
                  ))}
                </div>

                {/* Jami + vaqt */}
                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="text-xs text-gray-400">
                    {st === 'DELIVERED' && o.delivered_at ? `Yetkazildi: ${timeLabel(o.delivered_at)}`
                      : st === 'TAKEN' && o.taken_at ? `Olindi: ${timeLabel(o.taken_at)}`
                      : `Zakaz: ${timeLabel(o.created_at)}`}
                  </span>
                  <span className="font-bold text-blue-700">{fmt(o.total)} so'm</span>
                </div>

                {/* Amal — holatga qarab tugma */}
                {st === 'PENDING' && (
                  <button onClick={() => setStatus(o.order_ref, 'TAKEN')} disabled={statusMutation.isPending}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-semibold">
                    <Hand size={17} /> Tovarni oldim
                  </button>
                )}
                {st === 'TAKEN' && (
                  <div className="flex gap-2">
                    <button onClick={() => setStatus(o.order_ref, 'PENDING')} disabled={statusMutation.isPending}
                      className="btn-secondary btn-sm flex items-center justify-center gap-1.5" title="Boshiga qaytarish">
                      <RotateCcw size={14} /> Bekor qilish
                    </button>
                    <button onClick={() => setStatus(o.order_ref, 'DELIVERED')} disabled={statusMutation.isPending}
                      className="btn-success flex-1 flex items-center justify-center gap-2 py-2.5 font-semibold">
                      <CheckCircle2 size={17} /> Yetkazib berildi
                    </button>
                  </div>
                )}
                {/* DELIVERED — yakuniy holat, bekor qilish tugmasi YO'Q (egasi talabi) */}

                {/* Nakladnoy (yetkazish qog'ozi) — har doim yuklab olish mumkin */}
                <button onClick={() => downloadNakladnoy(o.order_ref)}
                  className="btn-secondary btn-sm w-full flex items-center justify-center gap-1.5">
                  <FileText size={14} /> Nakladnoy
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
