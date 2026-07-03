import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RotateCcw, MapPin, Package, User, Phone, PackageCheck, AlertTriangle, Warehouse, Navigation } from 'lucide-react';
import { deliveriesAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

// Google Maps — KALITSIZ (bepul):
//  · Ichki ko'rish xaritasi: klassik embed iframe (q=... &output=embed)
//  · Navigatsiya: rasmiy Maps URL (dir/?api=1&destination=...) — Google Maps ilovasida yo'l ko'rsatadi
const gmapEmbed = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
const gmapNav = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Vozvrat kartasi (shopir) — lokatsiyasi belgilangan vozvrat tovarlarni Google xaritada ko'radi,
// borib "yig'ib oldim" deb belgilaydi → kartadan yo'qoladi.
export default function VozvratKartaPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['return-pickups'],
    queryFn: () => deliveriesAPI.getReturnPickups().then(r => r.data),
    refetchInterval: 30 * 1000,
  });

  const collectMutation = useMutation({
    mutationFn: (id) => deliveriesAPI.collectReturn(id),
    onSuccess: (res) => { toast.success(res.data?.message || "Yig'ib olindi ✅"); qc.invalidateQueries({ queryKey: ['return-pickups'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const pickups = data?.pickups || [];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><RotateCcw size={22} /> Vozvrat kartasi</h1>
        <p className="text-sm text-gray-500">Lokatsiya belgilangan vozvrat tovarlarni borib oling → "Yig'ib oldim" deb belgilang</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Yuklanmoqda...</div>
      ) : !pickups.length ? (
        <div className="text-center py-16 text-gray-400">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          Yig'ib olinadigan (lokatsiyali) vozvrat yo'q
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pickups.map((p) => {
            const defective = p.condition === 'DEFECTIVE';
            const hasLoc = p.latitude != null && p.longitude != null;
            return (
              <div key={p.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                {/* Google xarita (kalitsiz embed) */}
                {hasLoc && (
                  <iframe
                    title={`map-${p.id}`}
                    src={gmapEmbed(p.latitude, p.longitude)}
                    className="w-full border-0"
                    style={{ height: 190 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <User size={15} className="text-gray-400" /> {p.customer_name || 'Nomsiz mijoz'}
                      </div>
                      {p.customer_phone && (
                        <a href={`tel:${p.customer_phone}`} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                          <Phone size={13} /> {p.customer_phone}
                        </a>
                      )}
                      {p.address && (
                        <div className="text-sm text-gray-500 flex items-start gap-1 mt-0.5">
                          <MapPin size={13} className="mt-0.5 flex-shrink-0" /> {p.address}
                        </div>
                      )}
                    </div>
                    {defective
                      ? <span className="badge bg-red-50 text-red-600 flex items-center gap-1 whitespace-nowrap"><AlertTriangle size={11} /> Brak</span>
                      : <span className="badge bg-emerald-50 text-emerald-600 flex items-center gap-1 whitespace-nowrap"><Warehouse size={11} /> Yaxshi</span>}
                  </div>

                  {/* Tovar */}
                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <Package size={13} className="text-gray-300" />
                      {p.product_name} <span className="text-gray-400">· {rangLabel(p.rang)}</span>
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">{fmt(p.quantity)} {p.unit || 'dona'}</span>
                  </div>

                  {p.reason && <div className="text-xs text-gray-500">Sabab: {p.reason}</div>}

                  {/* Google Maps navigatsiya (ilovada yo'l ko'rsatadi) */}
                  {hasLoc && (
                    <a href={gmapNav(p.latitude, p.longitude)} target="_blank" rel="noreferrer"
                      className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-semibold">
                      <Navigation size={16} /> Google Maps'da yo'l ko'rsatish
                    </a>
                  )}

                  <button onClick={() => collectMutation.mutate(p.id)} disabled={collectMutation.isPending}
                    className="btn-success w-full flex items-center justify-center gap-2 py-2.5 font-semibold">
                    <PackageCheck size={17} /> Yig'ib oldim
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
