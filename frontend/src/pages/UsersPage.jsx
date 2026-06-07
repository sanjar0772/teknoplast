import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, UserCheck, UserX, Shield, KeyRound, Copy } from 'lucide-react';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const ROLES = [
  { value: 'OWNER',           label: 'Ega / Rahbar',                cls: 'badge-yellow' },
  { value: 'ACCOUNTANT',      label: 'Buxgalter',                   cls: 'badge-blue' },
  { value: 'SALES_HEAD',      label: 'Sotuv Boshlig\'i',            cls: 'badge-green' },
  { value: 'PRODUCTION_HEAD', label: 'Ishlab Chiqarish Boshlig\'i', cls: 'badge-blue' },
  { value: 'KIRIMCHI',        label: 'Mahsulot Kirimchi',           cls: 'badge-gray' },
  { value: 'OMBORCHI',        label: 'Omborchi',                    cls: 'badge-gray' },
];
const roleInfo = (r) => ROLES.find(x => x.value === r) || { label: r, cls: 'badge-gray' };

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

export default function UsersPage() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [resetResult, setResetResult] = useState(null); // { full_name, phone, temp_password }
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => authAPI.getUsers().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => authAPI.register(d),
    onSuccess: () => {
      toast.success('Foydalanuvchi qo\'shildi');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      reset();
    },
    onError: (e) => toast.error(e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || 'Xato'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => authAPI.toggleUser(id),
    onSuccess: () => {
      toast.success('Holat o\'zgartirildi');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const resetMutation = useMutation({
    mutationFn: (id) => authAPI.resetPassword(id).then(r => r.data),
    onSuccess: (data) => setResetResult(data),
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const onSubmit = (d) => createMutation.mutate(d);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Foydalanuvchilar</h1>
        <button onClick={() => { reset({ role: 'SALES_HEAD' }); setShowForm(true); }} className="btn-primary btn-sm">
          <Plus size={14} /> Foydalanuvchi qo'shish
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Ism</th><th>Telefon</th><th>Rol</th><th>Holat</th><th>Oxirgi kirish</th><th>Amal</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.users?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Foydalanuvchi yo'q</td></tr>
            ) : data.users.map(u => {
              const info = roleInfo(u.role);
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td className="font-medium text-gray-900">
                    {u.full_name} {isMe && <span className="text-xs text-blue-500">(siz)</span>}
                  </td>
                  <td className="whitespace-nowrap">{u.phone}</td>
                  <td><span className={info.cls}>{info.label}</span></td>
                  <td>
                    {u.is_active
                      ? <span className="badge-green">Faol</span>
                      : <span className="badge-gray">Bloklangan</span>}
                  </td>
                  <td className="text-sm text-gray-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString('uz-UZ') : '—'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          if (window.confirm(`${u.full_name} uchun yangi vaqtinchalik parol yaratilsinmi?`))
                            resetMutation.mutate(u.id);
                        }}
                        disabled={resetMutation.isPending}
                        title="Parolni tiklash"
                        className="btn-secondary btn-sm">
                        <KeyRound size={12} /> Parol tiklash
                      </button>
                      {!isMe && (
                        <button
                          onClick={() => toggleMutation.mutate(u.id)}
                          className={u.is_active ? 'btn-danger btn-sm' : 'btn-success btn-sm'}
                        >
                          {u.is_active ? <><UserX size={12} /> Bloklash</> : <><UserCheck size={12} /> Faollashtirish</>}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Yangi foydalanuvchi">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">To'liq ism *</label>
            <input {...register('full_name', { required: true })} className="input" placeholder="Ism Familiya" />
          </div>
          <div>
            <label className="label">Telefon *</label>
            <input {...register('phone', { required: true })} className="input" placeholder="+998..." />
          </div>
          <div>
            <label className="label">Parol * (kamida 6 belgi)</label>
            <input {...register('password', { required: true, minLength: 6 })} className="input" placeholder="Parol" />
            {errors.password && <p className="text-xs text-red-500 mt-1">Kamida 6 belgi</p>}
          </div>
          <div>
            <label className="label flex items-center gap-1"><Shield size={13} /> Rol *</label>
            <select {...register('role', { required: true })} className="select">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Qo\'shish'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Parol tiklash natijasi */}
      <Modal open={!!resetResult} onClose={() => setResetResult(null)} title="Yangi parol yaratildi">
        {resetResult && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <strong>{resetResult.full_name}</strong> uchun yangi vaqtinchalik parol:
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <code className="flex-1 text-lg font-bold tracking-wider text-indigo-700">{resetResult.temp_password}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(resetResult.temp_password); toast.success('Nusxa olindi'); }}
                className="btn-secondary btn-sm" title="Nusxa olish">
                <Copy size={14} />
              </button>
            </div>
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
              ⚠️ Bu parolni xodimga bering ({resetResult.phone}). U kirgach o'z parolini o'zgartirsin. Parol qayta ko'rsatilmaydi.
            </div>
            <button onClick={() => setResetResult(null)} className="btn-primary w-full">Tushunarli</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
