import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Phone, Clock, CheckCircle, Coins, MessageSquare, Copy, Bot, Printer, Search, ChevronDown, ChevronRight, History, Plus, FileText, Wallet } from 'lucide-react';
import { reportsAPI, salesAPI, ahmadAPI, customersAPI } from '../services/api';
import { COMPANY } from '../constants/company';

const METHOD_LABEL = { CASH: '💵 Naqd', CARD: '💳 Karta', TRANSFER: '🏦 Bank', PAYME: '📱 Pay Me', CLICK: '⚡ Click', DISCOUNT: '🏷️ Skidka', OTHER: 'Boshqa' };

// To'lov tarixi modal — schyot-faktura formatida, chop etish mumkin
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow print:hidden">
          <X size={18} />
        </button>
        <div id="payment-history-print" className="px-6 py-6 text-[13px] text-gray-900">
          {/* Header — kompaniya rekvizitlari */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-3 gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight">{COMPANY.name}</h2>
              <div className="text-[11px] text-gray-500 leading-snug mt-0.5 space-y-px">
                <div>Манзил: {COMPANY.address}</div>
                <div>Тел: {COMPANY.phone} · ИНН: {COMPANY.inn}</div>
                <div>Х/р: {COMPANY.account} · МФО: {COMPANY.mfo}</div>
                <div>Банк: {COMPANY.bank}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">TO'LOV TARIXI SCHYOT-FAKTURASI</h3>
            <span className="text-xs text-gray-500">Sana: {new Date().toLocaleDateString('uz-UZ')}</span>
          </div>

          <div className="text-xs text-gray-600 mb-4">
            <span className="text-gray-400">Mijoz: </span>
            <span className="font-medium text-gray-800">{group.customer}</span>
            {group.phone && <span className="text-gray-400"> · {group.phone}</span>}
          </div>

          {isLoading ? (
            <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p>
          ) : !data?.length ? (
            <p className="text-center py-8 text-gray-400">Hali to'lov qilinmagan</p>
          ) : (
            <>
              <table className="w-full text-[13px] mb-4">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-500 text-xs">
                    <th className="text-left py-1 w-6">#</th>
                    <th className="text-left py-1">Sana</th>
                    <th className="text-left py-1">To'lov usuli</th>
                    <th className="text-right py-1">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 text-gray-400">{i + 1}</td>
                      <td className="py-1">{new Date(p.payment_date).toLocaleDateString('uz-UZ')}</td>
                      <td className="py-1 text-gray-700">{METHOD_LABEL[p.method] || p.method}</td>
                      <td className="py-1 text-right font-semibold text-green-700">{fmt(p.amount)} so'm</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td className="py-1.5" colSpan={3}>Jami to'langan</td>
                    <td className="py-1.5 text-right text-green-700">{fmt(totalPaid)} so'm</td>
                  </tr>
                </tfoot>
              </table>

              <div className="flex items-start justify-between pt-1 border-t border-gray-200">
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Umumiy qarz: <span className="font-medium text-gray-700">{fmt(group.totalAmount)} so'm</span></div>
                  <div>Jami to'langan: <span className="font-medium text-green-700">{fmt(totalPaid)} so'm</span></div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400">Qolgan qarz: </span>
                  <span className="text-xl font-bold text-red-600">{fmt(group.totalDebt)} <span className="text-sm font-medium">so'm</span></span>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between mt-10 text-xs text-gray-600">
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Qabul qildi (imzo)</div></div>
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Mijoz (imzo)</div></div>
          </div>

          <p className="text-[10px] text-gray-300 mt-4 text-center">TEKNOPLAST tizimi · to'lov tarixi hujjati</p>
        </div>

        <div className="flex gap-2 px-6 pb-5 print:hidden">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Yopish</button>
          <button onClick={() => {
            document.body.classList.add('printing-payment-history');
            window.print();
            setTimeout(() => document.body.classList.remove('printing-payment-history'), 1000);
          }} className="btn-primary flex-1 text-sm">
            <Printer size={13} /> Chop etish
          </button>
        </div>
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

// Qarzdorning umumiy qarzi bo'yicha schyot-faktura (mahsulotsiz) —
// ikki bo'lim: 1) Summalar tarixi (oldi-berdi: +qarz / −to'lov, qoldiq balans),
// 2) Umumiy tarixi (savdolar jadvali).
function DebtFakturaModal({ group, onClose }) {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['debt-faktura-payments', group?.key],
    queryFn: async () => {
      const results = await Promise.all(
        group.items.map(it => salesAPI.getPayments(it.sale_id).then(r => r.data.payments || []))
      );
      return results.flat();
    },
    enabled: !!group,
  });

  if (!group) return null;

  // Oldi-berdi: har bir qarz (+) va har bir to'lov (−) sana bo'yicha, qoldiq balans bilan
  const ledger = [];
  group.items.forEach(it => ledger.push({
    date: it.sale_date, label: 'Qarz olindi', amount: parseFloat(it.total_amount) || 0,
  }));
  (payments || []).forEach(p => ledger.push({
    date: p.payment_date,
    label: `To'lov${METHOD_LABEL[p.method] ? ' · ' + METHOD_LABEL[p.method] : ''}`,
    amount: -(parseFloat(p.amount) || 0),
  }));
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
  let bal = 0;
  ledger.forEach(e => { bal += e.amount; e.balance = bal; });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow print:hidden">
          <X size={18} />
        </button>
        <div id="debt-faktura-print" className="px-6 py-6 text-[13px] text-gray-900">
          {/* Header — yetkazib beruvchi rekvizitlari */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-3 gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight">{COMPANY.name}</h2>
              <div className="text-[11px] text-gray-500 leading-snug mt-0.5 space-y-px">
                <div>Манзил: {COMPANY.address}</div>
                <div>Тел: {COMPANY.phone} · ИНН: {COMPANY.inn}</div>
                <div>Х/р: {COMPANY.account} · МФО: {COMPANY.mfo}</div>
                <div>Банк: {COMPANY.bank}</div>
              </div>
            </div>
          </div>

          {/* Sarlavha + sana */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">QARZDORLIK BO'YICHA SCHYOT-FAKTURA</h3>
            <span className="text-xs text-gray-500">Sana: {new Date().toLocaleDateString('uz-UZ')}</span>
          </div>

          {/* Qarzdor (xaridor) */}
          <div className="text-xs text-gray-600 mb-4">
            <span className="text-gray-400">Qarzdor (xaridor): </span>
            <span className="font-medium text-gray-800">{group.customer}</span>
            {group.phone && <span className="text-gray-400"> · {group.phone}</span>}
          </div>

          {/* 1-BO'LIM: SUMMALAR TARIXI (oldi-berdi) */}
          <div className="mb-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">1. Summalar tarixi (oldi-berdi)</div>
          <table className="w-full text-[13px] mb-5">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500 text-xs">
                <th className="text-left py-1">Sana</th>
                <th className="text-left py-1">Izoh</th>
                <th className="text-right py-1">Summa</th>
                <th className="text-right py-1">Qoldiq</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="py-3 text-center text-gray-400">Yuklanmoqda...</td></tr>
              ) : ledger.map((e, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{new Date(e.date).toLocaleDateString('uz-UZ')}</td>
                  <td className="py-1 text-gray-700">{e.label}</td>
                  <td className={`py-1 text-right font-semibold ${e.amount < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {e.amount < 0 ? '−' : '+'}{fmt(Math.abs(e.amount))}
                  </td>
                  <td className="py-1 text-right text-gray-600">{fmt(e.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-1.5" colSpan={3}>Qoldiq qarz</td>
                <td className="py-1.5 text-right text-red-600">{fmt(group.totalDebt)}</td>
              </tr>
            </tfoot>
          </table>

          {/* 2-BO'LIM: UMUMIY TARIXI (savdolar) */}
          <div className="mb-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">2. Umumiy tarixi</div>
          <table className="w-full text-[13px] mb-3">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500 text-xs">
                <th className="text-left py-1 w-6">#</th>
                <th className="text-left py-1">Savdo sanasi</th>
                <th className="text-right py-1">Savdo summasi</th>
                <th className="text-right py-1">To'langan</th>
                <th className="text-right py-1">Qarz</th>
                <th className="text-center py-1 w-14">Kun</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((it, i) => (
                <tr key={it.sale_id} className="border-b border-gray-100">
                  <td className="py-1 text-gray-400">{i + 1}</td>
                  <td className="py-1">{new Date(it.sale_date).toLocaleDateString('uz-UZ')}</td>
                  <td className="py-1 text-right text-gray-600">{fmt(it.total_amount)}</td>
                  <td className="py-1 text-right text-green-600">{fmt(it.paid)}</td>
                  <td className="py-1 text-right font-semibold text-red-600">{fmt(it.debt)}</td>
                  <td className="py-1 text-center text-gray-500">{it.days_old}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-1.5" colSpan={2}>Jami</td>
                <td className="py-1.5 text-right text-gray-700">{fmt(group.totalAmount)}</td>
                <td className="py-1.5 text-right text-green-700">{fmt(group.totalPaid)}</td>
                <td className="py-1.5 text-right text-red-600">{fmt(group.totalDebt)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Umumiy qarz */}
          <div className="flex justify-end items-baseline gap-2 border-t border-gray-200 pt-2">
            <span className="text-xs text-gray-400">Umumiy qarz:</span>
            <span className="text-xl font-bold text-red-600">{fmt(group.totalDebt)} <span className="text-sm font-medium">so'm</span></span>
          </div>

          {/* Imzo joylari */}
          <div className="flex justify-between mt-10 text-xs text-gray-600">
            <div className="text-center">
              <div className="border-t border-gray-400 w-44 pt-1">Yetkazib beruvchi (imzo)</div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 w-44 pt-1">Qarzdor (imzo)</div>
            </div>
          </div>

          <p className="text-[10px] text-gray-300 mt-4 text-center">TEKNOPLAST tizimi · qarzdorlik hujjati</p>
        </div>

        <div className="flex gap-2 px-6 pb-5 print:hidden">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Yopish</button>
          <button onClick={() => {
            document.body.classList.add('printing-debt-faktura');
            window.print();
            setTimeout(() => document.body.classList.remove('printing-debt-faktura'), 1000);
          }} className="btn-primary flex-1 text-sm">
            <Printer size={13} /> Chop etish
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DebtsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // payFor = { customer, totalDebt, items: [{sale_id, debt}, ...] }
  const [payFor, setPayFor] = useState(null);
  const [payAmounts, setPayAmounts] = useState({ naqd: '', karta: '', bank: '', payme: '', click: '', skidka: '' });
  const [receipt, setReceipt] = useState(null); // to'lovdan keyin chek
  const [faktura, setFaktura] = useState(null); // qarzdorning umumiy qarzi bo'yicha schyot-faktura
  const [view, setView] = useState('active'); // 'active' = qarzdorlar, 'paid' = to'langan qarzlar tarixi
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
  // Qo'lda haqdor (oldindan to'lov) qo'shish formasi
  const [addCredit, setAddCredit] = useState(null); // null = yopiq

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

  // Mijoz pul tashlab ketdi → haqdor qilish (oldindan to'lov)
  const addCreditMutation = useMutation({
    mutationFn: (d) => reportsAPI.addCredit(d),
    onSuccess: (res) => {
      toast.success(`Haqdor qo'shildi — mijoz +${fmt(res.data?.credit || 0)} so'm haqdor bo'ldi`);
      setAddCredit(null);
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Haqdor qo\'shishda xato'),
  });

  const openAddCredit = () => setAddCredit({
    customer_id: '', amount: '', method: 'CASH', sale_date: new Date().toISOString().slice(0, 10), notes: '',
  });
  const submitAddCredit = () => {
    if (!addCredit.customer_id) return toast.error('Mijozni tanlang');
    if (!addCredit.amount || parseFloat(addCredit.amount) <= 0) return toast.error('Summani kiriting');
    addCreditMutation.mutate({
      customer_id: addCredit.customer_id,
      amount: parseFloat(addCredit.amount),
      method: addCredit.method,
      sale_date: addCredit.sale_date,
      notes: addCredit.notes || undefined,
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

  // To'langan qarzlar tarixi (qarz to'lovlari) — alohida bo'lim
  const { data: paidData, isLoading: paidLoading } = useQuery({
    queryKey: ['debt-payments', dateFilter],
    queryFn: () => reportsAPI.getDebtPayments(dateFilter.date_from || dateFilter.date_to ? dateFilter : undefined).then(r => r.data),
    enabled: view === 'paid',
  });

  // To'lovni eski qarzdan boshlab taqsimlash (FIFO):
  // naqd → karta → bank tartibida har bir qarzga yoziladi.
  // Qarzlar yopilgandan keyin qolgan ortiqcha pul — oxirgi savdoga HAQDOR sifatida yoziladi.
  const payMutation = useMutation({
    mutationFn: async ({ items, naqd, karta, bank, payme, click, skidka }) => {
      const round = (n) => Math.round(n * 100) / 100;
      // Bitta to'lov operatsiyasi — barcha taqsimlangan to'lovlar shu ref bilan belgilanadi,
      // shunda mijoz tarixida bitta qator sifatida jamlanadi.
      const payRef = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const totalDebt = items.reduce((s, it) => s + Math.max(0, it.debt), 0);
      // Skidka faqat qarzni kamaytiradi — qarzdan oshmaydi (haqdor yaratmaydi)
      let discountLeft = Math.min(Math.max(0, skidka || 0), totalDebt);
      const moneyPools = [
        { method: 'CASH',     remaining: naqd  || 0 },
        { method: 'CARD',     remaining: karta || 0 },
        { method: 'TRANSFER', remaining: bank  || 0 },
        { method: 'PAYME',    remaining: payme || 0 },
        { method: 'CLICK',    remaining: click || 0 },
      ].filter(p => p.remaining > 0.01);

      // 1) Har bir qarzni yopish: avval skidka, keyin pul
      for (const item of items) {
        let saleLeft = item.debt;
        if (saleLeft <= 0.01) continue;
        if (discountLeft > 0.01) {
          const d = Math.min(discountLeft, saleLeft);
          await salesAPI.addPayment(item.sale_id, { amount: round(d), method: 'DISCOUNT', payment_ref: payRef });
          discountLeft -= d;
          saleLeft -= d;
        }
        for (const pool of moneyPools) {
          if (pool.remaining <= 0.01 || saleLeft <= 0.01) continue;
          const pay = Math.min(pool.remaining, saleLeft);
          await salesAPI.addPayment(item.sale_id, { amount: round(pay), method: pool.method, payment_ref: payRef });
          pool.remaining -= pay;
          saleLeft -= pay;
        }
      }

      // 2) Qarzlar yopilgach qolgan ortiqcha pul — oxirgi savdoga haqdor (allow_overpay) sifatida
      const lastSale = items.length ? items[items.length - 1].sale_id : null;
      if (lastSale) {
        for (const pool of moneyPools) {
          if (pool.remaining > 0.01) {
            await salesAPI.addPayment(lastSale, { amount: round(pool.remaining), method: pool.method, allow_overpay: true, payment_ref: payRef });
            pool.remaining = 0;
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      const { customer, totalDebt, naqd, karta, bank, payme, click, skidka } = variables;
      const total = (naqd || 0) + (karta || 0) + (bank || 0) + (payme || 0) + (click || 0);
      const discountApplied = Math.min(Math.max(0, skidka || 0), totalDebt);
      const debtAfterDiscount = Math.max(0, totalDebt - discountApplied);
      const credit = Math.max(0, total - debtAfterDiscount);     // haqdor (oshiqcha pul)
      const remaining = Math.max(0, debtAfterDiscount - total);  // qolgan qarz
      setPayFor(null);
      setReceipt({ customer, naqd: naqd || 0, karta: karta || 0, bank: bank || 0, payme: payme || 0, click: click || 0, skidka: skidka || 0, total, remaining, credit, date: new Date() });
      toast.success(credit > 0 ? `To'lov saqlandi! Haqdor: +${fmt(credit)} so'm` : 'To\'lov saqlandi! Chek tayyor.');
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['debt-payments'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'To\'lovda xato'),
  });

  // To'lov oynasini ochish — barcha maydonlar bo'sh (0), foydalanuvchi o'zi kiritadi
  const openPay = (g) => {
    setPayAmounts({ naqd: '', karta: '', bank: '', payme: '', click: '', skidka: '' });
    setPayFor({ customer: g.customer, totalDebt: g.totalDebt, items: g.items });
  };

  const naqd   = parseFloat(payAmounts.naqd)   || 0;
  const karta  = parseFloat(payAmounts.karta)  || 0;
  const bank   = parseFloat(payAmounts.bank)   || 0;
  const payme  = parseFloat(payAmounts.payme)  || 0;
  const click  = parseFloat(payAmounts.click)  || 0;
  const skidka = parseFloat(payAmounts.skidka) || 0;
  const payTotal = naqd + karta + bank + payme + click;   // haqiqiy pul
  const settled  = payTotal + skidka;             // qarz kamayishi (pul + skidka)
  // Preview: skidka qarzdan oshmaydi; ortiqcha pul haqdor bo'ladi
  const debtTotal       = payFor?.totalDebt || 0;
  const discountApplied = Math.min(skidka, debtTotal);
  const debtAfterDisc   = Math.max(0, debtTotal - discountApplied);
  const previewCredit   = Math.max(0, payTotal - debtAfterDisc);   // haqdor bo'ladigan summa
  const previewRemaining= Math.max(0, debtAfterDisc - payTotal);   // qoladigan qarz

  const submitPay = () => {
    if (settled <= 0) return toast.error('Kamida bitta usulda summa yoki skidka kiriting');
    // Ortiqcha pul endi ruxsat — qarzdan oshgani haqdor bo'lib qoladi (skidka qarzdan oshmaydi)
    payMutation.mutate({ items: payFor.items, naqd, karta, bank, payme, click, skidka, customer: payFor.customer, totalDebt: payFor.totalDebt });
  };

  // To'langan qarzlar tabidan — tarixiy to'lov uchun chek (dastlabki/to'langan/joriy qarz bilan)
  const openPaidChek = (p) => {
    const amt = parseFloat(p.amount) || 0;
    const m = p.method;
    setReceipt({
      customer: p.customer_name || '—',
      product: p.product_name || null,
      naqd:   m === 'CASH'     ? amt : 0,
      karta:  m === 'CARD'     ? amt : 0,
      bank:   m === 'TRANSFER' ? amt : 0,
      payme:  m === 'PAYME'    ? amt : 0,
      click:  m === 'CLICK'    ? amt : 0,
      skidka: m === 'DISCOUNT' ? amt : 0,
      total:  m === 'DISCOUNT' ? 0   : amt,
      remaining: Math.max(0, parseFloat(p.sale_remaining) || 0),
      saleTotal: parseFloat(p.sale_total) || 0,
      salePaid:  parseFloat(p.sale_paid)  || 0,
      date: new Date(p.payment_date),
    });
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

  // To'langan qarzlar tarixi — qidiruv bo'yicha filtr + jami
  const paidPayments = paidData?.payments || [];
  const paidFiltered = useMemo(() => {
    if (!q) return paidPayments;
    return paidPayments.filter(p =>
      String(p.customer_name || '').toLowerCase().includes(q) ||
      String(p.product_name || '').toLowerCase().includes(q)
    );
  }, [paidPayments, q]);
  const paidTotal = paidFiltered.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  // To'langan qarzlar — bitta to'lov operatsiyasi bo'yicha jamlash.
  // Bir "To'lov" bir nechta savdoga/usulga yozilishi mumkin; mijoz + vaqt (daqiqagacha)
  // bo'yicha birlashtiramiz — bosilsa, tarkibidagi to'lovlar ochiladi.
  const paidGroups = useMemo(() => {
    const map = new Map();
    paidFiltered.forEach(p => {
      const cust = p.customer_id || p.customer_name || '—';
      const t = String(p.created_at || p.payment_date || '').slice(0, 16); // YYYY-MM-DD HH:MM
      const key = `paid:${cust}__${t}`;
      if (!map.has(key)) map.set(key, { key, payments: [], first: p });
      map.get(key).payments.push(p);
    });
    return Array.from(map.values()).map(g => {
      const amount   = g.payments.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
      const methods  = [...new Set(g.payments.map(x => x.method))];
      const products = [...new Set(g.payments.map(x => x.product_name).filter(Boolean))];
      return { key: g.key, payments: g.payments, first: g.first, amount, methods, products, multi: g.payments.length > 1 };
    }).sort((a, b) => new Date(b.first.created_at || b.first.payment_date) - new Date(a.first.created_at || a.first.payment_date));
  }, [paidFiltered]);

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
            {view === 'active' ? (
              <>
                <p className="text-xs text-gray-500">Umumiy qarz</p>
                <p className="text-2xl font-bold text-red-600">{fmt(data?.total_debt)} so'm</p>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500">To'langan (tanlangan davr)</p>
                <p className="text-2xl font-bold text-green-600">{fmt(paidTotal)} so'm</p>
              </>
            )}
          </div>
          <button onClick={openAddCredit} className="btn-success btn-sm no-print">
            <Wallet size={14} /> Haqdor qo'shish
          </button>
          <button onClick={openAddDebt} className="btn-primary btn-sm no-print">
            <Plus size={14} /> Qarz qo'shish
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm no-print">
            <Printer size={14} /> Chop etish
          </button>
        </div>
      </div>

      {/* Bo'lim tablari — Qarzdorlar / To'langan qarzlar tarixi */}
      <div className="flex gap-2 no-print">
        {[
          { key: 'active', label: 'Qarzdorlar' },
          { key: 'paid',   label: "To'langan qarzlar" },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`btn-sm rounded-lg px-4 font-medium ${
              view === t.key ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Aging buckets — faqat qarzdorlar bo'limida */}
      {view === 'active' && (
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
      )}

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

      {/* Qarzdorlar jadvali */}
      {view === 'active' && (
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
                        <button onClick={() => setFaktura(g)}
                          title="Qarz bo'yicha schyot-faktura" className="btn-secondary btn-sm">
                          <FileText size={12} /> Faktura
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
                        <td className="no-print">
                          <button onClick={() => navigate(`/invoice/${item.sale_id}`)}
                            title="Schyot-faktura" className="btn-secondary btn-sm">
                            <FileText size={12} /> Faktura
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* To'langan qarzlar tarixi (qarz to'lovlari) */}
      {view === 'paid' && (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Sana</th><th>Mijoz</th><th>Mahsulot</th><th>Usul</th>
              <th>To'landi</th><th>Dastlabki</th><th>Joriy qarz</th><th className="no-print">Amal</th>
            </tr>
          </thead>
          <tbody>
            {paidLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !paidFiltered.length ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                <Coins size={26} className="mx-auto mb-2 text-gray-300" />
                {q ? `"${search}" bo'yicha topilmadi` : "Bu davrda to'langan qarz yo'q"}
              </td></tr>
            ) : paidGroups.map(g => {
              const isOpen = expanded.has(g.key);
              // Bitta to'lov — oddiy qator
              if (!g.multi) {
                const p = g.payments[0];
                const rem = parseFloat(p.sale_remaining) || 0;
                return (
                  <tr key={g.key}>
                    <td className="whitespace-nowrap">{new Date(p.payment_date).toLocaleDateString('uz-UZ')}</td>
                    <td className="font-medium text-gray-900">{p.customer_name || '—'}</td>
                    <td className="text-gray-600">{p.product_name || '—'}</td>
                    <td><span className="text-sm">{METHOD_LABEL[p.method] || p.method}</span></td>
                    <td className="font-bold text-green-700 whitespace-nowrap">{fmt(p.amount)} so'm</td>
                    <td className="whitespace-nowrap">{fmt(p.sale_total)} so'm</td>
                    <td className="whitespace-nowrap">
                      {rem > 0.01
                        ? <span className="font-bold text-red-600">{fmt(rem)} so'm</span>
                        : <span className="badge badge-green">✅ yopilgan</span>}
                    </td>
                    <td className="no-print">
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/invoice/${p.order_ref || p.sale_id}`)}
                          className="btn-secondary btn-sm" title="Schyot-faktura">
                          <FileText size={12} /> Faktura
                        </button>
                        <button onClick={() => openPaidChek(p)} className="btn-secondary btn-sm" title="Chek">
                          <Printer size={12} /> Chek
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              // Bir nechta to'lov (bitta operatsiya) — jamlangan qator + ochiladigan tafsilot
              const p0 = g.first;
              return (
                <Fragment key={g.key}>
                  <tr className="bg-blue-50/30 cursor-pointer hover:bg-blue-50" onClick={() => toggleExpand(g.key)}>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 flex-shrink-0">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                        {new Date(p0.payment_date).toLocaleDateString('uz-UZ')}
                      </div>
                    </td>
                    <td className="font-medium text-gray-900">{p0.customer_name || '—'}</td>
                    <td><span className="badge badge-blue">{g.payments.length} ta to'lov</span></td>
                    <td className="text-sm text-gray-600">{g.methods.map(m => METHOD_LABEL[m] || m).join(', ')}</td>
                    <td className="font-bold text-green-700 whitespace-nowrap">{fmt(g.amount)} so'm</td>
                    <td className="text-gray-400">—</td>
                    <td className="text-gray-400">—</td>
                    <td className="no-print" onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/invoice/${p0.order_ref || p0.sale_id}`)}
                        className="btn-secondary btn-sm" title="Schyot-faktura">
                        <FileText size={12} /> Faktura
                      </button>
                    </td>
                  </tr>
                  {isOpen && g.payments.map(p => {
                    const rem = parseFloat(p.sale_remaining) || 0;
                    return (
                      <tr key={p.id} className="bg-gray-50/60 text-sm border-l-2 border-blue-200">
                        <td></td>
                        <td></td>
                        <td className="pl-4 text-gray-700">{p.product_name || '—'}</td>
                        <td><span className="text-sm">{METHOD_LABEL[p.method] || p.method}</span></td>
                        <td className="font-bold text-green-700 whitespace-nowrap">{fmt(p.amount)} so'm</td>
                        <td className="whitespace-nowrap">{fmt(p.sale_total)} so'm</td>
                        <td className="whitespace-nowrap">
                          {rem > 0.01
                            ? <span className="font-bold text-red-600">{fmt(rem)} so'm</span>
                            : <span className="badge badge-green">✅ yopilgan</span>}
                        </td>
                        <td className="no-print">
                          <button onClick={() => openPaidChek(p)} className="btn-secondary btn-sm" title="Chek">
                            <Printer size={12} /> Chek
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            {paidFiltered.length > 0 && (
              <tr className="bg-gray-50 font-bold">
                <td colSpan={4} className="text-right text-gray-600">Jami to'langan:</td>
                <td className="text-green-700 whitespace-nowrap">{fmt(paidTotal)} so'm</td>
                <td colSpan={3} className="no-print"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      </div>

      {/* To'lov modal — naqd / karta / bank / skidka */}
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
                { key: 'naqd',   label: '💵 Naqd',   cls: 'border-green-200 focus:ring-green-400'  },
                { key: 'karta',  label: '💳 Karta',  cls: 'border-blue-200  focus:ring-blue-400'   },
                { key: 'bank',   label: '🏦 Bank',   cls: 'border-purple-200 focus:ring-purple-400' },
                { key: 'payme',  label: '📱 Pay Me', cls: 'border-cyan-200 focus:ring-cyan-400'   },
                { key: 'click',  label: '⚡ Click',  cls: 'border-indigo-200 focus:ring-indigo-400' },
                { key: 'skidka', label: '🏷️ Skidka', cls: 'border-orange-200 focus:ring-orange-400' },
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

            <div className={`rounded-xl p-3 text-sm ${
              previewCredit > 0.01 ? 'bg-blue-50 border border-blue-200' :
              previewRemaining < 0.01 && settled > 0 ? 'bg-green-50 border border-green-200' :
              'bg-blue-50 border border-blue-100'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">To'lov (pul):</span>
                <span className="font-bold text-lg">{fmt(payTotal)} so'm</span>
              </div>
              {skidka > 0 && (
                <div className="flex justify-between items-center text-orange-600 mt-0.5">
                  <span className="font-medium">🏷️ Skidka:</span>
                  <span className="font-semibold">{fmt(discountApplied)} so'm{skidka > discountApplied ? ' (qarzgacha)' : ''}</span>
                </div>
              )}
              <div className="text-right mt-1">
                {previewRemaining > 0.01 && (
                  <div className="text-xs text-yellow-600">Qisman · qoladi: {fmt(previewRemaining)} so'm</div>
                )}
                {previewRemaining < 0.01 && previewCredit < 0.01 && settled > 0 && (
                  <div className="text-xs text-green-600">✅ To'liq — qarz yopiladi</div>
                )}
                {previewCredit > 0.01 && (
                  <div className="text-xs text-blue-700 font-semibold">💰 Qarz yopiladi · Haqdor bo'ladi: +{fmt(previewCredit)} so'm</div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setPayFor(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitPay}
                disabled={payMutation.isPending || settled <= 0}
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
                {receipt.product && <div className="flex justify-between"><span>Mahsulot:</span><span>{receipt.product}</span></div>}
              </div>
              <div className="text-[12px] space-y-0.5 border-b border-dashed border-gray-300 pb-2 mb-2">
                {receipt.naqd > 0 && <div className="flex justify-between"><span>Naqd:</span><span className="font-bold text-green-700">{fmt(receipt.naqd)} so'm</span></div>}
                {receipt.karta > 0 && <div className="flex justify-between"><span>Karta:</span><span className="font-bold text-blue-700">{fmt(receipt.karta)} so'm</span></div>}
                {receipt.bank > 0 && <div className="flex justify-between"><span>Bank:</span><span className="font-bold text-purple-700">{fmt(receipt.bank)} so'm</span></div>}
                {receipt.payme > 0 && <div className="flex justify-between"><span>Pay Me:</span><span className="font-bold text-cyan-700">{fmt(receipt.payme)} so'm</span></div>}
                {receipt.click > 0 && <div className="flex justify-between"><span>Click:</span><span className="font-bold text-indigo-700">{fmt(receipt.click)} so'm</span></div>}
                {receipt.skidka > 0 && <div className="flex justify-between"><span>🏷️ Skidka:</span><span className="font-bold text-orange-600">{fmt(receipt.skidka)} so'm</span></div>}
              </div>
              <div className="flex justify-between font-bold text-[15px] pb-2 mb-1">
                <span>TO'LANDI:</span><span>{fmt(receipt.total)} so'm</span>
              </div>
              {receipt.credit > 0.01 && (
                <div className="flex justify-between text-[13px] text-blue-700 font-bold border-t border-dashed border-gray-300 pt-2 mb-1">
                  <span>💰 Haqdor (oshiqcha):</span><span>+{fmt(receipt.credit)} so'm</span>
                </div>
              )}
              {receipt.saleTotal != null && receipt.saleTotal > 0 ? (
                <div className="text-[12px] space-y-0.5 border-t border-dashed border-gray-300 pt-2">
                  <div className="flex justify-between"><span>Dastlabki qarz:</span><span className="font-semibold">{fmt(receipt.saleTotal)} so'm</span></div>
                  <div className="flex justify-between text-green-700"><span>Jami to'langan:</span><span className="font-semibold">{fmt(receipt.salePaid)} so'm</span></div>
                  {receipt.remaining > 0.01 ? (
                    <div className="flex justify-between text-red-600"><span>Joriy qarz:</span><span className="font-bold">{fmt(receipt.remaining)} so'm</span></div>
                  ) : (
                    <div className="text-center text-green-700 font-bold pt-1">✅ Qarz to'liq yopildi!</div>
                  )}
                </div>
              ) : receipt.remaining > 0.01 ? (
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

      {/* Qarzdorning umumiy qarzi bo'yicha schyot-faktura (oldi-berdi + umumiy tarix) */}
      {faktura && <DebtFakturaModal group={faktura} onClose={() => setFaktura(null)} />}

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

      {/* Haqdor qo'shish modal — mijoz oldindan pul tashlab ketdi */}
      <Modal open={!!addCredit} onClose={() => setAddCredit(null)} title="Haqdor qo'shish (oldindan to'lov)">
        {addCredit && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
              Mijoz pul tashlab ketdi. Bu summaga mijoz <b>haqdor</b> bo'ladi — keyingi savdoda avtomatik ishlatiladi.
            </div>
            <div>
              <label className="label text-sm">Mijoz *</label>
              <select
                value={addCredit.customer_id}
                onChange={e => setAddCredit(d => ({ ...d, customer_id: e.target.value }))}
                className={`select ${!addCredit.customer_id ? 'border-red-300' : ''}`}
              >
                <option value="" disabled>— Mijozni tanlang —</option>
                {customersData?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-sm">Summa *</label>
              <div className="relative">
                <input type="number" min="0" step="1000"
                  value={addCredit.amount}
                  onChange={e => setAddCredit(d => ({ ...d, amount: e.target.value }))}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="input pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
              </div>
            </div>
            <div>
              <label className="label text-sm">To'lov usuli</label>
              <select value={addCredit.method}
                onChange={e => setAddCredit(d => ({ ...d, method: e.target.value }))}
                className="select">
                <option value="CASH">💵 Naqd</option>
                <option value="CARD">💳 Karta</option>
                <option value="TRANSFER">🏦 Bank</option>
                <option value="PAYME">📱 Pay Me</option>
                <option value="CLICK">⚡ Click</option>
              </select>
            </div>
            <div>
              <label className="label text-sm">Sana</label>
              <input type="date" value={addCredit.sale_date}
                onChange={e => setAddCredit(d => ({ ...d, sale_date: e.target.value }))}
                className="input" />
            </div>
            <div>
              <label className="label text-sm">Izoh (ixtiyoriy)</label>
              <input type="text" value={addCredit.notes}
                onChange={e => setAddCredit(d => ({ ...d, notes: e.target.value }))}
                placeholder="Masalan: oldindan to'lov"
                className="input" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddCredit(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitAddCredit}
                disabled={addCreditMutation.isPending}
                className="btn-success flex-1">
                {addCreditMutation.isPending ? 'Saqlanmoqda...' : 'Haqdor qo\'shish'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
