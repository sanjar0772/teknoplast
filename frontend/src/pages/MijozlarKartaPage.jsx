import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, User, Phone, Navigation, Crosshair, Users, CircleDot } from 'lucide-react';
import { customersAPI } from '../services/api';
import MapPickerModal from '../components/MapPickerModal';

// O'zbekiston (Namangan atrofi) — mijoz belgilanmagan bo'lsa boshlang'ich markaz
const DEFAULT_CENTER = [40.9983, 71.6726];

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Math.abs(parseFloat(n || 0))));

// XSS'dan himoya — popup HTML ichiga mijoz ismi/manzili qo'shiladi
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Google Maps navigatsiya (kalitsiz, bepul) — VozvratKartaPage bilan bir xil uslub
const gmapNav = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Qarz holatiga qarab pin rangi: qarzdor=qizil, haqdor=yashil, toza=ko'k
const pinColor = (debt) => {
  const d = parseFloat(debt || 0);
  if (d > 0.01) return '#dc2626';
  if (d < -0.01) return '#16a34a';
  return '#2563eb';
};

const makePin = (color) => L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
    display:flex;align-items:center;justify-content:center;">
    <div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

// Mijozlar xaritasi (FILIAL) — barcha lokatsiyali mijozlar bitta xaritada.
// Pin bosilsa: ism, telefon, qarz, Google navigatsiya. Lokatsiyasiz mijozni
// ro'yxatdan xaritada belgilash mumkin (MapPickerModal).
export default function MijozlarKartaPage() {
  const qc = useQueryClient();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markerByIdRef = useRef({});
  const [search, setSearch] = useState('');
  const [pickFor, setPickFor] = useState(null); // lokatsiya belgilanayotgan mijoz

  const { data, isLoading } = useQuery({
    queryKey: ['customers-map'],
    queryFn: () => customersAPI.getAll({ is_active: 'true' }).then(r => r.data),
    refetchInterval: 60 * 1000,
  });

  const customers = data?.customers || [];
  const withLoc = useMemo(
    () => customers.filter(c => c.latitude != null && c.longitude != null),
    [customers]
  );
  const withoutLoc = customers.length - withLoc.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      String(c.company_name || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  // Xaritani bir marta yaratamiz
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: DEFAULT_CENTER, zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; markersLayerRef.current = null; };
  }, []);

  // Mijoz pinlarini joylash (ma'lumot o'zgarganda yangilanadi)
  useEffect(() => {
    const map = mapRef.current, layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markerByIdRef.current = {};
    if (!withLoc.length) return;

    for (const c of withLoc) {
      const debt = parseFloat(c.total_debt || 0);
      const debtHtml = debt > 0.01
        ? `<div style="color:#dc2626;font-weight:600;margin-top:2px;">Qarz: ${fmt(debt)} so'm</div>`
        : debt < -0.01
          ? `<div style="color:#16a34a;font-weight:600;margin-top:2px;">Haqdor: ${fmt(debt)} so'm</div>`
          : `<div style="color:#6b7280;margin-top:2px;">Qarz yo'q</div>`;
      const html = `
        <div style="min-width:180px;font-size:13px;line-height:1.45;">
          <div style="font-weight:700;font-size:14px;">${esc(c.name)}</div>
          ${c.phone ? `<a href="tel:${esc(c.phone)}" style="color:#2563eb;">${esc(c.phone)}</a><br>` : ''}
          ${c.address ? `<span style="color:#6b7280;">${esc(c.address)}</span>` : ''}
          ${debtHtml}
          <a href="${gmapNav(c.latitude, c.longitude)}" target="_blank" rel="noreferrer"
             style="display:inline-block;margin-top:6px;background:#2563eb;color:#fff;
             padding:5px 10px;border-radius:8px;font-weight:600;text-decoration:none;">
             🧭 Yo'l ko'rsatish</a>
        </div>`;
      const m = L.marker([c.latitude, c.longitude], { icon: makePin(pinColor(c.total_debt)) })
        .bindPopup(html)
        .addTo(layer);
      markerByIdRef.current[c.id] = m;
    }

    // Barcha pinlar ko'rinadigan qilib masshtablash
    const bounds = L.latLngBounds(withLoc.map(c => [c.latitude, c.longitude]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 15 });
  }, [withLoc]);

  const focusCustomer = (c) => {
    const map = mapRef.current, m = markerByIdRef.current[c.id];
    if (!map || !m) return;
    map.setView([c.latitude, c.longitude], 16);
    m.openPopup();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lokatsiya saqlash — PUT to'liq maydonlarni talab qiladi (COALESCE faqat lat/lng'да)
  const saveLocMutation = useMutation({
    mutationFn: ({ c, pos }) => customersAPI.update(c.id, {
      name: c.name, phone: c.phone, company_name: c.company_name, address: c.address,
      customer_type: c.customer_type, credit_limit: c.credit_limit, notes: c.notes,
      is_active: true, latitude: pos.lat, longitude: pos.lng,
    }),
    onSuccess: () => {
      toast.success('Mijoz lokatsiyasi saqlandi 📍');
      qc.invalidateQueries({ queryKey: ['customers-map'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><MapPin size={22} /> Mijozlar xaritasi</h1>
          <p className="text-sm text-gray-500">Barcha mijozlarning joylashuvi bitta xaritada — pin bosib telefon/qarz/yo'lni ko'ring</p>
        </div>
      </div>

      {/* Statistika */}
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className="bg-gray-100 text-gray-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <Users size={13} /> Jami: {customers.length}
        </span>
        <span className="bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <MapPin size={13} /> Xaritada: {withLoc.length}
        </span>
        <span className="bg-amber-50 text-amber-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <Crosshair size={13} /> Lokatsiyasiz: {withoutLoc}
        </span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><CircleDot size={11} className="text-red-600" /> Qarzdor</span>
          <span className="flex items-center gap-1"><CircleDot size={11} className="text-green-600" /> Haqdor</span>
          <span className="flex items-center gap-1"><CircleDot size={11} className="text-blue-600" /> Toza</span>
        </span>
      </div>

      {/* Xarita */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <div ref={mapContainerRef} style={{ height: '58vh', minHeight: 380 }} className="w-full bg-gray-100" />
      </div>

      {/* Qidiruv */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Mijoz qidirish (ism, telefon)..."
          className="input pl-9"
        />
      </div>

      {/* Mijozlar ro'yxati — xaritaga o'tish / lokatsiya belgilash */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Yuklanmoqda...</div>
      ) : !filtered.length ? (
        <div className="text-center py-10 text-gray-400">Mijoz topilmadi</div>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const hasLoc = c.latitude != null && c.longitude != null;
            const debt = parseFloat(c.total_debt || 0);
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 truncate">
                      <User size={14} className="text-gray-400 flex-shrink-0" /> {c.name}
                    </div>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                        <Phone size={11} /> {c.phone}
                      </a>
                    )}
                  </div>
                  {debt > 0.01
                    ? <span className="text-[11px] font-semibold text-red-600 whitespace-nowrap">{fmt(debt)} qarz</span>
                    : debt < -0.01
                      ? <span className="text-[11px] font-semibold text-green-600 whitespace-nowrap">{fmt(debt)} haqdor</span>
                      : null}
                </div>
                <div className="flex gap-2">
                  {hasLoc ? (
                    <>
                      <button onClick={() => focusCustomer(c)}
                        className="btn-primary btn-sm flex-1 flex items-center justify-center gap-1.5">
                        <MapPin size={13} /> Xaritada ko'rish
                      </button>
                      <button onClick={() => setPickFor(c)}
                        className="btn-secondary btn-sm flex items-center justify-center gap-1 px-2.5"
                        title="Lokatsiyani o'zgartirish">
                        <Crosshair size={13} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setPickFor(c)}
                      className="btn-secondary btn-sm flex-1 flex items-center justify-center gap-1.5">
                      <Crosshair size={13} /> Xaritadan belgilash
                    </button>
                  )}
                  {hasLoc && (
                    <a href={gmapNav(c.latitude, c.longitude)} target="_blank" rel="noreferrer"
                      className="btn-secondary btn-sm flex items-center justify-center px-2.5" title="Google Maps navigatsiya">
                      <Navigation size={13} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lokatsiya belgilash oynasi */}
      <MapPickerModal
        open={!!pickFor}
        initial={pickFor && pickFor.latitude != null ? { lat: parseFloat(pickFor.latitude), lng: parseFloat(pickFor.longitude) } : null}
        onClose={() => setPickFor(null)}
        onPick={(pos) => { if (pickFor) saveLocMutation.mutate({ c: pickFor, pos }); }}
      />
    </div>
  );
}
