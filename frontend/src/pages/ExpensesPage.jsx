import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, Download } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { expensesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
const CATS = {
  RAW_MATERIAL: 'Xom ashyo', ENERGY: 'Energiya', MAINTENANCE: 'Texnik xizmat',
  SALARY: 'Oylik', TRANSPORT: 'Transport', OTHER: 'Boshqa',
};

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const { user, isOwner, isAccountant, activeBranch } = useAuthStore();
  // Ta'minotchi — faqat "Xom ashyo" toifasidagi kunlik xarajatlarni yoza oladi
  const taminotchiOnly = user?.role === 'TAMINOTCHI';
  // FILIAL konteksti (filial xodimi YOKI EGA filialga kirgan) — filialda xom ashyo YO'Q
  const inBranch = !!(user?.branch_id || activeBranch);
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showModal, setShowModal] = useState(false);
  // Ta'minotchi uchun: tanlangan xom ashyo va kg miqdori
  const [selRmId, setSelRmId] = useState('');
  const [selKg, setSelKg] = useState('');
  // Ta'minotchi uchun: Kirim/Harajat/Qoldiq hisoboti davri
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', month, taminotchiOnly],
    queryFn: () => expensesAPI.getAll({
      start_date: `${month}-01`, end_date: `${month}-31`, limit: 100,
      ...(taminotchiOnly ? { category: 'RAW_MATERIAL' } : {}),
    }).then(r => r.data),
  });

  // Ta'minotchiga butun korxona xarajatlari (oylik, boshqa toifalar) ko'rsatilmaydi —
  // u faqat o'zi yozgan "Xom ashyo" kunlik xarajatlari ro'yxatini ko'radi
  const { data: summary } = useQuery({
    queryKey: ['expenses-summary', month],
    queryFn: () => expensesAPI.getSummary({ month }).then(r => r.data),
    enabled: !taminotchiOnly,
  });

  // Ta'minotchi uchun xom ashyolar ro'yxati
  const { data: rawMatsData } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: () => productsAPI.getRawMaterials().then(r => r.data),
    enabled: taminotchiOnly,
  });
  const rawMats = rawMatsData?.raw_materials || [];
  const selRm = rawMats.find(r => r.id === selRmId);
  const calcAmount = selRm && selKg ? Math.round(parseFloat(selKg) * parseFloat(selRm.price_per_unit || 0)) : 0;

  // Kirim/Harajat/Qoldiq hisoboti (tanlangan davr) — Ta'minotchi, OWNER va ACCOUNTANT ko'radi.
  // FILIALDA xom ashyo yo'q — bu (zavod) hisoboti filialда KO'RSATILMAYDI.
  const canSeeRawMaterialReport = !inBranch && (isOwner() || isAccountant() || taminotchiOnly);
  const { data: rangeSummary, isLoading: rangeLoading } = useQuery({
    queryKey: ['raw-material-range-summary', rangeStart, rangeEnd],
    queryFn: () => productsAPI.getRawMaterialRangeSummary({ start_date: rangeStart, end_date: rangeEnd }).then(r => r.data),
    enabled: canSeeRawMaterialReport && !!rangeStart && !!rangeEnd,
  });

  const downloadRawMaterialExcel = async () => {
    try {
      const res = await productsAPI.getRawMaterialRangeExcel({ start_date: rangeStart, end_date: rangeEnd });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `hom-ashyo-${rangeStart}_${rangeEnd}.xlsx`; a.click();
    } catch { toast.error('Yuklab bo\'lmadi'); }
  };

  const createMutation = useMutation({
    mutationFn: (d) => expensesAPI.create(d),
    onSuccess: () => {
      toast.success('Xarajat qo\'shildi');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      qc.invalidateQueries({ queryKey: ['raw-material-range-summary'] });
      setShowModal(false);
      reset();
      setSelRmId(''); setSelKg('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => expensesAPI.delete(id),
    onSuccess: () => {
      toast.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['raw-material-range-summary'] });
    },
  });

  const { register, handleSubmit, reset } = useForm();
  const pieData = (summary?.by_category || []).map(c => ({
    name: CATS[c.category] || c.category,
    value: parseFloat(c.total),
  }));

  const canWrite = isOwner() || isAccountant() || taminotchiOnly;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">{taminotchiOnly ? "Xom ashyo xarajatlari" : "Xarajatlar"}</h1>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
          {canWrite && (
            <button onClick={() => { reset({ category: taminotchiOnly ? 'RAW_MATERIAL' : undefined }); setShowModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> {taminotchiOnly ? "Kunlik xom ashyo xarajati" : "Xarajat qo'shish"}
            </button>
          )}
        </div>
      </div>

      {taminotchiOnly ? (
        /* Ta'minotchi uchun soddalashtirilgan ko'rinish — faqat Xom ashyo xarajatlari */
        <div className="card max-w-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Shu oydagi xom ashyo xarajati</h2>
          <p className="text-2xl font-bold text-red-600 mb-1">
            {fmt((data?.expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0))} so'm
          </p>
          <p className="text-xs text-gray-400">{(data?.expenses || []).length} ta yozuv</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Xarajatlar bo'linishi */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Kategoriyalar bo'yicha</h2>
          <p className="text-2xl font-bold text-red-600 mb-4">{fmt(summary?.total)} so'm</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `${fmt(v)} so'm`} />
                <Legend iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-gray-400 text-sm">Ma'lumot yo'q</div>}
        </div>

        {/* Kategoriyalar ro'yxati */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Kategoriyalar</h2>
          <div className="space-y-3">
            {(summary?.by_category || []).map((cat, i) => (
              <div key={cat.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-gray-700">{CATS[cat.category] || cat.category}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{fmt(cat.total)} so'm</p>
                  <p className="text-xs text-gray-400">{cat.count} ta</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Kunlik */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Kunlik xarajatlar</h2>
          <div className="space-y-2 overflow-y-auto max-h-64">
            {(summary?.by_day || []).slice(-10).reverse().map(d => (
              <div key={d.day} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{new Date(d.day).toLocaleDateString('uz-UZ')}</span>
                <span className="text-sm font-semibold text-red-600">{fmt(d.total)} so'm</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Kirim / Harajat / Qoldiq hisoboti — davrni tanlab ko'rish va Excel yuklab olish */}
      {canSeeRawMaterialReport && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Hom ashyo hisoboti (Boshlang'ich / Kirim / Sarf / Yakuniy qoldiq)</h2>
            <div className="flex gap-2 items-center">
              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="input w-36" />
              <span className="text-gray-400 text-sm">—</span>
              <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="input w-36" />
              <button onClick={downloadRawMaterialExcel} className="btn-secondary btn-sm">
                <Download size={14} /> Excel
              </button>
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Xom ashyo</th>
                  <th>Boshlang'ich qoldiq</th>
                  <th>Kirim miqdori</th>
                  <th>Kirim summasi</th>
                  <th>Sarf miqdori</th>
                  <th>Yakuniy qoldiq</th>
                  <th>Yakuniy summa</th>
                </tr>
              </thead>
              <tbody>
                {rangeLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
                ) : !rangeSummary?.rows?.length ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Ma'lumot yo'q</td></tr>
                ) : rangeSummary.rows.map(r => (
                  <tr key={r.name}>
                    <td className="font-medium text-gray-900">{r.name}</td>
                    <td className="text-gray-500">{fmt(r.opening)} {r.unit || 'kg'}</td>
                    <td>{fmt(r.kirim_qty)} {r.unit || 'kg'}</td>
                    <td className="text-green-600">{fmt(r.kirim_cost)} so'm</td>
                    <td className="text-red-600">{fmt(r.sarf_qty)} {r.unit || 'kg'}</td>
                    <td className={`font-semibold ${parseFloat(r.closing) < 0 ? 'text-red-600' : ''}`}>{fmt(r.closing)} {r.unit || 'kg'}</td>
                    <td className="font-semibold text-gray-900">{fmt(r.closing_cost)} so'm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Sana</th><th>Kategoriya</th><th>Miqdor</th><th>Izoh</th><th>Kim</th>{canWrite && <th>Amal</th>}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.expenses?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Xarajat yo'q</td></tr>
            ) : data.expenses.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.expense_date).toLocaleDateString('uz-UZ')}</td>
                <td><span className="badge-blue">{CATS[e.category] || e.category}</span></td>
                <td className="font-semibold text-red-600">{fmt(e.amount)} so'm</td>
                <td className="text-gray-500">{e.description || '—'}</td>
                <td className="text-sm text-gray-500">{e.created_by_name}</td>
                {canWrite && (
                  <td>
                    <button
                      onClick={() => { if (confirm('O\'chirilsinmi?')) deleteMutation.mutate(e.id); }}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setSelRmId(''); setSelKg(''); }} title={taminotchiOnly ? "Kunlik Xom Ashyo Xarajati" : "Yangi Xarajat"}>
        <form
          onSubmit={handleSubmit(d => {
            if (taminotchiOnly) {
              if (!selRmId) return toast.error('Xom ashyo nomini tanlang');
              if (!selKg || parseFloat(selKg) <= 0) return toast.error('Miqdor (kg) kiriting');
              createMutation.mutate({
                category: 'RAW_MATERIAL',
                amount: calcAmount,
                description: d.description || `${selRm?.name} - ${selKg} ${selRm?.unit || 'kg'}`,
                expense_date: d.expense_date,
                raw_material_id: selRmId,
                quantity: parseFloat(selKg),
              });
            } else {
              createMutation.mutate(d);
            }
          })}
          className="space-y-4"
        >
          {taminotchiOnly ? (
            <>
              {/* Xom ashyo nomi */}
              <div>
                <label className="label">Xom ashyo nomi *</label>
                <select
                  value={selRmId}
                  onChange={e => setSelRmId(e.target.value)}
                  className="select"
                >
                  <option value="">— Tanlang —</option>
                  {rawMats.map(rm => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} ({fmt(rm.price_per_unit)} so'm/{rm.unit || 'kg'})
                    </option>
                  ))}
                </select>
              </div>
              {/* Miqdor kg */}
              <div>
                <label className="label">Miqdor ({selRm?.unit || 'kg'}) *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={selKg}
                  onChange={e => setSelKg(e.target.value)}
                  className="input"
                  placeholder={`Necha ${selRm?.unit || 'kg'}?`}
                />
              </div>
              {/* Hisoblangan summa */}
              {calcAmount > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Hisoblangan summa:</span>
                  <span className="font-bold text-blue-700">{fmt(calcAmount)} so'm</span>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="label">Kategoriya *</label>
              <select {...register('category', { required: true })} className="select">
                {Object.entries(CATS).filter(([k]) => !(inBranch && k === 'RAW_MATERIAL')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          {!taminotchiOnly && (
            <div>
              <label className="label">Miqdor (so'm) *</label>
              <input {...register('amount', { required: true, min: 1 })} type="number" min="0" className="input" />
            </div>
          )}

          <div>
            <label className="label">Izoh</label>
            <input {...register('description')} className="input" placeholder="Ixtiyoriy" />
          </div>
          <div>
            <label className="label">Sana</label>
            <input {...register('expense_date')} type="date" className="input"
              defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setSelRmId(''); setSelKg(''); }} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
