import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, X, Check, Crosshair } from 'lucide-react';

// O'zbekiston (Namangan atrofi) — boshlang'ich markaz
const DEFAULT = { lat: 40.9983, lng: 71.6726 };

// Ko'k tomchi belgi (leaflet default ikonka bundler'да yuklanmaydi — divIcon ishlatamiz)
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:30px;line-height:1;transform:translate(-2px,-4px)">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [13, 28],
});

// Xaritadan joy belgilash — bosib yoki belgini surib lokatsiyani tanlaydi.
// Savdo boshlig'i ofisда tursa ham mijoz manzilini xaritaga qo'yadi.
export default function MapPickerModal({ open, initial, onClose, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [pos, setPos] = useState(initial || DEFAULT);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const start = (initial && initial.lat != null) ? initial : DEFAULT;
    setPos(start);

    const map = L.map(containerRef.current, { center: [start.lat, start.lng], zoom: 15 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([start.lat, start.lng], { draggable: true, icon: pinIcon }).addTo(map);
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      setPos({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setPos({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    });

    mapRef.current = map;
    markerRef.current = marker;
    // Modal animatsiyasidan keyin o'lchamni to'g'rilash (aks holda xarita kul rang bo'ladi)
    setTimeout(() => map.invalidateSize(), 150);

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [open]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) };
      setPos(ll);
      mapRef.current?.setView([ll.lat, ll.lng], 16);
      markerRef.current?.setLatLng([ll.lat, ll.lng]);
    }, () => {}, { enableHighAccuracy: true, timeout: 15000 });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm flex items-center gap-1.5 text-gray-800">
            <MapPin size={16} className="text-amber-500" /> Xaritadan manzilni belgilang
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div ref={containerRef} style={{ height: 360 }} className="w-full bg-gray-100" />

        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Xaritaga bosing yoki belgini suring</span>
            <button onClick={useMyLocation} className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              <Crosshair size={13} /> Mening joyim
            </button>
          </div>
          <div className="text-[11px] text-gray-400 text-center">
            Tanlangan: {pos.lat}, {pos.lng}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1">Bekor</button>
            <button onClick={() => { onPick(pos); onClose(); }} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              <Check size={15} /> Shu joyni belgilash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
