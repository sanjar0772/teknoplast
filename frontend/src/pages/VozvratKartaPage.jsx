import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RotateCcw, MapPin, Package, User, Phone, PackageCheck, AlertTriangle, Warehouse } from 'lucide-react';
import { deliveriesAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';
const DEFAULT = { lat: 40.9983, lng: 71.6726 }; // Namangan atrofi

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1;transform:translate(-2px,-4px)">📦</div>',
  iconSize: [28, 28],
  iconAnchor: [12, 26],
});

// Bir nechta vozvrat lokatsiyasini bitta xaritada ko'rsatadi (faqat o'qish uchun).
function ReturnsMap({ pickups }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Xaritani bir marta yaratamiz
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [DEFAULT.lat, DEFAULT.lng], zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // Ma'lumot o'zgarsa — belgilarni qayta chizamiz
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = (pickups || []).filter(p => p.latitude != null && p.longitude != null);
    if (!pts.length) return;
    const latlngs = [];
    pts.forEach(p => {
      const ll = [parseFloat(p.latitude), parseFloat(p.longitude)];
      latlngs.push(ll);
      L.marker(ll, { icon: pinIcon }).addTo(layer).bindPopup(
        `<b>${p.customer_name || 'Mijoz'}</b><br/>${p.product_name || ''} — ${fmt(p.quantity)} ${p.unit || 'dona'}<br/><i>${p.reason || ''}</i>`
      );
    });
    if (latlngs.length === 1) map.setView(latlngs[0], 15);
    else map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
  }, [pickups]);

  return <div ref={containerRef} style={{ height: 340 }} className="w-full bg-gray-100 rounded-2xl overflow-hidden border border-gray-200" />;
}

// Vozvrat kartasi (shopir) — lokatsiyasi belgilangan vozvrat tovarlarni xaritada ko'radi,
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
        <>
          <ReturnsMap pickups={pickups} />

          <div className="grid gap-3 md:grid-cols-2">
            {pickups.map((p) => {
              const defective = p.condition === 'DEFECTIVE';
              return (
                <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
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

                  {/* Xaritada navigatsiya */}
                  <a href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                    <MapPin size={14} /> Xaritada ochish (navigatsiya)
                  </a>

                  {/* Tovar */}
                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <Package size={13} className="text-gray-300" />
                      {p.product_name} <span className="text-gray-400">· {rangLabel(p.rang)}</span>
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">{fmt(p.quantity)} {p.unit || 'dona'}</span>
                  </div>

                  {p.reason && <div className="text-xs text-gray-500">Sabab: {p.reason}</div>}

                  <button onClick={() => collectMutation.mutate(p.id)} disabled={collectMutation.isPending}
                    className="btn-success w-full flex items-center justify-center gap-2 py-2.5 font-semibold">
                    <PackageCheck size={17} /> Yig'ib oldim
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
