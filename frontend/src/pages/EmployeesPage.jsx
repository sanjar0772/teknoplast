import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Users, Trash2 } from 'lucide-react';
import { employeesAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const TYPES = {
  STANOKCHI: 'Stanokchi', DETALCHI: 'Detalchi', ISHCHI: 'Ishchi', OSHPAZ: 'Oshpaz', SHOFIR: 'Shofir',
  BUGALTER: 'Bugalter', SIFAT: 'Sifat nazorati', CALL_CENTER: 'Call center', YORDAMCHI: 'Yordamchi',
  DROBILKA: 'Drobilka', ELEKTRIK: 'Elektrik', USTA: 'Usta', OHRANA: 'Ohrana', SKLAD: 'Sklad',
  TEHNOLOG: 'Tehnolog', MARKETING: 'Marketing', BOSHQA: 'Boshqa',
};
const SHIFTS = { '1-SMENA': '1-Smena', '2-SMENA': '2-Smena' };
// STANOKCHI/DETALCHI — dona haqi (mahsulotga bog'liq). Qolganlari — oylik (belgilangan yoki foiz).
const PIECE_RATE = ['STANOKCHI', 'DETALCHI'];
const isPieceRate = (t) => PIECE_RATE.includes(t);

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

export default function EmployeesPage() {
  const { isOwner, isProductionHead, isKirimchi } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [filter, setFilter] = useState({ type: '', search: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', filter],
    queryFn: () => employeesAPI.getAll({ ...filter, is_active: 'all' }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => editEmployee ? employeesAPI.update(editEmployee.id, d) : employeesAPI.create(d),
    onSuccess: () => {
      toast.success(editEmployee ? 'Yangilandi' : 'Xodim qo\'shildi');
      qc.invalidateQueries({ queryKey: ['employees'] });
      setShowModal(false);
      setEditEmployee(null);
    },
    onError: (err) => {
      const e = err?.response?.data;
      const msg = e?.error || e?.errors?.[0]?.msg || err?.message || 'Saqlashda xato';
      toast.error(`Xato: ${msg}`);
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm();
  const watchedType = watch('type');
  const watchedSalaryType = watch('salary_type');

  const openCreate = () => {
    reset({ type: 'STANOKCHI', shift: '1-SMENA', salary_type: 'FIXED', monthly_salary: '', salary_percent: '', bonus_percent: '', hire_date: new Date().toISOString().slice(0, 10) });
    setEditEmployee(null);
    setShowModal(true);
  };
  const openEdit = (emp) => {
    setEditEmployee(emp);
    Object.entries(emp).forEach(([k, v]) => setValue(k, v));
    setShowModal(true);
  };

  const deactivateMutation = useMutation({
    mutationFn: (emp) => employeesAPI.update(emp.id, { ...emp, is_active: !emp.is_active }),
    onError: (err) => toast.error(`Xato: ${err?.response?.data?.error || err?.message || 'amal bajarilmadi'}`),
    onSuccess: (_, emp) => {
      toast.success(emp.is_active ? 'Xodim nofaol qilindi' : 'Xodim faollashtirildi');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  // Bitta xodimni butunlay o'chirish
  const deleteMutation = useMutation({
    mutationFn: (emp) => employeesAPI.remove(emp.id),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Xodim o\'chirildi');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'O\'chirishda xato'),
  });

  // Hamma xodimni o'chirish
  const deleteAllMutation = useMutation({
    mutationFn: () => employeesAPI.removeAll(),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Hamma xodim o\'chirildi');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'O\'chirishda xato'),
  });

  const canWrite = isOwner() || isProductionHead();
  // KIRIMCHI faqat yangi xodim (stanokchi/detalchi) qo'shishi mumkin
  const canAdd = canWrite || isKirimchi();

  const typeCount = (data?.employees || []).reduce((acc, e) => {
    if (e.is_active) acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Xodimlar</h1>
        <div className="flex gap-2">
          {isOwner() && (data?.employees || []).length > 0 && (
            <button
              onClick={() => {
                const total = (data?.employees || []).length;
                if (window.confirm(`HAMMA xodimni (${total} ta) BUTUNLAY o'chirasizmi?\nBarcha xodimlar va ularning maosh/ishlab chiqarish yozuvlari o'chadi. Qaytarib bo'lmaydi!`))
                  deleteAllMutation.mutate();
              }}
              disabled={deleteAllMutation.isPending}
              className="btn-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-3 flex items-center gap-1">
              <Trash2 size={14} /> Hammasini o'chirish
            </button>
          )}
          {canAdd && (
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus size={14} /> Xodim qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Stats — faqat xodimi bor turlar ko'rsatiladi */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(TYPES).filter(([key]) => (typeCount[key] || 0) > 0).map(([key, label]) => (
          <div key={key} className="card-sm text-center">
            <p className="text-2xl font-bold text-blue-600">{typeCount[key] || 0}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-3">
        <input placeholder="Xodim izlash..." value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          className="input w-48" />
        <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))} className="select w-40">
          <option value="">Barcha turlar</option>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {filter.type === 'STANOKCHI' && (
          <select value={filter.shift || ''} onChange={e => setFilter(f => ({ ...f, shift: e.target.value }))} className="select w-36">
            <option value="">Barcha smenalar</option>
            {Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Ismi</th><th>Turi</th><th>Smena</th><th>Oylik / Haq</th><th>Telefon</th><th>Yollangan sana</th><th>Holat</th>{canWrite && <th>Amal</th>}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.employees?.length ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" /><br />Xodim topilmadi
              </td></tr>
            ) : data.employees.map(emp => (
              <tr key={emp.id}>
                <td className="font-medium">{emp.name}</td>
                <td><span className="badge-blue">{TYPES[emp.type] || emp.type}</span></td>
                <td>
                  {emp.type === 'STANOKCHI'
                    ? <span className={`badge ${emp.shift === '2-SMENA' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                        {SHIFTS[emp.shift] || emp.shift || '1-Smena'}
                      </span>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td>
                  {isPieceRate(emp.type)
                    ? <span className="text-xs text-orange-600">Dona haqi</span>
                    : emp.salary_type === 'PERCENT'
                      ? <span className="badge bg-emerald-100 text-emerald-800">{emp.salary_percent || 0}%</span>
                      : (emp.monthly_salary > 0
                          ? <span className="font-medium">{fmt(emp.monthly_salary)} so'm{emp.bonus_percent > 0 && <span className="text-emerald-600"> +{emp.bonus_percent}%</span>}</span>
                          : <span className="text-gray-400">—</span>)
                  }
                </td>
                <td>{emp.phone || '—'}</td>
                <td>{new Date(emp.hire_date).toLocaleDateString('uz-UZ')}</td>
                <td>
                  <span className={emp.is_active ? 'badge-green' : 'badge-gray'}>
                    {emp.is_active ? 'Faol' : 'Nofaol'}
                  </span>
                </td>
                {canWrite && (
                  <td className="flex gap-1">
                    <button onClick={() => openEdit(emp)} className="btn-secondary btn-sm">Tahrirlash</button>
                    <button
                      onClick={() => {
                        if (window.confirm(emp.is_active ? `${emp.name}ni nofaol qilasizmi?` : `${emp.name}ni faollashtirasizmi?`))
                          deactivateMutation.mutate(emp);
                      }}
                      className={`btn-sm ${emp.is_active ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 rounded-lg px-2' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 rounded-lg px-2'}`}>
                      {emp.is_active ? 'Nofaol' : 'Faollashtirish'}
                    </button>
                    <button
                      title="Butunlay o'chirish"
                      onClick={() => {
                        if (window.confirm(`${emp.name}ni BUTUNLAY o'chirasizmi?\nBu xodim va uning maosh/ishlab chiqarish yozuvlari butunlay o'chadi. Qaytarib bo'lmaydi!`))
                          deleteMutation.mutate(emp);
                      }}
                      className="btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg px-2 flex items-center">
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditEmployee(null); }}
        title={editEmployee ? 'Xodimni tahrirlash' : 'Yangi Xodim'}>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Ismi *</label>
            <input {...register('name', { required: true })} className="input" placeholder="To'liq ismi" />
          </div>
          <div>
            <label className="label">Turi *</label>
            <select {...register('type', { required: true })} className="select">
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(watchedType === 'STANOKCHI' || watchedType === 'DETALCHI') && (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                {watchedType === 'STANOKCHI'
                  ? 'Stanokchi haqi chiqargan mahsulotiga qarab (tayyor/yarim tayyor dona narxi) — "Mahsulotlar" sahifasida belgilanadi.'
                  : 'Detalchi haqi mahsulot dona narxidan (yarim tayyor) — "Mahsulotlar" sahifasida belgilanadi.'}
              </div>
            )}
          </div>
          {watchedType === 'STANOKCHI' && (
            <div>
              <label className="label">Smena *</label>
              <select {...register('shift', { required: watchedType === 'STANOKCHI' })} className="select">
                <option value="1-SMENA">1-Smena (Ertalab)</option>
                <option value="2-SMENA">2-Smena (Kechqurun)</option>
              </select>
            </div>
          )}
          {watchedType !== 'STANOKCHI' && watchedType && (
            <input type="hidden" {...register('shift')} value="" />
          )}
          {/* Oylik — faqat dona haqi bo'lmagan turlar uchun (Bugalter, Sifat, Marketing, ...) */}
          {watchedType && !isPieceRate(watchedType) && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
              <div>
                <label className="label">Oylik turi</label>
                <select {...register('salary_type')} className="select">
                  <option value="FIXED">Belgilangan oylik (so'm)</option>
                  <option value="PERCENT">Foiz (%)</option>
                </select>
              </div>
              {watchedSalaryType === 'PERCENT' ? (
                <div>
                  <label className="label">Foiz (%)</label>
                  <input {...register('salary_percent')} type="number" step="0.1" min="0" className="input" placeholder="Masalan: 5" />
                  <p className="text-xs text-emerald-700 mt-1">Foiz qiymati saqlanadi; summasi buxgalter tomonidan oylik hisoblashda qo'llanadi.</p>
                </div>
              ) : (
                <div>
                  <label className="label">Oylik (so'm)</label>
                  <input {...register('monthly_salary')} type="number" min="0" className="input" placeholder="Masalan: 3000000" />
                </div>
              )}
              {watchedSalaryType !== 'PERCENT' && (
                <div>
                  <label className="label">Qo'shimcha foiz (%) — ixtiyoriy</label>
                  <input {...register('bonus_percent')} type="number" step="0.1" min="0" className="input" placeholder="Masalan: 10" />
                  <p className="text-xs text-emerald-700 mt-1">Har oy oyligiga shu foiz qo'shiladi. Masalan oylik 1.000.000, +10% → 1.100.000.</p>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Telefon</label>
              <input {...register('phone')} className="input" placeholder="+998..." />
            </div>
            <div>
              <label className="label">Yollangan sana</label>
              <input {...register('hire_date')} type="date" className="input"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div>
            <label className="label">Manzil</label>
            <input {...register('address')} className="input" placeholder="Ixtiyoriy" />
          </div>
          {editEmployee && (
            <div className="flex items-center gap-2">
              <input {...register('is_active')} type="checkbox" id="active" className="w-4 h-4" />
              <label htmlFor="active" className="text-sm text-gray-700">Faol xodim</label>
            </div>
          )}
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
