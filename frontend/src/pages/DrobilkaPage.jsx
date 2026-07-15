import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Recycle, Download, Trash2, ArrowLeft } from 'lucide-react';
import { drobilkaAPI, machinesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmtDT = (s) => s
  ? new Date(String(s).replace(' ', 'T')).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
const kgFmt = (n) => new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(parseFloat(n || 0));

// Drobilka (maydalagich) — stanoklardan chiqqan braklarni topshirish va maydalash.
// Kutayotgan brak = topshirilgan − maydalangan (drobilkada qayta ishlashni kutayotgan brak).
export default function DrobilkaPage() {
  const { isOwner, isProductionHead, isCycleTime, isKirimchi } = useAuthStore();
  const canWrite = isOwner() || isProductionHead() || isCycleTime() || isKirimchi();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [type, setType] = useState('TOPSHIRISH'); // TOPSHIRISH | MAYDALASH
  const [kg, setKg] = useState('');
  const [machineId, setMachineId] = useState('');
  const [productId, setProductId] = useState('');
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['drobilka'],
    queryFn: () => drobilkaAPI.getAll().then(r => r.data),
  });
  const { data: machinesData } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesAPI.getAll().then(r => r.data),
  });
  const { data: prodData } = useQuery({
    queryKey: ['products-all-for-drobilka'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => drobilkaAPI.create({
      entry_type: type, kg: parseFloat(kg),
      machine_id: machineId || undefined, product_id: productId || undefined,
      note: note || undefined,
    }),
    onSuccess: () => {
      toast.success(type === 'TOPSHIRISH' ? 'Brak topshirildi' : 'Maydalash qayd etildi');
      setKg(''); setNote('');
      qc.invalidateQueries({ queryKey: ['drobilka'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  const delMut = useMutation({
    mutationFn: (id) => drobilkaAPI.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drobilka'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const s = data?.summary || { topshirilgan: 0, maydalangan: 0, kutayotgan: 0, production_brak: 0 };
  const entries = data?.entries || [];
  const machines = machinesData?.machines || [];
  const products = prodData?.products || [];

  const submit = () => {
    if (!(parseFloat(kg) > 0)) return toast.error('Kg kiriting (musbat son)');
    createMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/machines')}
            className="btn-sm bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg p-2" title="Mashinalar sahifasiga qaytish">
            <ArrowLeft size={16} />
          </button>
          <h1 className="page-title flex items-center gap-2 text-cyan-700">
            <Recycle size={22} /> Drobilka — brak maydalash
          </h1>
        </div>
      </div>

      {/* Jamlanma */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-4 py-4 text-center">
          <p className="text-3xl font-bold text-amber-600 leading-none">{kgFmt(s.kutayotgan)}</p>
          <p className="text-xs text-gray-500 mt-1.5">Kutayotgan brak (kg)</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-4 text-center">
          <p className="text-3xl font-bold text-slate-600 leading-none">{kgFmt(s.topshirilgan)}</p>
          <p className="text-xs text-gray-500 mt-1.5">Jami topshirilgan (kg)</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-4 py-4 text-center">
          <p className="text-3xl font-bold text-emerald-600 leading-none">{kgFmt(s.maydalangan)}</p>
          <p className="text-xs text-gray-500 mt-1.5">Jami maydalangan (kg)</p>
        </div>
      </div>
      {s.production_brak > 0 && (
        <p className="text-xs text-gray-400 -mt-3">
          Ishlab chiqarishda qayd etilgan jami brak: <b className="text-gray-600">{kgFmt(s.production_brak)} kg</b>
        </p>
      )}

      {/* Yangi yozuv */}
      {canWrite && (
        <div className="card space-y-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 w-full max-w-md">
            <button type="button" onClick={() => setType('TOPSHIRISH')}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 ${type === 'TOPSHIRISH' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500'}`}>
              <Download size={15} /> Brak topshirish
            </button>
            <button type="button" onClick={() => setType('MAYDALASH')}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 ${type === 'MAYDALASH' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500'}`}>
              <Recycle size={15} /> Maydalash
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label text-xs">Miqdor (kg) *</label>
              <input type="number" min="0" step="0.1" value={kg} onChange={e => setKg(e.target.value)}
                onFocus={e => e.target.select()} placeholder="0" className="input" />
            </div>
            <div>
              <label className="label text-xs">Stanok (ixtiyoriy)</label>
              <select value={machineId} onChange={e => setMachineId(e.target.value)} className="select">
                <option value="">—</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Mahsulot (ixtiyoriy)</label>
              <select value={productId} onChange={e => setProductId(e.target.value)} className="select">
                <option value="">—</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Izoh (ixtiyoriy)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="—" className="input" />
            </div>
          </div>

          <button onClick={submit} disabled={createMut.isPending}
            className={`w-full sm:w-auto sm:min-w-[280px] px-6 py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 ${type === 'TOPSHIRISH' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-60`}>
            {type === 'TOPSHIRISH' ? <Download size={16} /> : <Recycle size={16} />}
            {createMut.isPending ? 'Saqlanmoqda...' : (type === 'TOPSHIRISH' ? 'Brak topshirish' : 'Maydalashni qayd etish')}
          </button>
        </div>
      )}

      {/* Tarix */}
      <div className="card">
        <p className="text-sm font-semibold text-gray-700 mb-3">Tarix</p>
        {isLoading ? (
          <p className="text-center text-gray-400 py-8 text-sm">Yuklanmoqda...</p>
        ) : !entries.length ? (
          <p className="text-center text-gray-400 py-8 text-sm">Hali yozuv yo'q</p>
        ) : (
          <div className="space-y-1.5">
            {entries.map(en => (
              <div key={en.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${en.entry_type === 'TOPSHIRISH' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {en.entry_type === 'TOPSHIRISH' ? 'Topshirildi' : 'Maydalandi'} · <span className={en.entry_type === 'TOPSHIRISH' ? 'text-amber-600' : 'text-emerald-600'}>{kgFmt(en.kg)} kg</span>
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {[en.machine_name, en.product_name, en.note].filter(Boolean).join(' · ') || '—'}
                    {en.created_at && <span> · {fmtDT(en.created_at)}</span>}
                  </p>
                </div>
                {canWrite && (
                  <button onClick={() => { if (confirm(`${kgFmt(en.kg)} kg yozuvini o'chirasizmi?`)) delMut.mutate(en.id); }}
                    className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
