import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { expensesAPI } from '../services/api';
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
  const { isOwner, isAccountant } = useAuthStore();
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', month],
    queryFn: () => expensesAPI.getAll({ start_date: `${month}-01`, end_date: `${month}-31`, limit: 100 }).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['expenses-summary', month],
    queryFn: () => expensesAPI.getSummary({ month }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => expensesAPI.create(d),
    onSuccess: () => {
      toast.success('Xarajat qo\'shildi');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      setShowModal(false);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => expensesAPI.delete(id),
    onSuccess: () => {
      toast.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  const { register, handleSubmit, reset } = useForm();
  const pieData = (summary?.by_category || []).map(c => ({
    name: CATS[c.category] || c.category,
    value: parseFloat(c.total),
  }));

  const canWrite = isOwner() || isAccountant();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Xarajatlar</h1>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
          {canWrite && (
            <button onClick={() => { reset(); setShowModal(true); }} className="btn-primary btn-sm">
              <Plus size={14} /> Xarajat qo'shish
            </button>
          )}
        </div>
      </div>

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
                    {isOwner() && (
                      <button
                        onClick={() => { if (confirm('O\'chirilsinmi?')) deleteMutation.mutate(e.id); }}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi Xarajat">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Kategoriya *</label>
            <select {...register('category', { required: true })} className="select">
              {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Miqdor (so'm) *</label>
            <input {...register('amount', { required: true, min: 1 })} type="number" min="0" className="input" />
          </div>
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
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
