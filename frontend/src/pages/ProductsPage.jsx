import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Package, DollarSign, Layers, Search, History, ArrowDownCircle, ArrowUpCircle, Factory, Calendar, CheckSquare, Square, FileText, FileSpreadsheet, Trash2, FlaskConical, Camera } from 'lucide-react';
import clsx from 'clsx';
import { productsAPI, customersAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';
import { parseSom } from '../utils/money';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Mahsulot foto URL (cache-busting uchun updated_at qo'shiladi)
const photoUrl = (p) => `/api/products/${p.id}/photo?v=${encodeURIComponent(p.photo_updated_at || '')}`;

// Rasmni brauzerda kichraytirish — telefon fotolari 5-10MB bo'ladi, bazaga ~100-250KB JPEG yozamiz
const resizeImage = (file, maxDim = 900, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    resolve(canvas.toDataURL('image/jpeg', quality));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasm o'qilmadi")); };
  img.src = url;
});

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
  const { isOwner, isProductionHead, isAccountant, isKirimchi, isSalesHead } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: 0, operation: 'add' });
  const [pricingModal, setPricingModal] = useState(null);
  const [pricingForm, setPricingForm] = useState({ stanokchi_rate: 0, stanokchi_semi_rate: 0, detalchi_rate: 0 });
  const [bomModal, setBomModal] = useState(null); // { id, name } — tarkibni boshqarish
  const [bomAddForm, setBomAddForm] = useState({ component_id: '', qty: 1, weight_grams: '' });
  const [recipeModal, setRecipeModal] = useState(null); // { id, name } — retsept
  const RECIPE_FORM0 = { ingredient_type: 'XOM_ASHYO', raw_material_id: '', qty_per_unit: '', unit: 'g', rang: '', note: '' };
  const [recipeAddForm, setRecipeAddForm] = useState(RECIPE_FORM0);
  const [historyProduct, setHistoryProduct] = useState(null); // tarix modal
  const [deleteTarget, setDeleteTarget] = useState(null); // o'chirish tasdig'i: mahsulot yoki { bulk: true }
  const [search, setSearch] = useState(''); // mahsulot qidiruv
  const [dateFilter, setDateFilter] = useState({ date_from: '', date_to: '' });
  const [datePreset, setDatePreset] = useState('all');
  // Belgilash rejimi — mahsulotlarni tanlab tarixini eksport qilish
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(null); // 'pdf' | 'excel' | null
  const [exportChoice, setExportChoice] = useState(null); // 'excel' | 'pdf' — "umumiy/qisqacha" so'rash oynasi
  // Foto tizimi: yashirin file input + qaysi mahsulotga yuklanayotgani + lightbox
  const photoInputRef = useRef(null);
  const photoTargetRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(null); // product id
  const [photoView, setPhotoView] = useState(null); // lightbox mahsuloti

  const pickPhoto = (p) => { photoTargetRef.current = p; photoInputRef.current?.click(); };

  const onPhotoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const p = photoTargetRef.current;
    if (!file || !p) return;
    if (!file.type.startsWith('image/')) return toast.error('Rasm fayl tanlang');
    setPhotoUploading(p.id);
    try {
      const dataUrl = await resizeImage(file);
      await productsAPI.uploadPhoto(p.id, dataUrl);
      toast.success('Foto saqlandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      const nowIso = new Date().toISOString();
      setPhotoView(v => (v && v.id === p.id ? { ...v, has_photo: 1, photo_updated_at: nowIso } : v));
    } catch (err) {
      toast.error(err?.response?.data?.error || "Foto yuklab bo'lmadi");
    } finally {
      setPhotoUploading(null);
    }
  };

  const deletePhoto = async (p) => {
    try {
      await productsAPI.deletePhoto(p.id);
      toast.success("Foto o'chirildi");
      qc.invalidateQueries({ queryKey: ['products'] });
      setPhotoView(null);
    } catch {
      toast.error("O'chirib bo'lmadi");
    }
  };

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (preset === 'today') {
      setDateFilter({ date_from: iso(today), date_to: iso(today) });
    } else if (preset === 'week') {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      setDateFilter({ date_from: iso(mon), date_to: iso(today) });
    } else if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFilter({ date_from: iso(first), date_to: iso(today) });
    } else if (preset === 'lastmonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFilter({ date_from: iso(first), date_to: iso(last) });
    } else {
      setDateFilter({ date_from: '', date_to: '' });
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['products', dateFilter],
    queryFn: () => productsAPI.getAll({ is_active: 'all', ...dateFilter }).then(r => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'product-supplier'],
    queryFn: () => customersAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });
  const customers = customersData?.customers || [];
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
    onError: (e) => toast.error(e.response?.data?.error || 'Saqlashda xato'),
  });

  const stockMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.updateStock(id, data),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setStockModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Ombor yangilashda xato'),
  });

  const pricingMutation = useMutation({
    mutationFn: ({ id, ...data }) => productsAPI.setPricing(id, data),
    onSuccess: () => {
      toast.success('Narxlar saqlandi');
      qc.invalidateQueries({ queryKey: ['products'] });
      setPricingModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Narx saqlashda xato'),
  });

  // Mahsulotni o'chirish (faqat OWNER) — sotuvi bori nofaol bo'ladi, boshqasi butunlay o'chadi
  const [forceDelete, setForceDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: ({ ids, force }) => productsAPI.bulkDelete(ids, force),
    onSuccess: () => {
      toast.success("Mahsulot o'chirildi");
      qc.invalidateQueries({ queryKey: ['products'] });
      setDeleteTarget(null);
      setSelectedIds(new Set());
      setForceDelete(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || "O'chirishda xato"),
  });


  // BOM (komponentlar tarkibi)
  const { data: bomData } = useQuery({
    queryKey: ['product-bom', bomModal?.id],
    queryFn: () => productsAPI.getBom(bomModal.id).then(r => r.data),
    enabled: !!bomModal,
  });

  // Retsept (xom ashyo tarkibi)
  const { data: recipeData } = useQuery({
    queryKey: ['product-recipe', recipeModal?.id],
    queryFn: () => productsAPI.getRecipe(recipeModal.id).then(r => r.data),
    enabled: !!recipeModal,
  });
  const addRecipeMutation = useMutation({
    mutationFn: ({ product_id, ...data }) => productsAPI.addRecipeItem(product_id, data),
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

  const addBomMutation = useMutation({
    mutationFn: ({ product_id, ...data }) => productsAPI.addBomItem(product_id, data),
    onSuccess: () => {
      toast.success('Komponent qo\'shildi');
      qc.invalidateQueries({ queryKey: ['product-bom', bomModal?.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setBomAddForm({ component_id: '', qty: 1, weight_grams: '' });
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

  const { register, handleSubmit, reset, setValue, watch } = useForm();
  const isResale = watch('is_resale');

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
  // Savdo boshlig'i ham mahsulot ma'lumotini (nom, narx, rang...) tahrirlay oladi
  const canEdit = canWrite || isSalesHead();
  const canPrice = isOwner() || isAccountant() || isProductionHead();
  // KIRIMCHI va Savdo boshlig'i yangi mahsulot qo'sha oladi
  const canAdd = canWrite || isKirimchi() || isSalesHead();
  // Mahsulotni o'chirish — faqat ega (rahbar)
  const canDelete = isOwner();

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

  // Belgilash rejimi yordamchilari
  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllShown = () => setSelectedIds(new Set(shownProducts.map(p => p.id)));
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  // Tanlangan mahsulotlar tarixini joriy davr bo'yicha PDF/Excel qilib yuklab olish
  const exportHistory = async (format, mode) => {
    if (!selectedIds.size) return toast.error('Avval mahsulot(lar)ni belgilang');
    setExportChoice(null);
    setExporting(format);
    const params = { ids: Array.from(selectedIds).join(',') };
    if (dateFilter.date_from) params.start_date = dateFilter.date_from;
    if (dateFilter.date_to)   params.end_date   = dateFilter.date_to;
    if (mode) params.mode = mode;
    try {
      const res = format === 'excel'
        ? await productsAPI.exportHistoryExcel(params)
        : await productsAPI.exportHistoryPdf(params);
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const type = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `mahsulot-${mode === 'brief' ? 'qisqacha' : 'tarixi'}-${dateFilter.date_from || 'boshi'}_${dateFilter.date_to || 'oxiri'}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        {!embedded && <h1 className="page-title">Mahsulotlar</h1>}
        <div className="flex gap-2 flex-wrap">
          {canAdd && (
            <button
              onClick={() => {
                reset({ created_at: new Date().toISOString().slice(0, 10), unit: 'dona' });
                setEditProduct(null);
                setShowModal(true);
              }}
              className="btn-sm flex items-center gap-1 rounded-lg px-3 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus size={14} /> Mahsulot qo'shish
            </button>
          )}
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            className={`btn-sm flex items-center gap-1 rounded-lg px-3 border ${
              selectMode
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <CheckSquare size={14} /> {selectMode ? 'Belgilashni yopish' : 'Belgilash'}
          </button>
        </div>
      </div>

      {/* Qidiruv + Sana filtri */}
      <div className="card p-4 space-y-3">
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
        {q && <p className="text-xs text-gray-400">{shownProducts.length} ta mahsulot topildi</p>}
        {/* Sana tugmalari */}
        <div className="flex gap-2 flex-wrap items-center">
          {[
            { key: 'all',       label: 'Barchasi' },
            { key: 'today',     label: 'Bugun' },
            { key: 'week',      label: 'Bu hafta' },
            { key: 'month',     label: 'Bu oy' },
            { key: 'lastmonth', label: "O'tgan oy" },
          ].map(p => (
            <button key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                datePreset === p.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
              }`}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 text-xs">|</span>
          <input type="date" value={dateFilter.date_from}
            onChange={e => { setDatePreset('custom'); setDateFilter(f => ({ ...f, date_from: e.target.value })); }}
            className="input text-xs py-1.5 w-36" title="Dan" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={dateFilter.date_to}
            onChange={e => { setDatePreset('custom'); setDateFilter(f => ({ ...f, date_to: e.target.value })); }}
            className="input text-xs py-1.5 w-36" title="Gacha" />
          {(dateFilter.date_from || dateFilter.date_to) && (
            <button onClick={() => applyPreset('all')}
              className="text-gray-400 hover:text-red-500" title="Tozalash">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Belgilash / eksport paneli */}
      {selectMode && (
        <div className="card p-3 border border-blue-200 bg-blue-50/50 flex flex-wrap items-center gap-2 sticky top-2 z-20">
          <span className="text-sm font-semibold text-gray-800">
            {selectedIds.size} ta mahsulot belgilandi
          </span>
          <button onClick={selectAllShown}
            className="btn-sm bg-white border border-gray-200 rounded-lg px-3 text-gray-600 hover:bg-gray-50">
            Hammasini belgilash ({shownProducts.length})
          </button>
          {selectedIds.size > 0 && (
            <button onClick={clearSelection}
              className="btn-sm bg-white border border-gray-200 rounded-lg px-3 text-gray-600 hover:bg-gray-50">
              Tozalash
            </button>
          )}
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar size={12} /> Davr: {dateFilter.date_from || '—'} — {dateFilter.date_to || '—'}
            <span className="text-gray-400">(yuqoridagi sana tugmalaridan tanlanadi)</span>
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setExportChoice('excel')}
              disabled={!selectedIds.size || !!exporting}
              className="btn-sm flex items-center gap-1 rounded-lg px-3 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              <FileSpreadsheet size={14} /> {exporting === 'excel' ? 'Yuklanmoqda...' : 'Excel'}
            </button>
            <button onClick={() => setExportChoice('pdf')}
              disabled={!selectedIds.size || !!exporting}
              className="btn-sm flex items-center gap-1 rounded-lg px-3 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              <FileText size={14} /> {exporting === 'pdf' ? 'Yuklanmoqda...' : 'PDF'}
            </button>
            {canDelete && (
              <button onClick={() => setDeleteTarget({ bulk: true })}
                disabled={!selectedIds.size}
                className="btn-sm flex items-center gap-1 rounded-lg px-3 bg-red-700 text-white hover:bg-red-800 disabled:opacity-50">
                <Trash2 size={14} /> O'chirish ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Eksport ko'rinishi — Umumiy statistika yoki Qisqacha */}
      <Modal open={!!exportChoice} onClose={() => setExportChoice(null)}
        title={`${exportChoice === 'excel' ? 'Excel' : 'PDF'} — qaysi ko'rinishda?`}>
        <div className="space-y-3">
          <button onClick={() => exportHistory(exportChoice, 'full')}
            className="w-full text-left rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 p-3 transition">
            <div className="font-semibold text-gray-800">Umumiy statistika</div>
            <div className="text-xs text-gray-500 mt-0.5">Har bir harakat alohida qator — kirim, sotuv, ishlab chiqarish (sana bilan).</div>
          </button>
          <button onClick={() => exportHistory(exportChoice, 'brief')}
            className="w-full text-left rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 p-3 transition">
            <div className="font-semibold text-gray-800">Qisqacha</div>
            <div className="text-xs text-gray-500 mt-0.5">Har mahsulot bitta qatorda — jami kirim, chiqim, sotuv summasi, joriy ombor.</div>
          </button>
        </div>
      </Modal>

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
          <div key={p.id}
            onClick={selectMode ? () => toggleSelect(p.id) : undefined}
            className={`card ${!p.is_active ? 'opacity-60' : ''} ${selectMode ? 'cursor-pointer transition' : ''} ${selectMode && selectedIds.has(p.id) ? 'ring-2 ring-blue-500 bg-blue-50/40' : ''}`}>
            {/* Mahsulot fotosi — bosganda kattalashadi, kamera tugmasi bilan yuklanadi */}
            <div className="relative h-36 mb-3 rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100">
              {p.has_photo ? (
                <img src={photoUrl(p)} alt={p.name} loading="lazy"
                  className="w-full h-full object-cover cursor-zoom-in"
                  onClick={selectMode ? undefined : (e) => { e.stopPropagation(); setPhotoView(p); }} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <Package size={30} />
                  <span className="text-[10px] mt-1">Foto yo'q</span>
                </div>
              )}
              {canEdit && !selectMode && (
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); pickPhoto(p); }}
                  disabled={photoUploading === p.id}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-white transition"
                  title={p.has_photo ? 'Fotoni almashtirish' : "Foto qo'shish"}>
                  {photoUploading === p.id
                    ? <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    : <Camera size={15} />}
                </button>
              )}
            </div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-2">
                {selectMode && (
                  <span className="flex-shrink-0 mt-0.5">
                    {selectedIds.has(p.id)
                      ? <CheckSquare size={18} className="text-blue-600" />
                      : <Square size={18} className="text-gray-300" />}
                  </span>
                )}
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

            {!selectMode && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => setHistoryProduct(p)}
                className="btn-sm flex-1 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                <History size={13} /> Tarix
              </button>
              {canEdit && (
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
              {canWrite && (
                <button onClick={() => { setRecipeModal(p); setRecipeAddForm(RECIPE_FORM0); }}
                  className="btn-sm w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg px-2 flex items-center gap-1 justify-center mt-1">
                  <FlaskConical size={13} /> Retsept (xom ashyo)
                </button>
              )}
              {canDelete && (
                <button onClick={() => setDeleteTarget(p)}
                  className="btn-sm w-full bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg px-2 flex items-center gap-1 justify-center mt-1">
                  <Trash2 size={13} /> O'chirish
                </button>
              )}
            </div>
            )}
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
              <select {...register('unit')} defaultValue="dona" className="select">
                <option value="dona">dona</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm) *</label>
              <input {...register('price', { required: true, setValueAs: parseSom })} type="text" inputMode="numeric" className="input" placeholder="masalan: 15 000" />
            </div>
            <div>
              <label className="label">Boshlang'ich ombor</label>
              <input {...register('stock_quantity')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('is_resale')} className="w-4 h-4" />
              <span className="text-sm font-medium text-amber-800">Boshqa sexdan olinadigan tovar (qayta sotish)</span>
            </label>
            {isResale && (
              <>
                <div>
                  <label className="label">Kelish narxi (so'm) — biz to'laymiz</label>
                  <input {...register('cost_price', { setValueAs: parseSom })} type="text" inputMode="numeric" className="input" placeholder="masalan: 10 000" />
                  <p className="text-xs text-amber-700 mt-1">Yuqoridagi "Narxi" — biz sotadigan narx (ustiga qo'yib).</p>
                </div>
                <div>
                  <label className="label">Kimdan olinadi (yetkazib beruvchi mijoz)</label>
                  <select {...register('supplier_customer_id')} className="select">
                    <option value="">— Tanlang (ixtiyoriy) —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-amber-700 mt-1">Kirimda shu mahsulotni tanlaganingizda "Kimdan olindi" avtomatik shu mijoz bo'ladi.</p>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Xom ashyo</label>
              <select {...register('raw_material_id')} className="select">
                <option value="">Tanlang (ixtiyoriy)</option>
                {rawMats?.raw_materials?.map(rm => (
                  <option key={rm.id} value={rm.id}>{rm.name} ({rm.stock_balance} {rm.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Og'irligi (gramm/dona)</label>
              <input {...register('weight')} type="number" min="0" step="0.1" className="input" placeholder="masalan: 55" />
              <p className="text-xs text-gray-400 mt-1">Ishlab chiqarishda ketgan xom ashyo = dona × og'irlik</p>
            </div>
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
        onClose={() => { setBomModal(null); setBomAddForm({ component_id: '', qty: 1, weight_grams: '' }); }}
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
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        × <strong>{item.qty}</strong> {item.unit}
                        {parseFloat(item.weight_grams) > 0 && <> · <strong>{item.weight_grams}</strong> gr</>}
                        {' '}· omborda: {item.stock_quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setBomModal(null); setRecipeModal({ id: item.component_id, name: item.name }); }}
                        className="p-1 text-green-500 hover:text-green-700 rounded"
                        title="Retsept (xom ashyo)"
                      >
                        <FlaskConical size={15} />
                      </button>
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
                      className="input text-sm w-20"
                    />
                    <label className="text-xs text-gray-600 whitespace-nowrap">Vazni (gr):</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={bomAddForm.weight_grams}
                      onChange={e => setBomAddForm(f => ({ ...f, weight_grams: e.target.value }))}
                      className="input text-sm w-24"
                      placeholder="0"
                    />
                    <button
                      onClick={() => {
                        if (!bomAddForm.component_id) return toast.error('Komponent tanlang');
                        addBomMutation.mutate({
                          product_id: bomModal.id,
                          component_id: bomAddForm.component_id,
                          qty: bomAddForm.qty,
                          weight_grams: parseFloat(bomAddForm.weight_grams) || 0,
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

      {/* Retsept (xom ashyo) modal */}
      <Modal
        open={!!recipeModal}
        onClose={() => { setRecipeModal(null); setRecipeAddForm(RECIPE_FORM0); }}
        title={`Retsept — ${recipeModal?.name || ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            1 dona mahsulot uchun kerakli xom ashyo miqdori. Ishlab chiqarishda avtomatik ayiriladi.
          </p>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Hozirgi retsept</h4>
            {!(recipeData?.recipe?.length) ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <FlaskConical size={24} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">Hali ingredient qo'shilmagan</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {(recipeData?.recipe || []).map(item => {
                  const special = item.ingredient_type && item.ingredient_type !== 'XOM_ASHYO';
                  return (
                  <div key={item.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${special ? (item.ingredient_type === 'KALSIY' ? 'bg-sky-50' : item.ingredient_type === 'RANG' ? 'bg-fuchsia-50' : 'bg-cyan-50') : 'bg-green-50'}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                        {item.ingredient_type === 'RANG' && item.rang && <span style={{ display:'inline-block', width:11, height:11, borderRadius:'50%', background: RANG_COLORS[item.rang] || '#999', border:'1px solid #ccc' }} />}
                        {item.display_name || item.raw_material_name}
                        {special && <span className="text-[10px] font-medium text-gray-500 bg-white/70 rounded-full px-1.5 py-0.5">maxsus</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        × <strong>{item.qty_per_unit}</strong> {item.unit}/dona
                        {item.note && <span className="ml-2 text-gray-400">({item.note})</span>}
                        {!special && <span className="ml-2 text-gray-400">· ombor: {item.stock_balance} kg</span>}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        onClick={() => removeRecipeMutation.mutate(item)}
                        disabled={removeRecipeMutation.isPending}
                        className="p-1 text-red-400 hover:text-red-600 rounded"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {canWrite && (
            <div className="border-t pt-3 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Ingredient qo'shish</h4>

              {/* Ingredient turi */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { k: 'XOM_ASHYO', label: 'Xom ashyo', on: 'bg-emerald-500 text-white border-emerald-500' },
                  { k: 'KALSIY', label: 'Kalsiy', on: 'bg-sky-500 text-white border-sky-500' },
                  { k: 'RANG', label: 'Rang', on: 'bg-fuchsia-500 text-white border-fuchsia-500' },
                  { k: 'DROBILKA', label: 'Drobilka', on: 'bg-cyan-500 text-white border-cyan-500' },
                ].map(t => {
                  const active = recipeAddForm.ingredient_type === t.k;
                  return (
                    <button key={t.k} type="button"
                      onClick={() => setRecipeAddForm(f => ({ ...f, ingredient_type: t.k, unit: t.k === 'DROBILKA' ? 'kg' : 'g', raw_material_id: '', rang: '' }))}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold border ${active ? t.on : 'bg-white text-gray-500 border-gray-200'}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {recipeAddForm.ingredient_type === 'XOM_ASHYO' && (
                <select
                  value={recipeAddForm.raw_material_id}
                  onChange={e => setRecipeAddForm(f => ({ ...f, raw_material_id: e.target.value }))}
                  className="select text-sm"
                >
                  <option value="">— Xom ashyo tanlang —</option>
                  {(rawMats?.raw_materials || []).filter(r => r.is_active !== 0).map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}

              {recipeAddForm.ingredient_type === 'RANG' && (
                <div className="flex items-center gap-1.5">
                  <select value={recipeAddForm.rang} onChange={e => setRecipeAddForm(f => ({ ...f, rang: e.target.value }))} className="select text-sm">
                    <option value="">— Rang tanlang —</option>
                    {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {recipeAddForm.rang && <span style={{ display:'inline-block', width:14, height:14, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[recipeAddForm.rang] || '#999', border:'1px solid #ccc' }} />}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="number" min="0" step="any"
                  placeholder="Miqdor"
                  value={recipeAddForm.qty_per_unit}
                  onChange={e => setRecipeAddForm(f => ({ ...f, qty_per_unit: e.target.value }))}
                  className="input text-sm w-28"
                />
                <select
                  value={recipeAddForm.unit}
                  onChange={e => setRecipeAddForm(f => ({ ...f, unit: e.target.value }))}
                  className="select text-sm w-20"
                >
                  {recipeAddForm.ingredient_type === 'DROBILKA' ? (
                    <option value="kg">kg</option>
                  ) : recipeAddForm.ingredient_type === 'XOM_ASHYO' ? (
                    <><option value="g">g</option><option value="kg">kg</option></>
                  ) : (
                    <><option value="mg">mg</option><option value="g">g</option></>
                  )}
                </select>
                <input
                  type="text"
                  placeholder="Izoh (ixtiyoriy)"
                  value={recipeAddForm.note}
                  onChange={e => setRecipeAddForm(f => ({ ...f, note: e.target.value }))}
                  className="input text-sm flex-1"
                />
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
                className="btn-primary btn-sm w-full"
              >
                <Plus size={14} /> Qo'shish
              </button>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={() => { setRecipeModal(null); setRecipeAddForm(RECIPE_FORM0); }}
              className="btn-secondary"
            >
              Yopish
            </button>
          </div>
        </div>
      </Modal>

      {/* Yashirin fayl tanlagich — foto yuklash uchun */}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />

      {/* Foto lightbox — katta ko'rish + almashtirish/o'chirish */}
      {photoView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPhotoView(null)}>
          <div className="absolute inset-0 bg-black/75" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <img src={photoUrl(photoView)} alt={photoView.name} className="w-full max-h-[60vh] object-contain bg-gray-950" />
            <div className="p-4 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 truncate">{photoView.name}</p>
                <p className="text-xs text-gray-500">{photoView.type} · {fmt(photoView.price)} so'm</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {canEdit && (
                  <button onClick={() => pickPhoto(photoView)}
                    className="btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg px-2 py-1.5 flex items-center gap-1">
                    <Camera size={13} /> Almashtirish
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => deletePhoto(photoView)}
                    className="btn-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg px-2 py-1.5 flex items-center gap-1">
                    <Trash2 size={13} /> O'chirish
                  </button>
                )}
                <button onClick={() => setPhotoView(null)}
                  className="btn-sm bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1.5"><X size={14} /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mahsulot tarixi modal */}
      <ProductHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />

      {/* O'chirishni tasdiqlash — faqat OWNER */}
      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setForceDelete(false); }} title="Mahsulotni o'chirish">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
            <Trash2 size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              {deleteTarget?.bulk ? (
                <p><strong>{selectedIds.size} ta</strong> mahsulotni o'chirmoqchimisiz?</p>
              ) : (
                <p>«<strong>{deleteTarget?.name}</strong>» mahsulotini o'chirmoqchimisiz?</p>
              )}
              {!forceDelete && (
                <p className="text-xs text-gray-500 mt-1">
                  Sotuv tarixi bor mahsulot <strong>nofaol</strong> qilinadi. Butunlay o'chirish uchun quyidagi katak belgilang.
                </p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceDelete}
              onChange={e => setForceDelete(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span className="text-sm font-medium text-red-700">Majburiy o'chirish — sotuv tarixi ham o'chadi</span>
          </label>

          {forceDelete && (
            <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-800">
              ⚠️ Ogohlantirish: bu mahsulotga bog'liq barcha sotuv, to'lov va kirim yozuvlari ham bazadan butunlay o'chiriladi. Qaytarib bo'lmaydi!
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setDeleteTarget(null); setForceDelete(false); }} className="btn-secondary flex-1">Bekor</button>
            <button
              onClick={() => deleteMutation.mutate({ ids: deleteTarget?.bulk ? Array.from(selectedIds) : [deleteTarget.id], force: forceDelete })}
              disabled={deleteMutation.isPending || (deleteTarget?.bulk && !selectedIds.size)}
              className="btn-sm flex-1 bg-red-600 text-white hover:bg-red-700 rounded-lg px-3 flex items-center gap-1 justify-center disabled:opacity-50">
              <Trash2 size={14} /> {deleteMutation.isPending ? "O'chirilmoqda..." : forceDelete ? "Majburiy o'chirish" : "Ha, o'chirish"}
            </button>
          </div>
        </div>
      </Modal>

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
