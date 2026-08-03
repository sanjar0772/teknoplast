import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ShoppingBag, Plus, Trash2, PackageCheck, X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { productsAPI, customersAPI, onlineOrdersAPI } from '../services/api';
import { RANG_COLORS } from '../constants/colors';

const rangLabel = (r) => (r && r.trim()) ? r : 'Rangsiz';
const fmt = (n) => (Math.round(parseFloat(n) || 0)).toLocaleString('ru-RU');
const newKey = () => Math.random().toString(36).slice(2);

const STATUS_UI = {
  RESERVED:  { label: 'Kutilmoqda', cls: 'badge-yellow', icon: Clock },
  COMPLETED: { label: 'Olib ketildi', cls: 'badge-green', icon: CheckCircle2 },
  CANCELLED: { label: 'Bekor qilingan', cls: 'badge-red', icon: XCircle },
};

export default function OnlineOrdersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('list'); // 'list' | 'new'
  const [statusFilter, setStatusFilter] = useState('RESERVED');

  const { data: productsData } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });
  const { data: customersData } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['online-orders', statusFilter],
    queryFn: () => onlineOrdersAPI.getAll(statusFilter ? { status: statusFilter } : {}).then(r => r.data),
  });

  const products = (productsData?.products || []).filter(p => p.kind !== 'KOMPONENT');
  const customers = customersData?.customers || [];
  const orders = ordersData?.orders || [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['online-orders'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg">
          <ShoppingBag size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Onlayn zakazlar</h1>
          <p className="text-xs text-gray-500">Ijtimoiy tarmoqdan kelgan buyurtmalar — tovar band qilinadi, mijoz kelganda olib ketadi</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('list')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'list' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          Zakazlar ro'yxati
        </button>
        <button onClick={() => setTab('new')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 ${tab === 'new' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          <Plus size={16} /> Yangi zakaz
        </button>
      </div>

      {tab === 'new'
        ? <NewOrderForm products={products} customers={customers}
            onDone={() => { refresh(); setTab('list'); setStatusFilter('RESERVED'); }} />
        : <OrderList orders={orders} isLoading={isLoading}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter} onChange={refresh} />}
    </div>
  );
}

/* ---------------- Yangi zakaz formasi ---------------- */
function NewOrderForm({ products, customers, onDone }) {
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [advance, setAdvance] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? products.filter(p => String(p.name || '').toLowerCase().includes(q)) : products;
    return base.slice(0, 20);
  }, [search, products]);

  const rowIds = new Set(rows.map(r => r.id));

  const addRow = (p) => {
    if (rowIds.has(p.id)) return;
    const cs = p.color_stock || [];
    setRows(rs => [...rs, {
      key: newKey(), id: p.id, name: p.name, unit: p.unit || 'dona',
      price: parseFloat(p.price) || 0, qty: 1,
      color_stock: cs, rang: cs.length === 1 ? cs[0].rang : '',
    }]);
    setSearch('');
  };
  const updRow = (key, field, val) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: val } : r));
  const delRow = (key) => setRows(rs => rs.filter(r => r.key !== key));

  const rowAvail = (r) => {
    const cs = (r.color_stock || []).find(c => (c.rang || '') === (r.rang || ''));
    return cs ? parseFloat(cs.quantity) || 0 : 0;
  };
  const grand = rows.reduce((s, r) => s + (parseInt(r.qty) || 0) * (parseFloat(r.price) || 0), 0);

  const mutation = useMutation({
    mutationFn: (data) => onlineOrdersAPI.create(data),
    onSuccess: () => { toast.success('Onlayn zakaz yaratildi — tovar band qilindi'); onDone(); },
  });

  const submit = () => {
    if (!customerId) return toast.error('Mijozni tanlang');
    if (!rows.length) return toast.error('Kamida bitta mahsulot qo\'shing');
    for (const r of rows) {
      if ((r.color_stock || []).length > 1 && !(r.color_stock || []).some(c => (c.rang || '') === (r.rang || '')))
        return toast.error(`"${r.name}" uchun rang tanlang`);
      if (!(parseInt(r.qty) > 0)) return toast.error(`"${r.name}" — miqdorni kiriting`);
      if (parseInt(r.qty) > rowAvail(r)) return toast.error(`"${r.name}" — ${rangLabel(r.rang)}: faqat ${rowAvail(r)} dona bor`);
    }
    mutation.mutate({
      customer_id: customerId,
      advance_amount: parseFloat(advance) || 0,
      expected_date: expectedDate || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
      items: rows.map(r => ({ product_id: r.id, quantity: parseInt(r.qty), unit_price: parseFloat(r.price) || 0, rang: r.rang || '' })),
    });
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Chap: mahsulot qidirish */}
      <div className="card space-y-3">
        <label className="text-xs font-medium text-gray-500">Mahsulot qidirish</label>
        <input className="input" placeholder="Mahsulot nomi..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map(p => (
            <button key={p.id} onClick={() => addRow(p)} disabled={rowIds.has(p.id)}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:bg-purple-50 disabled:opacity-40 flex justify-between items-center text-sm">
              <span>{p.name}</span>
              <span className="text-xs text-gray-400">{fmt(p.price)} · {p.stock_quantity} {p.unit || 'dona'}</span>
            </button>
          ))}
          {!filtered.length && <p className="text-xs text-gray-400 text-center py-4">Mahsulot topilmadi</p>}
        </div>
      </div>

      {/* O'ng: zakaz tarkibi + ma'lumot */}
      <div className="card space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500">Mijoz *</label>
          <select className="select" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">— Mijozni tanlang —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.key} className="border border-gray-100 rounded-lg p-2 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{r.name}</span>
                <button onClick={() => delRow(r.key)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(r.color_stock || []).length > 0 && (
                  <span className="flex items-center gap-1">
                    <select className="select py-0.5 px-1 text-xs w-28"
                      value={r.rang || ''} onChange={e => updRow(r.key, 'rang', e.target.value)}>
                      {(r.color_stock || []).length !== 1 && <option value="">— Rang —</option>}
                      {(r.color_stock || []).map(c => (
                        <option key={c.rang || 'none'} value={c.rang}>{rangLabel(c.rang)} ({c.quantity})</option>
                      ))}
                    </select>
                    {r.rang && <span style={{ width: 8, height: 8, borderRadius: '50%', background: RANG_COLORS[r.rang] || '#999', display: 'inline-block' }} />}
                  </span>
                )}
                <input type="number" min="1" className="input py-0.5 px-2 text-xs w-16" value={r.qty}
                  onChange={e => updRow(r.key, 'qty', e.target.value)} />
                <span className="text-xs text-gray-400">×</span>
                <input type="number" min="0" className="input py-0.5 px-2 text-xs w-24" value={r.price}
                  onChange={e => updRow(r.key, 'price', e.target.value)} />
                <span className="text-xs font-semibold ml-auto">{fmt((parseInt(r.qty) || 0) * (parseFloat(r.price) || 0))}</span>
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-xs text-gray-400 text-center py-3">Chapdan mahsulot tanlang</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500">Avans (ixtiyoriy)</label>
            <input type="number" min="0" className="input" placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Kutilayotgan sana</label>
            <input type="date" className="input" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Qayerdan (Instagram/Telegram...)</label>
          <input className="input" placeholder="Ixtiyoriy" value={source} onChange={e => setSource(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">Izoh</label>
          <input className="input" placeholder="Ixtiyoriy" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-gray-500">Jami:</span>
          <span className="text-lg font-bold text-purple-700">{fmt(grand)} so'm</span>
        </div>
        <button onClick={submit} disabled={mutation.isPending}
          className="btn btn-primary w-full flex items-center justify-center gap-2">
          <PackageCheck size={18} /> {mutation.isPending ? 'Saqlanmoqda...' : 'Zakazni saqlash (tovarni band qilish)'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Zakazlar ro'yxati ---------------- */
function OrderList({ orders, isLoading, statusFilter, setStatusFilter, onChange }) {
  const [completing, setCompleting] = useState(null);

  const FILTERS = [
    { v: 'RESERVED', label: 'Kutilmoqda' },
    { v: 'COMPLETED', label: 'Olib ketilgan' },
    { v: 'CANCELLED', label: 'Bekor qilingan' },
    { v: '', label: 'Hammasi' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === f.v ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 text-center py-6">Yuklanmoqda...</p>}
      {!isLoading && !orders.length && <p className="text-sm text-gray-400 text-center py-6">Zakaz yo'q</p>}

      {orders.map(o => {
        const st = STATUS_UI[o.status] || STATUS_UI.RESERVED;
        const StIcon = st.icon;
        return (
          <div key={o.id} className="card space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800">{o.customer_name || 'Mijoz'}</span>
                  <span className={`${st.cls} flex items-center gap-1`}><StIcon size={12} /> {st.label}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {o.order_ref}{o.source ? ` · ${o.source}` : ''}
                  {o.expected_date ? ` · kutiladi: ${o.expected_date}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-purple-700">{fmt(o.total_amount)} so'm</div>
                {parseFloat(o.advance_amount) > 0 && <div className="text-[11px] text-green-600">avans: {fmt(o.advance_amount)}</div>}
              </div>
            </div>

            <div className="text-xs text-gray-600 space-y-0.5">
              {(o.items || []).map(it => (
                <div key={it.id} className="flex items-center gap-1">
                  {it.rang && <span style={{ width: 7, height: 7, borderRadius: '50%', background: RANG_COLORS[it.rang] || '#999', display: 'inline-block' }} />}
                  <span>{it.product_name} — {it.quantity} {it.unit} × {fmt(it.unit_price)}{it.rang ? ` · ${rangLabel(it.rang)}` : ''}</span>
                </div>
              ))}
            </div>
            {o.notes && <div className="text-[11px] text-gray-400">{o.notes}</div>}

            {o.status === 'RESERVED' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCompleting(o)} className="btn btn-success btn-sm flex-1 flex items-center justify-center gap-1">
                  <PackageCheck size={15} /> Olib ketdi / Yakunlash
                </button>
                <button onClick={() => {
                  if (window.confirm('Zakaz bekor qilinsinmi? Tovar omborga qaytariladi.')) {
                    onlineOrdersAPI.cancel(o.id, {}).then(() => { toast.success('Bekor qilindi, tovar qaytarildi'); onChange(); });
                  }
                }} className="btn btn-danger btn-sm">Bekor</button>
              </div>
            )}
            {o.status === 'COMPLETED' && o.sale_order_ref && (
              <div className="text-[11px] text-green-600">Savdo cheki: {o.sale_order_ref}</div>
            )}
          </div>
        );
      })}

      {completing && <CompleteModal order={completing} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); onChange(); }} />}
    </div>
  );
}

/* ---------------- Yakunlash modali (to'lov) ---------------- */
function CompleteModal({ order, onClose, onDone }) {
  const grand = parseFloat(order.total_amount) || 0;
  const advance = parseFloat(order.advance_amount) || 0;
  const remaining = Math.max(0, grand - advance);
  const [cash, setCash] = useState(String(remaining));
  const [card, setCard] = useState('');
  const [bank, setBank] = useState('');
  const [click, setClick] = useState('');

  const finalPay = (parseFloat(cash) || 0) + (parseFloat(card) || 0) + (parseFloat(bank) || 0) + (parseFloat(click) || 0);
  const totalPaid = advance + finalPay;
  const debt = Math.max(0, grand - totalPaid);

  const mutation = useMutation({
    mutationFn: (data) => onlineOrdersAPI.complete(order.id, data),
    onSuccess: () => { toast.success('Zakaz yakunlandi — savdoga aylandi'); onDone(); },
  });

  const submit = () => {
    const parts = [];
    if (advance > 0) parts.push(`Avans: ${Math.round(advance)}`);
    if (parseFloat(cash) > 0) parts.push(`Naqd: ${Math.round(parseFloat(cash))}`);
    if (parseFloat(card) > 0) parts.push(`Karta: ${Math.round(parseFloat(card))}`);
    if (parseFloat(bank) > 0) parts.push(`Bank: ${Math.round(parseFloat(bank))}`);
    if (parseFloat(click) > 0) parts.push(`Click: ${Math.round(parseFloat(click))}`);
    if (debt > 0) parts.push(`Qarz: ${Math.round(debt)}`);
    if (!parts.length) parts.push('Qarz');
    mutation.mutate({ final_payment: finalPay, notes: `To'lov: ${parts.join(' · ')}` });
  };

  const Field = ({ label, val, set }) => (
    <div>
      <label className="text-[11px] text-gray-500">{label}</label>
      <input type="number" min="0" className="input" value={val} onChange={e => set(e.target.value)} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Zakazni yakunlash</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500">{order.customer_name} · jami <b>{fmt(grand)}</b> so'm{advance > 0 ? ` · avans ${fmt(advance)}` : ''}</p>

        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[11px] text-gray-500">💵 Naqd</label><input type="number" min="0" className="input" value={cash} onChange={e => setCash(e.target.value)} /></div>
          <div><label className="text-[11px] text-gray-500">💳 Karta</label><input type="number" min="0" className="input" value={card} onChange={e => setCard(e.target.value)} /></div>
          <div><label className="text-[11px] text-gray-500">🏦 Bank</label><input type="number" min="0" className="input" value={bank} onChange={e => setBank(e.target.value)} /></div>
          <div><label className="text-[11px] text-gray-500">📱 Click</label><input type="number" min="0" className="input" value={click} onChange={e => setClick(e.target.value)} /></div>
        </div>

        <div className="text-sm bg-gray-50 rounded-xl p-3 space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Bugun to'lov:</span><span className="font-semibold">{fmt(finalPay)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Jami to'langan:</span><span className="font-semibold">{fmt(totalPaid)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Qolgan qarz:</span><span className={`font-bold ${debt > 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(debt)}</span></div>
        </div>

        <button onClick={submit} disabled={mutation.isPending} className="btn btn-primary w-full">
          {mutation.isPending ? 'Bajarilmoqda...' : 'Yakunlash va savdoga aylantirish'}
        </button>
      </div>
    </div>
  );
}
