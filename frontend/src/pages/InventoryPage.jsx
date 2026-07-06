import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Minus, X, AlertTriangle, Warehouse, Package, Boxes, PackagePlus, Pencil, Trash2, Factory, FileSpreadsheet, FileText, ClipboardList, Save, Search, RefreshCw } from 'lucide-react';
import { productsAPI, reportsAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { RANGLAR, RANG_COLORS } from '../constants/colors';
import clsx from 'clsx';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { user, isOwner, isTaminotchi, isKirimchi, activeBranch } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Ta'minotchi (Owner emas) — faqat Xom ashyo bo'limini ko'radi, Tayyor mahsulot ombori unga ko'rinmaydi
  const taminotchiOnly = user?.role === 'TAMINOTCHI';
  // FILIAL konteksti (filial xodimi YOKI EGA filialga kirgan) — faqat O'Z ombori (Tayyor mahsulotlar);
  // ishlab chiqarish ombori / xom ashyo / inventarizatsiya YO'Q
  const isBranch = !!(user?.branch_id || activeBranch);
  const [tab, setTab] = useState(taminotchiOnly ? 'raw' : 'products'); // 'products' | 'raw'
  const [showRmModal, setShowRmModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false); // ishlab chiqarish ombori — mahsulot qo'shish
  const [editRmModal, setEditRmModal] = useState(null); // tahrirlash uchun
  const [rmStockModal, setRmStockModal] = useState(null);
  const [rmStockForm, setRmStockForm] = useState({ quantity: 0, operation: 'add' });
  const [bomModal, setBomModal] = useState(null); // { id, name } — tarkibni ko'rish/tahrirlash
  const [bomAddForm, setBomAddForm] = useState({ component_id: '', qty: 1 });
  // Tovar aylanmasi (ombor) hisoboti — mahsulot tanlab, davr bo'yicha PDF/Excel
  const [turnoverOpen, setTurnoverOpen] = useState(false);
  const [tFrom, setTFrom] = useState(() => new Date().getFullYear() + '-01-01');
  const [tTo, setTTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [tSel, setTSel] = useState(() => new Set());
  const [tExporting, setTExporting] = useState(null);
  // Inventarizatsiya (sanab tekshirish)
  const [auditCounts, setAuditCounts] = useState({}); // { [productId]: 'sanalган son' }
  const [adjModal, setAdjModal] = useState(null);     // { product } — ombor +/- oynasi
  const [adjForm, setAdjForm] = useState({ qty: '', rang: '', unit: 'dona' });
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCat, setAuditCat] = useState('all'); // 'all' | 'finished' | 'component'
  const [auditReason, setAuditReason] = useState(''); // sabab (nima uchun)
  const [auditView, setAuditView] = useState('count'); // 'count' = sanash | 'history' = tarix
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditExporting, setAuditExporting] = useState(null);

  const { data: products } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  const { data: rawMats } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
  });

  // Inventarizatsiya tarixi (sana oralig'i bo'yicha)
  const {
    data: auditHistory,
    isLoading: auditHistLoading,
    isFetching: auditHistFetching,
    isError: auditHistError,
    refetch: refetchAuditHist,
  } = useQuery({
    queryKey: ['inventory-audits', auditFrom, auditTo],
    queryFn: () => productsAPI.inventoryHistory({
      start_date: auditFrom || undefined,
      end_date: auditTo || undefined,
    }).then(r => r.data),
    enabled: tab === 'audit' && auditView === 'history',
    retry: 1,
  });
  const auditRows = auditHistory?.audits || [];

  const createRmMutation = useMutation({
    mutationFn: (d) => productsAPI.createRawMaterial(d),
    onSuccess: () => {
      toast.success('Xom ashyo qo\'shildi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setShowRmModal(false);
      resetRm();
    },
  });

  const rmStockMutation = useMutation({
    mutationFn: ({ id, ...d }) => productsAPI.updateRawMaterialStock(id, d),
    onSuccess: () => {
      toast.success('Ombor yangilandi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setRmStockModal(null);
    },
  });

  const { register: registerRm, handleSubmit: handleSubmitRm, reset: resetRm } = useForm();
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit } = useForm();
  const { register: registerComp, handleSubmit: handleSubmitComp, reset: resetComp } = useForm();

  // Ishlab chiqarish ombori — yangi mahsulot (komponent) qo'shish
  const createCompMutation = useMutation({
    mutationFn: (d) => productsAPI.create({
      name: d.name, type: d.type || (d.kind === 'TAYYOR' ? 'Mahsulot' : 'Komponent'), unit: d.unit || 'dona',
      price: parseFloat(d.price) || 0, stock_quantity: parseInt(d.stock_quantity) || 0,
      kind: d.kind === 'TAYYOR' ? 'TAYYOR' : 'KOMPONENT',
    }),
    onSuccess: (_res, d) => {
      toast.success(d.kind === 'TAYYOR' ? 'Tayyor mahsulot qo\'shildi' : 'Komponent ishlab chiqarish omboriga qo\'shildi');
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setShowCompModal(false);
      resetComp();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const { data: bomData } = useQuery({
    queryKey: ['product-bom', bomModal?.id],
    queryFn: () => productsAPI.getBom(bomModal.id).then(r => r.data),
    enabled: !!bomModal,
  });

  const addBomMutation = useMutation({
    mutationFn: ({ product_id, ...data }) => productsAPI.addBomItem(product_id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-bom', bomModal?.id] });
      setBomAddForm({ component_id: '', qty: 1 });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const removeBomMutation = useMutation({
    mutationFn: ({ product_id, component_id }) => productsAPI.removeBomItem(product_id, component_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-bom', bomModal?.id] }),
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const updateRmMutation = useMutation({
    mutationFn: ({ id, ...d }) => productsAPI.updateRawMaterial(id, d),
    onSuccess: () => {
      toast.success('Xom ashyo yangilandi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      setEditRmModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const deleteRmMutation = useMutation({
    mutationFn: (id) => productsAPI.deleteRawMaterial(id),
    onSuccess: () => {
      toast.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const openEdit = (rm) => {
    setEditRmModal(rm);
    resetEdit({
      name: rm.name,
      unit: rm.unit,
      price_per_unit: rm.price_per_unit,
      supplier_name: rm.supplier_name || '',
      min_stock_level: rm.min_stock_level,
      stock_balance: rm.stock_balance,
    });
  };

  // Ombor turi bo'yicha ajratish: KOMPONENT = ishlab chiqarish ombori, qolgani = tayyor ombor
  const allProducts = products?.products || [];
  const finishedProducts = allProducts.filter(p => p.kind !== 'KOMPONENT');
  const componentProducts = allProducts.filter(p => p.kind === 'KOMPONENT');
  const isProdTab = tab === 'production';
  const shownProducts = isProdTab ? componentProducts : finishedProducts;

  const lowProducts = finishedProducts.filter(p => p.stock_quantity < 10);
  const lowRm = (rawMats?.raw_materials || []).filter(rm => rm.stock_balance <= rm.min_stock_level);

  // Xom ashyo qo'shish/tahrirlash — faqat Ta'minotchi (va nazorat uchun Ega) qila oladi
  const canWriteRaw = isOwner() || isTaminotchi();
  // Tayyor mahsulot kirimini boshqarish — Kirimchi (va Ega) ning vazifasi, "Kirim" sahifasi orqali
  const canManageProducts = isOwner() || isKirimchi();

  // Mahsulotni omborlar o'rtasida ko'chirish (tayyor <-> ishlab chiqarish)
  const moveMutation = useMutation({
    mutationFn: ({ id, kind }) => productsAPI.updateBulk([{ id, kind }]),
    onSuccess: () => {
      toast.success('Ombor o\'zgartirildi');
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  // Inventarizatsiya — sanalган (haqiqiy) qoldiqlarni tizimga moslash
  const auditMutation = useMutation({
    mutationFn: ({ items, reason }) => productsAPI.inventoryAdjust(items, reason).then(r => r.data),
    onSuccess: (d) => {
      toast.success(d.changed > 0
        ? `Inventarizatsiya saqlandi — ${d.changed} ta mahsulot to'g'rilandi`
        : 'Farq topilmadi — hammasi mos');
      setAuditCounts({});
      setAuditReason('');
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory-audits'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Saqlashda xato'),
  });

  // Ombor qo'shish/ayirish (＋ / −) — oyna orqali: son + birlik + rang
  const quickAdjustMutation = useMutation({
    mutationFn: ({ product_id, delta, rang, reason }) => productsAPI.inventoryAdjust([{ product_id, delta, rang }], reason).then(r => r.data),
    onSuccess: (d, vars) => {
      toast.success(vars.delta > 0
        ? `Omborga +${Math.abs(vars.delta)} qo'shildi`
        : `Ombordan ${Math.abs(vars.delta)} ayirildi`);
      setAdjModal(null);
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory-audits'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  // Oynani ochish — mahsulotning o'z rangi va birligi bilan to'ldiramiz.
  // presetRang berilса (rang bo'yicha qatordan), o'sha rang tanlab qo'yiladi.
  const openAdj = (product, presetRang) => {
    setAdjForm({
      qty: '',
      rang: (presetRang !== undefined && presetRang !== null)
        ? presetRang
        : (product.rang || (product.color_stock && product.color_stock[0]?.rang) || ''),
      unit: product.unit || 'dona',
    });
    setAdjModal({ product });
  };
  // Tasdiqlash: sign = +1 (qo'shish) yoki -1 (ayirish)
  const confirmAdj = (sign) => {
    const qty = parseFloat(adjForm.qty);
    if (!qty || qty <= 0) return toast.error('Sonni kiriting');
    quickAdjustMutation.mutate({
      product_id: adjModal.product.id,
      delta: sign * qty,
      rang: adjForm.rang,
      reason: auditReason,
    });
  };

  // Inventarizatsiya tarixini Excel/PDF qilib yuklab olish (sana oralig'i bo'yicha)
  const downloadAudit = async (kind) => {
    setAuditExporting(kind);
    try {
      const params = { start_date: auditFrom || undefined, end_date: auditTo || undefined };
      const res = kind === 'excel' ? await productsAPI.inventoryAuditExcel(params) : await productsAPI.inventoryAuditPdf(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventarizatsiya-${auditFrom || 'hammasi'}${auditTo ? '_' + auditTo : ''}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setAuditExporting(null);
    }
  };

  // Ombor ro'yxatini Excel/PDF qilib yuklab olish (joriy tab bo'yicha)
  const downloadInventory = async (format) => {
    const names = { products: 'ombor-tayyor-mahsulotlar', production: 'ombor-ishlab-chiqarish', raw: 'ombor-xom-ashyo' };
    const tid = toast.loading(format === 'pdf' ? 'PDF tayyorlanmoqda...' : 'Excel tayyorlanmoqda...');
    try {
      const res = await reportsAPI.downloadInventory(tab, format);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${names[tab] || 'ombor'}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Yuklab olindi', { id: tid });
    } catch {
      toast.error('Yuklab bo\'lmadi', { id: tid });
    }
  };

  // Tovar aylanmasi — tanlash va eksport
  const tToggle = (id) => setTSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exportTurnover = async (format) => {
    if (!tSel.size) return toast.error('Mahsulot tanlang');
    setTExporting(format);
    const params = { ids: Array.from(tSel).join(','), start_date: tFrom || undefined, end_date: tTo || undefined };
    try {
      const res = format === 'excel' ? await productsAPI.turnoverExcel(params) : await productsAPI.turnoverPdf(params);
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const type = format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = `tovar-aylanmasi-${tFrom || 'boshi'}_${tTo || 'oxiri'}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Yuklab bo\'lmadi'); }
    finally { setTExporting(null); }
  };

  // Inventarizatsiya — qidiruv + kategoriya bo'yicha ro'yxat va kiritilган sonlar
  const auditList = allProducts
    .filter(p => auditCat === 'all' ? true : auditCat === 'finished' ? p.kind !== 'KOMPONENT' : p.kind === 'KOMPONENT')
    .filter(p => { const q = auditSearch.trim().toLowerCase(); return !q || (p.name || '').toLowerCase().includes(q); });
  const auditShown = auditList.slice(0, 120); // ro'yxat juda uzun bo'lsa — qidiruv bilan topiladi

  // Har mahsulotni rang bo'yicha qatorlarga yoyamiz. Rang buketi bo'lsa — har rang alohida
  // qator (rang bo'yicha sanaladi); buketi yo'q bo'lsa — bitta umumiy qator (jami sanaladi).
  const RSEP = '|'; // kalitда product_id va rangни ajratish uchun
  const auditRowsFlat = auditShown.flatMap(p => {
    const buckets = p.color_stock || [];
    if (!buckets.length) {
      return [{ p, rang: null, isColor: false, sys: parseFloat(p.stock_quantity) || 0, key: p.id }];
    }
    return buckets.map(b => ({
      p, rang: b.rang || '', isColor: true,
      sys: parseFloat(b.quantity) || 0, key: `${p.id}${RSEP}${b.rang || ''}`,
    }));
  });

  // Kiritilган sonlardan saqlash ro'yxati — rang qatori → counted_color, oddiy qator → counted
  const auditItems = Object.entries(auditCounts)
    .filter(([, v]) => v !== '' && v != null && !isNaN(parseFloat(v)))
    .map(([key, v]) => {
      const n = parseFloat(v);
      const sep = key.indexOf(RSEP);
      if (sep >= 0) {
        return { product_id: key.slice(0, sep), rang: key.slice(sep + RSEP.length), counted_color: n };
      }
      return { product_id: key, counted: n };
    });

  const TABS = [
    { key: 'products',   label: 'Tayyor mahsulotlar',     icon: Package },
    { key: 'production', label: 'Ishlab chiqarish ombori', icon: Factory },
    { key: 'raw',        label: 'Xom ashyo',              icon: Boxes },
    ...(isOwner() ? [{ key: 'audit', label: 'Inventarizatsiya', icon: ClipboardList }] : []),
  ].filter(t => !(taminotchiOnly && (t.key === 'products' || t.key === 'production' || t.key === 'audit')))
   // Filial faqat o'z omborini (Tayyor mahsulotlar) ko'radi — ishlab chiqarish/xom ashyo/inventarizatsiya yo'q
   .filter(t => !(isBranch && t.key !== 'products'));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Ombor</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {tab !== 'audit' && (
            <button onClick={() => downloadInventory('excel')} className="btn-secondary btn-sm" title="Excel formatida yuklab olish">
              <FileSpreadsheet size={14} /> Excel
            </button>
          )}
          {tab !== 'audit' && (
            <button onClick={() => downloadInventory('pdf')} className="btn-secondary btn-sm" title="PDF formatida yuklab olish">
              <FileText size={14} /> PDF
            </button>
          )}
          {tab !== 'raw' && tab !== 'audit' && (
            <button onClick={() => setTurnoverOpen(true)} className="btn-secondary btn-sm" title="Tovar aylanmasi — davr bo'yicha qoldiq/kirim/chiqim">
              <Warehouse size={14} /> Tovar aylanmasi
            </button>
          )}
          {tab === 'products' && canManageProducts && (
            <button onClick={() => navigate('/intake')} className="btn-primary btn-sm">
              <PackagePlus size={14} /> Mahsulot kirimi (Kirim sahifasi)
            </button>
          )}
          {tab === 'production' && canManageProducts && (
            <button onClick={() => { resetComp(); setShowCompModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Mahsulot qo'shish
            </button>
          )}
          {tab === 'raw' && canWriteRaw && (
            <button onClick={() => { resetRm(); setShowRmModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Xom ashyo qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Tovar aylanmasi hisoboti — mahsulot tanlab, davr bo'yicha PDF/Excel */}
      <Modal open={turnoverOpen} onClose={() => setTurnoverOpen(false)} title="Tovar aylanmasi hisoboti">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Davr boshi</label>
              <input type="date" value={tFrom} onChange={e => setTFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label text-xs">Davr oxiri</label>
              <input type="date" value={tTo} onChange={e => setTTo(e.target.value)} className="input" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{tSel.size} ta tanlandi</span>
            <div className="flex gap-2">
              <button onClick={() => setTSel(new Set(finishedProducts.map(p => p.id)))}
                className="btn-sm bg-white border border-gray-200 rounded-lg px-3 text-gray-600 hover:bg-gray-50">Hammasi</button>
              {tSel.size > 0 && (
                <button onClick={() => setTSel(new Set())}
                  className="btn-sm bg-white border border-gray-200 rounded-lg px-3 text-gray-600 hover:bg-gray-50">Tozalash</button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {finishedProducts.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">Mahsulot yo'q</p>
            ) : finishedProducts.map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={tSel.has(p.id)} onChange={() => tToggle(p.id)} className="w-4 h-4" />
                <span className="text-sm text-gray-800 flex-1">{p.name}</span>
                <span className="text-xs text-gray-400">{p.stock_quantity} {p.unit}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => exportTurnover('excel')} disabled={!tSel.size || !!tExporting}
              className="btn-sm flex-1 flex items-center justify-center gap-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              <FileSpreadsheet size={14} /> {tExporting === 'excel' ? 'Yuklanmoqda...' : 'Excel'}
            </button>
            <button onClick={() => exportTurnover('pdf')} disabled={!tSel.size || !!tExporting}
              className="btn-sm flex-1 flex items-center justify-center gap-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              <FileText size={14} /> {tExporting === 'pdf' ? 'Yuklanmoqda...' : 'PDF'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Tabs */}
      {TABS.length > 1 && (
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>
      )}

      {(tab === 'products' || tab === 'production') && !taminotchiOnly && (
        <>
          {/* Products alert — faqat tayyor ombor uchun */}
          {!isProdTab && lowProducts.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-orange-500" />
                <h3 className="font-semibold text-orange-800">Kam ombor ogohlantirishlari — Mahsulotlar</h3>
              </div>
              <ul className="text-sm text-orange-700 space-y-1">
                {lowProducts.map(p => (
                  <li key={p.id}>• {p.name}: {p.stock_quantity} {p.unit} qoldi</li>
                ))}
              </ul>
            </div>
          )}

          {/* Ombor jadvali */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {isProdTab ? 'Ishlab Chiqarish Ombori (detallar/komponentlar)' : 'Tayyor Mahsulotlar Ombori'}
            </h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mahsulot</th><th>Turi</th><th>Omborda</th><th>Narxi</th><th>Qiymati</th><th>Holat</th>
                    {canManageProducts && <th>Ombor</th>}
                  </tr>
                </thead>
                <tbody>
                  {!shownProducts.length ? (
                    <tr><td colSpan={canManageProducts ? 7 : 6} className="text-center py-8 text-gray-400">
                      <Warehouse size={32} className="mx-auto mb-2 opacity-30" /><br />
                      {isProdTab ? "Ishlab chiqarish omborida mahsulot yo'q" : "Mahsulot yo'q"}
                    </td></tr>
                  ) : shownProducts.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td>{p.type}</td>
                      <td className={`font-bold ${p.stock_quantity < 10 ? 'text-red-600' : 'text-green-700'}`}>
                        {p.stock_quantity} {p.unit}
                      </td>
                      <td>{fmt(p.price)} so'm</td>
                      <td className="font-semibold">{fmt(p.stock_quantity * p.price)} so'm</td>
                      <td>
                        {p.stock_quantity === 0
                          ? <span className="badge-red">Tugagan</span>
                          : p.stock_quantity < 10
                            ? <span className="badge-yellow">Kam</span>
                            : <span className="badge-green">Yetarli</span>
                        }
                      </td>
                      {canManageProducts && (
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {!isProdTab && (
                              <button
                                onClick={() => { setBomModal(p); setBomAddForm({ component_id: '', qty: 1 }); }}
                                className="btn-secondary btn-sm"
                                title="Tarkibni boshqarish"
                              >
                                Tarkib
                              </button>
                            )}
                            <button
                              onClick={() => moveMutation.mutate({ id: p.id, kind: isProdTab ? 'TAYYOR' : 'KOMPONENT' })}
                              className="btn-secondary btn-sm whitespace-nowrap"
                              title={isProdTab ? 'Tayyor mahsulotlar omboriga ko\'chirish' : 'Ishlab chiqarish omboriga ko\'chirish'}
                            >
                              {isProdTab ? '→ Tayyorga' : '→ Ishlab chiqarishga'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManageProducts && !isProdTab && (
              <p className="text-xs text-gray-400 mt-3">
                Mahsulot ombori "Kirim" sahifasi orqali to'ldiriladi — bu yerda faqat ko'rish mumkin.
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'raw' && (
        <>
          {/* Raw materials alert */}
          {lowRm.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-orange-500" />
                <h3 className="font-semibold text-orange-800">Kam ombor ogohlantirishlari — Xom ashyo</h3>
              </div>
              <ul className="text-sm text-orange-700 space-y-1">
                {lowRm.map(rm => (
                  <li key={rm.id}>• {rm.name}: {rm.stock_balance} {rm.unit} qoldi</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw materials */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Xom Ashyolar</h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Nomi</th><th>Birlik</th><th>Omborda</th><th>Narxi</th><th>Ta'minotchi</th><th>Holat</th>{canWriteRaw && <th>Amal</th>}</tr>

                </thead>
                <tbody>
                  {!(rawMats?.raw_materials || []).length ? (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-400">Xom ashyo yo'q</td></tr>
                  ) : (rawMats?.raw_materials || []).map(rm => (
                    <tr key={rm.id}>
                      <td className="font-medium">{rm.name}</td>
                      <td>{rm.unit}</td>
                      <td className={`font-bold ${rm.stock_balance <= rm.min_stock_level ? 'text-red-600' : 'text-green-700'}`}>
                        {rm.stock_balance} {rm.unit}
                      </td>
                      <td>{fmt(rm.price_per_unit)} so'm/{rm.unit}</td>
                      <td>{rm.supplier_name || '—'}</td>
                      <td>
                        {rm.stock_balance <= 0
                          ? <span className="badge-red">Tugagan</span>
                          : rm.stock_balance <= rm.min_stock_level
                            ? <span className="badge-yellow">Kam</span>
                            : <span className="badge-green">Yetarli</span>
                        }
                      </td>
                      {canWriteRaw && (
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(rm)}
                              className="btn-secondary btn-sm" title="Tahrirlash">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => { setRmStockModal(rm); setRmStockForm({ quantity: 0, operation: 'add' }); }}
                              className="btn-secondary btn-sm">Ombor</button>
                            <button
                              onClick={() => { if (confirm(`"${rm.name}" o'chirilsinmi?`)) deleteRmMutation.mutate(rm.id); }}
                              disabled={deleteRmMutation.isPending}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="O'chirish">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!canWriteRaw && (
              <p className="text-xs text-gray-400 mt-3">
                Xom ashyo qo'shish va ombor balansini o'zgartirish faqat Ta'minotchi vazifasi.
              </p>
            )}
          </div>
        </>
      )}

      {/* INVENTARIZATSIYA — sanab tekshirish */}
      {tab === 'audit' && (
        <>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button onClick={() => setAuditView('count')}
              className={`btn-sm rounded-md px-4 ${auditView === 'count' ? 'bg-white shadow-sm text-indigo-700 font-semibold' : 'text-gray-500'}`}>Sanash</button>
            <button onClick={() => setAuditView('history')}
              className={`btn-sm rounded-md px-4 ${auditView === 'history' ? 'bg-white shadow-sm text-indigo-700 font-semibold' : 'text-gray-500'}`}>Tarix</button>
          </div>

          {auditView === 'count' && (
          <>
          <div className="card p-4 space-y-3">
            <div className="flex items-start gap-2">
              <ClipboardList size={18} className="text-indigo-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500">
                Har bir mahsulotni <b>sanab</b>, "Sanaldi" ustuniga haqiqiy sonini yozing. "Farq" o'zi hisoblanadi.
                <b> Saqlash</b> bosilganda tizimdagi ombor qoldig'i siz sanagan songa to'g'rilanadi. Bo'sh qoldirilган
                qatorlarga tegilmaydi. Yoki <b>Qo'shish / Ayirish</b> ustunidagi son bilan
                <span className="text-green-600 font-bold"> ＋</span> /
                <span className="text-red-600 font-bold"> −</span> tugmalarini bosib omborga darrov qo'shing yoki ayiring (tarixga yoziladi).
                <br />
                <b>Rangli mahsulotlar</b> har rang uchun alohida qatorда ko'rsatiladi — har rangни alohida sanang.
                Umumiy qoldiq <b>ranglar yig'indisiga</b> avtomatik to'g'rilanadi (masalan Оқ + Қора).
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Sabab (nima uchun to'g'rilanmoqda)</label>
              <input value={auditReason} onChange={e => setAuditReason(e.target.value)}
                placeholder="Masalan: sanoq xatosi, yo'qolган, buzilған, topildi..."
                className="input w-full mt-1" />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['Sanoq xatosi', 'Yo\'qolган / kamaygan', 'Buzilган (brak)', 'Topildi / ortdi', 'Yillik inventarizatsiya'].map(s => (
                  <button key={s} type="button" onClick={() => setAuditReason(s)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${auditReason === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                  placeholder="Mahsulot qidirish..." className="input pl-8 w-full" />
              </div>
              <div className="flex gap-1">
                {[{ k: 'all', t: 'Hammasi' }, { k: 'finished', t: 'Tayyor' }, { k: 'component', t: 'Komponent' }].map(c => (
                  <button key={c.k} onClick={() => setAuditCat(c.k)}
                    className={`btn-sm rounded-lg px-3 border ${auditCat === c.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {c.t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-500">
                {auditList.length} ta mahsulot · {auditItems.length} ta kiritildi
              </span>
              <div className="flex gap-2">
                {auditItems.length > 0 && (
                  <button onClick={() => setAuditCounts({})} className="btn-secondary btn-sm" disabled={auditMutation.isPending}>
                    <X size={14} /> Tozalash
                  </button>
                )}
                <button onClick={() => auditMutation.mutate({ items: auditItems, reason: auditReason })}
                  disabled={!auditItems.length || auditMutation.isPending}
                  className="btn-primary btn-sm">
                  <Save size={14} /> {auditMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mahsulot</th><th>Rang</th>
                    <th className="text-right">Tizimda</th>
                    <th className="text-right">Sanaldi</th>
                    <th className="text-right">Farq</th>
                    <th className="text-right">Qo'shish / Ayirish</th>
                  </tr>
                </thead>
                <tbody>
                  {!auditList.length ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">
                      <ClipboardList size={26} className="mx-auto mb-2 text-gray-300" />
                      {auditSearch ? `"${auditSearch}" bo'yicha topilmadi` : 'Mahsulot yo\'q'}
                    </td></tr>
                  ) : auditRowsFlat.map(row => {
                    const { p, rang, isColor, sys, key } = row;
                    const raw = auditCounts[key];
                    const counted = raw === '' || raw == null ? null : parseFloat(raw);
                    const diff = counted == null || isNaN(counted) ? null : counted - sys;
                    const rangLabel = isColor ? (rang || 'Rangsiz') : (p.rang || '—');
                    return (
                      <tr key={key} className={diff != null && diff !== 0 ? 'bg-yellow-50/60' : ''}>
                        <td className="font-medium text-gray-900">{p.name}</td>
                        <td className="text-gray-600">
                          <span className="inline-flex items-center gap-1.5">
                            {isColor && (
                              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: RANG_COLORS[rang] || '#bbb', border:'1px solid #ccc' }} />
                            )}
                            {rangLabel}
                          </span>
                        </td>
                        <td className="text-right font-semibold">{fmt(sys)} {p.unit}</td>
                        <td className="text-right">
                          <input type="number" min="0" inputMode="numeric"
                            value={raw ?? ''}
                            onChange={e => setAuditCounts(prev => ({ ...prev, [key]: e.target.value }))}
                            onFocus={e => e.target.select()}
                            placeholder="—"
                            className="input py-1 w-24 text-right ml-auto" />
                        </td>
                        <td className="text-right font-bold whitespace-nowrap">
                          {diff == null ? <span className="text-gray-300">—</span>
                            : diff === 0 ? <span className="text-green-600">0</span>
                            : diff > 0 ? <span className="text-blue-600">+{fmt(diff)}</span>
                            : <span className="text-red-600">−{fmt(Math.abs(diff))}</span>}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openAdj(p, isColor ? rang : undefined)}
                              className="px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium flex items-center gap-1"
                              title="Omborga qo'shish">
                              <Plus size={13} /> Qo'shish
                            </button>
                            <button onClick={() => openAdj(p, isColor ? rang : undefined)}
                              className="px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium flex items-center gap-1"
                              title="Ombordan ayirish">
                              <Minus size={13} /> Ayirish
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {auditList.length > auditShown.length && (
                    <tr><td colSpan={6} className="text-center py-3 text-xs text-gray-400">
                      Yana {auditList.length - auditShown.length} ta mahsulot — yuqoridagi qidiruv yoki kategoriya bilan toping
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}

          {auditView === 'history' && (
          <>
            <div className="card p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Davr:</span>
                <input type="date" value={auditFrom} onChange={e => setAuditFrom(e.target.value)} className="input text-xs py-1.5 w-40" title="Dan" />
                <span className="text-gray-400 text-xs">—</span>
                <input type="date" value={auditTo} onChange={e => setAuditTo(e.target.value)} className="input text-xs py-1.5 w-40" title="Gacha" />
                {(auditFrom || auditTo) && (
                  <button onClick={() => { setAuditFrom(''); setAuditTo(''); }} className="text-gray-400 hover:text-red-500" title="Tozalash"><X size={16} /></button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => refetchAuditHist()} className="btn-secondary btn-sm" title="Yangilash">
                    <RefreshCw size={14} className={auditHistFetching ? 'animate-spin' : ''} /> Yangilash
                  </button>
                  <button onClick={() => downloadAudit('excel')} disabled={!!auditExporting || !auditRows.length} className="btn-secondary btn-sm">
                    <FileSpreadsheet size={14} /> {auditExporting === 'excel' ? '...' : 'Excel'}
                  </button>
                  <button onClick={() => downloadAudit('pdf')} disabled={!!auditExporting || !auditRows.length} className="btn-secondary btn-sm">
                    <FileText size={14} /> {auditExporting === 'pdf' ? '...' : 'PDF'}
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {(auditHistLoading || auditHistFetching) ? 'Yuklanmoqda...'
                  : auditHistError ? <span className="text-red-500">Tarixni yuklab bo'lmadi — "Yangilash" tugmasini bosing</span>
                  : `Jami ${auditRows.length} ta yozuv${(auditFrom || auditTo) ? ' (tanlangan davrda)' : ''}`}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="table-container">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <th>Sana</th><th>Mahsulot</th><th>Rang</th>
                      <th className="text-right">Dastlabki</th>
                      <th className="text-right">Sanaldi</th>
                      <th className="text-right">Farq</th>
                      <th>Sabab</th><th>Kim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditHistLoading || auditHistFetching) ? (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400">Yuklanmoqda...</td></tr>
                    ) : auditHistError ? (
                      <tr><td colSpan={8} className="text-center py-10 text-red-500">
                        Tarixni yuklab bo'lmadi. Yuqoridagi "Yangilash" tugmasini bosing.
                      </td></tr>
                    ) : !auditRows.length ? (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                        <ClipboardList size={26} className="mx-auto mb-2 text-gray-300" />
                        {(auditFrom || auditTo)
                          ? 'Bu davrda inventarizatsiya yozuvi yo\'q'
                          : 'Hali inventarizatsiya qilinmagan — "Sanash" bo\'limida ombor qo\'shing yoki ayiring'}
                      </td></tr>
                    ) : auditRows.map(a => {
                      const d = parseFloat(a.delta) || 0;
                      return (
                        <tr key={a.id}>
                          <td className="whitespace-nowrap text-gray-600">{String(a.created_at || '').slice(0, 10)}</td>
                          <td className="font-medium text-gray-900">{a.product_name || '—'}</td>
                          <td className="text-gray-500">{a.rang || '—'}</td>
                          <td className="text-right">{fmt(a.old_qty)}</td>
                          <td className="text-right font-semibold">{fmt(a.new_qty)}</td>
                          <td className="text-right font-bold whitespace-nowrap">
                            {d > 0 ? <span className="text-blue-600">+{fmt(d)}</span>
                              : d < 0 ? <span className="text-red-600">−{fmt(Math.abs(d))}</span>
                              : <span className="text-green-600">0</span>}
                          </td>
                          <td className="text-gray-600">{a.reason || '—'}</td>
                          <td className="text-gray-500">{a.created_by_name || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
          )}
        </>
      )}

      {/* Ombor qo'shish/ayirish oynasi (＋ / −) */}
      <Modal open={!!adjModal} onClose={() => setAdjModal(null)} title={adjModal ? `${adjModal.product.name}` : ''}>
        {adjModal && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              Hozir omborda: <b className="text-gray-800">{fmt(adjModal.product.stock_quantity)} {adjModal.product.unit}</b>
            </div>
            <div>
              <label className="label">Miqdor (son) *</label>
              <input type="number" min="0" step="any" autoFocus
                value={adjForm.qty}
                onChange={e => setAdjForm(f => ({ ...f, qty: e.target.value }))}
                onFocus={e => e.target.select()}
                placeholder="Sonni kiriting..."
                className="input w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Birlik</label>
                <select value={adjForm.unit} onChange={e => setAdjForm(f => ({ ...f, unit: e.target.value }))} className="select">
                  {['dona', 'kg', 'litr', 'ton', 'metr', 'paket', 'quti'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Rang</label>
                <select value={adjForm.rang} onChange={e => setAdjForm(f => ({ ...f, rang: e.target.value }))} className="select">
                  <option value="">— Rangsiz —</option>
                  {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Sabab (ixtiyoriy)</label>
              <input value={auditReason} onChange={e => setAuditReason(e.target.value)}
                placeholder="Masalan: yangi kirim, yo'qolган, sanoq..." className="input w-full" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => confirmAdj(-1)} disabled={quickAdjustMutation.isPending}
                className="flex-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg py-2.5 font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                <Minus size={16} /> Ayirish
              </button>
              <button onClick={() => confirmAdj(1)} disabled={quickAdjustMutation.isPending}
                className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-lg py-2.5 font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                <Plus size={16} /> Qo'shish
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add raw material */}
      <Modal open={showRmModal} onClose={() => setShowRmModal(false)} title="Yangi Xom Ashyo">
        <form onSubmit={handleSubmitRm(d => createRmMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...registerRm('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Miqdor *</label>
              <input {...registerRm('quantity', { required: true })} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <select {...registerRm('unit')} className="select">
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="litr">litr</option>
                <option value="dona">dona</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm/birlik)</label>
              <input {...registerRm('price_per_unit')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Min. ombor</label>
              <input {...registerRm('min_stock_level')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Ta'minotchi</label>
            <input {...registerRm('supplier_name')} className="input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" {...registerRm('create_expense')} className="w-4 h-4" defaultChecked />
            Xom ashyo qiymatini xarajat sifatida ham yozib qo'yish (Narxi va Miqdor bo'yicha)
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowRmModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createRmMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* Ishlab chiqarish ombori — mahsulot (komponent) qo'shish */}
      <Modal open={showCompModal} onClose={() => setShowCompModal(false)} title="Ishlab chiqarish — mahsulot qo'shish">
        <form onSubmit={handleSubmitComp(d => createCompMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Turi *</label>
            <select {...registerComp('kind')} defaultValue="KOMPONENT" className="select">
              <option value="KOMPONENT">Komponent (yig'iladi — detal)</option>
              <option value="TAYYOR">Tayyor (bittada tayyor — sotiladi)</option>
            </select>
          </div>
          <div>
            <label className="label">Nomi *</label>
            <input {...registerComp('name', { required: true })} className="input" placeholder="Masalan: Korpus, Oyoq, Qopqoq..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Turi</label>
              <input {...registerComp('type')} className="input" placeholder="Komponent" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <select {...registerComp('unit')} className="select">
                <option value="dona">dona</option>
                <option value="kg">kg</option>
                <option value="metr">metr</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm)</label>
              <input {...registerComp('price')} type="number" min="0" defaultValue={0} className="input" />
            </div>
            <div>
              <label className="label">Omborda (soni)</label>
              <input {...registerComp('stock_quantity')} type="number" min="0" defaultValue={0} className="input" />
            </div>
          </div>
          <p className="text-xs text-gray-400"><b>Komponent</b> → ishlab chiqarish ombori (sotuvда ko'rinmaydi). <b>Tayyor</b> → tayyor mahsulotlar ombori (sotuvда ko'rinadi).</p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCompModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createCompMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>

      {/* Xom ashyo tahrirlash modali */}
      <Modal open={!!editRmModal} onClose={() => setEditRmModal(null)} title={`Tahrirlash — ${editRmModal?.name || ''}`}>
        <form onSubmit={handleSubmitEdit(d => updateRmMutation.mutate({ id: editRmModal.id, ...d }))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...registerEdit('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ombordagi miqdor</label>
              <input {...registerEdit('stock_balance')} type="number" min="0" step="0.01" className="input" />
            </div>
            <div>
              <label className="label">Birlik</label>
              <select {...registerEdit('unit')} className="select">
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="litr">litr</option>
                <option value="dona">dona</option>
                <option value="metr">metr</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Narxi (so'm/birlik)</label>
              <input {...registerEdit('price_per_unit')} type="number" min="0" className="input" />
            </div>
            <div>
              <label className="label">Min. ombor darajasi</label>
              <input {...registerEdit('min_stock_level')} type="number" min="0" step="0.01" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Ta'minotchi nomi</label>
            <input {...registerEdit('supplier_name')} className="input" placeholder="Kompaniya yoki shaxs ismi" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditRmModal(null)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={updateRmMutation.isPending} className="btn-primary flex-1">
              {updateRmMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* BOM — Tayyor mahsulot tarkibi modali */}
      <Modal
        open={!!bomModal}
        onClose={() => { setBomModal(null); setBomAddForm({ component_id: '', qty: 1 }); }}
        title={`Tarkib — ${bomModal?.name || ''}`}
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Tarkibdagi komponentlar</h4>
            {!(bomData?.bom?.length) ? (
              <p className="text-sm text-gray-400 text-center py-4">Hali komponent qo'shilmagan</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(bomData?.bom || []).map(item => (
                  <div key={item.component_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="text-gray-500 text-sm ml-2">× {item.qty} {item.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">ombor: {item.stock_quantity}</span>
                      {canManageProducts && (
                        <button
                          onClick={() => removeBomMutation.mutate({ product_id: bomModal.id, component_id: item.component_id })}
                          disabled={removeBomMutation.isPending}
                          className="p-1 text-red-400 hover:text-red-600 rounded"
                          title="Olib tashlash"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canManageProducts && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Komponent qo'shish</h4>
              <div className="flex gap-2 items-center">
                <select
                  value={bomAddForm.component_id}
                  onChange={e => setBomAddForm(f => ({ ...f, component_id: e.target.value }))}
                  className="select flex-1 text-sm"
                >
                  <option value="">Komponent tanlang...</option>
                  {componentProducts.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (ombor: {c.stock_quantity})</option>
                  ))}
                </select>
                <input
                  type="number" min="1" step="1"
                  value={bomAddForm.qty}
                  onChange={e => setBomAddForm(f => ({ ...f, qty: parseFloat(e.target.value) || 1 }))}
                  className="input w-20 text-sm"
                  placeholder="soni"
                />
                <button
                  onClick={() => {
                    if (!bomAddForm.component_id) return toast.error('Komponent tanlang');
                    addBomMutation.mutate({ product_id: bomModal.id, component_id: bomAddForm.component_id, qty: bomAddForm.qty });
                  }}
                  disabled={addBomMutation.isPending}
                  className="btn-primary btn-sm whitespace-nowrap"
                >
                  <Plus size={14} /> Qo'shish
                </button>
              </div>
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

      {/* RM Stock Modal */}
      {rmStockModal && (
        <Modal open={!!rmStockModal} onClose={() => setRmStockModal(null)} title={`Ombor — ${rmStockModal.name}`}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              Joriy: <strong>{rmStockModal.stock_balance} {rmStockModal.unit}</strong>
            </div>
            <div>
              <label className="label">Operatsiya</label>
              <select value={rmStockForm.operation} onChange={e => setRmStockForm(f => ({ ...f, operation: e.target.value }))} className="select">
                <option value="add">Kirim (+)</option>
                <option value="subtract">Chiqim (-)</option>
                <option value="set">Belgilash (=)</option>
              </select>
            </div>
            <div>
              <label className="label">Miqdor ({rmStockModal.unit})</label>
              <input type="number" min="0" value={rmStockForm.quantity}
                onChange={e => setRmStockForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                className="input" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRmStockModal(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={() => rmStockMutation.mutate({ id: rmStockModal.id, ...rmStockForm })}
                disabled={rmStockMutation.isPending} className="btn-primary flex-1">Saqlash</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
