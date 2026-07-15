import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Recycle, ArrowLeft } from 'lucide-react';
import { drobilkaAPI } from '../services/api';
import { RANG_COLORS } from '../constants/colors';

const kgFmt = (n) => new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(parseFloat(n || 0));
const rangLabel = (r) => r || 'Rangsiz';

// Drobilka ombori — rang bo'yicha kelgan brak (kutayotgan) + maydalangan material.
export default function DrobilkaOmborPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['drobilka'],
    queryFn: () => drobilkaAPI.getAll().then(r => r.data),
  });

  const byColor = data?.by_color || [];
  const kutayotganByColor = byColor.filter(c => c.kutayotgan > 0.0001);
  const ombor = byColor.filter(c => c.maydalangan > 0);
  const s = data?.summary || { topshirilgan: 0, maydalangan: 0, kutayotgan: 0 };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/drobilka')}
            className="btn-sm bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg p-2" title="Drobilka sahifasiga qaytish">
            <ArrowLeft size={16} />
          </button>
          <h1 className="page-title flex items-center gap-2 text-amber-700">
            <Package size={22} /> Drobilka ombori
          </h1>
        </div>
      </div>

      {/* Jamlanma */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-4 py-4 text-center">
          <p className="text-3xl font-bold text-amber-600 leading-none">{kgFmt(s.kutayotgan)}</p>
          <p className="text-xs text-gray-500 mt-1.5">Ombordagi brak (kg)</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-4 py-4 text-center">
          <p className="text-3xl font-bold text-emerald-600 leading-none">{kgFmt(s.maydalangan)}</p>
          <p className="text-xs text-gray-500 mt-1.5">Maydalangan (kg)</p>
        </div>
      </div>

      {/* Rang bo'yicha brak */}
      <div className="card">
        <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <Package size={16} className="text-amber-600" /> Rang bo'yicha brak
          <span className="text-xs font-normal text-gray-400">— maydalashni kutayotgan</span>
        </p>
        <p className="text-[11px] text-gray-400 mb-3">Kunlik kiritishda yozilgan brak shu yerga avtomatik tushadi.</p>
        {isLoading ? (
          <p className="text-center text-gray-400 py-6 text-sm">Yuklanmoqda...</p>
        ) : !kutayotganByColor.length ? (
          <p className="text-center text-gray-400 py-6 text-sm">Ombor bo'sh — hali brak tushmagan</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {kutayotganByColor.map(c => (
              <div key={c.rang || 'none'} className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-3 flex items-center gap-2.5">
                <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[c.rang] || '#cbd5e1', border:'1px solid #ccc' }} />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-amber-700 leading-none">{kgFmt(c.kutayotgan)} <span className="text-[11px] font-normal text-gray-500">kg</span></p>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">{rangLabel(c.rang)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maydalangan material */}
      <div className="card">
        <p className="text-sm font-semibold text-emerald-600 mb-3 flex items-center gap-1.5">
          <Recycle size={16} /> Maydalangan material
          <span className="text-xs font-normal text-gray-400">— qayta ishlashga tayyor</span>
        </p>
        {!ombor.length ? (
          <p className="text-center text-gray-400 py-6 text-sm">Hali material maydalanmagan</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {ombor.map(c => (
              <div key={c.rang || 'none'} className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 flex items-center gap-2.5">
                <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[c.rang] || '#cbd5e1', border:'1px solid #ccc' }} />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-emerald-700 leading-none">{kgFmt(c.maydalangan)} <span className="text-[11px] font-normal text-gray-500">kg</span></p>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">{rangLabel(c.rang)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
