import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Save } from 'lucide-react';
import { productionAPI, employeesAPI, productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function ProductionPage() {
  const { isOwner, isProductionHead } = useAuthStore();
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showBulk, setShowBulk] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['production-summary', month],
    queryFn: () => productionAPI.getSummary({ month }).then(r => r.data),
  });

  const { data: daily } = useQuery({
    queryKey: ['production-daily', date],
    queryFn: () => productionAPI.getAll({ date }).then(r => r.data),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesAPI.getAll({ is_active: 'true' }).then(r => r.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsAPI.getAll().then(r => r.data),
  });

  const bulkMutation = useMutation({
    mutationFn: (data) => productionAPI.bulk(data),
    onSuccess: (res) => {
      toast.success(`${res.data.count} ta xodim kiritildi`);
      qc.invalidateQueries({ queryKey: ['production'] });
      setShowBulk(false);
    },
  });

  const [entries, setEntries] = useState([]);

  const empMap = {};
  (employees?.employees || []).forEach(e => { empMap[e.id] = e; });

  const prodMap = {};
  (products?.products || []).forEach(p => { prodMap[p.id] = p; });

  const addEntry = () => {
    setEntries(prev => [...prev, { employee_id: '', quantity_produced: 0, product_id: '', production_type: 'FINISHED' }]);
  };

  const updateEntry = (i, field, value) => {
    setEntries(prev => prev.map((e, idx) => {
      if (idx !== i) return e;
      const next = { ...e, [field]: value };
      // Xodim turi o'zgarsa — ishlab chiqarish turini moslaymiz
      if (field === 'employee_id') {
        const emp = empMap[value];
        if (emp?.type === 'DETALCHI') next.production_type = 'SEMI_FINISHED'; // detalchi doim yarim tayyor
        else if (emp?.type === 'STANOKCHI' && !next.production_type) next.production_type = 'FINISHED';
      }
      return next;
    }));
  };

  // Haq: stanokchi/detalchi mahsulot dona narxidan; boshqalar kunlik tarifdan
  const calcEarnings = (entry) => {
    const emp = empMap[entry.employee_id];
    if (!emp || !entry.quantity_produced) return 0;
    const p = prodMap[entry.product_id];
    if (emp.type === 'STANOKCHI') {
      const rate = entry.production_type === 'SEMI_FINISHED' ? (p?.stanokchi_semi_rate || 0) : (p?.stanokchi_rate || 0);
      return entry.quantity_produced * rate;
    }
    if (emp.type === 'DETALCHI') {
      return entry.quantity_produced * (p?.detalchi_rate || 0);
    }
    return entry.quantity_produced * (emp.daily_tariff || 0);
  };

  const saveBulk = () => {
    const valid = entries
      .filter(e => e.employee_id && e.quantity_produced > 0)
      .map(e => {
        const emp = empMap[e.employee_id];
        let production_type = e.production_type || 'FINISHED';
        if (emp?.type === 'DETALCHI') production_type = 'SEMI_FINISHED';
        return { ...e, production_type };
      });
    if (!valid.length) return toast.error('Kamida bitta xodim kiritilsin');
    bulkMutation.mutate({ production_date: date, entries: valid });
  };

  const canWrite = isOwner() || isProductionHead();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Ishlab Chiqarish</h1>
        {canWrite && (
          <button onClick={() => { setEntries([{ employee_id: '', quantity_produced: 0 }]); setShowBulk(true); }}
            className="btn-primary btn-sm">
            <Plus size={14} /> Kunlik kiritish
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <div>
          <label className="label">Oy</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-40" />
        </div>
        <div>
          <label className="label">Kun</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
        </div>
      </div>

      {/* Month summary by employee */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{month} — Xodimlar natijalari</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Xodim</th><th>Turi</th><th>Ish kunlari</th><th>Jami ishlab chiqargan</th><th>Hisoblanган maosh</th></tr>
            </thead>
            <tbody>
              {!summary?.by_employee?.length ? (
                <tr><td colSpan={5} className="text-center py-6 text-gray-400">Ma'lumot yo'q</td></tr>
              ) : summary.by_employee.map(row => (
                <tr key={row.name}>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.work_days} kun</td>
                  <td>{fmt(row.total_produced)} dona</td>
                  <td className="font-semibold text-green-700">{fmt(row.total_earned)} so'm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily detail */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {new Date(date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })} — Kunlik natijalar
        </h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Xodim</th><th>Mahsulot</th><th>Tur</th><th>Miqdor</th><th>Tarif</th><th>Hisoblangan</th></tr>
            </thead>
            <tbody>
              {!daily?.production?.length ? (
                <tr><td colSpan={6} className="text-center py-6 text-gray-400">Bu kun uchun ma'lumot yo'q</td></tr>
              ) : daily.production.map(row => (
                <tr key={row.id}>
                  <td className="font-medium">{row.employee_name}</td>
                  <td>{row.product_name || '—'}</td>
                  <td>{row.production_type === 'SEMI_FINISHED' ? 'Yarim tayyor' : row.production_type === 'FINISHED' ? 'Tayyor' : '—'}</td>
                  <td>{fmt(row.quantity_produced)} dona</td>
                  <td>{fmt(row.daily_tariff)} so'm/dona</td>
                  <td className="font-semibold text-green-700">{fmt(row.calculated_amount)} so'm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk entry panel */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBulk(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Kunlik Ishlab Chiqarish Kiritish</h3>
              <button onClick={() => setShowBulk(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">Sana: <strong>{new Date(date).toLocaleDateString('uz-UZ')}</strong></p>

            <div className="space-y-2">
              {/* Sarlavha */}
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
                <span className="col-span-3">Xodim</span>
                <span className="col-span-3">Mahsulot</span>
                <span className="col-span-2">Tur</span>
                <span className="col-span-2">Dona</span>
                <span className="col-span-2 text-green-600 text-right">Hisoblangan</span>
              </div>

              {entries.map((entry, i) => {
                const emp = empMap[entry.employee_id];
                const isDetalchi = emp?.type === 'DETALCHI';
                const isStanokchi = emp?.type === 'STANOKCHI';
                const earned = calcEarnings(entry);
                return (
                  <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${isDetalchi ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50'}`}>
                    <div className="col-span-3">
                      <select
                        value={entry.employee_id}
                        onChange={e => updateEntry(i, 'employee_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">Xodim tanlang</option>
                        {employees?.employees?.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} {emp.type === 'DETALCHI' ? '(D)' : emp.type === 'STANOKCHI' ? '(S)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <select
                        value={entry.product_id}
                        onChange={e => updateEntry(i, 'product_id', e.target.value)}
                        className="select text-sm w-full"
                      >
                        <option value="">Mahsulot</option>
                        {products?.products?.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {isStanokchi ? (
                        <select
                          value={entry.production_type || 'FINISHED'}
                          onChange={e => updateEntry(i, 'production_type', e.target.value)}
                          className="select text-sm w-full"
                        >
                          <option value="FINISHED">Tayyor</option>
                          <option value="SEMI_FINISHED">Yarim tayyor</option>
                        </select>
                      ) : isDetalchi ? (
                        <span className="text-xs text-orange-600">Yarim tayyor</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number" min="0"
                        placeholder="Dona"
                        value={entry.quantity_produced || ''}
                        onChange={e => updateEntry(i, 'quantity_produced', parseInt(e.target.value) || 0)}
                        className="input text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {earned > 0 && (
                        <span className="text-sm font-semibold text-green-700">{fmt(earned)}</span>
                      )}
                      <button
                        onClick={() => setEntries(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600"
                      ><X size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Jami hisoblangan maosh */}
            {entries.length > 0 && (
              <div className="mt-3 p-3 bg-green-50 rounded-lg flex justify-between items-center">
                <span className="text-sm text-gray-600">Jami hisoblangan:</span>
                <span className="font-bold text-green-700 text-lg">
                  {fmt(entries.reduce((sum, e) => sum + calcEarnings(e), 0))} so'm
                </span>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={addEntry} className="btn-secondary btn-sm">
                <Plus size={14} /> Xodim qo'shish
              </button>
              <button onClick={saveBulk} disabled={bulkMutation.isPending} className="btn-primary btn-sm ml-auto">
                <Save size={14} /> {bulkMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
