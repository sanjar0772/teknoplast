import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackagePlus, X, Search, Plus, Trash2, Check, Ban, Eye, Save, Users, ChevronDown } from 'lucide-react';
import { intakesAPI, productsAPI, productionAPI, employeesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import clsx from 'clsx';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

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

  const { data, isLoading } = useQuery({
    queryKey: ['intakes'],
    queryFn: () => intakesAPI.getAll().then(r => r.data),
  });
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
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20);
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

  const addToCart = (p) => {
    setCart(c => c.find(x => x.id === p.id)
      ? c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x)
      : [...c, { id: p.id, name: p.name, qty: 1, stock: p.stock_quantity }]);
  };
  const submit = () => {
    if (!cart.length) return toast.error('Mahsulot qo\'shing');
    createMutation.mutate({ items: cart.map(x => ({ product_id: x.id, quantity: parseInt(x.qty) })), notes });
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        {canCreate && (
          <button onClick={() => { setCart([]); setNotes(''); setShowForm(true); }} className="btn-primary btn-sm">
            <PackagePlus size={14} /> Yangi kirim
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Sana</th><th>Kirituvchi</th><th>Mahsulot xili</th><th>Jami miqdor</th><th>Status</th><th>Amal</th></tr>
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
                  <td>{i.item_count} xil</td>
                  <td className="font-semibold">{fmt(i.total_qty)} dona</td>
                  <td><span className={st.cls}>{st.label}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setDetailId(i.id)} className="btn-secondary btn-sm"><Eye size={12} /></button>
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
          {search && (
            <div className="border border-gray-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
              {filtered.map(p => (
                <button key={p.id} onClick={() => addToCart(p)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 text-sm">
                  <span>{p.name} <span className="text-xs text-gray-400">(ombor: {p.stock_quantity})</span></span>
                  <Plus size={14} className="text-blue-600" />
                </button>
              ))}
            </div>
          )}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="table text-sm">
              <thead><tr><th>Mahsulot</th><th className="w-28">Kirim miqdori</th><th className="w-10"></th></tr></thead>
              <tbody>
                {!cart.length ? (
                  <tr><td colSpan={3} className="text-center py-6 text-gray-400">Mahsulot qo'shing</td></tr>
                ) : cart.map(x => (
                  <tr key={x.id}>
                    <td>{x.name}<div className="text-xs text-gray-400">ombor: {x.stock}</div></td>
                    <td><input type="number" min="1" value={x.qty} onChange={e => setCart(c => c.map(y => y.id === x.id ? { ...y, qty: e.target.value } : y))} onFocus={e => e.target.select()} className="input py-1 px-2 w-24" /></td>
                    <td><button onClick={() => setCart(c => c.filter(y => y.id !== x.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button></td>
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
                <thead><tr><th>Mahsulot</th><th>Kirim miqdori</th><th>Hozirgi ombor</th></tr></thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id}>
                      <td>{it.product_name}</td>
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
function WorkerOutputTab() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState([newEntry()]);

  function newEntry() {
    return { employee_id: '', product_id: '', quantity_produced: '', production_type: 'FINISHED', tarif: '' };
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

  const workers = (empData?.employees || []).filter(e => e.type === 'STANOKCHI' || e.type === 'DETALCHI');
  const products = prodData?.products || [];

  const empMap = {};
  workers.forEach(e => { empMap[e.id] = e; });
  const prodMap = {};
  products.forEach(p => { prodMap[p.id] = p; });

  // Mahsulot/xodim/tur asosida tarifni avtomatik hisoblash
  const autoTarif = (empId, prodId, ptype) => {
    const emp = empMap[empId];
    const p = prodMap[prodId];
    if (!emp) return '';
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
      if (field === 'employee_id') {
        const emp = empMap[value];
        if (emp?.type === 'DETALCHI') next.production_type = 'SEMI_FINISHED';
        else next.production_type = 'FINISHED';
        next.tarif = autoTarif(value, next.product_id, next.production_type);
      }
      if (field === 'product_id' || field === 'production_type') {
        next.tarif = autoTarif(next.employee_id, field === 'product_id' ? value : next.product_id, field === 'production_type' ? value : next.production_type);
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
        production_type: empMap[e.employee_id]?.type === 'DETALCHI' ? 'SEMI_FINISHED' : (e.production_type || 'FINISHED'),
        daily_tariff: e.tarif !== '' ? parseFloat(e.tarif) : undefined,
      })),
    });
  };

  const todayRows = (dailyData?.production || []).filter(r =>
    r.employee_type === 'STANOKCHI' || r.employee_type === 'DETALCHI'
  );

  return (
    <div className="space-y-6">
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
              <span className="col-span-3">Xodim</span>
              <span className="col-span-3">Mahsulot</span>
              <span className="col-span-1">Turi</span>
              <span className="col-span-2 text-blue-500">Tarif (so'm/dona)</span>
              <span className="col-span-1">Dona</span>
              <span className="col-span-2 text-right text-green-600">Hisoblangan haq</span>
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
                    <div className="col-span-12 sm:col-span-3">
                      <select
                        value={entry.employee_id}
                        onChange={e => updateEntry(i, 'employee_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">— Xodim tanlang —</option>
                        {workers.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.type === 'DETALCHI' ? 'D' : 'S'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mahsulot */}
                    <div className="col-span-12 sm:col-span-3">
                      <select
                        value={entry.product_id}
                        onChange={e => updateEntry(i, 'product_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">— Mahsulot —</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tur */}
                    <div className="col-span-6 sm:col-span-1">
                      {emp?.type === 'STANOKCHI' ? (
                        <select
                          value={entry.production_type}
                          onChange={e => updateEntry(i, 'production_type', e.target.value)}
                          className="select text-sm w-full"
                        >
                          <option value="FINISHED">Tayyor</option>
                          <option value="SEMI_FINISHED">Yarim</option>
                        </select>
                      ) : isDetalchi ? (
                        <span className="text-xs text-orange-600 font-medium px-1">Yarim</span>
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

      {/* Shu kun uchun saqlangan yozuvlar */}
      {todayRows.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            {new Date(date + 'T12:00:00').toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })} — Saqlangan natijalar
          </h2>
          <div className="table-container">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Xodim</th>
                  <th>Turi</th>
                  <th>Mahsulot</th>
                  <th>Tarif (so'm/dona)</th>
                  <th>Miqdor</th>
                  <th>Hisoblangan haq</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map(row => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.employee_name}</td>
                    <td>
                      <span className={clsx(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        row.employee_type === 'DETALCHI' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {row.employee_type}
                      </span>
                    </td>
                    <td>{row.product_name || '—'}</td>
                    <td className="text-gray-500">{fmt(row.daily_tariff)} so'm</td>
                    <td className="font-semibold">{fmt(row.quantity_produced)} dona</td>
                    <td className="font-bold text-green-700">{fmt(row.calculated_amount)} so'm</td>
                  </tr>
                ))}
                <tr className="bg-green-50">
                  <td colSpan={5} className="text-right text-sm font-semibold text-gray-700 pr-2">Jami:</td>
                  <td className="font-bold text-green-800 text-base">
                    {fmt(todayRows.reduce((s, r) => s + parseFloat(r.calculated_amount || 0), 0))} so'm
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Asosiy sahifa ────────────────────────────────────────────────────────────
export default function IntakePage() {
  const { isOwner, isSalesHead, isKirimchi, isProductionHead } = useAuthStore();
  const [tab, setTab] = useState('intake');

  const canCreate = isOwner() || isKirimchi() || isProductionHead();
  const canApprove = isOwner() || isSalesHead();

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
        <WorkerOutputTab />
      )}
    </div>
  );
}
