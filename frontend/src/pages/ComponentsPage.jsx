import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Boxes, Search, Edit3, Warehouse, FlaskConical, Scale } from 'lucide-react';
import clsx from 'clsx';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';
import { parseSom } from '../utils/money';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children, wide, xl }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-2xl w-full p-6 max-h-[85vh] overflow-y-auto', xl ? 'max-w-2xl' : wide ? 'max-w-lg' : 'max-w-md')}>
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
  const [recipeModal, setRecipeModal] = useState(null); // { id, name } — komponent retsepti
  const RECIPE_FORM0 = { ingredient_type: 'XOM_ASHYO', raw_material_id: '', qty_per_unit: '', unit: 'g', rang: '', note: '' };
  const [recipeAddForm, setRecipeAddForm] = useState(RECIPE_FORM0);

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  // Retsept (xom ashyo tarkibi) — mahsulotlardagi bilan bir xil tizim
  const { data: rawMats } = useQuery({
    queryKey: ['raw-materials-list'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
    enabled: !!recipeModal,
  });
  const { data: recipeData } = useQuery({
    queryKey: ['product-recipe', recipeModal?.id],
    queryFn: () => productsAPI.getRecipe(recipeModal.id).then(r => r.data),
    enabled: !!recipeModal,
  });
  const addRecipeMutation = useMutation({
    mutationFn: ({ product_id, ...d }) => productsAPI.addRecipeItem(product_id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-recipe', recipeModal?.id] });
      setRecipeAddForm(RECIPE_FORM0);
      toast.success('Ingredient qo\'shildi');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  const removeRecipeMutation = useMutation({
    mutationFn: (item) => item.raw_material_id
      ? productsAPI.removeRecipeItem(recipeModal.id, item.raw_material_id)
      : productsAPI.removeRecipeItemById(recipeModal.id, item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-recipe', recipeModal?.id] });
      toast.success('Olib tashlandi');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const components = useMemo(() => {
    // Faqat faol komponentlar — o'chirilgan/nofaol qilinganlar ro'yxatda ko'rinmaydi
    const list = (data?.products || []).filter(p => p.kind === 'KOMPONENT' && p.is_active);
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
        <div className="flex gap-2">
          {canAdd && (
            <button onClick={openNew}
              className="btn-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg px-3 flex items-center gap-1">
              <Plus size={14} /> Komponent qo'shish
            </button>
          )}
        </div>
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
                  <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs">Vazni</th>
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
                    <td className="px-3 py-2.5 text-right">
                      {parseFloat(p.weight) > 0
                        ? <span className="inline-flex items-center gap-1 font-medium text-gray-700"><Scale size={12} className="text-gray-400" /> {p.weight} gr</span>
                        : <span className="text-gray-300">—</span>}
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
                          <button onClick={() => setRecipeModal({ id: p.id, name: p.name })} title="Retsept (xom ashyo)"
                            className="btn-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-1 flex items-center gap-1">
                            <FlaskConical size={12} /> Retsept
                          </button>
                        )}
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
              <input {...register('price', { required: true, setValueAs: parseSom })} type="text" inputMode="numeric" className="input" placeholder="masalan: 5 000" />
            </div>
            <div>
              <label className="label">Boshlang'ich ombor</label>
              <input {...register('stock_quantity')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Rangi</label>
              <select {...register('rang')} className="select">
                <option value="">— Rangsiz —</option>
                {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vazni (gramm)</label>
              <input {...register('weight')} type="number" min="0" step="0.1" className="input" placeholder="masalan: 55" />
            </div>
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

      {/* Retsept (xom ashyo) — komponent uchun, katta va aniq ko'rinishda */}
      {recipeModal && (() => {
        const recipe = recipeData?.recipe || [];
        const totalGr = recipe.reduce((s, it) => s + (it.unit === 'kg' ? (parseFloat(it.qty_per_unit) || 0) * 1000 : (parseFloat(it.qty_per_unit) || 0)), 0);
        const closeRecipe = () => { setRecipeModal(null); setRecipeAddForm({ raw_material_id: '', qty_per_unit: '', unit: 'g', note: '' }); };
        return (
          <Modal open onClose={closeRecipe} xl
            title={`🧪 Retsept — ${recipeModal.name}`}>
            <div className="space-y-5">
              {/* Jamlanma — 1 dona komponent uchun */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5 text-center">
                  <p className="text-3xl font-bold text-emerald-700 leading-none">
                    {new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(totalGr)}
                    <span className="text-sm font-semibold text-emerald-500 ml-1">g</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">1 dona uchun jami xom ashyo</p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3.5 text-center">
                  <p className="text-3xl font-bold text-indigo-700 leading-none">{recipe.length}</p>
                  <p className="text-xs text-gray-500 mt-1.5">Ingredient turi</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 -mt-2">
                1 dona komponent uchun kerakli xom ashyo miqdori. Ishlab chiqarish tasdiqlanganda ombordan avtomatik ayiriladi.
              </p>

              {/* Hozirgi retsept */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <FlaskConical size={15} className="text-emerald-600" /> Hozirgi retsept
                </h4>
                {!recipe.length ? (
                  <div className="text-center py-8 bg-gray-50 rounded-xl">
                    <FlaskConical size={30} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-400">Hali ingredient qo'shilmagan</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {recipe.map(item => {
                      const special = item.ingredient_type && item.ingredient_type !== 'XOM_ASHYO';
                      const tint = special
                        ? (item.ingredient_type === 'KALSIY' ? 'border-sky-100 bg-sky-50/60' : item.ingredient_type === 'RANG' ? 'border-fuchsia-100 bg-fuchsia-50/60' : 'border-cyan-100 bg-cyan-50/60')
                        : 'border-emerald-100 bg-emerald-50/60';
                      return (
                        <div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${tint}`}>
                          <div className="min-w-0">
                            <div className="font-semibold text-[15px] text-gray-900 truncate flex items-center gap-1.5">
                              {item.ingredient_type === 'RANG' && item.rang && <span style={{ display:'inline-block', width:12, height:12, borderRadius:'50%', background: RANG_COLORS[item.rang] || '#999', border:'1px solid #ccc' }} />}
                              {item.display_name || item.raw_material_name}
                              {special && <span className="text-[10px] font-medium text-gray-500 bg-white/70 rounded-full px-1.5 py-0.5">maxsus</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {item.note && <span className="mr-2">({item.note})</span>}
                              {!special && <>ombor: {item.stock_balance} kg</>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-lg font-bold text-emerald-700 whitespace-nowrap">{item.qty_per_unit} {item.unit}<span className="text-xs font-normal text-gray-400">/dona</span></span>
                            {canWrite && (
                              <button
                                onClick={() => removeRecipeMutation.mutate(item)}
                                disabled={removeRecipeMutation.isPending}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <X size={17} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ingredient qo'shish */}
              {canWrite && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Plus size={15} className="text-emerald-600" /> Ingredient qo'shish</h4>

                  {/* Ingredient turi */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { k: 'XOM_ASHYO', label: 'Xom ashyo', on: 'bg-emerald-500 text-white border-emerald-500' },
                      { k: 'KALSIY', label: 'Kalsiy', on: 'bg-sky-500 text-white border-sky-500' },
                      { k: 'RANG', label: 'Rang', on: 'bg-fuchsia-500 text-white border-fuchsia-500' },
                      { k: 'DROBILKA', label: 'Drobilka', on: 'bg-cyan-500 text-white border-cyan-500' },
                    ].map(t => {
                      const active = recipeAddForm.ingredient_type === t.k;
                      const defUnit = t.k === 'DROBILKA' ? 'kg' : 'g';
                      return (
                        <button key={t.k} type="button"
                          onClick={() => setRecipeAddForm(f => ({ ...f, ingredient_type: t.k, unit: defUnit, raw_material_id: '', rang: '' }))}
                          className={`py-1.5 rounded-lg text-xs font-semibold border ${active ? t.on : 'bg-white text-gray-500 border-gray-200'}`}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Xom ashyo tanlash — faqat XOM_ASHYO uchun */}
                  {recipeAddForm.ingredient_type === 'XOM_ASHYO' && (
                    <select
                      value={recipeAddForm.raw_material_id}
                      onChange={e => setRecipeAddForm(f => ({ ...f, raw_material_id: e.target.value }))}
                      className="select">
                      <option value="">— Xom ashyo tanlang —</option>
                      {(rawMats?.raw_materials || []).filter(r => r.is_active !== 0).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}

                  {/* Rang tanlash — faqat RANG uchun */}
                  {recipeAddForm.ingredient_type === 'RANG' && (
                    <div className="flex items-center gap-1.5">
                      <select value={recipeAddForm.rang} onChange={e => setRecipeAddForm(f => ({ ...f, rang: e.target.value }))} className="select">
                        <option value="">— Rang tanlang —</option>
                        {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {recipeAddForm.rang && <span style={{ display:'inline-block', width:14, height:14, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[recipeAddForm.rang] || '#999', border:'1px solid #ccc' }} />}
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_90px] sm:grid-cols-[130px_90px_1fr] gap-2">
                    <input
                      type="number" min="0" step="any"
                      placeholder="Miqdor"
                      value={recipeAddForm.qty_per_unit}
                      onChange={e => setRecipeAddForm(f => ({ ...f, qty_per_unit: e.target.value }))}
                      onFocus={e => e.target.select()}
                      className="input" />
                    <select
                      value={recipeAddForm.unit}
                      onChange={e => setRecipeAddForm(f => ({ ...f, unit: e.target.value }))}
                      className="select">
                      {recipeAddForm.ingredient_type === 'DROBILKA' ? (
                        <option value="kg">kg</option>
                      ) : recipeAddForm.ingredient_type === 'XOM_ASHYO' ? (
                        <>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                        </>
                      ) : (
                        <>
                          <option value="mg">mg</option>
                          <option value="g">g</option>
                        </>
                      )}
                    </select>
                    <input
                      type="text"
                      placeholder="Izoh (ixtiyoriy)"
                      value={recipeAddForm.note}
                      onChange={e => setRecipeAddForm(f => ({ ...f, note: e.target.value }))}
                      className="input col-span-2 sm:col-span-1" />
                  </div>
                  <button
                    onClick={() => {
                      const t = recipeAddForm.ingredient_type;
                      if (t === 'XOM_ASHYO' && !recipeAddForm.raw_material_id) return toast.error('Xom ashyo tanlang');
                      if (t === 'RANG' && !recipeAddForm.rang) return toast.error('Rang tanlang');
                      if (!recipeAddForm.qty_per_unit || parseFloat(recipeAddForm.qty_per_unit) <= 0) return toast.error('Miqdor kiriting');
                      addRecipeMutation.mutate({
                        product_id: recipeModal.id,
                        ingredient_type: t,
                        raw_material_id: t === 'XOM_ASHYO' ? recipeAddForm.raw_material_id : null,
                        rang: t === 'RANG' ? recipeAddForm.rang : null,
                        qty_per_unit: parseFloat(recipeAddForm.qty_per_unit),
                        unit: recipeAddForm.unit,
                        note: recipeAddForm.note || null,
                      });
                    }}
                    disabled={addRecipeMutation.isPending}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-60">
                    <Plus size={15} /> {addRecipeMutation.isPending ? 'Saqlanmoqda...' : 'Qo\'shish'}
                  </button>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={closeRecipe} className="btn-secondary">Yopish</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
