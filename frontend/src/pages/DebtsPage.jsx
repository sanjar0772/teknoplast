import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Phone, Clock, CheckCircle, Coins, MessageSquare, Copy, Bot, Printer, Search, ChevronDown, ChevronRight, History, Plus } from 'lucide-react';
import { reportsAPI, salesAPI, ahmadAPI, customersAPI } from '../services/api';

const METHOD_LABEL = { CASH: '💵 Naqd', CARD: '💳 Karta', TRANSFER: '🏦 Bank', OTHER: 'Boshqa' };

// To'lov tarixi modal — ichida o'zi fetch qiladi
function PaymentHistoryModal({ group, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['debt-payments', group?.key],
    queryFn: async () => {
      const results = await Promise.all(
        group.items.map(item => salesAPI.getPayments(item.sale_id).then(r => r.data.payments || []))
      );
      return results.flat().sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));
    },
    enabled: !!group,
  });

  if (!group) return null;
  const totalPaid = (data || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">To'lov tarixi</h3>
            <p className="text-sm text-gray-500">{group.customer}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p>
        ) : !data?.length ? (
          <p className="text-center py-8 text-gray-400">Hali to'lov qilinmagan</p>
        ) : (
          <div className="space-y-2">
            {data.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {new Date(p.payment_date).toLocaleDateString('uz-UZ')}
                  </div>
                  <div className="text-xs text-gray-400">{METHOD_LABEL[p.method] || p.method}</div>
                </div>
                <span className="font-bold text-green-700">{fmt(p.amount)} so'm</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-600">Jami to'langan:</span>
              <span className="font-bold text-green-700 text-base">{fmt(totalPaid)} so'm</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-600">Qolgan qarz:</span>
              <span className="font-bold text-red-600 text-base">{fmt(group.totalDebt)} so'm</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

const BUCKET_INFO = {
  '0-30':  { label: '0–30 kun',  cls: 'text-green-600',  bg: 'bg-green-50' },
  '31-60': { label: '31–60 kun', cls: 'text-yellow-600', bg: 'bg-yellow-50' },
  '61-90': { label: '61–90 kun', cls: 'text-orange-600', bg: 'bg-orange-50' },
  '90+':   { label: '90+ kun',   cls: 'text-red-600',    bg: 'bg-red-50' },
};

const BUCKET_ORDER = ['90+', '61-90', '31-60', '0-30'];

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function DebtsPage() {
  const qc = useQueryClient();
  // payFor = { customer, totalDebt, items: [{sale_id, debt}, ...] }
  const [payFor, setPayFor] = useState(null);
  const [payAmounts, setPayAmounts] = useState({ naqd: '', karta: '', bank: '' });
  const [receipt, setReceipt] = useState(null); // to'lovdan keyin chek
  const [historyFor, setHistoryFor] = useState(null);
  const [remindFor, setRemindFor] = useState(null);
  const [reminderText, setReminderText] = useState('');
  const [tone, setTone] = useState('soft');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [dateFilter, setDateFilter] = useState({ date_from: '', date_to: '' });
  const [datePreset, setDatePreset] = useState('all');
  // Qo'lda qarz qo'shish formasi
  const [addDebt, setAddDebt] = useState(null); // null = yopiq

  const { data: customersData } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const addDebtMutation = useMutation({
    mutationFn: (d) => reportsAPI.addDebt(d),
    onSuccess: () => {
      toast.success('Qarz qo\'shildi');
      setAddDebt(null);
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Qarz qo\'shishda xato'),
  });

  const openAddDebt = () => setAddDebt({
    customer_id: '', amount: '', sale_date: new Date().toISOString().slice(0, 10), notes: '',
  });
  const submitAddDebt = () => {
    if (!addDebt.customer_id) return toast.error('Mijozni tanlang');
    if (!addDebt.amount || parseFloat(addDebt.amount) <= 0) return toast.error('Qarz summasini kiriting');
    addDebtMutation.mutate({
      customer_id: addDebt.customer_id,
      amount: parseFloat(addDebt.amount),
      sale_date: addDebt.sale_date,
      notes: addDebt.notes || undefined,
    });
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

  const toggleExpand = (key) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const reminderMutation = useMutation({
    mutationFn: ({ item, tone }) => ahmadAPI.debtReminder({
      customer: item.customer, debt: Math.round(item.debt), days_old: item.days_old, tone, language: 'uz',
    }).then(r => r.data),
    onSuccess: (data) => setReminderText(data.message || ''),
    onError: (e) => toast.error(e.response?.data?.error || 'AI eslatma yoza olmadi'),
  });

  const openReminder = (item) => {
    setRemindFor(item);
    setReminderText('');
    setTone('soft');
    reminderMutation.mutate({ item, tone: 'soft' });
  };
  const changeTone = (t) => {
    setTone(t);
    if (remindFor) reminderMutation.mutate({ item: remindFor, tone: t });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['debts', dateFilter],
    queryFn: () => reportsAPI.getDebts(dateFilter.date_from || dateFilter.date_to ? dateFilter : undefined).then(r => r.data),
  });

  // To'lovni eski qarzdan boshlab taqsimlash (FIFO):
  // naqd → karta → bank tartibida har bir qarzga yoziladi
  const payMutation = useMutation({
    mutationFn: async ({ items, naqd, karta, bank }) => {
      const pools = [
        { method: 'CASH',     remaining: naqd  },
        { method: 'CARD',     remaining: karta },
        { method: 'TRANSFER', remaining: bank  },
      ].filter(p => p.remaining > 0.01);

      for (const item of items) {
        let saleLeft = item.debt;
        if (saleLeft <= 0.01) continue;
        for (const pool of pools) {
          if (pool.remaining <= 0.01 || saleLeft <= 0.01) continue;
          const pay = Math.min(pool.remaining, saleLeft);
          await salesAPI.addPayment(item.sale_id, { amount: Math.round(pay * 100) / 100, method: pool.method });
          pool.remaining -= pay;
          saleLeft -= pay;
        }
      }
    },
    onSuccess: (_, variables) => {
      const { customer, totalDebt, naqd, karta, bank } = variables;
      const total = (naqd || 0) + (karta || 0) + (bank || 0);
      setPayFor(null);
      setReceipt({ customer, naqd: naqd || 0, karta: karta || 0, bank: bank || 0, total, remaining: Math.max(0, totalDebt - total), date: new Date() });
      toast.success('To\'lov saqlandi! Chek tayyor.');
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'To\'lovda xato'),
  });

  // To'lov oynasini ochish — bir yoki ko'p qarz, oraliq modal yo'q
  const openPay = (g) => {
    setPayAmounts({ naqd: Math.round(g.totalDebt), karta: '', bank: '' });
    setPayFor({ customer: g.customer, totalDebt: g.totalDebt, items: g.items });
  };

  const naqd  = parseFloat(payAmounts.naqd)  || 0;
  const karta = parseFloat(payAmounts.karta) || 0;
  const bank  = parseFloat(payAmounts.bank)  || 0;
  const payTotal = naqd + karta + bank;

  const submitPay = () => {
    if (payTotal <= 0) return toast.error('Kamida bitta usulda summa kiriting');
    if (payFor && payTotal > payFor.totalDebt + 0.01)
      return toast.error(`To'lov ${fmt(payFor.totalDebt)} so'mdan oshmasin`);
    payMutation.mutate({ items: payFor.items, naqd, karta, bank, customer: payFor.customer, totalDebt: payFor.totalDebt });
  };

  const buckets = data?.buckets || {};
  const allItems = data?.items || [];
  const q = search.trim().toLowerCase();

  // Mijoz bo'yicha guruhlash — bir mijozning barcha qarzlari 1 qatorda
  const customerGroups = useMemo(() => {
    const map = new Map();
    allItems.forEach(item => {
      const key = item.customer_id ? `id:${item.customer_id}` : `name:${item.customer}`;
      if (!map.has(key)) {
        map.set(key, { key, customer: item.customer, phone: item.phone, items: [] });
      }
      map.get(key).items.push(item);
    });
    return Array.from(map.values()).map(g => {
      const totalDebt   = g.items.reduce((s, x) => s + x.debt, 0);
      const totalAmount = g.items.reduce((s, x) => s + x.total_amount, 0);
      const totalPaid   = g.items.reduce((s, x) => s + x.paid, 0);
      const maxDays     = Math.max(...g.items.map(x => x.days_old));
      const worstBucket = BUCKET_ORDER.find(b => g.items.some(x => x.bucket === b)) || '0-30';
      const sortedItems = [...g.items].sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
      return { ...g, items: sortedItems, totalDebt, totalAmount, totalPaid, maxDays, worstBucket, multi: g.items.length > 1 };
    }).sort((a, b) => b.totalDebt - a.totalDebt);
  }, [allItems]);

  const filteredGroups = useMemo(() => {
    if (!q) return customerGroups;
    return customerGroups.filter(g =>
      g.customer.toLowerCase().includes(q) ||
      String(g.phone || '').toLowerCase().includes(q)
    );
  }, [customerGroups, q]);

  return (
    <div className="space-y-6">
      <div id="debts-print" className="space-y-6">
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-2 mb-2">
        <span className="font-bold text-gray-900">ТЕХНО-ИННОВАТОР МЧЖ — Qarzlar (Debitorlar) hisoboti</span>
        <span className="text-sm text-gray-600">{new Date().toLocaleDateString('uz-UZ')}</span>
      </div>

      <div className="page-header">
        <h1 className="page-title">Qarzlar (Debitorlar)</h1>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Umumiy qarz</p>
            <p className="text-2xl font-bold text-red-600">{fmt(data?.total_debt)} so'm</p>
          </div>
          <button onClick={openAddDebt} className="btn-primary btn-sm no-print">
            <Plus size={14} /> Qarz qo'shish
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm no-print">
            <Printer size={14} /> Chop etish
          </button>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.keys(BUCKET_INFO).map(key => {
          const info = BUCKET_INFO[key];
          return (
            <div key={key} className={`card-sm ${info.bg}`}>
              <div className="flex items-center gap-2">
                <Clock size={14} className={info.cls} />
                <p className="text-xs text-gray-600">{info.label}</p>
              </div>
              <p className={`text-lg font-bold mt-1 ${info.cls}`}>{fmt(buckets[key])} <span className="text-xs font-normal text-gray-400">so'm</span></p>
            </div>
          );
        })}
      </div>

      {/* Qidiruv + Sana filtri */}
      <div className="no-print card p-4 space-y-3">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Mijoz ismi yoki telefon bo'yicha qidirish..."
            className="input pl-9 pr-9 w-full" />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
          )}
        </div>
        {q && <p className="text-xs text-gray-400">{filteredGroups.length} ta mijoz topildi</p>}
        {/* Sana filtri — sotuv sanasi bo'yicha */}
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

      {/* Jadval */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Mijoz</th><th>Qarzlar</th><th>Kun</th>
              <th>Jami</th><th>To'langan</th><th>Qarz</th><th>Muddat</th><th className="no-print">Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !allItems.length ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
                Qarzdorlar yo'q — hammasi to'langan! 🎉
              </td></tr>
            ) : !filteredGroups.length ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                <Search size={24} className="mx-auto mb-2 text-gray-300" />
                "{search}" bo'yicha qarzdor topilmadi
              </td></tr>
            ) : filteredGroups.map(g => {
              const info = BUCKET_INFO[g.worstBucket];
              const isOpen = expanded.has(g.key);
              return (
                <Fragment key={g.key}>
                  <tr className={g.multi ? 'bg-blue-50/30 cursor-pointer hover:bg-blue-50' : ''}
                    onClick={g.multi ? () => toggleExpand(g.key) : undefined}>
                    <td>
                      <div className="flex items-center gap-1">
                        {g.multi && <span className="text-gray-400 flex-shrink-0">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>}
                        <div>
                          <div className="font-medium text-gray-900">{g.customer}</div>
                          {g.phone && <div className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} /> {g.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {g.multi
                        ? <span className="badge badge-blue">{g.items.length} ta qarz</span>
                        : <span className="whitespace-nowrap">{new Date(g.items[0].sale_date).toLocaleDateString('uz-UZ')}</span>}
                    </td>
                    <td>{g.maxDays} kun</td>
                    <td>{fmt(g.totalAmount)}</td>
                    <td className="text-green-600">{fmt(g.totalPaid)}</td>
                    <td className="font-bold text-red-600">{fmt(g.totalDebt)}</td>
                    <td><span className={`badge ${info.bg} ${info.cls}`}>{info.label}</span></td>
                    <td className="no-print" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => openPay(g)} className="btn-success btn-sm">
                          <Coins size={12} /> To'lov
                        </button>
                        <button onClick={() => setHistoryFor(g)} title="To'lov tarixi"
                          className="btn-secondary btn-sm">
                          <History size={12} /> Tarixi
                        </button>
                        <button onClick={() => openReminder({ customer: g.customer, debt: g.totalDebt, days_old: g.maxDays, phone: g.phone })}
                          title="AI eslatma" className="btn-secondary btn-sm">
                          <MessageSquare size={12} /> AI
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Kengaytirilgan tarix — faqat ko'rish, To'lov yo'q */}
                  {g.multi && isOpen && g.items.map(item => {
                    const iInfo = BUCKET_INFO[item.bucket];
                    return (
                      <tr key={item.sale_id} className="bg-gray-50/60 text-sm border-l-2 border-blue-200">
                        <td></td>
                        <td className="pl-4 whitespace-nowrap text-gray-700">{new Date(item.sale_date).toLocaleDateString('uz-UZ')}</td>
                        <td className="text-gray-500">{item.days_old} kun</td>
                        <td>{fmt(item.total_amount)}</td>
                        <td className="text-green-600">{fmt(item.paid)}</td>
                        <td className="font-bold text-red-600">{fmt(item.debt)}</td>
                        <td><span className={`badge ${iInfo.bg} ${iInfo.cls}`}>{iInfo.label}</span></td>
                        <td></td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* To'lov modal — naqd / karta / bank */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="To'lov kiritish">
        {payFor && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Mijoz:</span>
                <span className="font-medium">{payFor.customer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Jami qarz:</span>
                <span className="font-bold text-red-600">{fmt(payFor.totalDebt)} so'm</span>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { key: 'naqd',  label: '💵 Naqd',  cls: 'border-green-200 focus:ring-green-400'  },
                { key: 'karta', label: '💳 Karta', cls: 'border-blue-200  focus:ring-blue-400'   },
                { key: 'bank',  label: '🏦 Bank',  cls: 'border-purple-200 focus:ring-purple-400' },
              ].map(({ key, label, cls }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="w-20 text-sm font-medium text-gray-700 flex-shrink-0">{label}</label>
                  <div className="relative flex-1">
                    <input type="number" min="0"
                      value={payAmounts[key]}
                      onChange={e => setPayAmounts(p => ({ ...p, [key]: e.target.value }))}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                      className={`input pr-12 ${cls}`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                  </div>
                </div>
              ))}
            </div>

            <div className={`rounded-xl p-3 text-sm flex justify-between items-center ${
              payTotal > payFor.totalDebt + 0.01 ? 'bg-red-50 border border-red-200' :
              payTotal >= payFor.totalDebt - 0.01 && payTotal > 0 ? 'bg-green-50 border border-green-200' :
              'bg-blue-50 border border-blue-100'
            }`}>
              <span className="text-gray-600 font-medium">Jami to'lov:</span>
              <div className="text-right">
                <span className="font-bold text-lg">{fmt(payTotal)} so'm</span>
                {payTotal > 0 && payTotal < payFor.totalDebt - 0.01 && (
                  <div className="text-xs text-yellow-600">Qisman · qoladi: {fmt(payFor.totalDebt - payTotal)} so'm</div>
                )}
                {payTotal >= payFor.totalDebt - 0.01 && payTotal <= payFor.totalDebt + 0.01 && payTotal > 0 && (
                  <div className="text-xs text-green-600">✅ To'liq — qarz yopiladi</div>
                )}
                {payTotal > payFor.totalDebt + 0.01 && (
                  <div className="text-xs text-red-600">⚠️ Qarzdan ko'p!</div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setPayFor(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitPay}
                disabled={payMutation.isPending || payTotal <= 0 || payTotal > payFor.totalDebt + 0.01}
                className="btn-success flex-1">
                {payMutation.isPending ? 'Saqlanmoqda...' : 'To\'lovni saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* To'lov cheki modal */}
      {receipt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 print:hidden" onClick={() => setReceipt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <button onClick={() => setReceipt(null)}
              className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow print:hidden">
              <X size={18} />
            </button>
            <div id="chek-print" className="px-5 py-5 font-mono text-[13px] leading-tight text-gray-900">
              <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="text-lg font-bold tracking-wide">TEKNOPLAST</div>
                <div className="text-[11px] text-gray-500">Plastik mahsulotlar zavodi</div>
              </div>
              <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="flex justify-between"><span>Chek turi:</span><span className="font-bold">Qarz to'lovi</span></div>
                <div className="flex justify-between"><span>Sana:</span><span>{receipt.date.toLocaleDateString('uz-UZ')}</span></div>
                <div className="flex justify-between"><span>Vaqt:</span><span>{receipt.date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="flex justify-between"><span>Mijoz:</span><span className="font-bold">{receipt.customer}</span></div>
              </div>
              <div className="text-[12px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                {receipt.naqd > 0 && <div className="flex justify-between"><span>Naqd:</span><span className="font-bold text-green-700">{fmt(receipt.naqd)} so'm</span></div>}
                {receipt.karta > 0 && <div className="flex justify-between"><span>Karta:</span><span className="font-bold text-blue-700">{fmt(receipt.karta)} so'm</span></div>}
                {receipt.bank > 0 && <div className="flex justify-between"><span>Bank:</span><span className="font-bold text-purple-700">{fmt(receipt.bank)} so'm</span></div>}
              </div>
              <div className="flex justify-between font-bold text-[15px] pb-2 mb-1">
                <span>TO'LANDI:</span><span>{fmt(receipt.total)} so'm</span>
              </div>
              {receipt.remaining > 0.01 ? (
                <div className="flex justify-between text-[12px] text-red-600">
                  <span>Qolgan qarz:</span><span className="font-bold">{fmt(receipt.remaining)} so'm</span>
                </div>
              ) : (
                <div className="text-center text-[12px] text-green-700 font-bold">✅ Qarz to'liq yopildi!</div>
              )}
              <div className="text-center text-[10px] text-gray-400 mt-3">Xaridingiz uchun rahmat!</div>
            </div>
            <div className="flex gap-2 px-4 pb-4 print:hidden">
              <button onClick={() => setReceipt(null)} className="btn-secondary flex-1 text-sm">Yopish</button>
              <button onClick={() => {
                document.body.classList.add('printing-receipt');
                window.print();
                setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);
              }} className="btn-primary flex-1 text-sm">
                <Printer size={13} /> Chop etish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* To'lov tarixi modal */}
      <PaymentHistoryModal group={historyFor} onClose={() => setHistoryFor(null)} />

      {/* AI eslatma modal */}
      <Modal open={!!remindFor} onClose={() => setRemindFor(null)} title="AI qarz eslatmasi">
        {remindFor && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm flex justify-between">
              <span className="text-gray-500">{remindFor.customer}</span>
              <span className="font-bold text-red-600">{fmt(remindFor.debt)} so'm</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => changeTone('soft')} className={`btn-sm flex-1 ${tone === 'soft' ? 'btn-primary' : 'btn-secondary'}`}>Yumshoq</button>
              <button onClick={() => changeTone('firm')} className={`btn-sm flex-1 ${tone === 'firm' ? 'btn-primary' : 'btn-secondary'}`}>Qat'iy</button>
            </div>
            <div className="relative">
              <textarea value={reminderMutation.isPending ? '' : reminderText} onChange={e => setReminderText(e.target.value)}
                rows={6} placeholder={reminderMutation.isPending ? '' : 'Xabar matni...'}
                className="input w-full resize-none" />
              {reminderMutation.isPending && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 gap-2">
                  <Bot size={16} className="animate-pulse" /> AI yozmoqda...
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(reminderText); toast.success('Nusxa olindi'); }}
                disabled={!reminderText} className="btn-secondary flex-1"><Copy size={14} /> Nusxa olish</button>
              {remindFor.phone && (
                <a href={`sms:${remindFor.phone}?body=${encodeURIComponent(reminderText)}`}
                  className="btn-primary flex-1 flex items-center justify-center gap-1">
                  <MessageSquare size={14} /> SMS yuborish
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center">AI faqat matn yozadi — siz tekshirib, o'zingiz yuborasiz.</p>
          </div>
        )}
      </Modal>

      {/* Qo'lda qarz qo'shish modal */}
      <Modal open={!!addDebt} onClose={() => setAddDebt(null)} title="Qarz qo'shish">
        {addDebt && (
          <div className="space-y-4">
            <div>
              <label className="label text-sm">Mijoz *</label>
              <select
                value={addDebt.customer_id}
                onChange={e => setAddDebt(d => ({ ...d, customer_id: e.target.value }))}
                className={`select ${!addDebt.customer_id ? 'border-red-300' : ''}`}
              >
                <option value="" disabled>— Mijozni tanlang —</option>
                {customersData?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-sm">Qarz summasi *</label>
              <div className="relative">
                <input type="number" min="0" step="1000"
                  value={addDebt.amount}
                  onChange={e => setAddDebt(d => ({ ...d, amount: e.target.value }))}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
              </div>
            </div>
            <div>
              <label className="label text-sm">Sana</label>
              <input type="date" value={addDebt.sale_date}
                onChange={e => setAddDebt(d => ({ ...d, sale_date: e.target.value }))}
                className="input" />
            </div>
            <div>
              <label className="label text-sm">Izoh (ixtiyoriy)</label>
              <input type="text" value={addDebt.notes}
                onChange={e => setAddDebt(d => ({ ...d, notes: e.target.value }))}
                placeholder="Masalan: oldingi qarz qoldig'i"
                className="input" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddDebt(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitAddDebt}
                disabled={addDebtMutation.isPending}
                className="btn-primary flex-1">
                {addDebtMutation.isPending ? 'Saqlanmoqda...' : 'Qarz qo\'shish'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
