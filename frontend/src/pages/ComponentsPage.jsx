import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Boxes, Search, Trash2, Edit3, Warehouse } from 'lucide-react';
import clsx from 'clsx';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-2xl w-full p-6', wide ? 'max-w-lg' : 'max-w-md')}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ComponentsPage() {
  const { isOwner, isProductionHead, isKirimchi } = useAuthStore();
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: 0, operation: 'add' });
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  const components = useMemo(() => {
    const list = (data?.products || []).filter(p => p.kind === 'KOMPONENT');
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(p =>
      (p.name || '').toLowerCase().includes(s) ||
      (p.type || '').toLowerCase().includes(s) ||
      (p.rang || '').toLowerCase().includes(s)
    );
  }, [data, q]);

  const totalStock = components.reduce((s, p) => s + parseFloat(p.stock_quantity || 0), 0);
  const lowStock = components.filter(p => parseFloat(p.stock_quantity || 0) < 10).length;

  const { register, handleSubmit, reset, setValue } = useForm();

  const saveMutation = useMutation({
    mutationFn: (d) => {
      const payload = { ...d, kind: 'KOMPONENT' };
      return editItem ? productsAPI.update(editItem.id, payload) : productsAPI.create(payload);
    },
    onSuccess: () => {
      toast.success(editItem ? 'Yangilandi' : 'Komponent qo\'shildi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setShowModal(false);
      setEditItem(null);
      reset();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const stockMutation = useMutation({
    mutationFn: ({ id, ...d }) => productsAPI.updateStock(id, d),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setStockModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const openNew = () => {
    reset();
    setEditItem(null);
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditItem(p);
    Object.entries(p).forEach(([k, v]) => setValue(k, v));
    setShowModal(true);
  };

  const canWrite = isOwner() || isProductionHead();
  const canAdd = canWrite || isKirimchi();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Boxes size={22} className="text-indigo-600" /> Komponentlar
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Ishlab chiqarish detallari va komponentlarini ro'yxatga olish
          </p>
        </div>
        {canAdd && (
          <button onClick={openNew}
            className="btn-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg px-3 flex items-center gap-1">
            <Plus size={14} /> Komponent qo'shish
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card border-l-4 border-indigo-500">
          <p className="text-xs text-gray-500">Jami komponentlar</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{components.length}</p>
        </div>
        <div className="card border-l-4 border-green-500">
          <p className="text-xs text-gray-500">Umumiy qoldiq (dona)</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(totalStock)}</p>
        </div>
        <div className="card border-l-4 border-red-500">
          <p className="text-xs text-gray-500">Kam qolgan (&lt;10)</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{lowStock}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Komponent qidirish (nomi, turi, rangi)..."
          className="input pl-9"
        />
      </div>

      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-900">
        <p className="font-medium mb-1">Komponentlar nima?</p>
        <p className="text-xs text-indigo-700">
          Komponent — tayyor mahsulot tarkibiga kiruvchi detal (masalan: <i>Бачок 22л копог,
          Унитаз пакир усти, Лола тувак №1 куйди</i>). Komponentlar sotuvда (Savdo qilish)
          ko'rinmaydi — faqat <strong>Mahsulotlar</strong> sahifasidagi <strong>Tarkib</strong>{' '}
          orqali tayyor mahsulotga biriktiriladi.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Yuklanmoqda...</div>
      ) : !components.length ? (
        <div className="text-center py-12 text-gray-400">
          <Boxes size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Hali komponent yo'q</p>
          <p className="text-xs mt-1">Yuqoridagi "Komponent qo'shish" tugmasi bilan boshlang</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Nomi</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Turi</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs">Rangi</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Narxi</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Omborda</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600 text-xs">Holat</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {components.map(p => (
                  <tr key={p.id} className={clsx('hover:bg-gray-50', !p.is_active && 'opacity-60')}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{p.type}</td>
                    <td className="px-3 py-2.5">
                      {p.rang ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: RANG_COLORS[p.rang] || '#999', border:'1px solid #ccc' }} />
                          {p.rang}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(p.price)} so'm</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={clsx('font-bold', parseFloat(p.stock_quantity) < 10 ? 'text-red-600' : 'text-green-700')}>
                        {p.stock_quantity} {p.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={p.is_active ? 'badge-green' : 'badge-gray'}>
                        {p.is_active ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5 justify-end">
                        {canWrite && (
                          <button onClick={() => setStockModal(p)} title="Ombor"
                            className="btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded px-2 py-1 flex items-center gap-1">
                            <Warehouse size={12} /> Ombor
                          </button>
                        )}
                        {canWrite && (
                          <button onClick={() => openEdit(p)} title="Tahrirlash"
                            className="btn-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded px-2 py-1 flex items-center gap-1">
                            <Edit3 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditItem(null); }}
        title={editItem ? 'Komponentni tahrirlash' : 'Yangi komponent'}
        wide
      >
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...register('name', { required: true })} className="input"
              placeholder="Masalan: Бачок 22л копог" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Turi (kategoriya) *</label>
              <input {...register('type', { required: true })} className="input"
                placeholder="masalan: Plastik detal" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <input {...register('unit')} defaultValue="dona" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm) *</label>
              <input {...register('price', { required: true })} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Boshlang'ich ombor</label>
              <input {...register('stock_quantity')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Rangi</label>
            <select {...register('rang')} className="select">
              <option value="">— Rangsiz —</option>
              {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tavsif</label>
            <input {...register('description')} className="input"
              placeholder="qo'shimcha ma'lumot (ixtiyoriy)" />
          </div>
          {editItem && (
            <div className="flex items-center gap-2">
              <input {...register('is_active')} type="checkbox" id="cactive" className="w-4 h-4" />
              <label htmlFor="cactive" className="text-sm">Faol</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditItem(null); }}
              className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={saveMutation.isPending}
              className="btn-primary flex-1 bg-indigo-600 hover:bg-indigo-700">
              {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Modal */}
      {stockModal && (
        <Modal open={!!stockModal} onClose={() => setStockModal(null)}
          title={`Ombor — ${stockModal.name}`}>
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-lg p-3 text-sm">
              Joriy ombor: <strong>{stockModal.stock_quantity} {stockModal.unit}</strong>
            </div>
            <div>
              <label className="label">Operatsiya</label>
              <select value={stockForm.operation}
                onChange={e => setStockForm(f => ({ ...f, operation: e.target.value }))}
                className="select">
                <option value="add">Qo'shish (+)</option>
                <option value="subtract">Ayirish (-)</option>
                <option value="set">Belgilash (=)</option>
              </select>
            </div>
            <div>
              <label className="label">Miqdor *</label>
              <input type="number" min="0" value={stockForm.quantity}
                onChange={e => setStockForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                className="input" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStockModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={() => stockMutation.mutate({ id: stockModal.id, ...stockForm })}
                disabled={stockMutation.isPending}
                className="btn-primary flex-1 bg-indigo-600 hover:bg-indigo-700">
                {stockMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
