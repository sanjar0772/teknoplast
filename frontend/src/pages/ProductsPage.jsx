import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Package, DollarSign, Layers, Search, History, ArrowDownCircle, ArrowUpCircle, Factory, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Tarix turi bo'yicha ko'rinish
const HIST_INFO = {
  kirim:           { label: 'Kirim',            icon: ArrowDownCircle, cls: 'text-green-600', sign: '+' },
  ishlab_chiqarish:{ label: 'Ishlab chiqarish', icon: Factory,        cls: 'text-blue-600',  sign: '+' },
  sotuv:           { label: 'Sotuv',            icon: ArrowUpCircle,   cls: 'text-red-600',   sign: '−' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const yearStart = () => new Date().getFullYear() + '-01-01';

const DATE_PRESETS = [
  { key: 'today', label: 'Bugun',  start: todayStr, end: todayStr },
  { key: 'week',  label: 'Hafta',  start: () => daysAgo(7), end: todayStr },
  { key: 'month', label: 'Oy',     start: monthStart, end: todayStr },
  { key: 'year',  label: 'Yil',    start: yearStart, end: todayStr },
  { key: 'all',   label: 'Hammasi' },
];

function ProductHistoryModal({ product, onClose }) {
  const [preset, setPreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(() => {
    if (preset === 'all') return {};
    if (preset === 'custom') {
      const p = {};
      if (startDate) p.start_date = startDate;
      if (endDate) p.end_date = endDate;
      return p;
    }
    const pr = DATE_PRESETS.find(p => p.key === preset);
    if (!pr || !pr.start) return {};
    return { start_date: pr.start(), end_date: pr.end() };
  }, [preset, startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['product-history', product?.id, params],
    queryFn: () => productsAPI.getHistory(product.id, params).then(r => r.data),
    enabled: !!product,
  });

  if (!product) return null;
  const history = data?.history || [];

  const totalIn = history.filter(h => h.qty > 0).reduce((s, h) => s + Math.abs(h.qty), 0);
  const totalOut = history.filter(h => h.qty < 0).reduce((s, h) => s + Math.abs(h.qty), 0);
  const totalSales = history.filter(h => h.type === 'sotuv').reduce((s, h) => s + (h.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-900">Mahsulot tarixi</h3>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 mb-3 flex justify-between text-sm">
          <span className="text-gray-500">Hozirgi ombor:</span>
          <span className="font-bold text-gray-900">{product.stock_quantity} {product.unit}</span>
        </div>

        {/* Sana tugmalari */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                preset === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{p.label}</button>
          ))}
          <button onClick={() => setPreset('custom')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              preset === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}><Calendar size={11} /> Boshqa</button>
        </div>

        {/* Qo'lda sana kiritish */}
        {preset === 'custom' && (
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500">Boshlanish</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input text-xs py-1" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-500">Tugash</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input text-xs py-1" />
            </div>
          </div>
        )}

        {/* Umumiy statistika */}
        {history.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-green-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-green-600 font-medium">Kirim</div>
              <div className="text-sm font-bold text-green-700">+{totalIn}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-red-600 font-medium">Chiqim</div>
              <div className="text-sm font-bold text-red-700">-{totalOut}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-blue-600 font-medium">Sotuv</div>
              <div className="text-sm font-bold text-blue-700">{fmt(totalSales)}</div>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p>
        ) : !history.length ? (
          <div className="text-center py-10 text-gray-400">
            <History size={28} className="mx-auto mb-2 opacity-30" />
            {preset === 'all' ? 'Hali harakat yo\'q' : 'Bu davr uchun harakat yo\'q'}
          </div>
        ) : (
          <div className="space-y-1.5 overflow-y-auto">
            {history.map((h, i) => {
              const info = HIST_INFO[h.type] || HIST_INFO.kirim;
              const Icon = info.icon;
              return (
                <div key={i} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={18} className={`${info.cls} flex-shrink-0`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800">{info.label}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {h.date ? new Date(h.date).toLocaleDateString('uz-UZ') : '—'}
                        {h.detail ? ` · ${h.detail}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-bold ${info.cls}`}>{info.sign}{Math.abs(h.qty)} {product.unit}</div>
                    {h.type === 'sotuv' && h.amount > 0 && (
                      <div className="text-xs text-gray-400">{fmt(h.amount)} so'm</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ProductsPage({ embedded = false }) {
  const { isOwner, isProductionHead, isAccountant, isKirimchi } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: 0, operation: 'add' });
  const [pricingModal, setPricingModal] = useState(null);
  const [pricingForm, setPricingForm] = useState({ stanokchi_rate: 0, stanokchi_semi_rate: 0, detalchi_rate: 0 });
  const [bomModal, setBomModal] = useState(null); // { id, name } — tarkibni boshqarish
  const [bomAddForm, setBomAddForm] = useState({ component_id: '', qty: 1 });
  const [historyProduct, setHistoryProduct] = useState(null); // tarix modal
  const [search, setSearch] = useState(''); // mahsulot qidiruv
  const [datePreset, setDatePreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateParams = useMemo(() => {
    if (datePreset === 'all') return {};
    if (datePreset === 'custom') {
      const p = {};
      if (customStart) p.start_date = customStart;
      if (customEnd) p.end_date = customEnd;
      return p;
    }
    const pr = DATE_PRESETS.find(p => p.key === datePreset);
    if (!pr || !pr.start) return {};
    return { start_date: pr.start(), end_date: pr.end() };
  }, [datePreset, customStart, customEnd]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', dateParams],
    queryFn: () => productsAPI.getAll({ is_active: 'all', ...dateParams }).then(r => r.data),
  });

  const { data: rawMats } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => {
      const payload = { ...d, kind: editProduct ? (editProduct.kind || 'TAYYOR') : 'TAYYOR' };
      return editProduct ? productsAPI.update(editProduct.id, payload) : productsAPI.create(payload);
    },
    onSuccess: () => {
      toast.success(editProduct ? 'Yangilandi' : 'Mahsulot qo\'shildi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setShowModal(false); setEditProduct(null);
    },
  });

  const stockMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.updateStock(id, data),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setStockModal(null);
    },
  });

  const pricingMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.setPricing(id, data),
    onSuccess: () => {
      toast.success('Narxlar saqlandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setPricingModal(null);
    },
  });

  // BOM (komponentlar tarkibi)
  const { data: bomData } = useQuery({
    queryKey: ['product-bom', bomModal?.id],
    queryFn: () => productsAPI.getBom(bomModal.id).then(r => r.data),
    enabled: !!bomModal,
  });

  const addBomMutation = useMutation({
    mutationFn: ({ product_id, ...data }) => productsAPI.addBomItem(product_id, data),
    onSuccess: () => {
      toast.success('Komponent qo\'shildi');
      qc.invalidateQueries({ queryKey: ['product-bom', bomModal?.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setBomAddForm({ component_id: '', qty: 1 });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const removeBomMutation = useMutation({
    mutationFn: ({ product_id, component_id }) => productsAPI.removeBomItem(product_id, component_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-bom', bomModal?.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (p) => {
    setEditProduct(p);
    Object.entries(p).forEach(([k, v]) => setValue(k, v));
    setValue('created_at', p.created_at ? String(p.created_at).slice(0, 10) : '');
    setShowModal(true);
  };

  const openPricing = (p) => {
    setPricingModal(p);
    setPricingForm({
      stanokchi_rate: p.stanokchi_rate || 0,
      stanokchi_semi_rate: p.stanokchi_semi_rate || 0,
      detalchi_rate: p.detalchi_rate || 0,
    });
  };

  const canWrite = isOwner() || isProductionHead();
  const canPrice = isOwner() || isAccountant() || isProductionHead();
  // KIRIMCHI faqat yangi mahsulot qo'shishi mumkin
  const canAdd = canWrite || isKirimchi();

  // Komponent (KOMPONENT) mahsulotlar — BOM (Tarkib) formasi uchun
  const componentProducts = (data?.products || []).filter(p => p.kind === 'KOMPONENT');
  // Sahifa faqat TAYYOR mahsulotlarni ko'rsatadi (komponentlar alohida sahifada)
  // Qidiruv — bitta harf yozilsa ham, ichida bo'lsa chiqaveradi (nom/turi/rang bo'yicha)
  const q = search.trim().toLowerCase();
  const shownProducts = useMemo(() => {
    const base = (data?.products || []).filter(p => p.kind !== 'KOMPONENT');
    if (!q) return base;
    return base.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.type || '').toLowerCase().includes(q) ||
      String(p.rang || '').toLowerCase().includes(q)
    );
  }, [data, q]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        {!embedded && <h1 className="page-title">Mahsulotlar</h1>}
        <div className="flex gap-2 flex-wrap">
          {canAdd && (
            <button
              onClick={() => {
                reset({ created_at: new Date().toISOString().slice(0, 10) });
                setEditProduct(null);
                setShowModal(true);
              }}
              className="btn-sm flex items-center gap-1 rounded-lg px-3 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus size={14} /> Mahsulot qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Qidiruv */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Mahsulot nomi, turi yoki rangi bo'yicha qidirish..."
          className="input pl-9 pr-9 w-full" />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
        )}
      </div>
      {q && <p className="text-xs text-gray-400 -mt-3">{shownProducts.length} ta mahsulot topildi</p>}

      {/* Sana filtri tugmalari */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        <span className="text-xs text-gray-500 font-medium flex items-center gap-1"><Calendar size={13} /> Davr:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.key} onClick={() => setDatePreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              datePreset === p.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{p.label}</button>
        ))}
        <button onClick={() => setDatePreset('custom')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
            datePreset === 'custom' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}><Calendar size={11} /> Boshqa</button>
        {datePreset === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="input text-xs py-1 px-2 w-32" placeholder="Dan" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="input text-xs py-1 px-2 w-32" placeholder="Gacha" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-gray-400">Yuklanmoqda...</div>
        ) : !shownProducts.length ? (
          <div className="col-span-3 text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-2 opacity-30" />
            {q ? (
              <>
                <p>"{search}" bo'yicha mahsulot topilmadi</p>
                <button onClick={() => setSearch('')} className="text-xs text-blue-600 mt-1 hover:underline">Qidiruvni tozalash</button>
              </>
            ) : (
              <>
                <p>Mahsulot yo'q</p>
                <p className="text-xs mt-1">Yuqoridagi "Mahsulot qo'shish" tugmasi bilan qo'shing</p>
              </>
            )}
          </div>
        ) : shownProducts.map(p => (
          <div key={p.id} className={`card ${!p.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="text-xs text-gray-500">{p.type} · {p.unit}</p>
                {p.rang && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-600">
                    <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: RANG_COLORS[p.rang] || '#999', border:'1px solid #ccc' }} />
                    {p.rang}
                  </span>
                )}
              </div>
              <span className={p.is_active ? 'badge-green' : 'badge-gray'}>
                {p.is_active ? 'Faol' : 'Nofaol'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Narxi:</span>
                <span className="font-semibold">{fmt(p.price)} so'm</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Omborda:</span>
                <span className={`font-bold ${p.stock_quantity < 10 ? 'text-red-600' : 'text-green-700'}`}>
                  {p.stock_quantity} {p.unit}
                </span>
              </div>
              {p.period && (
                <div className="border-t pt-2 mt-1 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-600">Sotildi:</span>
                    <span className="font-semibold text-orange-700">{p.period.sold_qty} {p.unit} ({p.period.sold_count} ta)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-600">Tushum:</span>
                    <span className="font-semibold text-orange-700">{fmt(p.period.sold_amount)} so'm</span>
                  </div>
                </div>
              )}
              {(p.stanokchi_rate > 0 || p.stanokchi_semi_rate > 0 || p.detalchi_rate > 0) && (
                <div className="border-t pt-2 mt-2 space-y-1">
                  {p.stanokchi_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-600">Stanokchi (tayyor):</span>
                      <span className="font-semibold text-blue-700">{fmt(p.stanokchi_rate)} so'm/dona</span>
                    </div>
                  )}
                  {p.stanokchi_semi_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-sky-600">Stanokchi (yarim):</span>
                      <span className="font-semibold text-sky-700">{fmt(p.stanokchi_semi_rate)} so'm/dona</span>
                    </div>
                  )}
                  {p.detalchi_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-600">Detalchi (yarim):</span>
                      <span className="font-semibold text-orange-700">{fmt(p.detalchi_rate)} so'm/dona</span>
                    </div>
                  )}
                </div>
              )}
              {p.raw_material_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Xom ashyo:</span>
                  <span className="text-gray-700">{p.raw_material_name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => setHistoryProduct(p)}
                className="btn-sm flex-1 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                <History size={13} /> Tarix
              </button>
              {canWrite && (
                <button onClick={() => openEdit(p)} className="btn-secondary btn-sm flex-1">Tahrirlash</button>
              )}
              {canWrite && (
                <button onClick={() => setStockModal(p)} className="btn-primary btn-sm flex-1">Ombor</button>
              )}
              {canPrice && (
                <button onClick={() => openPricing(p)}
                  className="btn-sm flex-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                  <DollarSign size={13} /> Narh
                </button>
              )}
              {canWrite && (
                <button onClick={() => { setBomModal(p); setBomAddForm({ component_id: '', qty: 1 }); }}
                  className="btn-sm w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 flex items-center gap-1 justify-center mt-1">
                  <Layers size={13} /> Tarkib (komponentlar)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Product Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditProduct(null); }}
        title={editProduct ? 'Mahsulotni tahrirlash' : 'Yangi Mahsulot'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...register('name', { required: true })} className="input"
              placeholder="Masalan: Бачок 22л to'plam" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Turi *</label>
              <input {...register('type', { required: true })} className="input" placeholder="masalan: Plastik idish" />
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
            <label className="label">Xom ashyo</label>
            <select {...register('raw_material_id')} className="select">
              <option value="">Tanlang (ixtiyoriy)</option>
              {rawMats?.raw_materials?.map(rm => (
                <option key={rm.id} value={rm.id}>{rm.name} ({rm.stock_balance} {rm.unit})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Rangi</label>
              <select {...register('rang')} className="select">
                <option value="">— Rangsiz —</option>
                {RANGLAR.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Qo'shilgan sana</label>
              <input {...register('created_at')} type="date" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Tavsif</label>
            <input {...register('description')} className="input" />
          </div>
          {editProduct && (
            <div className="flex items-center gap-2">
              <input {...register('is_active')} type="checkbox" id="pactive" className="w-4 h-4" />
              <label htmlFor="pactive" className="text-sm">Faol</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* Stock Modal */}
      {stockModal && (
        <Modal open={!!stockModal} onClose={() => setStockModal(null)} title={`Ombor — ${stockModal.name}`}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              Joriy ombor: <strong>{stockModal.stock_quantity} {stockModal.unit}</strong>
            </div>
            <div>
              <label className="label">Operatsiya</label>
              <select value={stockForm.operation} onChange={e => setStockForm(f => ({ ...f, operation: e.target.value }))} className="select">
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
              <button
                onClick={() => stockMutation.mutate({ id: stockModal.id, ...stockForm })}
                disabled={stockMutation.isPending}
                className="btn-primary flex-1"
              >
                {stockMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BOM (Tarkib) Modal — tayyor mahsulotning komponentlari */}
      <Modal
        open={!!bomModal}
        onClose={() => { setBomModal(null); setBomAddForm({ component_id: '', qty: 1 }); }}
        title={`Tarkib — ${bomModal?.name || ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Ushbu tayyor mahsulot qaysi komponentlardan yig'iladi. Komponentlar "Ishlab chiqarish ombori"da turadi.
          </p>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Hozirgi tarkib</h4>
            {!(bomData?.bom?.length) ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <Package size={24} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">Hali komponent qo'shilmagan</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {(bomData?.bom || []).map(item => (
                  <div key={item.component_id} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        × <strong>{item.qty}</strong> {item.unit} · omborda: {item.stock_quantity}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        onClick={() => removeBomMutation.mutate({ product_id: bomModal.id, component_id: item.component_id })}
                        disabled={removeBomMutation.isPending}
                        className="p-1 text-red-400 hover:text-red-600 rounded"
                        title="Olib tashlash"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canWrite && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Komponent qo'shish</h4>
              {!componentProducts.length ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  Komponent mahsulotlar topilmadi. Avval "Ishlab chiqarish ombori" sahifasida
                  yangi komponent qo'shing (Turi: KOMPONENT).
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={bomAddForm.component_id}
                    onChange={e => setBomAddForm(f => ({ ...f, component_id: e.target.value }))}
                    className="select text-sm"
                  >
                    <option value="">— Komponent tanlang —</option>
                    {componentProducts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (omborda: {c.stock_quantity} {c.unit})
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-600 whitespace-nowrap">Soni:</label>
                    <input
                      type="number" min="1" step="1"
                      value={bomAddForm.qty}
                      onChange={e => setBomAddForm(f => ({ ...f, qty: parseFloat(e.target.value) || 1 }))}
                      className="input text-sm w-24"
                    />
                    <button
                      onClick={() => {
                        if (!bomAddForm.component_id) return toast.error('Komponent tanlang');
                        addBomMutation.mutate({
                          product_id: bomModal.id,
                          component_id: bomAddForm.component_id,
                          qty: bomAddForm.qty,
                        });
                      }}
                      disabled={addBomMutation.isPending}
                      className="btn-primary btn-sm flex-1"
                    >
                      <Plus size={14} /> Qo'shish
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={() => { setBomModal(null); setBomAddForm({ component_id: '', qty: 1 }); }}
              className="btn-secondary"
            >
              Yopish
            </button>
          </div>
        </div>
      </Modal>

      {/* Mahsulot tarixi modal */}
      <ProductHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />

      {/* Pricing Modal — Bugalter/OWNER uchun */}
      {pricingModal && (
        <Modal open={!!pricingModal} onClose={() => setPricingModal(null)} title={`Ishlab chiqarish narhlari — ${pricingModal.name}`}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Bu narxlar — 1 dona uchun ishchiga to'lanadigan haq (ishlab chiqarish narxi).
              Stanokchi tayyor yoki yarim tayyor chiqaradi; detalchi faqat yarim tayyor bilan ishlaydi.
            </p>
            <div>
              <label className="label">Stanokchi — TAYYOR (1 dona, so'm)</label>
              <input
                type="number" min="0"
                value={pricingForm.stanokchi_rate}
                onChange={e => setPricingForm(f => ({ ...f, stanokchi_rate: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Masalan: 200"
              />
            </div>
            <div>
              <label className="label">Stanokchi — YARIM TAYYOR (1 dona, so'm)</label>
              <input
                type="number" min="0"
                value={pricingForm.stanokchi_semi_rate}
                onChange={e => setPricingForm(f => ({ ...f, stanokchi_semi_rate: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Masalan: 120"
              />
            </div>
            <div>
              <label className="label">Detalchi (yarim tayyor, 1 dona, so'm)</label>
              <input
                type="number" min="0"
                value={pricingForm.detalchi_rate}
                onChange={e => setPricingForm(f => ({ ...f, detalchi_rate: parseFloat(e.target.value) || 0 }))}
                className="input"
                placeholder="Masalan: 150"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPricingModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button
                onClick={() => pricingMutation.mutate({ id: pricingModal.id, ...pricingForm })}
                disabled={pricingMutation.isPending}
                className="btn-primary flex-1"
              >
                {pricingMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
