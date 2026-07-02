import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Truck, MapPin, Phone, User, Package, CheckCircle2, Clock, RotateCcw, PackageCheck,
} from 'lucide-react';
import { deliveriesAPI } from '../services/api';

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

// Dostavka (yetkazib berish) — SHOPIR (haydovchi) navbati.
// Savdo agenti "dostavka" belgisi bilan qilgan zakazlar shu yerga tushadi.
export default function DeliveriesPage() {
  const [tab, setTab] = useState('pending'); // pending | delivered
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => deliveriesAPI.getAll({ status: 'all' }).then(r => r.data),
    refetchInterval: 30 * 1000, // yangi zakazlar tez ko'rinsin
  });

  const deliverMutation = useMutation({
    mutationFn: (ref) => deliveriesAPI.markDelivered(ref),
    onSuccess: () => { toast.success('Yetkazildi deb belgilandi ✅'); qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  const undeliverMutation = useMutation({
    mutationFn: (ref) => deliveriesAPI.undeliver(ref),
    onSuccess: () => { toast.success('Yetkazilmagan holatga qaytarildi'); qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const orders = data?.orders || [];
  const counts = data?.counts || { pending: 0, delivered: 0 };
  const list = orders.filter(o =>
    tab === 'pending' ? o.delivery_status !== 'DELIVERED' : o.delivery_status === 'DELIVERED'
  );

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Truck size={22} /> Yetkazib berish</h1>
        <p className="text-sm text-gray-500">Dostavka zakazlarini mijozga yetkazib, "Yetkazildi" deb belgilang</p>
      </div>

      {/* Tablar */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('pending')}
          className={`btn-sm flex items-center gap-1.5 rounded-lg px-4 font-medium ${
            tab === 'pending' ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          <Clock size={15} /> Yetkazilmagan
          <span className="ml-1 bg-white/25 rounded-full px-1.5 text-xs">{counts.pending}</span>
        </button>
        <button onClick={() => setTab('delivered')}
          className={`btn-sm flex items-center gap-1.5 rounded-lg px-4 font-medium ${
            tab === 'delivered' ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          <PackageCheck size={15} /> Yetkazilgan
          <span className="ml-1 bg-white/25 rounded-full px-1.5 text-xs">{counts.delivered}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Yuklanmoqda...</div>
      ) : !list.length ? (
        <div className="text-center py-16 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-30" />
          {tab === 'pending' ? 'Hozircha yetkaziladigan zakaz yo\'q' : 'Hali yetkazilgan zakaz yo\'q'}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => {
            const done = o.delivery_status === 'DELIVERED';
            const hasLoc = o.latitude != null && o.longitude != null;
            return (
              <div key={o.order_ref}
                className={`rounded-2xl border p-4 space-y-3 ${done ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-white'}`}>
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
                  {done ? (
                    <span className="badge-green flex items-center gap-1 whitespace-nowrap"><CheckCircle2 size={12} /> Yetkazildi</span>
                  ) : (
                    <span className="badge-yellow flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> Kutilmoqda</span>
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
                    {done && o.delivered_at ? `Yetkazildi: ${timeLabel(o.delivered_at)}` : `Zakaz: ${timeLabel(o.created_at)}`}
                  </span>
                  <span className="font-bold text-blue-700">{fmt(o.total)} so'm</span>
                </div>

                {/* Amal */}
                {done ? (
                  <button onClick={() => { if (window.confirm('Yetkazilmagan holatga qaytarilsinmi?')) undeliverMutation.mutate(o.order_ref); }}
                    disabled={undeliverMutation.isPending}
                    className="btn-secondary btn-sm w-full flex items-center justify-center gap-1.5">
                    <RotateCcw size={14} /> Bekor qilish
                  </button>
                ) : (
                  <button onClick={() => deliverMutation.mutate(o.order_ref)}
                    disabled={deliverMutation.isPending}
                    className="btn-success w-full flex items-center justify-center gap-2 py-2.5 font-semibold">
                    <CheckCircle2 size={17} /> Yetkazildi
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
