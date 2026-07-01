import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackagePlus, X, Search, Plus, Trash2, Check, Ban, Eye, Save, Users, ChevronDown, Clock, FileDown, FileText, Pencil, RotateCcw } from 'lucide-react';
import { intakesAPI, productsAPI, productionAPI, employeesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';
import { RANGLAR, RANG_COLORS } from '../constants/colors';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
let _rowId = 0;
const newRowId = () => ++_rowId;

const STATUS = {
  PENDING:  { label: 'Kutilmoqda', cls: 'badge-yellow' },
  APPROVED: { label: 'Tasdiqlangan', cls: 'badge-green' },
  REJECTED: { label: 'Rad etilgan', cls: 'badge-gray' },
};

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Mahsulot kirimi tab ──────────────────────────────────────────────────────
function ProductIntakeTab({ canCreate, canApprove }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const [exp, setExp] = useState({ start_date: '', end_date: '' }); // eksport sana oralig'i
  const [downloading, setDownloading] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['intakes'],
    queryFn: () => intakesAPI.getAll().then(r => r.data),
  });

  // Kirimlarni Excel yoki PDF qilib yuklab olish
  const downloadReport = async (kind) => {
    setDownloading(kind);
    try {
      const params = {};
      if (exp.start_date) params.start_date = exp.start_date;
      if (exp.end_date) params.end_date = exp.end_date;
      const res = kind === 'excel' ? await intakesAPI.downloadExcel(params) : await intakesAPI.downloadPdf(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kirimlar-${exp.start_date || 'hammasi'}${exp.end_date ? '_' + exp.end_date : ''}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setDownloading('');
    }
  };
  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
    enabled: showForm,
  });
  const { data: detail } = useQuery({
    queryKey: ['intake', detailId],
    queryFn: () => intakesAPI.getById(detailId).then(r => r.data),
    enabled: !!detailId,
  });

  const products = productsData?.products || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter(p => String(p.name || '').toLowerCase().includes(q)).slice(0, 20);
  }, [search, products]);

  const createMutation = useMutation({
    mutationFn: (d) => intakesAPI.create(d),
    onSuccess: () => {
      toast.success('Kirim yuborildi — tasdiqlash kutilmoqda');
      qc.invalidateQueries({ queryKey: ['intakes'] });
      setShowForm(false); setCart([]); setNotes(''); setSearch('');
    },
  });
  const approveMutation = useMutation({
    mutationFn: (id) => intakesAPI.approve(id),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['intakes'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setDetailId(null);
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (id) => intakesAPI.reject(id),
    onSuccess: () => {
      toast.success('Kirim rad etildi');
      qc.invalidateQueries({ queryKey: ['intakes'] });
      setDetailId(null);
    },
  });

  // cart row: { rowId, product_id, name, stock, rang, qty }
  // Har safar yangi qator — bitta mahsulotni bir necha rangda kiritish mumkin
  const addToCart = (p) => {
    setCart(c => [...c, { rowId: newRowId(), product_id: p.id, name: p.name, stock: p.stock_quantity, rang: '', qty: 1 }]);
    // setSearch ni tozalamaymiz — foydalanuvchi ketma-ket bir nechta mahsulot qo'sha olsin
  };
  const updateRow = (rowId, field, value) => {
    setCart(c => c.map(r => r.rowId === rowId ? { ...r, [field]: value } : r));
  };
  const removeRow = (rowId) => setCart(c => c.filter(r => r.rowId !== rowId));

  const submit = () => {
    if (!cart.length) return toast.error('Mahsulot qo\'shing');
    for (const r of cart) {
      // rang bo'sh bo'lsa "Rangsiz" sifatida saqlanadi — majburiy emas
      if (!r.qty || parseInt(r.qty) < 1) return toast.error(`"${r.name}" miqdori noto'g'ri`);
    }
    createMutation.mutate({ items: cart.map(r => ({ product_id: r.product_id, quantity: parseInt(r.qty), rang: r.rang })), notes });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Eksport:</span>
          <input type="date" value={exp.start_date}
            onChange={e => setExp(f => ({ ...f, start_date: e.target.value }))}
            className="input text-xs py-1.5 w-36" title="Dan" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={exp.end_date}
            onChange={e => setExp(f => ({ ...f, end_date: e.target.value }))}
            className="input text-xs py-1.5 w-36" title="Gacha" />
          <button onClick={() => downloadReport('excel')} disabled={!!downloading}
            className="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50">
            <FileDown size={13} /> {downloading === 'excel' ? '...' : 'Excel'}
          </button>
          <button onClick={() => downloadReport('pdf')} disabled={!!downloading}
            className="btn-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 flex items-center gap-1 hover:bg-red-100 disabled:opacity-50">
            <FileText size={13} /> {downloading === 'pdf' ? '...' : 'PDF'}
          </button>
        </div>
        {canCreate && (
          <button onClick={() => { setCart([]); setNotes(''); setShowForm(true); }} className="btn-primary btn-sm">
            <PackagePlus size={14} /> Yangi kirim
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Sana</th><th>Kirituvchi</th><th>Mahsulotlar</th><th>Jami</th><th>Status</th><th>Amal</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.intakes?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Kirim yo'q</td></tr>
            ) : data.intakes.map(i => {
              const st = STATUS[i.status] || STATUS.PENDING;
              return (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{new Date(i.created_at).toLocaleDateString('uz-UZ')}</td>
                  <td>{i.created_by_name || '—'}</td>
                  <td className="max-w-xs">
                    {i.product_list
                      ? <span className="text-sm text-gray-800">{i.product_list}</span>
                      : <span className="text-gray-400 text-sm">{i.item_count} xil</span>}
                  </td>
                  <td className="font-semibold whitespace-nowrap">{fmt(i.total_qty)} dona</td>
                  <td><span className={st.cls}>{st.label}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setDetailId(i.id)} className="btn-secondary btn-sm" title="Batafsil"><Eye size={12} /></button>
                      {canApprove && i.status === 'PENDING' && (
                        <>
                          <button onClick={() => approveMutation.mutate(i.id)} className="btn-success btn-sm"><Check size={12} /> Tasdiq</button>
                          <button onClick={() => rejectMutation.mutate(i.id)} className="btn-danger btn-sm"><Ban size={12} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Yangi kirim" wide>
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mahsulot qidirish..." className="input pl-8" />
          </div>
          {search && filtered.length > 0 && (
            <div className="border border-gray-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
              {filtered.map(p => {
                const alreadyAdded = cart.some(r => r.product_id === p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 text-sm">
                    <span>{p.name} <span className="text-xs text-gray-400">(ombor: {p.stock_quantity})</span></span>
                    {alreadyAdded
                      ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check size={12} /> Qo'shildi</span>
                      : <Plus size={14} className="text-blue-600" />}
                  </button>
                );
              })}
            </div>
          )}
          {search && filtered.length === 0 && (
            <p className="text-sm text-gray-400 px-1">"{search}" topilmadi</p>
          )}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Mahsulot</th>
                  <th className="w-36">Rang</th>
                  <th className="w-28">Miqdor</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {!cart.length ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">Mahsulot qo'shing</td></tr>
                ) : cart.map((x) => (
                  <tr key={x.rowId}>
                    <td>
                      <div className="font-medium text-gray-900">{x.name}</div>
                      <div className="text-xs text-gray-400">ombor: {x.stock}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <select
                          value={x.rang}
                          onChange={e => updateRow(x.rowId, 'rang', e.target.value)}
                          className="select py-1 px-2 text-sm w-32"
                        >
                          <option value="">Rangsiz</option>
                          {RANGLAR.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {x.rang && <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[x.rang] || '#999', border:'1px solid #ccc' }} />}
                      </div>
                    </td>
                    <td>
                      <input type="number" min="1" value={x.qty}
                        onChange={e => updateRow(x.rowId, 'qty', e.target.value)}
                        onFocus={e => e.target.select()}
                        className="input py-1 px-2 w-24" />
                    </td>
                    <td>
                      <button onClick={() => removeRow(x.rowId)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Izoh (ixtiyoriy)" className="input" />
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Bekor</button>
            <button onClick={submit} disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Yuborilmoqda...' : 'Kirimni yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Kirim tafsiloti" wide>
        {!detail ? <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p> : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={STATUS[detail.intake.status]?.cls}>{STATUS[detail.intake.status]?.label}</span>
              <span className="text-sm text-gray-500">Kirituvchi: {detail.intake.created_by_name}</span>
              {detail.intake.approved_by_name && <span className="text-sm text-gray-500">· Tasdiqladi: {detail.intake.approved_by_name}</span>}
            </div>
            {detail.intake.notes && <p className="text-sm text-gray-600">Izoh: {detail.intake.notes}</p>}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="table text-sm">
                <thead><tr><th>Mahsulot</th><th>Rang</th><th>Kirim miqdori</th><th>Hozirgi ombor</th></tr></thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id}>
                      <td>{it.product_name}</td>
                      <td>
                        {it.rang ? (
                          <span className="flex items-center gap-1">
                            <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: RANG_COLORS[it.rang] || '#999' }} />
                            {it.rang}
                          </span>
                        ) : <span className="text-gray-400">Rangsiz</span>}
                      </td>
                      <td className="font-semibold text-green-600">+{fmt(it.quantity)} {it.unit}</td>
                      <td>{fmt(it.stock_quantity)} {it.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canApprove && detail.intake.status === 'PENDING' && (
              <div className="flex gap-3">
                <button onClick={() => rejectMutation.mutate(detail.intake.id)} className="btn-danger flex-1"><Ban size={14} /> Rad etish</button>
                <button onClick={() => approveMutation.mutate(detail.intake.id)} className="btn-success flex-1"><Check size={14} /> Tasdiqlash</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Ishchilar ishi tab ───────────────────────────────────────────────────────
function WorkerOutputTab({ canApprove, canEdit }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState([newEntry()]);
  const [dlWorks, setDlWorks] = useState(null); // 'excel' | 'pdf' yuklab olish holati
  const [rng, setRng] = useState({ start_date: '', end_date: '' }); // hisobot vaqt oralig'i
  const [dlRange, setDlRange] = useState(null); // vaqt oralig'i hisoboti yuklash holati
  const [dlPending, setDlPending] = useState(null); // tasdiqlash kutayotganlar yuklash holati

  // Tasdiqlash kutayotgan mahsulot/komponentlarni Excel yoki PDF qilib yuklab olish
  const downloadPending = async (kind) => {
    try {
      setDlPending(kind);
      const res = kind === 'excel' ? await productionAPI.pendingExcel() : await productionAPI.pendingPdf();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasdiqlash-kutilmoqda-${today}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setDlPending(null);
    }
  };

  // Tanlangan vaqt oralig'i uchun ishchilar ishi hisobotini (jamlangan) yuklab olish
  const downloadRange = async (kind) => {
    if (!rng.start_date || !rng.end_date) return toast.error("Vaqt oralig'ini tanlang (dan va gacha)");
    if (rng.start_date > rng.end_date) return toast.error("'Dan' sanasi 'gacha'dan katta bo'lmasin");
    try {
      setDlRange(kind);
      const params = { start_date: rng.start_date, end_date: rng.end_date };
      const res = kind === 'excel'
        ? await productionAPI.getRangeSummaryExcel(params)
        : await productionAPI.getRangeSummaryPdf(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ishchilar-ishi-${rng.start_date}_${rng.end_date}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setDlRange(null);
    }
  };

  // Ishchilar ishini (shu kun) PDF yoki Excel qilib to'g'ridan-to'g'ri yuklab olish
  const downloadWorks = async (kind) => {
    try {
      setDlWorks(kind);
      const res = kind === 'excel'
        ? await productionAPI.worksDayExcel(date)
        : await productionAPI.worksDayPdf(date);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ishchilar-ishi-${date}.${kind === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Yuklab bo\'lmadi');
    } finally {
      setDlWorks(null);
    }
  };

  function newEntry() {
    return { employee_id: '', product_id: '', quantity_produced: '', production_type: 'FINISHED', tarif: '', rang: '' };
  }

  // Faqat STANOKCHI va DETALCHI ishchilarni yuklaymiz
  const { data: empData } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesAPI.getAll({ is_active: 'true' }).then(r => r.data),
  });
  const { data: prodData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });
  const { data: dailyData, refetch: refetchDaily } = useQuery({
    queryKey: ['production-daily', date],
    queryFn: () => productionAPI.getAll({ date }).then(r => r.data),
  });

  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ['production-pending'],
    queryFn: () => productionAPI.getPending().then(r => r.data),
    enabled: canApprove,
  });

  const approveMutation = useMutation({
    mutationFn: ({ employee_id, production_date }) => productionAPI.approveDay(employee_id, production_date),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['production-pending'] });
      qc.invalidateQueries({ queryKey: ['production-daily', date] });
      qc.invalidateQueries({ queryKey: ['products'] });
      // Ombor sahifasi (Ishlab chiqarish ombori tabi) ham darrov yangilanishi uchun
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      refetchPending();
      refetchDaily();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Xato'),
  });

  // "Qayta" — noto'g'ri yozuvni kirimchiga qaytarish (u to'g'irlab qayta yuboradi).
  // window.prompt Electron desktop ilovada ishlamaydi — shuning uchun modal ishlatamiz.
  const [rejectFor, setRejectFor] = useState(null); // qaytariladigan guruh
  const [rejectReason, setRejectReason] = useState('');

  const rejectMutation = useMutation({
    mutationFn: ({ employee_id, production_date, reason }) => productionAPI.rejectDay(employee_id, production_date, reason),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['production-pending'] });
      qc.invalidateQueries({ queryKey: ['production-daily', date] });
      setRejectFor(null); setRejectReason('');
      refetchPending();
      refetchDaily();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Xato'),
  });

  const askReject = (g) => { setRejectReason(''); setRejectFor(g); };
  const confirmReject = () => {
    if (!rejectFor) return;
    rejectMutation.mutate({ employee_id: rejectFor.employee_id, production_date: rejectFor.production_date, reason: rejectReason.trim() });
  };

  const workers = (empData?.employees || []).filter(e => e.type === 'STANOKCHI' || e.type === 'DETALCHI');
  const products = prodData?.products || [];
  // Mahsulotlarni tur bo'yicha ajratamiz — komponent tanlash aniq ko'rinishi uchun
  const componentOptions = products.filter(p => p.kind === 'KOMPONENT');
  const finishedOptions = products.filter(p => p.kind !== 'KOMPONENT');

  const empMap = {};
  workers.forEach(e => { empMap[e.id] = e; });
  const prodMap = {};
  products.forEach(p => { prodMap[p.id] = p; });

  // Mahsulot/xodim/tur asosida tarifni avtomatik hisoblash
  const autoTarif = (empId, prodId, ptype) => {
    const emp = empMap[empId];
    const p = prodMap[prodId];
    if (!emp) return '';
    // Komponent — bitta narx (tayyor/yarim farqi yo'q, mahsulot narxi)
    if (p && p.kind === 'KOMPONENT') return p.price || '';
    if (emp.type === 'STANOKCHI' && p) {
      return ptype === 'SEMI_FINISHED' ? (p.stanokchi_semi_rate || '') : (p.stanokchi_rate || '');
    }
    if (emp.type === 'DETALCHI' && p) return p.detalchi_rate || '';
    return emp.daily_tariff || '';
  };

  // Bir qator uchun hisoblangan haq
  const calcPay = (entry) => {
    const emp = empMap[entry.employee_id];
    const qty = parseFloat(entry.quantity_produced) || 0;
    if (!emp || !qty) return 0;
    // entry.tarif kiritilgan bo'lsa — uni ishlatamiz
    if (entry.tarif !== '' && parseFloat(entry.tarif) >= 0) return qty * parseFloat(entry.tarif);
    const p = prodMap[entry.product_id];
    // Komponent — mahsulot narxi
    if (p?.kind === 'KOMPONENT') return qty * (parseFloat(p.price) || 0);
    if (emp.type === 'STANOKCHI') {
      const rate = entry.production_type === 'SEMI_FINISHED' ? (p?.stanokchi_semi_rate || 0) : (p?.stanokchi_rate || 0);
      return qty * rate;
    }
    if (emp.type === 'DETALCHI') return qty * (p?.detalchi_rate || 0);
    return qty * (emp.daily_tariff || 0);
  };

  const totalPay = entries.reduce((sum, e) => sum + calcPay(e), 0);

  const updateEntry = (i, field, value) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i) return e;
      const next = { ...e, [field]: value };
      const emp = empMap[next.employee_id];
      if (field === 'product_id') {
        const p = prodMap[value];
        // Komponent tanlansa — turi avtomatik 'KOMPONENT'
        if (p?.kind === 'KOMPONENT') {
          next.production_type = 'KOMPONENT';
        } else if (e.production_type === 'KOMPONENT') {
          // Oldin komponent edi, endi tayyor mahsulot — turni tiklaymiz
          next.production_type = emp?.type === 'DETALCHI' ? 'SEMI_FINISHED' : 'FINISHED';
        }
        next.rang = p?.rang || '';
      }
      if (field === 'employee_id') {
        const p = prodMap[next.product_id];
        if (p?.kind === 'KOMPONENT') next.production_type = 'KOMPONENT';
        else if (emp?.type === 'DETALCHI') next.production_type = 'SEMI_FINISHED';
        else next.production_type = 'FINISHED';
      }
      if (field === 'employee_id' || field === 'product_id' || field === 'production_type') {
        next.tarif = autoTarif(next.employee_id, next.product_id, next.production_type);
      }
      return next;
    }));
  };

  const bulkMutation = useMutation({
    mutationFn: (data) => productionAPI.bulk(data),
    onSuccess: (res) => {
      toast.success(`${res.data.count} ta ishchi saqlandi`);
      qc.invalidateQueries({ queryKey: ['production-daily', date] });
      qc.invalidateQueries({ queryKey: ['production-summary'] });
      setEntries([newEntry()]);
      refetchDaily();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const save = () => {
    const valid = entries.filter(e => e.employee_id && parseFloat(e.quantity_produced) > 0);
    if (!valid.length) return toast.error('Kamida bitta ishchi miqdori kiritilsin');
    bulkMutation.mutate({
      production_date: date,
      entries: valid.map(e => ({
        employee_id: e.employee_id,
        product_id: e.product_id || null,
        quantity_produced: parseFloat(e.quantity_produced),
        production_type: (e.production_type === 'KOMPONENT' || prodMap[e.product_id]?.kind === 'KOMPONENT')
          ? 'KOMPONENT'
          : (empMap[e.employee_id]?.type === 'DETALCHI' ? 'SEMI_FINISHED' : (e.production_type || 'FINISHED')),
        daily_tariff: e.tarif !== '' ? parseFloat(e.tarif) : undefined,
        rang: e.rang || null,
      })),
    });
  };

  // ── Saqlangan yozuvni tahrirlash / o'chirish ─────────────────────────────────
  const [editRow, setEditRow] = useState(null);

  const openEdit = (row) => setEditRow({
    id: row.id,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_type: row.employee_type,
    product_id: row.product_id || '',
    rang: row.rang || '',
    quantity_produced: row.quantity_produced ?? '',
    tarif: row.daily_tariff ?? '',
    production_type: row.production_type || 'FINISHED',
    approval_status: row.approval_status,
  });

  const updateEditField = (field, value) => {
    setEditRow(prev => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === 'product_id') {
        const p = prodMap[value];
        if (p?.kind === 'KOMPONENT') next.production_type = 'KOMPONENT';
        else if (prev.production_type === 'KOMPONENT') next.production_type = prev.employee_type === 'DETALCHI' ? 'SEMI_FINISHED' : 'FINISHED';
        if (p?.rang) next.rang = p.rang;
      }
      if (field === 'product_id' || field === 'production_type') {
        const t = autoTarif(prev.employee_id, next.product_id, next.production_type);
        if (t !== '') next.tarif = t;
      }
      return next;
    });
  };

  const invalidateProduction = () => {
    qc.invalidateQueries({ queryKey: ['production-daily', date] });
    qc.invalidateQueries({ queryKey: ['production-summary'] });
    qc.invalidateQueries({ queryKey: ['production-pending'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['inventory-products'] });
    refetchDaily();
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => productionAPI.update(id, data),
    onSuccess: () => { toast.success('Yozuv yangilandi'); invalidateProduction(); setEditRow(null); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Xato'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productionAPI.remove(id),
    onSuccess: () => { toast.success('Yozuv o\'chirildi'); invalidateProduction(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Xato'),
  });

  const saveEdit = () => {
    if (!editRow) return;
    const qty = parseFloat(editRow.quantity_produced);
    if (!(qty > 0)) return toast.error('Miqdor noto\'g\'ri');
    updateMutation.mutate({ id: editRow.id, data: {
      product_id: editRow.product_id || null,
      quantity_produced: qty,
      daily_tariff: editRow.tarif === '' ? undefined : parseFloat(editRow.tarif),
      rang: editRow.rang || null,
      production_type: editRow.production_type,
    } });
  };

  const askDelete = (row) => {
    if (!window.confirm(`"${row.employee_name}" — ${row.product_name || 'mahsulot'} (${fmt(row.quantity_produced)} dona) yozuvini o'chirasizmi?${row.approval_status === 'APPROVED' ? "\n\nBu yozuv tasdiqlangan — ombordan ham ayiriladi." : ''}`)) return;
    deleteMutation.mutate(row.id);
  };

  const todayRows = (dailyData?.production || []).filter(r =>
    (r.employee_type === 'STANOKCHI' || r.employee_type === 'DETALCHI') && r.approval_status === 'APPROVED'
  );
  const pendingRows = (dailyData?.production || []).filter(r =>
    (r.employee_type === 'STANOKCHI' || r.employee_type === 'DETALCHI') && r.approval_status !== 'APPROVED'
  );
  // Tasdiqlash kutayotganlar (barcha sanalar) — faqat sales head/owner ko'radi
  const allPending = (pendingData?.production || []);
  // Xodim+sana bo'yicha guruhlaymiz
  const pendingGroups = [];
  const seen = new Set();
  for (const r of allPending) {
    const key = `${r.employee_id}|${r.production_date}`;
    if (!seen.has(key)) {
      seen.add(key);
      pendingGroups.push({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        production_date: r.production_date,
        rows: allPending.filter(x => x.employee_id === r.employee_id && x.production_date === r.production_date),
      });
    }
  }

  return (
    <div className="space-y-6">

      {/* Hisobot — tanlangan vaqt oralig'i uchun ishchilar ishi (Excel / PDF) */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mr-1">
            <FileDown size={15} className="text-emerald-600" /> Hisobot (vaqt oralig'i)
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Dan</label>
            <input type="date" value={rng.start_date}
              onChange={e => setRng(r => ({ ...r, start_date: e.target.value }))}
              className="input text-sm py-1.5 w-40" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Gacha</label>
            <input type="date" value={rng.end_date}
              onChange={e => setRng(r => ({ ...r, end_date: e.target.value }))}
              className="input text-sm py-1.5 w-40" />
          </div>
          <button onClick={() => downloadRange('excel')} disabled={!!dlRange}
            className="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50">
            <FileDown size={13} /> {dlRange === 'excel' ? '...' : 'Excel'}
          </button>
          <button onClick={() => downloadRange('pdf')} disabled={!!dlRange}
            className="btn-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 flex items-center gap-1 hover:bg-red-100 disabled:opacity-50">
            <FileText size={13} /> {dlRange === 'pdf' ? '...' : 'PDF'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Tanlangan davrda har bir ishchining chiqargan mahsuloti, dona va hisoblangan haqi.</p>
      </div>

      {/* TASDIQLASH BO'LIMI — faqat sales head/owner ko'radi */}
      {canApprove && pendingGroups.length > 0 && (
        <div className="card border-l-4 border-yellow-400">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-yellow-500" />
              <h2 className="font-semibold text-gray-800">Tasdiqlash kutilmoqda — {pendingGroups.length} ta guruh</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => downloadPending('excel')} disabled={!!dlPending}
                className="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50">
                <FileDown size={13} /> {dlPending === 'excel' ? '...' : 'Excel'}
              </button>
              <button onClick={() => downloadPending('pdf')} disabled={!!dlPending}
                className="btn-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 flex items-center gap-1 hover:bg-red-100 disabled:opacity-50">
                <FileText size={13} /> {dlPending === 'pdf' ? '...' : 'PDF'}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {pendingGroups.map(g => (
              <div key={`${g.employee_id}|${g.production_date}`} className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-gray-900">{g.employee_name}</span>
                    <span className="text-sm text-gray-500 ml-2">{new Date(g.production_date + 'T12:00:00').toLocaleDateString('uz-UZ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => askReject(g)}
                      disabled={rejectMutation.isPending}
                      className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-3 flex items-center gap-1 disabled:opacity-50"
                      title="Noto'g'ri — kirimchiga qaytarish"
                    >
                      <RotateCcw size={13} /> Qayta
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ employee_id: g.employee_id, production_date: g.production_date })}
                      disabled={approveMutation.isPending}
                      className="btn-success btn-sm"
                    >
                      <Check size={13} /> Tasdiqlash
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {g.rows.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="font-medium">{r.product_name || '—'}</span>
                      {r.product_id && (
                        r.product_kind === 'KOMPONENT'
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">🔧 Komponent</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">📦 Tayyor</span>
                      )}
                      {r.rang && (
                        <span className="flex items-center gap-1">
                          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: RANG_COLORS[r.rang] || '#999' }} />
                          {r.rang}
                        </span>
                      )}
                      <span className="text-gray-500">{fmt(r.quantity_produced)} dona · {fmt(r.calculated_amount)} so'm</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sana */}
      <div className="flex items-center gap-3">
        <label className="label mb-0 whitespace-nowrap">Sana:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
        {date === today && <span className="text-xs text-blue-600 font-medium">Bugun</span>}
      </div>

      {/* Kiritish jadvali */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Ishchilar mahsulot chiqimi — {new Date(date + 'T12:00:00').toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>

        {workers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Stanokchi yoki detalchi xodimlar topilmadi</p>
        ) : (
          <>
            {/* Ustun sarlavhalari */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1 mb-2 hidden sm:grid">
              <span className="col-span-2">Xodim</span>
              <span className="col-span-2">Mahsulot</span>
              <span className="col-span-2">Rang</span>
              <span className="col-span-1">Turi</span>
              <span className="col-span-2 text-blue-500">Tarif</span>
              <span className="col-span-1">Dona</span>
              <span className="col-span-2 text-right text-green-600">Haq</span>
            </div>

            <div className="space-y-2">
              {entries.map((entry, i) => {
                const emp = empMap[entry.employee_id];
                const isDetalchi = emp?.type === 'DETALCHI';
                const pay = calcPay(entry);

                return (
                  <div key={i} className={clsx(
                    'grid grid-cols-12 gap-2 items-center p-2 rounded-lg border',
                    isDetalchi ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'
                  )}>
                    {/* Xodim */}
                    <div className="col-span-12 sm:col-span-2">
                      <select
                        value={entry.employee_id}
                        onChange={e => updateEntry(i, 'employee_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">— Xodim —</option>
                        {workers.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.type === 'DETALCHI' ? 'D' : 'S'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mahsulot — komponent va tayyor alohida guruhlangan */}
                    <div className="col-span-12 sm:col-span-2">
                      <select
                        value={entry.product_id}
                        onChange={e => updateEntry(i, 'product_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">— Mahsulot —</option>
                        {componentOptions.length > 0 && (
                          <optgroup label="🔧 Komponentlar (ishlab chiqarish ombori)">
                            {componentOptions.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {finishedOptions.length > 0 && (
                          <optgroup label="📦 Tayyor mahsulotlar">
                            {finishedOptions.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {/* Tanlangan mahsulot turi — avtomatik ko'rsatiladi */}
                      {entry.product_id && prodMap[entry.product_id] && (
                        prodMap[entry.product_id].kind === 'KOMPONENT'
                          ? <div className="mt-0.5 text-[10px] font-medium text-indigo-600">🔧 Komponent → ombor + Komponentlar</div>
                          : <div className="mt-0.5 text-[10px] font-medium text-blue-600">📦 Tayyor mahsulot → ombor</div>
                      )}
                    </div>

                    {/* Rang — ishchi qaysi rangda chiqarganini tanlaydi */}
                    <div className="col-span-12 sm:col-span-2">
                      <div className="flex items-center gap-1">
                        <select
                          value={entry.rang}
                          onChange={e => updateEntry(i, 'rang', e.target.value)}
                          className="select text-sm w-full"
                        >
                          <option value="">Rangsiz</option>
                          {RANGLAR.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {entry.rang && <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', flexShrink:0, background: RANG_COLORS[entry.rang] || '#999', border:'1px solid #ccc' }} />}
                      </div>
                    </div>

                    {/* Tur — Tayyor / Yarim / Komponent (qo'lda tanlash mumkin) */}
                    <div className="col-span-6 sm:col-span-1">
                      {emp?.type === 'STANOKCHI' ? (
                        <select
                          value={entry.production_type}
                          onChange={e => updateEntry(i, 'production_type', e.target.value)}
                          className="select text-sm w-full"
                        >
                          <option value="FINISHED">Tayyor</option>
                          <option value="SEMI_FINISHED">Yarim</option>
                          <option value="KOMPONENT">🔧 Komponent</option>
                        </select>
                      ) : isDetalchi ? (
                        <select
                          value={entry.production_type === 'KOMPONENT' ? 'KOMPONENT' : 'SEMI_FINISHED'}
                          onChange={e => updateEntry(i, 'production_type', e.target.value)}
                          className="select text-sm w-full"
                        >
                          <option value="SEMI_FINISHED">Yarim</option>
                          <option value="KOMPONENT">🔧 Komponent</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-300 px-1">—</span>
                      )}
                    </div>

                    {/* Tarif — avtomatik to'ladi, tahrirlanadi */}
                    <div className="col-span-6 sm:col-span-2">
                      <input
                        type="number" min="0" placeholder="so'm/dona"
                        value={entry.tarif}
                        onChange={e => updateEntry(i, 'tarif', e.target.value)}
                        onFocus={e => e.target.select()}
                        className="input text-sm border-blue-200 focus:border-blue-500"
                      />
                    </div>

                    {/* Miqdor */}
                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="number" min="0" placeholder="0"
                        value={entry.quantity_produced}
                        onChange={e => updateEntry(i, 'quantity_produced', e.target.value)}
                        onFocus={e => e.target.select()}
                        className="input text-sm"
                      />
                    </div>

                    {/* Haq + o'chirish */}
                    <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
                      {pay > 0 && (
                        <span className="text-sm font-bold text-green-700 whitespace-nowrap">
                          {fmt(pay)} so'm
                        </span>
                      )}
                      <button
                        onClick={() => setEntries(prev => prev.length === 1 ? [newEntry()] : prev.filter((_, idx) => idx !== i))}
                        className="text-gray-300 hover:text-red-500 ml-1"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Jami */}
            {totalPay > 0 && (
              <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-xl flex justify-between items-center">
                <span className="text-sm text-gray-600">Jami hisoblangan haq:</span>
                <span className="font-bold text-green-700 text-lg">{fmt(totalPay)} so'm</span>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setEntries(prev => [...prev, newEntry()])}
                className="btn-secondary btn-sm"
              >
                <Plus size={14} /> Ishchi qo'shish
              </button>
              <button
                onClick={save}
                disabled={bulkMutation.isPending}
                className="btn-primary btn-sm ml-auto"
              >
                <Save size={14} /> {bulkMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Shu kun uchun saqlangan + kutilayotgan yozuvlar */}
      {(todayRows.length > 0 || pendingRows.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">
              {new Date(date + 'T12:00:00').toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })} — Natijalar
            </h2>
            <div className="flex gap-2">
              <button onClick={() => downloadWorks('excel')} disabled={!!dlWorks}
                className="btn-secondary btn-sm" title="Excel (xlsx) yuklab olish">
                <FileDown size={13} /> {dlWorks === 'excel' ? '...' : 'Excel'}
              </button>
              <button onClick={() => downloadWorks('pdf')} disabled={!!dlWorks}
                className="btn-secondary btn-sm" title="PDF yuklab olish">
                <FileText size={13} /> {dlWorks === 'pdf' ? '...' : 'PDF'}
              </button>
            </div>
          </div>
          <div className="table-container">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Xodim</th>
                  <th>Mahsulot</th>
                  <th>Rang</th>
                  <th>Miqdor</th>
                  <th>Haq</th>
                  <th>Holat</th>
                  {canEdit && <th>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {[...pendingRows, ...todayRows].map(row => (
                  <tr key={row.id} className={row.approval_status === 'REJECTED' ? 'bg-red-50' : row.approval_status !== 'APPROVED' ? 'bg-yellow-50' : ''}>
                    <td className="font-medium">{row.employee_name}</td>
                    <td>
                      {row.product_name || '—'}
                      {row.approval_status === 'REJECTED' && row.notes && (
                        <div className="text-[10px] text-red-500 mt-0.5">↩ {row.notes}</div>
                      )}
                    </td>
                    <td>
                      {row.rang ? (
                        <span className="flex items-center gap-1">
                          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: RANG_COLORS[row.rang] || '#999' }} />
                          {row.rang}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="font-semibold">{fmt(row.quantity_produced)} dona</td>
                    <td className="font-bold text-green-700">{fmt(row.calculated_amount)} so'm</td>
                    <td>
                      {row.approval_status === 'APPROVED'
                        ? <span className="badge-green">Tasdiqlangan</span>
                        : row.approval_status === 'REJECTED'
                          ? <span className="badge bg-red-50 text-red-600">Qayta to'g'irlansin</span>
                          : <span className="badge-yellow">Kutilmoqda</span>
                      }
                    </td>
                    {canEdit && (
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(row)} className="btn-secondary btn-sm" title="Tahrirlash">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => askDelete(row)} disabled={deleteMutation.isPending}
                            className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-2" title="O'chirish">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="bg-green-50">
                  <td colSpan={4} className="text-right text-sm font-semibold text-gray-700 pr-2">Jami (tasdiqlangan):</td>
                  <td className="font-bold text-green-800 text-base" colSpan={canEdit ? 3 : 2}>
                    {fmt(todayRows.reduce((s, r) => s + parseFloat(r.calculated_amount || 0), 0))} so'm
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Yozuvni tahrirlash modali */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Yozuvni tahrirlash">
        {editRow && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 flex items-center flex-wrap gap-2">
              <span>Xodim: <span className="font-semibold text-gray-900">{editRow.employee_name}</span></span>
              <span className="text-xs text-gray-400">({editRow.employee_type === 'DETALCHI' ? 'Detalchi' : 'Stanokchi'})</span>
              {editRow.approval_status === 'APPROVED'
                ? <span className="badge-green">Tasdiqlangan</span>
                : editRow.approval_status === 'REJECTED'
                  ? <span className="badge bg-red-50 text-red-600">Qaytarilgan — saqlansa qayta yuboriladi</span>
                  : <span className="badge-yellow">Kutilmoqda</span>}
            </div>
            <div>
              <label className="label">Mahsulot</label>
              <select value={editRow.product_id} onChange={e => updateEditField('product_id', e.target.value)} className="select w-full">
                <option value="">— Mahsulot —</option>
                {componentOptions.length > 0 && (
                  <optgroup label="🔧 Komponentlar">
                    {componentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                )}
                {finishedOptions.length > 0 && (
                  <optgroup label="📦 Tayyor mahsulotlar">
                    {finishedOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Rang</label>
                <select value={editRow.rang} onChange={e => updateEditField('rang', e.target.value)} className="select w-full">
                  <option value="">Rangsiz</option>
                  {RANGLAR.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Turi</label>
                {editRow.employee_type === 'DETALCHI' ? (
                  <select value={editRow.production_type === 'KOMPONENT' ? 'KOMPONENT' : 'SEMI_FINISHED'}
                    onChange={e => updateEditField('production_type', e.target.value)} className="select w-full">
                    <option value="SEMI_FINISHED">Yarim</option>
                    <option value="KOMPONENT">🔧 Komponent</option>
                  </select>
                ) : (
                  <select value={editRow.production_type} onChange={e => updateEditField('production_type', e.target.value)} className="select w-full">
                    <option value="FINISHED">Tayyor</option>
                    <option value="SEMI_FINISHED">Yarim</option>
                    <option value="KOMPONENT">🔧 Komponent</option>
                  </select>
                )}
              </div>
              <div>
                <label className="label">Miqdor (dona)</label>
                <input type="number" min="1" value={editRow.quantity_produced}
                  onChange={e => updateEditField('quantity_produced', e.target.value)}
                  onFocus={e => e.target.select()} className="input w-full" />
              </div>
              <div>
                <label className="label">Tarif (so'm/dona)</label>
                <input type="number" min="0" value={editRow.tarif}
                  onChange={e => updateEditField('tarif', e.target.value)}
                  onFocus={e => e.target.select()} className="input w-full" />
              </div>
            </div>
            <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-600">Hisoblangan haq:</span>
              <span className="font-bold text-green-700">
                {fmt((parseFloat(editRow.quantity_produced) || 0) * (parseFloat(editRow.tarif) || 0))} so'm
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditRow(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={saveEdit} disabled={updateMutation.isPending} className="btn-primary flex-1">
                <Save size={14} /> {updateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Qaytarish (Qayta) modali — sabab so'raladi */}
      <Modal open={!!rejectFor} onClose={() => setRejectFor(null)} title="Kirimchiga qaytarish">
        {rejectFor && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{rejectFor.employee_name}</span> ning{' '}
              {new Date(rejectFor.production_date + 'T12:00:00').toLocaleDateString('uz-UZ')} kungi yozuvi kirimchiga
              qaytariladi — u to'g'irlab qayta yuboradi. Ombor o'zgarmaydi.
            </p>
            <div>
              <label className="label">Sabab (ixtiyoriy — nima noto'g'ri?)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                rows={3} className="input w-full" placeholder="Masalan: mahsulot noto'g'ri, miqdor xato..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectFor(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={confirmReject} disabled={rejectMutation.isPending}
                className="btn-primary flex-1 bg-red-600 hover:bg-red-700 border-red-600">
                <RotateCcw size={14} /> {rejectMutation.isPending ? 'Qaytarilmoqda...' : 'Qaytarish'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Asosiy sahifa ────────────────────────────────────────────────────────────
export default function IntakePage() {
  const { isOwner, isSalesHead, isKirimchi, isProductionHead, user } = useAuthStore();
  const [tab, setTab] = useState('intake');

  const canCreate = isOwner() || isKirimchi() || isProductionHead() || isSalesHead();
  const canApprove = isOwner() || isSalesHead();
  // Tahrirlash/o'chirish — backend ruxsati bilan bir xil (OWNER/PRODUCTION_HEAD/KIRIMCHI)
  const canEdit = isOwner() || isProductionHead() || isKirimchi();

  const TABS = [
    { key: 'intake',  label: 'Mahsulot kirimi', icon: PackagePlus },
    { key: 'workers', label: 'Ishchilar ishi',   icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mahsulot Kirim</h1>
      </div>

      {/* Tabs */}
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

      {tab === 'intake' && (
        <ProductIntakeTab canCreate={canCreate} canApprove={canApprove} />
      )}
      {tab === 'workers' && (
        <WorkerOutputTab canApprove={canApprove} canEdit={canEdit} />
      )}
    </div>
  );
}
