import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RotateCcw, Warehouse, AlertTriangle, Coins, X, Search, Printer, Plus, Package } from 'lucide-react';
import { salesAPI } from '../services/api';

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
  const [dateFilter, setDateFilter] = useState({ date_from: '', date_to: '' });
  const [datePreset, setDatePreset] = useState('all');
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState(false);       // sotuvni tanlash oynasi
  const [pickerSearch, setPickerSearch] = useState('');
  const [returnForm, setReturnForm] = useState(null); // tanlangan sotuv uchun vozvrat formasi

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const iso = d => d.toISOString().slice(0, 10);
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
    queryFn: () => salesAPI.getAll({ limit: 100 }).then(r => r.data),
    enabled: picker,
  });

  const pickableSales = useMemo(() => {
    const list = (salesData?.sales || []).filter(s => (parseInt(s.quantity, 10) || 0) >= 1);
    const pq = pickerSearch.trim().toLowerCase();
    if (!pq) return list;
    return list.filter(s =>
      String(s.product_name || '').toLowerCase().includes(pq) ||
      String(s.customer_name || '').toLowerCase().includes(pq) ||
      String(s.order_ref || '').toLowerCase().includes(pq)
    );
  }, [salesData, pickerSearch]);

  const returnMutation = useMutation({
    mutationFn: ({ id, payload }) => salesAPI.returnSale(id, payload),
    onSuccess: (res) => {
      const refund = parseFloat(res?.data?.refund_amount || 0);
      const loss = parseFloat(res?.data?.loss_amount || 0);
      if (loss > 0) toast.success(`Brak qabul qilindi — ${fmt(loss)} so'm ziyon sifatida qayd etildi`);
      else toast.success(refund > 0 ? `Vozvrat qabul qilindi. Qaytariladigan pul: ${fmt(refund)} so'm` : 'Vozvrat qabul qilindi — tovar omborga qaytdi');
      qc.invalidateQueries({ queryKey: ['returns-all'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setReturnForm(null);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Vozvratda xato'),
  });

  const selectSale = (sale) => {
    setPicker(false);
    setReturnForm({
      id: sale.id,
      product_name: sale.product_name,
      customer_name: sale.customer_name,
      rang: sale.rang || '',
      max: parseInt(sale.quantity, 10) || 0,
      unit: sale.unit || 'dona',
      unit_price: parseFloat(sale.unit_price) || 0,
      quantity: parseInt(sale.quantity, 10) || 1,
      reason: '',
      condition: 'GOOD',
    });
  };

  const submitReturn = () => {
    const q = parseInt(returnForm.quantity, 10);
    if (!q || q < 1) return toast.error('Miqdor noto\'g\'ri');
    if (q > returnForm.max) return toast.error(`Faqat ${returnForm.max} ${returnForm.unit} qaytarish mumkin`);
    if (!returnForm.reason.trim()) return toast.error('Vozvrat sababi majburiy');
    returnMutation.mutate({ id: returnForm.id, payload: { quantity: q, reason: returnForm.reason.trim(), condition: returnForm.condition } });
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
            <button onClick={() => { setPickerSearch(''); setPicker(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Vozvrat qilish
            </button>
            <button onClick={() => window.print()} className="btn-secondary btn-sm">
              <Printer size={14} /> Chop etish
            </button>
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
                <th>Holati</th><th>Summa</th><th>Ziyon</th><th>Sabab</th><th>Xodim</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
              ) : !all.length ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                  <RotateCcw size={28} className="mx-auto mb-2 text-gray-300" />
                  Hali vozvrat (qaytarish) yo'q
                </td></tr>
              ) : !returns.length ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
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
                    <td className={`whitespace-nowrap font-semibold ${defective ? 'text-red-600' : 'text-gray-300'}`}>
                      {defective ? `${fmt(r.loss_amount)} so'm` : '—'}
                    </td>
                    <td className="max-w-[200px]"><span className="text-sm text-gray-600">{r.reason}</span></td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">{r.created_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1-qadam: qaytariladigan sotuvni tanlash */}
      <Modal open={picker} onClose={() => setPicker(false)} title="Qaysi sotuvni qaytarmoqchisiz?" wide>
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Mijoz, mahsulot yoki chek raqami..."
              className="input pl-9 w-full" />
          </div>
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
            {salesLoading ? (
              <p className="text-center py-8 text-gray-400 text-sm">Yuklanmoqda...</p>
            ) : !pickableSales.length ? (
              <p className="text-center py-8 text-gray-400 text-sm">
                <Package size={24} className="mx-auto mb-2 opacity-30" />
                Sotuv topilmadi
              </p>
            ) : pickableSales.map(s => (
              <button key={s.id} onClick={() => selectSale(s)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{s.product_name}{s.rang ? ` · ${s.rang}` : ''}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {s.customer_name || 'Tasodifiy'} · {new Date(s.sale_date).toLocaleDateString('uz-UZ')}
                    {s.order_ref ? ` · ${s.order_ref}` : ''}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold text-gray-900">{fmt(s.quantity)} {s.unit || 'dona'}</div>
                  <div className="text-xs text-gray-400">{fmt(s.unit_price)} so'm</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* 2-qadam: vozvrat formasi */}
      <Modal open={!!returnForm} onClose={() => setReturnForm(null)} title="Vozvrat — sotuvdan qaytarish">
        {returnForm && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <div className="font-medium text-gray-900">{returnForm.product_name || 'Mahsulot'}{returnForm.rang ? ` · ${returnForm.rang}` : ''}</div>
              <div className="text-gray-500">
                {returnForm.customer_name ? `${returnForm.customer_name} · ` : ''}
                Sotilgan: {returnForm.max} {returnForm.unit} · Narx: {fmt(returnForm.unit_price)} so'm
              </div>
            </div>

            <div>
              <label className="label">Qaytariladigan miqdor * (maks: {returnForm.max})</label>
              <input type="number" min="1" max={returnForm.max} className="input"
                value={returnForm.quantity}
                onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>

            <div>
              <label className="label">Tovar holati *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setReturnForm(f => ({ ...f, condition: 'GOOD' }))}
                  className={`rounded-xl border p-2.5 text-sm text-left transition ${returnForm.condition === 'GOOD' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-900 flex items-center gap-1"><Warehouse size={13} /> Yaxshi</div>
                  <div className="text-[11px] text-gray-500">Omborga qaytadi</div>
                </button>
                <button type="button" onClick={() => setReturnForm(f => ({ ...f, condition: 'DEFECTIVE' }))}
                  className={`rounded-xl border p-2.5 text-sm text-left transition ${returnForm.condition === 'DEFECTIVE' ? 'border-red-400 bg-red-50 ring-1 ring-red-300' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-900 flex items-center gap-1"><AlertTriangle size={13} /> Brak</div>
                  <div className="text-[11px] text-gray-500">Ziyon sifatida qayd</div>
                </button>
              </div>
            </div>

            <div>
              <label className="label">Sabab * (majburiy)</label>
              <textarea className="input" rows={2} placeholder="Masalan: sifatsiz, ortiqcha, mijoz qaytardi..."
                value={returnForm.reason}
                onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))} />
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-sm flex justify-between">
              <span className="text-gray-600">Mijozga qaytariladigan (taxminiy):</span>
              <span className="font-bold text-gray-900">
                {fmt((parseInt(returnForm.quantity, 10) || 0) * returnForm.unit_price)} so'm
              </span>
            </div>
            {returnForm.condition === 'DEFECTIVE' && (
              <div className="bg-red-50 rounded-xl p-3 text-sm flex justify-between">
                <span className="text-gray-600">⚠️ Ziyon (taxminiy):</span>
                <span className="font-bold text-red-600">
                  {fmt((parseInt(returnForm.quantity, 10) || 0) * returnForm.unit_price)} so'm
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setReturnForm(null)} className="btn-secondary flex-1">Bekor</button>
              <button onClick={submitReturn} disabled={returnMutation.isPending} className="btn-primary flex-1">
                <RotateCcw size={14} /> {returnMutation.isPending ? 'Saqlanmoqda...' : 'Vozvratni tasdiqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
