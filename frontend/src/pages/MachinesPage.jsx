import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Cog, AlertTriangle, CheckCircle, Wrench } from 'lucide-react';
import { machinesAPI, employeesAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const STATUS = {
  WORKING: { label: 'Ishlayapti', cls: 'badge-green', icon: CheckCircle },
  SERVICE: { label: "Ta'mirda", cls: 'badge-yellow', icon: Wrench },
  BROKEN: { label: 'Buzilgan', cls: 'badge-red', icon: AlertTriangle },
};

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MachinesPage() {
  const { isOwner, isProductionHead } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editMachine, setEditMachine] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesAPI.getAll().then(r => r.data),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesAPI.getAll({ type: 'STANOKCHI', is_active: 'true' }).then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editMachine ? machinesAPI.update(editMachine.id, d) : machinesAPI.create(d),
    onSuccess: () => {
      toast.success(editMachine ? 'Yangilandi' : 'Mashina qo\'shildi');
      qc.invalidateQueries({ queryKey: ['machines'] });
      setShowModal(false); setEditMachine(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => machinesAPI.updateStatus(id, { status }),
    onSuccess: () => { toast.success('Status yangilandi'); qc.invalidateQueries({ queryKey: ['machines'] }); },
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (m) => {
    setEditMachine(m);
    Object.entries(m).forEach(([k, v]) => setValue(k, v));
    setShowModal(true);
  };

  const canWrite = isOwner() || isProductionHead();
  const machines = data?.machines || [];
  const working = machines.filter(m => m.status === 'WORKING').length;
  const broken = machines.filter(m => m.status === 'BROKEN').length;
  const service = machines.filter(m => m.status === 'SERVICE').length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mashinalar</h1>
        {canWrite && (
          <button onClick={() => { reset(); setEditMachine(null); setShowModal(true); }} className="btn-primary btn-sm">
            <Plus size={14} /> Mashina qo'shish
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ishlayapti', count: working, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { label: "Ta'mirda", count: service, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
          { label: 'Buzilgan', count: broken, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`card-sm text-center border ${bg}`}>
            <p className={`text-3xl font-bold ${color}`}>{count}</p>
            <p className="text-sm text-gray-600">{label}</p>
          </div>
        ))}
      </div>

      {/* Machine cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-gray-400">Yuklanmoqda...</div>
        ) : !machines.length ? (
          <div className="col-span-3 text-center py-12 text-gray-400">
            <Cog size={40} className="mx-auto mb-2 opacity-30" />
            <p>Mashina yo'q</p>
          </div>
        ) : machines.map(m => {
          const st = STATUS[m.status] || STATUS.WORKING;
          const StIcon = st.icon;
          return (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    m.status === 'WORKING' ? 'bg-green-100' :
                    m.status === 'BROKEN' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    <Cog size={20} className={
                      m.status === 'WORKING' ? 'text-green-600' :
                      m.status === 'BROKEN' ? 'text-red-600' : 'text-yellow-600'
                    } />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{m.name}</h3>
                    <p className="text-xs text-gray-500">{m.location || 'Joyi ko\'rsatilmagan'}</p>
                  </div>
                </div>
                <span className={st.cls}>{st.label}</span>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Operator:</span>
                  <span>{m.operator_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kunlik quvvat:</span>
                  <span>{m.daily_production_capacity || 0} dona</span>
                </div>
                {m.next_service_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Keyingi xizmat:</span>
                    <span>{new Date(m.next_service_date).toLocaleDateString('uz-UZ')}</span>
                  </div>
                )}
              </div>

              {canWrite && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => openEdit(m)} className="btn-secondary btn-sm flex-1">Tahrirlash</button>
                  <select
                    value={m.status}
                    onChange={e => statusMutation.mutate({ id: m.id, status: e.target.value })}
                    className="select btn-sm flex-1 text-xs"
                  >
                    <option value="WORKING">Ishlayapti</option>
                    <option value="SERVICE">Ta'mirda</option>
                    <option value="BROKEN">Buzilgan</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditMachine(null); }}
        title={editMachine ? 'Mashinani tahrirlash' : 'Yangi Mashina'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nomi *</label>
            <input {...register('name', { required: true })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="select">
                <option value="WORKING">Ishlayapti</option>
                <option value="SERVICE">Ta'mirda</option>
                <option value="BROKEN">Buzilgan</option>
              </select>
            </div>
            <div>
              <label className="label">Kunlik quvvat</label>
              <input {...register('daily_production_capacity')} type="number" min="0" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Operator (Stanokchi)</label>
            <select {...register('operator_id')} className="select">
              <option value="">Tanlang</option>
              {employees?.employees?.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Oxirgi xizmat</label>
              <input {...register('last_service_date')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Keyingi xizmat</label>
              <input {...register('next_service_date')} type="date" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Joyi</label>
            <input {...register('location')} className="input" placeholder="masalan: 1-sex" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Bekor</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">Saqlash</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
