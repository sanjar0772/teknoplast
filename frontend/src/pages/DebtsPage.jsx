import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Wallet, X, Phone, AlertTriangle, Clock, CheckCircle, Coins, MessageSquare, Copy, Bot } from 'lucide-react';
import { reportsAPI, salesAPI, ahmadAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

const BUCKET_INFO = {
  '0-30':  { label: '0–30 kun',  cls: 'text-green-600',  bg: 'bg-green-50' },
  '31-60': { label: '31–60 kun', cls: 'text-yellow-600', bg: 'bg-yellow-50' },
  '61-90': { label: '61–90 kun', cls: 'text-orange-600', bg: 'bg-orange-50' },
  '90+':   { label: '90+ kun',   cls: 'text-red-600',    bg: 'bg-red-50' },
};

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
  const [payFor, setPayFor] = useState(null); // {sale_id, customer, debt}
  const [remindFor, setRemindFor] = useState(null); // qaysi mijoz uchun eslatma
  const [reminderText, setReminderText] = useState('');
  const [tone, setTone] = useState('soft');
  const { register, handleSubmit, reset, watch } = useForm();

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
    queryKey: ['debts'],
    queryFn: () => reportsAPI.getDebts().then(r => r.data),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, body }) => salesAPI.addPayment(id, body),
    onSuccess: (res) => {
      const s = res.data;
      toast.success(s.status === 'PAID'
        ? '✅ To\'liq to\'landi!'
        : `Qisman to'landi · qolgan: ${fmt(s.remaining)} so'm`);
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setPayFor(null);
    },
  });

  const openPay = (item) => { reset({ amount: Math.round(item.debt), method: 'CASH' }); setPayFor(item); };
  const onSubmit = (form) => {
    payMutation.mutate({
      id: payFor.sale_id,
      body: { amount: parseFloat(form.amount), method: form.method, notes: form.notes },
    });
  };

  const buckets = data?.buckets || {};
  const enterAmount = parseFloat(watch('amount') || 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Qarzlar (Debitorlar)</h1>
        <div className="text-right">
          <p className="text-xs text-gray-500">Umumiy qarz</p>
          <p className="text-2xl font-bold text-red-600">{fmt(data?.total_debt)} so'm</p>
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

      {/* Debtors table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Mijoz</th><th>Sotuv sanasi</th><th>Kun</th>
              <th>Jami</th><th>To'langan</th><th>Qarz</th><th>Muddat</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
                Qarzdorlar yo'q — hammasi to'langan! 🎉
              </td></tr>
            ) : data.items.map(item => {
              const info = BUCKET_INFO[item.bucket];
              return (
                <tr key={item.sale_id}>
                  <td>
                    <div className="font-medium text-gray-900">{item.customer}</div>
                    {item.phone && <div className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} /> {item.phone}</div>}
                  </td>
                  <td className="whitespace-nowrap">{new Date(item.sale_date).toLocaleDateString('uz-UZ')}</td>
                  <td>{item.days_old} kun</td>
                  <td>{fmt(item.total_amount)}</td>
                  <td className="text-green-600">{fmt(item.paid)}</td>
                  <td className="font-bold text-red-600">{fmt(item.debt)}</td>
                  <td><span className={`badge ${info.bg} ${info.cls}`}>{info.label}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openPay(item)} className="btn-success btn-sm">
                        <Coins size={12} /> To'lov
                      </button>
                      <button onClick={() => openReminder(item)} title="AI eslatma matni"
                        className="btn-secondary btn-sm">
                        <MessageSquare size={12} /> AI eslatma
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment modal */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="To'lov kiritish">
        {payFor && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Mijoz:</span><span className="font-medium">{payFor.customer}</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-500">Qolgan qarz:</span><span className="font-bold text-red-600">{fmt(payFor.debt)} so'm</span></div>
            </div>
            <div>
              <label className="label">To'lov summasi (so'm) *</label>
              <input {...register('amount', { required: true, min: 1 })} type="number" min="1" max={Math.round(payFor.debt)} className="input" />
              {enterAmount > 0 && enterAmount < payFor.debt && (
                <p className="text-xs text-yellow-600 mt-1">Qisman to'lov — qoladi: {fmt(payFor.debt - enterAmount)} so'm</p>
              )}
              {enterAmount >= payFor.debt && (
                <p className="text-xs text-green-600 mt-1">✅ To'liq to'lov — qarz yopiladi</p>
              )}
            </div>
            <div>
              <label className="label">To'lov usuli</label>
              <select {...register('method')} className="select">
                <option value="CASH">Naqd</option>
                <option value="CARD">Karta</option>
                <option value="TRANSFER">O'tkazma</option>
                <option value="OTHER">Boshqa</option>
              </select>
            </div>
            <div>
              <label className="label">Izoh</label>
              <input {...register('notes')} className="input" placeholder="Ixtiyoriy" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setPayFor(null)} className="btn-secondary flex-1">Bekor</button>
              <button type="submit" disabled={payMutation.isPending} className="btn-success flex-1">
                {payMutation.isPending ? 'Saqlanmoqda...' : 'To\'lovni saqlash'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* AI eslatma modal (call-center) */}
      <Modal open={!!remindFor} onClose={() => setRemindFor(null)} title="AI qarz eslatmasi">
        {remindFor && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm flex justify-between">
              <span className="text-gray-500">{remindFor.customer}</span>
              <span className="font-bold text-red-600">{fmt(remindFor.debt)} so'm</span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => changeTone('soft')}
                className={`btn-sm flex-1 ${tone === 'soft' ? 'btn-primary' : 'btn-secondary'}`}>Yumshoq</button>
              <button onClick={() => changeTone('firm')}
                className={`btn-sm flex-1 ${tone === 'firm' ? 'btn-primary' : 'btn-secondary'}`}>Qat'iy</button>
            </div>

            <div className="relative">
              <textarea
                value={reminderMutation.isPending ? '' : reminderText}
                onChange={e => setReminderText(e.target.value)}
                rows={6}
                placeholder={reminderMutation.isPending ? '' : 'Xabar matni...'}
                className="input w-full resize-none" />
              {reminderMutation.isPending && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 gap-2">
                  <Bot size={16} className="animate-pulse" /> AI yozmoqda...
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard?.writeText(reminderText); toast.success('Nusxa olindi'); }}
                disabled={!reminderText}
                className="btn-secondary flex-1"><Copy size={14} /> Nusxa olish</button>
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
    </div>
  );
}
