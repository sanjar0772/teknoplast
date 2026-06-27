import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RotateCcw, Warehouse, AlertTriangle, Coins, X, Search, Printer, Plus, Package, User, ArrowLeft, Check, FileText, Trash2 } from 'lucide-react';
import { salesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import VozvratFakturaModal from '../components/VozvratFakturaModal';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function VozvratlarPage() {
  const qc = useQueryClient();
  const { isOwner } = useAuthStore();
  const [dateFilter, setDateFilter] = useState({ date_from: '', date_to: '' });
  const [datePreset, setDatePreset] = useState('all');
  const [search, setSearch] = useState('');
  const [receiptFor, setReceiptFor] = useState(null); // vozvrat cheki uchun

  // ── Vozvrat oqimi: 1) mijoz tanlash → 2) mahsulotlarni belgilash (bir nechtasini birdan) ──
  const [picker, setPicker] = useState(false);
  const [step, setStep] = useState('customer');        // 'customer' | 'products'
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { key, id, name, sales }
  const [selectedItems, setSelectedItems] = useState({});         // { [saleId]: { quantity, condition } }
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSettlement, setBulkSettlement] = useState('DEBT'); // DEBT | REFUND | CREDIT — summani qanday yopish

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
    queryKey: ['returns-all', dateFilter],
    queryFn: () => salesAPI.getAllReturns(dateFilter.date_from || dateFilter.date_to ? dateFilter : undefined).then(r => r.data),
  });

  // Vozvrat qilish uchun so'nggi sotuvlar (faqat oyna ochilganda yuklanadi)
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales', 'for-return'],
    queryFn: () => salesAPI.getAll({ limit: 300 }).then(r => r.data),
    enabled: picker,
  });

  // 1-qadam: sotuvlarni mijoz bo'yicha guruhlash
  const customerGroups = useMemo(() => {
    const list = (salesData?.sales || []).filter(s => (parseInt(s.quantity, 10) || 0) >= 1);
    const map = new Map();
    list.forEach(s => {
      const key = s.customer_id ? `c:${s.customer_id}` : 'walkin';
      if (!map.has(key)) {
        map.set(key, { key, id: s.customer_id || null, name: s.customer_name || 'Tasodifiy mijoz', sales: [] });
      }
      map.get(key).sales.push(s);
    });
    return Array.from(map.values()).sort((a, b) => b.sales.length - a.sales.length);
  }, [salesData]);

  const visibleCustomers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return customerGroups;
    return customerGroups.filter(c => c.name.toLowerCase().includes(q));
  }, [customerGroups, pickerSearch]);

  // 2-qadam: tanlangan mijozning mahsulotlari (qidiruv bilan)
  const customerSales = useMemo(() => {
    if (!selectedCustomer) return [];
    const q = pickerSearch.trim().toLowerCase();
    const list = selectedCustomer.sales;
    if (!q) return list;
    return list.filter(s =>
      String(s.product_name || '').toLowerCase().includes(q) ||
      String(s.order_ref || '').toLowerCase().includes(q)
    );
  }, [selectedCustomer, pickerSearch]);

  const bulkMutation = useMutation({
    mutationFn: async ({ items, reason, settlement }) => {
      const results = [];
      // Ketma-ket yuboramiz — har bir sotuv alohida vozvrat qilinadi
      for (const it of items) {
        const res = await salesAPI.returnSale(it.id, { quantity: it.quantity, reason, condition: it.condition, settlement });
        results.push(res.data);
      }
      return results;
    },
    onSuccess: (results) => {
      const refund = results.reduce((a, r) => a + parseFloat(r?.refund_amount || 0), 0);
      const loss   = results.reduce((a, r) => a + parseFloat(r?.loss_amount || 0), 0);
      const debtDed = results.reduce((a, r) => a + parseFloat(r?.debt_deducted || 0), 0);
      let msg = `${results.length} ta mahsulot qaytarildi`;
      if (debtDed > 0) msg += ` · Qarzdan ayirildi: ${fmt(debtDed)} so'm`;
      if (refund > 0) msg += ` · Qaytariladigan pul: ${fmt(refund)} so'm`;
      if (loss > 0)   msg += ` · Ziyon: ${fmt(loss)} so'm`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['returns-all'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-summary'] });
      closePicker();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Vozvratda xato'),
  });

  // Barcha vozvratlar tarixini o'chirish (0 qilish) — faqat OWNER
  const resetMutation = useMutation({
    mutationFn: () => salesAPI.resetReturns().then(r => r.data),
    onSuccess: (d) => {
      toast.success(`${d?.count ?? 0} ta vozvrat o'chirildi`);
      qc.invalidateQueries({ queryKey: ['returns-all'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Tozalashda xato'),
  });

  const openPicker = () => {
    setStep('customer');
    setPickerSearch('');
    setSelectedCustomer(null);
    setSelectedItems({});
    setBulkReason('');
    setBulkSettlement('DEBT');
    setPicker(true);
  };
  const closePicker = () => {
    setPicker(false);
    setStep('customer');
    setSelectedCustomer(null);
    setSelectedItems({});
    setBulkReason('');
    setBulkSettlement('DEBT');
    setPickerSearch('');
  };

  const chooseCustomer = (cust) => {
    setSelectedCustomer(cust);
    setSelectedItems({});
    setPickerSearch('');
    setStep('products');
  };
  const backToCustomers = () => {
    setStep('customer');
    setSelectedCustomer(null);
    setSelectedItems({});
    setPickerSearch('');
  };

  const isPicked = (sale) => Object.prototype.hasOwnProperty.call(selectedItems, sale.id);
  const toggleItem = (sale) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[sale.id]) {
        delete next[sale.id];
      } else {
        next[sale.id] = { quantity: parseInt(sale.quantity, 10) || 1, condition: 'GOOD' };
      }
      return next;
    });
  };
  const setItemQty = (sale, val) => {
    setSelectedItems(prev => ({ ...prev, [sale.id]: { ...prev[sale.id], quantity: val } }));
  };
  const setItemCond = (sale, cond) => {
    setSelectedItems(prev => ({ ...prev, [sale.id]: { ...prev[sale.id], condition: cond } }));
  };

  const pickedCount = Object.keys(selectedItems).length;

  const submitBulk = () => {
    const entries = Object.entries(selectedItems);
    if (!entries.length) return toast.error('Kamida bitta mahsulot tanlang');
    if (!bulkReason.trim()) return toast.error('Vozvrat sababi majburiy');

    const items = [];
    for (const [id, it] of entries) {
      const sale = selectedCustomer.sales.find(s => String(s.id) === String(id));
      const max = parseInt(sale?.quantity, 10) || 0;
      const q = parseInt(it.quantity, 10);
      if (!q || q < 1) return toast.error(`"${sale?.product_name}" — miqdor noto'g'ri`);
      if (q > max) return toast.error(`"${sale?.product_name}" — faqat ${max} ${sale?.unit || 'dona'} qaytarish mumkin`);
      items.push({ id, quantity: q, condition: it.condition });
    }
    const settlement = bulkSettlement === 'REFUND' ? 'REFUND' : 'BALANCE';
    bulkMutation.mutate({ items, reason: bulkReason.trim(), settlement });
  };

  const summary = data?.summary || {};
  const all = data?.returns || [];
  const q = search.trim().toLowerCase();
  const returns = !q ? all : all.filter(r =>
    String(r.product_name || '').toLowerCase().includes(q) ||
    String(r.customer_name || '').toLowerCase().includes(q) ||
    String(r.reason || '').toLowerCase().includes(q)
  );

  const cards = [
    { label: 'Omborga qaytgan', value: `${fmt(summary.good_qty)} dona`, cls: 'text-emerald-600', bg: 'bg-emerald-50', Icon: Warehouse },
    { label: 'Brak (ziyon)',    value: `${fmt(summary.defective_qty)} dona`, cls: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
    { label: 'Ziyon summasi',   value: `${fmt(summary.total_loss)} so'm`, cls: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
    { label: 'Qaytarilgan pul', value: `${fmt(summary.total_refund)} so'm`, cls: 'text-blue-600', bg: 'bg-blue-50', Icon: Coins },
  ];

  return (
    <div className="space-y-6">
      <div id="vozvrat-print" className="space-y-6">
        <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-2 mb-2">
          <span className="font-bold text-gray-900">TEKNOPLAST — Vozvratlar (Qaytarishlar) hisoboti</span>
          <span className="text-sm text-gray-600">{new Date().toLocaleDateString('uz-UZ')}</span>
        </div>

        <div className="page-header">
          <h1 className="page-title flex items-center gap-2"><RotateCcw size={20} /> Vozvratlar (Qaytarishlar)</h1>
          <div className="flex items-center gap-2 no-print">
            <button onClick={openPicker} className="btn-primary btn-sm">
              <Plus size={14} /> Vozvrat qilish
            </button>
            <button onClick={() => window.print()} className="btn-secondary btn-sm">
              <Printer size={14} /> Chop etish
            </button>
            {isOwner() && (
              <button
                onClick={() => { if (window.confirm('Barcha vozvratlar tarixi o\'chiriladi (0 qilinadi). Sotuv/ombor o\'zgarmaydi. Davom etamizmi?')) resetMutation.mutate(); }}
                disabled={resetMutation.isPending}
                className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-3 flex items-center gap-1 disabled:opacity-50">
                <Trash2 size={14} /> {resetMutation.isPending ? 'O\'chirilmoqda...' : 'Tozalash'}
              </button>
            )}
          </div>
        </div>

        {/* Summary kartalar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c, i) => (
            <div key={i} className={`card-sm ${c.bg}`}>
              <div className="flex items-center gap-2">
                <c.Icon size={14} className={c.cls} />
                <p className="text-xs text-gray-600">{c.label}</p>
              </div>
              <p className={`text-lg font-bold mt-1 ${c.cls}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Qidiruv + sana filtri */}
        <div className="no-print card p-4 space-y-3">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Mahsulot, mijoz yoki sabab bo'yicha qidirish..."
              className="input pl-9 pr-9 w-full" />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {[
              { key: 'all',       label: 'Barchasi' },
              { key: 'today',     label: 'Bugun' },
              { key: 'week',      label: 'Bu hafta' },
              { key: 'month',     label: 'Bu oy' },
              { key: 'lastmonth', label: "O'tgan oy" },
            ].map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
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
              <button onClick={() => applyPreset('all')} className="text-gray-400 hover:text-red-500" title="Tozalash">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Jadval */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Sana</th><th>Mahsulot</th><th>Mijoz</th><th>Miqdor</th>
                <th>Holati</th><th>Summa</th><th>Qarzdan</th><th>Ziyon</th><th>Sabab</th><th className="no-print">Amal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
              ) : !all.length ? (
                <tr><td colSpan={11} className="text-center py-10 text-gray-400">
                  <RotateCcw size={28} className="mx-auto mb-2 text-gray-300" />
                  Hali vozvrat (qaytarish) yo'q
                </td></tr>
              ) : !returns.length ? (
                <tr><td colSpan={11} className="text-center py-10 text-gray-400">
                  <Search size={24} className="mx-auto mb-2 text-gray-300" />
                  "{search}" bo'yicha topilmadi
                </td></tr>
              ) : returns.map(r => {
                const defective = r.condition === 'DEFECTIVE';
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{new Date(r.return_date || r.created_at).toLocaleDateString('uz-UZ')}</td>
                    <td>
                      <div className="font-medium text-gray-900">{r.product_name || 'Mahsulot'}</div>
                      {r.rang && <div className="text-xs text-gray-400">{r.rang}</div>}
                    </td>
                    <td className="text-gray-600">{r.customer_name || '—'}</td>
                    <td className="whitespace-nowrap">{fmt(r.quantity)} {r.unit || 'dona'}</td>
                    <td>
                      {defective
                        ? <span className="badge bg-red-50 text-red-600 flex items-center gap-1 w-fit"><AlertTriangle size={11} /> Brak / Ziyon</span>
                        : <span className="badge bg-emerald-50 text-emerald-600 flex items-center gap-1 w-fit"><Warehouse size={11} /> Omborga qaytdi</span>}
                    </td>
                    <td className="whitespace-nowrap">{fmt(r.amount)} so'm</td>
                    <td className={`whitespace-nowrap font-semibold ${parseFloat(r.debt_deducted) > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {parseFloat(r.debt_deducted) > 0 ? `−${fmt(r.debt_deducted)}` : '—'}
                    </td>
                    <td className={`whitespace-nowrap font-semibold ${defective ? 'text-red-600' : 'text-gray-300'}`}>
                      {defective ? `${fmt(r.loss_amount)} so'm` : '—'}
                    </td>
                    <td className="max-w-[200px]"><span className="text-sm text-gray-600">{r.reason}</span></td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">{r.created_by_name || '—'}</td>
                    <td className="no-print">
                      <button onClick={() => setReceiptFor(r)} className="btn-secondary btn-sm" title="Vozvrat schyot-fakturasi">
                        <FileText size={12} /> Faktura
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1-qadam: MIJOZNI tanlash */}
      <Modal open={picker && step === 'customer'} onClose={closePicker} title="Qaysi mijoz qaytarmoqchi?" wide>
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Mijoz ismi bo'yicha qidirish..."
              className="input pl-9 w-full" />
          </div>
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
            {salesLoading ? (
              <p className="text-center py-8 text-gray-400 text-sm">Yuklanmoqda...</p>
            ) : !visibleCustomers.length ? (
              <p className="text-center py-8 text-gray-400 text-sm">
                <User size={24} className="mx-auto mb-2 opacity-30" />
                Mijoz topilmadi
              </p>
            ) : visibleCustomers.map(c => (
              <button key={c.key} onClick={() => chooseCustomer(c)}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-blue-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.sales.length} ta mahsulot sotilgan</div>
                  </div>
                </div>
                <span className="badge bg-gray-100 text-gray-600 flex-shrink-0">{c.sales.length}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* 2-qadam: MAHSULOTLARNI belgilash (bir nechtasini birdan) */}
      <Modal open={picker && step === 'products'} onClose={closePicker}
        title={selectedCustomer ? `${selectedCustomer.name} — mahsulotlar` : 'Mahsulotlar'} wide>
        <div className="space-y-3">
          <button onClick={backToCustomers} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <ArrowLeft size={14} /> Mijozni o'zgartirish
          </button>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Mahsulot yoki chek raqami..."
              className="input pl-9 w-full" />
          </div>

          <p className="text-xs text-gray-500">Qaytariladigan mahsulotlarni belgilang (bir nechtasini birdan tanlash mumkin):</p>

          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[42vh] overflow-y-auto">
            {!customerSales.length ? (
              <p className="text-center py-8 text-gray-400 text-sm">
                <Package size={24} className="mx-auto mb-2 opacity-30" />
                Mahsulot topilmadi
              </p>
            ) : customerSales.map(s => {
              const picked = isPicked(s);
              const it = selectedItems[s.id];
              const max = parseInt(s.quantity, 10) || 0;
              return (
                <div key={s.id} className={`px-3 py-2.5 transition ${picked ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                  <button onClick={() => toggleItem(s)} className="w-full flex items-center gap-3 text-left">
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${picked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                      {picked && <Check size={13} className="text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{s.product_name}{s.rang ? ` · ${s.rang}` : ''}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {new Date(s.sale_date).toLocaleDateString('uz-UZ')}
                        {s.order_ref ? ` · ${s.order_ref}` : ''} · {fmt(s.unit_price)} so'm
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 flex-shrink-0">{fmt(s.quantity)} {s.unit || 'dona'}</div>
                  </button>

                  {picked && (
                    <div className="mt-2 ml-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-500">Miqdor (maks: {max})</label>
                        <input type="number" min="1" max={max} className="input py-1.5 text-sm"
                          value={it.quantity}
                          onChange={e => setItemQty(s, e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500">Holati</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button type="button" onClick={() => setItemCond(s, 'GOOD')}
                            className={`rounded-lg border px-2 py-1.5 text-xs flex items-center justify-center gap-1 transition ${it.condition === 'GOOD' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            <Warehouse size={12} /> Yaxshi
                          </button>
                          <button type="button" onClick={() => setItemCond(s, 'DEFECTIVE')}
                            className={`rounded-lg border px-2 py-1.5 text-xs flex items-center justify-center gap-1 transition ${it.condition === 'DEFECTIVE' ? 'border-red-400 bg-red-50 text-red-700 ring-1 ring-red-300' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            <AlertTriangle size={12} /> Brak
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Vozvrat summasi qayerga ketsin? */}
          <div>
            <label className="label">Summa qayerga ketsin? * (barcha tanlanganlar uchun)</label>
            <div className="space-y-2">
              {[
                { key: 'DEBT',   title: '➖ Qarzdan ayirsin',      desc: 'Qarz shu summaga kamayadi (naqd berilmaydi)' },
                { key: 'REFUND', title: '💵 Naqd qaytarib berish', desc: 'Mijozga naqd pul qaytariladi' },
                { key: 'CREDIT', title: '⭐ Haqdor bo‘lib qolsin',  desc: 'Mijoz shu summaga haqdor bo‘ladi (keyingi xaridda)' },
              ].map(opt => (
                <button key={opt.key} type="button" onClick={() => setBulkSettlement(opt.key)}
                  className={`w-full rounded-xl border p-2.5 text-sm text-left transition ${bulkSettlement === opt.key ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-900">{opt.title}</div>
                  <div className="text-[11px] text-gray-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Sabab * (barcha tanlanganlar uchun, majburiy)</label>
            <textarea className="input" rows={2} placeholder="Masalan: sifatsiz, ortiqcha, mijoz qaytardi..."
              value={bulkReason}
              onChange={e => setBulkReason(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={closePicker} className="btn-secondary flex-1">Bekor</button>
            <button onClick={submitBulk} disabled={bulkMutation.isPending || !pickedCount} className="btn-primary flex-1">
              <RotateCcw size={14} />
              {bulkMutation.isPending ? 'Saqlanmoqda...' : `Qaytarish${pickedCount ? ` (${pickedCount} ta)` : ''}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Vozvrat schyot-fakturasi */}
      {receiptFor && <VozvratFakturaModal ret={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}
