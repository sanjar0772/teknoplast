import { useQuery } from '@tanstack/react-query';
import { MapPin, RefreshCw, User, Phone, Store, Navigation, CircleDot } from 'lucide-react';
import { agentAPI } from '../services/api';

// SQLite UTC vaqtini ('YYYY-MM-DD HH:MM:SS') to'g'ri parse qilish
const parseUTC = (s) => {
  if (!s) return null;
  const d = typeof s === 'string' && !s.includes('T') && !s.includes('Z')
    ? new Date(s.replace(' ', 'T') + 'Z') : new Date(s);
  return isNaN(d) ? null : d;
};

// "5 daqiqa oldin" ko'rinishida
const agoLabel = (s) => {
  const d = parseUTC(s);
  if (!d) return null;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'hozirgina';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
};

const fullLabel = (s) => {
  const d = parseUTC(s);
  return d ? d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
};

// Agent "yangi" (oxirgi 10 daqiqa ichida) joylashuv yuborgan bo'lsa — yashil "onlayn"
const isFresh = (s) => {
  const d = parseUTC(s);
  return d ? (Date.now() - d.getTime()) < 10 * 60 * 1000 : false;
};

// Agentlar joylashuvi — EGA (admin) va SAVDO BOSHLIG'I ko'radi.
// Har bir agentning oxirgi GPS joyi + xaritada ochish havolasi. 30s'da avto-yangilanadi.
export default function AgentLocationsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agent-locations'],
    queryFn: () => agentAPI.getLocations().then(r => r.data),
    refetchInterval: 30 * 1000,
  });

  const agents = data?.agents || [];
  const withLoc = agents.filter(a => a.last_lat != null && a.last_lng != null);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><MapPin size={22} /> Agentlar joylashuvi</h1>
          <p className="text-sm text-gray-500">Har bir agentning oxirgi turgan joyi — xaritada ochib ko'ring</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm flex items-center gap-1.5">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yangilash
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Yuklanmoqda...</div>
      ) : !agents.length ? (
        <div className="text-center py-16 text-gray-400">
          <User size={40} className="mx-auto mb-3 opacity-30" />
          Hali agent yo'q
        </div>
      ) : (
        <>
          {/* Hammasini bitta xaritada ko'rish — joylashuvi bor agentlar bo'lsa */}
          {withLoc.length > 1 && (
            <a href={`https://www.google.com/maps/dir/${withLoc.map(a => `${a.last_lat},${a.last_lng}`).join('/')}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
              <Navigation size={15} /> Barchasini xaritada ko'rish ({withLoc.length} ta agent)
            </a>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => {
              const hasLoc = a.last_lat != null && a.last_lng != null;
              const fresh = isFresh(a.last_location_at);
              return (
                <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <User size={15} className="text-gray-400" /> {a.full_name}
                      </div>
                      {a.phone && (
                        <a href={`tel:${a.phone}`} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                          <Phone size={13} /> {a.phone}
                        </a>
                      )}
                      {a.branch_name && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Store size={12} /> {a.branch_name}
                        </div>
                      )}
                    </div>
                    {hasLoc && (
                      <span className={`text-[11px] font-medium flex items-center gap-1 whitespace-nowrap ${fresh ? 'text-green-600' : 'text-gray-400'}`}>
                        <CircleDot size={11} className={fresh ? '' : 'opacity-50'} /> {fresh ? 'Onlayn' : 'Oflayn'}
                      </span>
                    )}
                  </div>

                  {hasLoc ? (
                    <>
                      <div className="text-xs text-gray-500">
                        Oxirgi joy: <b className="text-gray-700">{agoLabel(a.last_location_at)}</b>
                        <span className="text-gray-400"> · {fullLabel(a.last_location_at)}</span>
                      </div>
                      <a href={`https://maps.google.com/?q=${a.last_lat},${a.last_lng}`}
                        target="_blank" rel="noreferrer"
                        className="btn-primary w-full flex items-center justify-center gap-2 py-2 font-medium">
                        <MapPin size={16} /> Xaritada ko'rish
                      </a>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                      📍 Joylashuv hali yo'q
                      <div className="text-xs text-gray-400 mt-1">
                        Agent ilovada joylashuvga ruxsat bersa ko'rinadi
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
