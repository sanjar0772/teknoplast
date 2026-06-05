import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle, DollarSign, Calculator, Download, X } from 'lucide-react';
import { salariesAPI, reportsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const STATUS = {
  CALCULATED: { label: 'Hisoblangan', cls: 'badge-yellow' },
  APPROVED: { label: 'Tasdiqlangan', cls: 'badge-blue' },
  PAID: { label: "To'langan", cls: 'badge-green' },
};

export default function SalariesPage() {
  const { isOwner, isAccountant } = useAuthStore();
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [adjustModal, setAdjustModal] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['salaries', month],
    queryFn: () => salariesAPI.getAll({ month }).then(r => r.data),
  });

  const calculateMutation = useMutation({
    mutationFn: () => salariesAPI.calculate({ month }),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['salaries'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => salariesAPI.approve(id),
    onSuccess: () => { toast.success('Tasdiqlandi'); qc.invalidateQueries({ queryKey: ['salaries'] }); },
  });

  const payMutation = useMutation({
    mutationFn: (id) => salariesAPI.pay(id),
    onSuccess: () => { toast.success("To'landi"); qc.invalidateQueries({ queryKey: ['salaries'] }); },
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, bonuses, penalties, notes }) => salariesAPI.adjust(id, { bonuses, penalties, notes }),
    onSuccess: () => {
      toast.success('Yangilandi');
      qc.invalidateQueries({ queryKey: ['salaries'] });
      setAdjustModal(null);
    },
  });

  const [adjustForm, setAdjustForm] = useState({ bonuses: 0, penalties: 0, notes: '' });

  const downloadExcel = async () => {
    try {
      const res = await reportsAPI.downloadSalaryExcel(month);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `maoshlar-${month}.xlsx`; a.click();
    } catch { toast.error('Yuklab bo\'lmadi'); }
  };

  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Maoshlar</h1>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
          <button onClick={downloadExcel} className="btn-secondary btn-sm">
            <Download size={14} /> Excel
          </button>
          {(isOwner() || isAccountant()) && (
            <button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending}
              className="btn-primary btn-sm">
              <Calculator size={14} />
              {calculateMutation.isPending ? 'Hisoblanmoqda...' : 'Oylik hisoblash'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Jami xodim', value: summary.total_employees || 0 },
          { label: 'Jami summa', value: `${fmt(summary.total_amount)} so'm` },
          { label: 'Hisoblangan', value: summary.calculated_count || 0 },
          { label: "To'langan", value: summary.paid_count || 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Xodim</th><th>Turi</th><th>Ish kunlari</th><th>Ishlab chiqargan</th>
              <th>Hisoblangan</th><th>Bonus</th><th>Jarima</th><th>Sof maosh</th>
              <th>Status</th><th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.salaries?.length ? (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">
                Oylik hisob yo'q. "Oylik hisoblash" tugmasini bosing.
              </td></tr>
            ) : data.salaries.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.employee_name}</td>
                <td>{s.employee_type}</td>
                <td>{s.work_days}</td>
                <td>{fmt(s.total_produced)}</td>
                <td>{fmt(s.total_calculated)} so'm</td>
                <td className="text-green-600">+{fmt(s.bonuses)} so'm</td>
                <td className="text-red-600">-{fmt(s.penalties)} so'm</td>
                <td className="font-bold text-blue-700">{fmt(s.net_amount)} so'm</td>
                <td><span className={STATUS[s.status]?.cls || 'badge-gray'}>{STATUS[s.status]?.label}</span></td>
                <td>
                  <div className="flex gap-1">
                    {(isOwner() || isAccountant()) && s.status === 'CALCULATED' && (
                      <button onClick={() => { setAdjustModal(s); setAdjustForm({ bonuses: s.bonuses, penalties: s.penalties, notes: s.notes || '' }); }}
                        className="btn-secondary btn-sm text-xs">Bonus/Jarima</button>
                    )}
                    {isOwner() && s.status === 'CALCULATED' && (
                      <button onClick={() => approveMutation.mutate(s.id)} className="btn-primary btn-sm text-xs">
                        <CheckCircle size={12} /> Tasdiq
                      </button>
                    )}
                    {isOwner() && s.status === 'APPROVED' && (
                      <button onClick={() => payMutation.mutate(s.id)} className="btn-success btn-sm text-xs">
                        <DollarSign size={12} /> To'la
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adjust Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAdjustModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Bonus / Jarima — {adjustModal.employee_name}</h3>
              <button onClick={() => setAdjustModal(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Bonus (so'm)</label>
                <input type="number" min="0" value={adjustForm.bonuses}
                  onChange={e => setAdjustForm(f => ({ ...f, bonuses: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Jarima (so'm)</label>
                <input type="number" min="0" value={adjustForm.penalties}
                  onChange={e => setAdjustForm(f => ({ ...f, penalties: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="label">Izoh</label>
                <input value={adjustForm.notes}
                  onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
                  className="input" placeholder="Sababi..." />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <span className="text-gray-600">Sof maosh: </span>
                <span className="font-bold text-blue-700">
                  {fmt(parseFloat(adjustModal.total_calculated) + parseFloat(adjustForm.bonuses || 0) - parseFloat(adjustForm.penalties || 0))} so'm
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAdjustModal(null)} className="btn-secondary flex-1">Bekor</button>
                <button onClick={() => adjustMutation.mutate({ id: adjustModal.id, ...adjustForm })}
                  disabled={adjustMutation.isPending} className="btn-primary flex-1">
                  {adjustMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
