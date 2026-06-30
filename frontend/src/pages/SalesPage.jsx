import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Plus, Download, Search, X, CheckCircle, Clock, AlertCircle, FileText, Printer, Pencil, ChevronDown, ChevronRight, RotateCcw, CalendarDays, Trash2 } from 'lucide-react';
import { salesAPI, productsAPI, reportsAPI, customersAPI } from '../services/api';
import { downloadQR } from '../utils/qr';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const balfmt = (n) => (parseFloat(n) > 0 ? '+' : '') + fmt(n);

const STATUS_MAP = {
  PAID: { label: "To'langan", cls: 'badge-green' },
  PENDING: { label: 'Kutilmoqda', cls: 'badge-yellow' },
  PARTIALLY_PAID: { label: 'Qisman', cls: 'badge-blue' },
};

// Mahalliy (Toshkent) sana — toISOString() UTC bergani uchun emas, mahalliy kun bo'yicha
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Sana presetlari → { from, to } oraliq
function presetRange(preset) {
  const today = new Date();
  if (preset === 'bugun') return { from: iso(today), to: iso(today) };
  if (preset === 'kecha') { const y = new Date(today); y.setDate(today.getDate() - 1); return { from: iso(y), to: iso(y) }; }
  if (preset === 'hafta') {
    const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: iso(mon), to: iso(sun) };
  }
  if (preset === 'oy') {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
  }
  if (preset === 'otgan_oy') {
    return { from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  return { from: '', to: '' }; // custom
}
const DATE_PRESETS = [
  { key: 'bugun', label: 'Bugun' },
  { key: 'kecha', label: 'Kecha' },
  { key: 'hafta', label: 'Bu hafta' },
  { key: 'oy', label: 'Bu oy' },
  { key: 'otgan_oy', label: "O'tgan oy" },
];
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('uz-UZ') : '—';
// created_at SQLite'da UTC ('YYYY-MM-DD HH:MM:SS', Z'siz) — 'Z' qo'shib mahalliy (Toshkent) vaqtini ko'rsatamiz
const fmtTime = (ca) => {
  if (!ca) return '';
  const d = new Date(String(ca).replace(' ', 'T') + (String(ca).includes('Z') ? '' : 'Z'));
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SalesPage({ embedded = false }) {
  const { isSalesHead, isAccountant, isOwner } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [showModal, setShowModal] = useState(false);
  const [datePreset, setDatePreset] = useState('oy');
  const [dateRange, setDateRange] = useState(() => presetRange('oy'));
  const [showDaily, setShowDaily] = useState(false);
  const applyPreset = (p) => { setDatePreset(p); setDateRange(presetRange(p)); };
  const [chekSaleId, setChekSaleId] = useState(null);
  const [editForm, setEditForm] = useState(null); // tahrirlanayotgan savdo
  const [returnForm, setReturnForm] = useState(null); // vozvrat (qaytarish)
  const [expanded, setExpanded] = useState(() => new Set()); // ochilgan cheklar (order_ref)
  const toggleExpand = (key) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const { data: chekData, isLoading: chekLoading } = useQuery({
    queryKey: ['invoice', chekSaleId],
    queryFn: () => salesAPI.getById(chekSaleId).then(r => r.data),
    enabled: !!chekSaleId,
    retry: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sales', filter, dateRange],
    queryFn: () => salesAPI.getAll({
      ...filter,
      start_date: dateRange.from || undefined,
      end_date: dateRange.to || undefined,
      limit: 500,
    }).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['sales-summary', dateRange],
    queryFn: () => salesAPI.getSummary({
      start_date: dateRange.from || undefined,
      end_date: dateRange.to || undefined,
    }).then(r => r.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => salesAPI.create(data),
    onSuccess: () => {
      toast.success('Sotuv qo\'shildi');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setShowModal(false);
    },
  });

  // Barcha savdo + to'lov + vozvratlarni o'chirish (0 qilish) — faqat OWNER
  const resetSalesMutation = useMutation({
    mutationFn: () => salesAPI.resetSales().then(r => r.data),
    onSuccess: (d) => {
      toast.success(`${d?.count ?? 0} ta savdo o'chirildi — savdo va vozvratlar 0`);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['returns-all'] });
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Tozalashda xato'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => salesAPI.updateStatus(id, { status }),
    onSuccess: () => {
      toast.success('Status yangilandi');
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => salesAPI.update(id, data),
    onSuccess: () => {
      toast.success('Savdo yangilandi');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditForm(null);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Saqlashda xato');
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, data }) => salesAPI.returnSale(id, data),
    onSuccess: (res, vars) => {
      const refund = parseFloat(res?.data?.refund_amount || 0);
      const loss = parseFloat(res?.data?.loss_amount || 0);
      const amt = parseFloat(res?.data?.amount || 0);
      const settlement = vars?.data?.settlement;
      if (refund > 0) {
        toast.success(`Vozvrat qabul qilindi — mijozga ${fmt(refund)} so'm naqd qaytarildi`);
      } else if (settlement === 'BALANCE') {
        toast.success(`Vozvrat qabul qilindi — ${fmt(amt)} so'm mijoz hisobiga yozildi (qarz kamaydi / haqdor bo'ldi)`);
      } else {
        toast.success('Vozvrat qabul qilindi — tovar omborga qaytdi');
      }
      if (loss > 0) toast.success(`Brak: ${fmt(loss)} so'm ziyon sifatida qayd etildi`);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setReturnForm(null);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Vozvratda xato'),
  });

  const openReturn = (sale) => {
    // Mijozning UMUMIY balansi (barcha savdolar bo'yicha): >0 qarzdor, <0 haqdor, 0 teng
    const cust = customers?.customers?.find(c => String(c.id) === String(sale.customer_id));
    const customerDebt = cust ? (parseFloat(cust.total_debt) || 0) : 0;
    setReturnForm({
      id: sale.id,
      product_name: sale.product_name,
      max: parseInt(sale.quantity, 10) || 0,
      unit: sale.unit || 'dona',
      unit_price: parseFloat(sale.unit_price) || 0,
      total_amount: parseFloat(sale.total_amount) || 0,
      payment_amount: parseFloat(sale.payment_amount) || 0,
      quantity: parseInt(sale.quantity, 10) || 1,
      reason: '',
      condition: 'GOOD',
      customerDebt, // mijozning umumiy qarzi (settlement variantlarini hal qiladi)
      // Qarzi bor mijozga vozvrat — avtomatik "qarzdan ayirsin"; aks holda egasi tanlaydi
      settlement: 'DEBT', // 'DEBT' = qarzdan ayirsin · 'REFUND' = naqd qaytarsin · 'CREDIT' = haqdor bo'lsin
    });
  };

  const submitReturn = () => {
    const q = parseInt(returnForm.quantity, 10);
    if (!q || q < 1) return toast.error('Miqdor noto\'g\'ri');
    if (q > returnForm.max) return toast.error(`Faqat ${returnForm.max} dona qaytarish mumkin`);
    if (!returnForm.reason.trim()) return toast.error('Vozvrat sababi majburiy');
    // 'DEBT' va 'CREDIT' — naqd qaytarilmaydi (balansga); 'REFUND' — naqd pul qaytariladi
    const settlement = returnForm.settlement === 'REFUND' ? 'REFUND' : 'BALANCE';
    returnMutation.mutate({ id: returnForm.id, data: { quantity: q, reason: returnForm.reason.trim(), condition: returnForm.condition, settlement } });
  };

  // Bitta chekdagi barcha to'lanmagan mahsulotlarni "To'langan" qilish
  const markCheckPaid = (sales) => {
    const unpaid = sales.filter(s => s.status !== 'PAID');
    if (!unpaid.length) return;
    Promise.all(unpaid.map(s => salesAPI.updateStatus(s.id, { status: 'PAID' })))
      .then(() => {
        toast.success('Chek to\'landi');
        qc.invalidateQueries({ queryKey: ['sales'] });
        qc.invalidateQueries({ queryKey: ['sales-summary'] });
      })
      .catch(() => toast.error('Xato'));
  };

  const openEdit = (sale) => {
    setEditForm({
      id: sale.id,
      product_id: sale.product_id || '',
      customer_id: sale.customer_id || '',
      quantity: sale.quantity,
      unit_price: parseFloat(sale.unit_price),
      sale_date: sale.sale_date ? String(sale.sale_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: sale.status,
    });
  };

  const submitEdit = () => {
    if (!editForm.product_id) return toast.error('Mahsulotni tanlang');
    if (!editForm.customer_id) return toast.error('Mijozni tanlang — savdo faqat mijozga qilinadi');
    if (!editForm.quantity || editForm.quantity < 1) return toast.error('Miqdor noto\'g\'ri');
    updateMutation.mutate({
      id: editForm.id,
      data: {
        product_id: editForm.product_id,
        customer_id: editForm.customer_id || null,
        quantity: parseInt(editForm.quantity),
        unit_price: parseFloat(editForm.unit_price),
        sale_date: editForm.sale_date,
        status: editForm.status,
      },
    });
  };

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const qty = watch('quantity', 0);
  const price = watch('unit_price', 0);

  const onSubmit = (data) => {
    createMutation.mutate({
      ...data,
      quantity: parseInt(data.quantity),
      unit_price: parseFloat(data.unit_price),
    });
  };

  const downloadExcel = async () => {
    const params = {};
    if (dateRange.from) params.start_date = dateRange.from;
    if (dateRange.to)   params.end_date   = dateRange.to;
    if (!params.start_date && !params.end_date) {
      params.month = new Date().toISOString().slice(0, 7);
    }
    const label = params.start_date && params.end_date
      ? `${params.start_date}_${params.end_date}`
      : (params.month || new Date().toISOString().slice(0, 7));
    try {
      const res = await reportsAPI.downloadSalesExcel(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `sotuv-${label}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Yuklab bo\'lmadi'); }
  };

  const canCreate = isOwner() || isSalesHead() || isAccountant();

  // HAR BIR SAVDO (chek/order_ref) = alohida qator. Bir mijoz bir kunda bir necha marta
  // xarid qilsa ham, har bir savdo o'z qatorida (vaqti bilan) ko'rinadi. Yangi savdo — tepada.
  const groups = useMemo(() => {
    const map = new Map();
    (data?.sales || []).forEach(s => {
      // Bitta chekdagi (order_ref) bir necha mahsulot — 1 qator; aks holda har sotuv alohida
      const key = s.order_ref ? `ord:${s.order_ref}` : `id:${s.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return Array.from(map.entries()).map(([key, sales]) => {
      const total = sales.reduce((sum, x) => sum + parseFloat(x.total_amount || 0), 0);
      const paid = sales.reduce((sum, x) => sum + parseFloat(x.payment_amount || 0), 0);
      const totalQty = sales.reduce((sum, x) => sum + parseFloat(x.quantity || 0), 0);
      const statuses = new Set(sales.map(x => x.status));
      // Eng so'nggi created_at — saralash va vaqt ko'rsatish uchun
      const created = sales.reduce((mx, x) => (x.created_at && x.created_at > mx ? x.created_at : mx), '');
      return {
        key,
        sales,
        first: sales[0],
        multi: sales.length > 1,
        total,
        paid,
        debt: Math.max(0, total - paid),
        totalQty,
        created,
        status: statuses.size === 1 ? sales[0].status : null,
      };
    }).sort((a, b) => String(b.created).localeCompare(String(a.created))); // yangi savdo tepada
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        {!embedded && <h1 className="page-title">Sotuv</h1>}
        <div className="flex gap-2">
          <button onClick={downloadExcel} className="btn-secondary btn-sm">
            <Download size={14} /> Excel
          </button>
          {isOwner() && !embedded && (
            <button
              onClick={() => {
                if (!window.confirm('DIQQAT! Barcha savdo, to\'lov va vozvratlar butunlay o\'chiriladi (0 bo\'ladi). Qarzlar ham 0 bo\'ladi. Ombor/mahsulot/mijozlarga tegmaydi. Davom etamizmi?')) return;
                if (!window.confirm('Bu amalni ortga qaytarib bo\'lmaydi. Rostdan ham hammasini o\'chiramizmi?')) return;
                resetSalesMutation.mutate();
              }}
              disabled={resetSalesMutation.isPending}
              className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-3 flex items-center gap-1 disabled:opacity-50">
              <Trash2 size={14} /> {resetSalesMutation.isPending ? 'O\'chirilmoqda...' : 'Savdoni 0 qilish'}
            </button>
          )}
          {canCreate && (
            <button onClick={() => { reset(); setShowModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Sotuv qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Jami sotuv', value: fmt(summary.summary?.total_revenue), color: 'text-blue-600' },
            { label: "To'langan", value: fmt(summary.summary?.paid_amount), color: 'text-green-600' },
            { label: 'Kutilmoqda', value: fmt(summary.summary?.pending_amount), color: 'text-yellow-600' },
            { label: 'Savdolar soni', value: summary.summary?.total_count || 0, color: 'text-gray-900' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card-sm">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Sana — kunlik / haftalik / oylik / oraliq */}
        <div className="flex gap-2 flex-wrap items-center">
          {DATE_PRESETS.map(p => (
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
          <input type="date" value={dateRange.from}
            onChange={e => { setDatePreset('custom'); setDateRange(r => ({ ...r, from: e.target.value })); }}
            className="input text-xs py-1.5 w-36" title="Dan" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={dateRange.to}
            onChange={e => { setDatePreset('custom'); setDateRange(r => ({ ...r, to: e.target.value })); }}
            className="input text-xs py-1.5 w-36" title="Gacha" />
        </div>
        {(dateRange.from || dateRange.to) && (
          <p className="text-xs text-gray-400">Davr: <span className="font-medium text-gray-600">{fmtDate(dateRange.from)} — {fmtDate(dateRange.to)}</span></p>
        )}
        {/* Qidiruv + status */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Mijoz izlash..." value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value, customer: e.target.value }))}
              className="input pl-8 w-48" />
          </div>
          <select value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="select w-40">
            <option value="">Barcha status</option>
            <option value="PAID">To'langan</option>
            <option value="PENDING">Kutilmoqda</option>
            <option value="PARTIALLY_PAID">Qisman</option>
          </select>
        </div>
      </div>

      {/* Kunlik taqsimot — har kunlik tushum (oraliqда 1 kundan ko'p bo'lsa) */}
      {summary?.by_day?.length > 1 && (
        <div className="card overflow-hidden">
          <button onClick={() => setShowDaily(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <CalendarDays size={15} className="text-blue-600" /> Kunlik taqsimot
              <span className="badge-blue text-[10px] px-1.5">{summary.by_day.length} kun</span>
            </span>
            {showDaily ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          </button>
          {showDaily && (
            <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
              <table className="table text-sm">
                <thead><tr><th>Kun</th><th>Savdolar</th><th className="text-right">Tushum</th></tr></thead>
                <tbody>
                  {summary.by_day.map(d => (
                    <tr key={d.day}>
                      <td className="whitespace-nowrap">{new Date(d.day).toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                      <td>{d.count} ta</td>
                      <td className="text-right font-semibold text-blue-700">{fmt(d.revenue)} so'm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Sana</th><th>Mahsulot</th><th>Miqdor</th>
              <th>Narx</th><th>Jami</th><th>Mijoz</th><th>Status</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !groups.length ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Sotuv topilmadi</td></tr>
            ) : groups.map(g => {
              const { first, multi, sales } = g;
              const isOpen = expanded.has(g.key);
              return (
                <Fragment key={g.key}>
                  <tr className={multi ? 'bg-white' : ''}>
                    <td className="whitespace-nowrap">
                      <div>{new Date(first.sale_date).toLocaleDateString('uz-UZ')}</div>
                      {fmtTime(g.created) && <div className="text-[11px] text-gray-400">{fmtTime(g.created)}</div>}
                    </td>
                    <td className="font-medium">
                      {multi ? (
                        <button onClick={() => toggleExpand(g.key)} className="flex items-center gap-1 text-left hover:text-blue-700">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>{first.product_name}</span>
                          <span className="badge-blue ml-1">+{sales.length - 1} ta mahsulot</span>
                        </button>
                      ) : first.product_name}
                    </td>
                    <td>{multi ? `${g.totalQty} dona` : `${first.quantity} ${first.unit}`}</td>
                    <td>{multi ? <span className="text-gray-400">—</span> : `${fmt(first.unit_price)} so'm`}</td>
                    <td>
                      <div className="font-semibold text-blue-700">{fmt(g.total)} so'm</div>
                      {g.debt > 0 && (
                        <div className="text-xs mt-0.5">
                          <span className="text-green-600">✓ {fmt(g.paid)}</span>
                          <span className="text-red-500 ml-1">· qarz {fmt(g.debt)}</span>
                        </div>
                      )}
                    </td>
                    <td>{first.customer_name || <span className="text-gray-400">—</span>}</td>
                    <td>
                      {g.status ? (
                        <span className={STATUS_MAP[g.status]?.cls || 'badge-gray'}>{STATUS_MAP[g.status]?.label}</span>
                      ) : (
                        <span className="badge-gray">Aralash</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => setChekSaleId(first.id)} className="btn-secondary btn-sm" title="Chekni ko'rish">
                          <FileText size={12} /> Chek
                        </button>
                        {!multi && canCreate && (
                          <button onClick={() => openEdit(first)} className="btn-secondary btn-sm" title="Tahrirlash">
                            <Pencil size={12} /> Tahrir
                          </button>
                        )}
                        {!multi && canCreate && (parseInt(first.quantity, 10) || 0) > 0 && (
                          <button onClick={() => openReturn(first)} className="btn-secondary btn-sm" title="Vozvrat (qaytarish)">
                            <RotateCcw size={12} /> Vozvrat
                          </button>
                        )}
                        {!embedded && g.status !== 'PAID' && canCreate && (
                          <button
                            onClick={() => multi ? markCheckPaid(sales) : statusMutation.mutate({ id: first.id, status: 'PAID' })}
                            className="btn-success btn-sm"
                          >
                            <CheckCircle size={12} /> To'landi
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Mijozning shu kundagi barcha xaridlari (kengaytirilganda) —
                      ko'k chap chiziq bilan ajratiladi, mahsulot nomi to'q ko'k */}
                  {multi && isOpen && sales.map(s => (
                    <tr key={s.id} className="bg-blue-50/30 text-sm border-l-4 border-blue-400">
                      <td></td>
                      <td className="pl-8 font-medium text-blue-800">{s.product_name}</td>
                      <td>{s.quantity} {s.unit}</td>
                      <td>{fmt(s.unit_price)} so'm</td>
                      <td className="font-medium">{fmt(s.total_amount)} so'm</td>
                      <td></td>
                      <td><span className={STATUS_MAP[s.status]?.cls || 'badge-gray'}>{STATUS_MAP[s.status]?.label}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => setChekSaleId(s.id)} className="btn-secondary btn-sm" title="Chekni ko'rish">
                            <FileText size={12} />
                          </button>
                          {canCreate && (
                            <button onClick={() => openEdit(s)} className="btn-secondary btn-sm" title="Tahrirlash">
                              <Pencil size={12} />
                            </button>
                          )}
                          {canCreate && (parseInt(s.quantity, 10) || 0) > 0 && (
                            <button onClick={() => openReturn(s)} className="btn-secondary btn-sm" title="Vozvrat">
                              <RotateCcw size={12} />
                            </button>
                          )}
                          {!embedded && s.status !== 'PAID' && canCreate && (
                            <button onClick={() => statusMutation.mutate({ id: s.id, status: 'PAID' })} className="btn-success btn-sm" title="To'landi">
                              <CheckCircle size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi Sotuv">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Mahsulot *</label>
            <select {...register('product_id', { required: true })} className="select">
              <option value="">Tanlang...</option>
              {(products?.products || []).filter(p => p.kind !== 'KOMPONENT').map(p => (
                <option key={p.id} value={p.id}>{p.name} (Ombor: {p.stock_quantity})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Miqdor *</label>
              <input {...register('quantity', { required: true, min: 1 })} type="number" min="1" className="input" />
            </div>
            <div>
              <label className="label">Birlik narxi *</label>
              <input {...register('unit_price', { required: true, min: 0 })} type="number" min="0" className="input" />
            </div>
          </div>
          {qty > 0 && price > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 font-semibold">
              Jami: {fmt(qty * price)} so'm
            </div>
          )}
          <div>
            <label className="label">Mijoz <span className="text-red-500">*</span></label>
            <select {...register('customer_id', { required: true })} className={`select ${errors.customer_id ? 'border-red-300' : ''}`}>
              <option value="">— Mijozni tanlang —</option>
              {customers?.customers?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Savdo faqat mijozga qilinadi. Yangi mijozni "Mijozlar" bo'limidan qo'shing.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mijoz ismi (qo'lda)</label>
              <input {...register('customer_name')} className="input" placeholder="Ixtiyoriy" />
            </div>
            <div>
              <label className="label">Sana</label>
              <input {...register('sale_date')} type="date" className="input"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select {...register('status')} className="select">
              <option value="PENDING">Kutilmoqda</option>
              <option value="PAID">To'langan</option>
              <option value="PARTIALLY_PAID">Qisman to'langan</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tahrirlash modal */}
      <Modal open={!!editForm} onClose={() => setEditForm(null)} title="Savdoni tahrirlash">
        {editForm && (
          <div className="space-y-4">
            <div>
              <label className="label">Mahsulot *</label>
              <select
                value={editForm.product_id}
                onChange={e => setEditForm(f => ({ ...f, product_id: e.target.value }))}
                className="select"
              >
                <option value="">Tanlang...</option>
                {(products?.products || []).filter(p => p.kind !== 'KOMPONENT').map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Ombor: {p.stock_quantity})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Miqdor *</label>
                <input
                  type="number" min="1" value={editForm.quantity}
                  onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Birlik narxi *</label>
                <input
                  type="number" min="0" value={editForm.unit_price}
                  onChange={e => setEditForm(f => ({ ...f, unit_price: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            {editForm.quantity > 0 && editForm.unit_price > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 font-semibold">
                Jami: {fmt(parseFloat(editForm.quantity) * parseFloat(editForm.unit_price))} so'm
              </div>
            )}
            <div>
              <label className="label">Mijoz <span className="text-red-500">*</span></label>
              <select
                value={editForm.customer_id}
                onChange={e => setEditForm(f => ({ ...f, customer_id: e.target.value }))}
                className={`select ${!editForm.customer_id ? 'border-red-300' : ''}`}
              >
                <option value="" disabled>— Mijozni tanlang —</option>
                {customers?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sana</label>
                <input
                  type="date" value={editForm.sale_date}
                  onChange={e => setEditForm(f => ({ ...f, sale_date: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="select"
                >
                  <option value="PENDING">Kutilmoqda</option>
                  <option value="PAID">To'langan</option>
                  <option value="PARTIALLY_PAID">Qisman to'langan</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditForm(null)} className="btn-secondary flex-1">Bekor</button>
              <button type="button" onClick={submitEdit} disabled={updateMutation.isPending} className="btn-primary flex-1">
                {updateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Vozvrat (qaytarish) modal */}
      <Modal open={!!returnForm} onClose={() => setReturnForm(null)} title="Vozvrat — sotuvdan qaytarish">
        {returnForm && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <div className="font-medium text-gray-900">{returnForm.product_name || 'Mahsulot'}</div>
              <div className="text-gray-500">Sotilgan: {returnForm.max} {returnForm.unit} · Narx: {fmt(returnForm.unit_price)} so'm</div>
            </div>
            <div>
              <label className="label">Qaytariladigan miqdor * (maks: {returnForm.max})</label>
              <input
                type="number" min="1" max={returnForm.max} className="input"
                value={returnForm.quantity}
                onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Tovar holati *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReturnForm(f => ({ ...f, condition: 'GOOD' }))}
                  className={`rounded-xl border p-2.5 text-sm text-left transition ${returnForm.condition === 'GOOD' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="font-medium text-gray-900">✅ Yaxshi</div>
                  <div className="text-[11px] text-gray-500">Omborga qaytadi</div>
                </button>
                <button
                  type="button"
                  onClick={() => setReturnForm(f => ({ ...f, condition: 'DEFECTIVE' }))}
                  className={`rounded-xl border p-2.5 text-sm text-left transition ${returnForm.condition === 'DEFECTIVE' ? 'border-red-400 bg-red-50 ring-1 ring-red-300' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="font-medium text-gray-900">⚠️ Brak</div>
                  <div className="text-[11px] text-gray-500">Ziyon sifatida qayd</div>
                </button>
              </div>
            </div>
            <div>
              <label className="label">Sabab * (majburiy)</label>
              <textarea
                className="input" rows={2} placeholder="Masalan: sifatsiz, ortiqcha, mijoz qaytardi..."
                value={returnForm.reason}
                onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {/* Summani qanday yopish — mijozning qarz holatiga qarab */}
            <div>
              <label className="label">Summa qayerga ketsin? *</label>
              {(returnForm.customerDebt || 0) > 0 ? (
                /* Qarzi bor mijoz → faqat qarzdan ayirish (avtomatik) */
                <div className="rounded-xl border border-blue-400 bg-blue-50 ring-1 ring-blue-300 p-2.5 text-sm">
                  <div className="font-medium text-gray-900">➖ Qarzdan ayirsin</div>
                  <div className="text-[11px] text-gray-500">
                    Mijozning qarzi bor ({fmt(returnForm.customerDebt)} so'm) — vozvrat summasi avtomatik qarzdan ayiriladi
                  </div>
                </div>
              ) : (
                /* Qarzi yo'q yoki haqdor → 3 ta variant */
                <div className="space-y-2">
                  {[
                    { key: 'DEBT',   title: '➖ Qarzdan ayirsin',     desc: 'Qarz shu summaga kamayadi (naqd pul berilmaydi)' },
                    { key: 'REFUND', title: '💵 Naqd qaytarib berish', desc: 'Mijozga naqd pul qaytariladi' },
                    { key: 'CREDIT', title: '⭐ Haqdor bo‘lib qolsin',  desc: 'Mijoz shu summaga haqdor bo‘ladi (keyingi xaridda)' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setReturnForm(f => ({ ...f, settlement: opt.key }))}
                      className={`w-full rounded-xl border p-2.5 text-sm text-left transition ${returnForm.settlement === opt.key ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="font-medium text-gray-900">{opt.title}</div>
                      <div className="text-[11px] text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Natija — tanlangan usul bo'yicha */}
            {(() => {
              const q = parseInt(returnForm.quantity, 10) || 0;
              const A = q * returnForm.unit_price;                 // qaytarilayotgan tovar qiymati
              const debtBefore = Math.max(0, returnForm.total_amount - returnForm.payment_amount);
              if (returnForm.settlement === 'REFUND') {
                const cash = Math.min(A, returnForm.payment_amount);
                return (
                  <div className="bg-emerald-50 rounded-xl p-3 text-sm flex justify-between">
                    <span className="text-gray-600">💵 Mijozga naqd qaytariladi:</span>
                    <span className="font-semibold text-emerald-700">{fmt(cash)} so'm</span>
                  </div>
                );
              }
              if (returnForm.settlement === 'CREDIT') {
                return (
                  <div className="bg-amber-50 rounded-xl p-3 text-sm flex justify-between">
                    <span className="text-gray-600">⭐ Mijoz haqdor bo'ladi:</span>
                    <span className="font-semibold text-amber-700">{fmt(A)} so'm</span>
                  </div>
                );
              }
              // DEBT
              const debtAfter = Math.max(0, debtBefore - A);
              const creditAfter = Math.max(0, A - debtBefore);
              return (
                <div className="bg-blue-50 rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Hozirgi qarz:</span>
                    <span className="font-medium text-gray-800">{fmt(debtBefore)} so'm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Vozvratdan keyin qarz:</span>
                    <span className="font-semibold text-blue-700">{fmt(debtAfter)} so'm</span>
                  </div>
                  {creditAfter > 0 && (
                    <div className="flex justify-between border-t border-blue-100 pt-1">
                      <span className="text-gray-600">Mijoz haqdor bo'ladi:</span>
                      <span className="font-semibold text-amber-700">{fmt(creditAfter)} so'm</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {returnForm.condition === 'DEFECTIVE' && (
              <div className="bg-red-50 rounded-xl p-3 text-sm flex justify-between">
                <span className="text-gray-600">⚠️ Ziyon (taxminiy):</span>
                <span className="font-semibold text-red-600">
                  {fmt((parseInt(returnForm.quantity, 10) || 0) * returnForm.unit_price)} so'm
                </span>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setReturnForm(null)} className="btn-secondary btn-sm">Bekor</button>
              <button onClick={submitReturn} disabled={returnMutation.isPending} className="btn-primary btn-sm">
                <RotateCcw size={14} /> Vozvratni tasdiqlash
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Chek modal */}
      {chekSaleId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50 print:hidden" onClick={() => setChekSaleId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden my-4">
            <button onClick={() => setChekSaleId(null)}
              className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow">
              <X size={18} />
            </button>

            {chekLoading ? (
              <div className="py-16 text-center text-gray-400">Yuklanmoqda...</div>
            ) : !chekData?.sale ? (
              <div className="py-16 text-center text-gray-400">Chek topilmadi</div>
            ) : (() => {
              const { sale, items } = chekData;
              const rows = items?.length ? items : [sale];
              const total = rows.reduce((s, it) => s + parseFloat(it.total_amount || 0), 0);
              const chekPaid = rows.reduce((s, it) => s + parseFloat(it.payment_amount || 0), 0);
              const chekDebt = Math.max(0, total - chekPaid);
              const chekCredit = Math.max(0, chekPaid - total);
              const invoiceUrl = `${window.location.origin}/invoice/${sale.order_ref || sale.id}`;
              return (
                <>
                  <div id="chek-print" className="px-5 py-5 font-mono text-[13px] leading-tight text-gray-900">
                    <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                      <div className="text-lg font-bold tracking-wide">TEKNOPLAST</div>
                      <div className="text-[11px] text-gray-500">Plastik mahsulotlar zavodi</div>
                    </div>
                    <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                      <div className="flex justify-between"><span>Chek:</span><span className="font-bold">{sale.order_ref || sale.id?.slice(0,8)}</span></div>
                      <div className="flex justify-between"><span>Sana:</span><span>{new Date(sale.sale_date).toLocaleDateString('uz-UZ')}</span></div>
                      <div className="flex justify-between"><span>Mijoz:</span><span>{sale.customer_full_name || sale.customer_name || 'Tasodifiy'}</span></div>
                      {sale.customer_full_phone && <div className="flex justify-between"><span>Tel:</span><span>{sale.customer_full_phone}</span></div>}
                      {sale.created_by_name && <div className="flex justify-between"><span>Sotuvchi:</span><span>{sale.created_by_name}</span></div>}
                    </div>
                    <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                      {rows.map((it, i) => (
                        <div key={i} className="mb-1">
                          <div className="font-medium truncate">{it.product_name}</div>
                          <div className="flex justify-between text-gray-600">
                            <span>{it.quantity} x {fmt(it.unit_price)}</span>
                            <span className="font-bold text-gray-900">{fmt(it.total_amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const dM = (sale.notes || '').match(/Chegirma:\s*([\d\s,.]+)/);
                      const dAmt = dM ? parseFloat(dM[1].replace(/[^\d.]/g, '')) || 0 : 0;
                      return dAmt > 0 ? (
                        <>
                          <div className="flex justify-between text-[12px] text-gray-600 pb-0.5">
                            <span>Oraliq:</span><span>{fmt(total + dAmt)} so'm</span>
                          </div>
                          <div className="flex justify-between text-[12px] text-rose-600 pb-1">
                            <span>Chegirma:</span><span className="font-bold">−{fmt(dAmt)} so'm</span>
                          </div>
                        </>
                      ) : null;
                    })()}
                    <div className="flex justify-between font-bold text-[15px] pb-2 mb-2">
                      <span>JAMI:</span><span>{fmt(total)} so'm</span>
                    </div>
                    {(() => {
                      const notes = sale.notes || '';
                      const parseAmt = (m) => parseFloat((m?.[1] || '0').replace(/[^\d.]/g, '')) || 0;
                      const cashM = notes.match(/Naqd:\s*([\d\s,.]+)/);
                      const cardM = notes.match(/Karta:\s*([\d\s,.]+)/);
                      const bankM = notes.match(/Bank:\s*([\d\s,.]+)/);
                      const paymeM = notes.match(/Payme:\s*([\d\s,.]+)/);
                      const hasMixed = cashM || cardM || bankM || paymeM;
                      if (!hasMixed && chekDebt <= 0 && chekCredit <= 0) return null;
                      return (
                        <div className="text-[12px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-3">
                          {hasMixed ? (
                            <>
                              {cashM && <div className="flex justify-between text-green-700"><span>Naqd:</span><span className="font-bold">{fmt(parseAmt(cashM))} so'm</span></div>}
                              {cardM && <div className="flex justify-between text-blue-700"><span>Karta:</span><span className="font-bold">{fmt(parseAmt(cardM))} so'm</span></div>}
                              {bankM && <div className="flex justify-between text-purple-700"><span>Bank:</span><span className="font-bold">{fmt(parseAmt(bankM))} so'm</span></div>}
                              {paymeM && <div className="flex justify-between text-cyan-700"><span>Pay Me:</span><span className="font-bold">{fmt(parseAmt(paymeM))} so'm</span></div>}
                              {chekDebt > 0 && <div className="flex justify-between text-red-600"><span>Qarz:</span><span className="font-bold">{fmt(chekDebt)} so'm</span></div>}
                              {chekCredit > 0 && <div className="flex justify-between text-blue-700"><span>Haqdor (oshiqcha):</span><span className="font-bold">+{fmt(chekCredit)} so'm</span></div>}
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between text-green-700"><span>To'landi:</span><span className="font-bold">{fmt(chekPaid)} so'm</span></div>
                              {chekDebt > 0 && <div className="flex justify-between text-red-600"><span>Qarz:</span><span className="font-bold">{fmt(chekDebt)} so'm</span></div>}
                              {chekCredit > 0 && <div className="flex justify-between text-blue-700"><span>Haqdor (oshiqcha):</span><span className="font-bold">+{fmt(chekCredit)} so'm</span></div>}
                            </>
                          )}
                        </div>
                      );
                    })()}
                    {sale.balance_after != null && (sale.balance_before !== 0 || sale.balance_after !== 0) && (
                      <div className="text-[12px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-3">
                        <div className="flex justify-between">
                          <span>Savdodan oldingi balans:</span>
                          <span className={`font-semibold ${sale.balance_before < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(sale.balance_before)} so'm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Savdodan keyingi balans:</span>
                          <span className={`font-bold ${sale.balance_after < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(sale.balance_after)} so'm</span>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col items-center">
                      <QRCodeSVG id="sales-chek-qr" value={invoiceUrl} size={110} />
                      <QRCodeCanvas id="sales-chek-qr-canvas" value={invoiceUrl} size={512} className="hidden" />
                      <div className="text-[10px] text-gray-500 mt-1">Xaridingiz uchun rahmat!</div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-4 pb-4">
                    <button onClick={() => window.print()} className="btn-secondary flex-1 text-sm">
                      <Printer size={13} /> Chop
                    </button>
                    <button onClick={() => { downloadQR('sales-chek-qr-canvas', `qr-${sale.order_ref || sale.id}`); toast.success('QR kod yuklab olindi'); }} className="btn-secondary flex-1 text-sm">
                      <Download size={13} /> QR
                    </button>
                    <button onClick={() => navigate(`/invoice/${sale.order_ref || sale.id}`)} className="btn-primary flex-1 text-sm">
                      <FileText size={13} /> Faktura
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
