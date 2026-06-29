import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Cog, AlertTriangle, CheckCircle, Wrench, Timer, Trash2, Play, Pause, Coffee, RefreshCw } from 'lucide-react';
import { machinesAPI, employeesAPI, productsAPI } from '../services/api';
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

const fmtDT = (s) => s
  ? new Date(String(s).replace(' ', 'T')).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// Tushlik (obed) — Toshkent vaqti bo'yicha: kunduzi 12:00–13:00, tunda 00:00–01:00.
// Smenadagilar shu vaqtda alishadi. Vaqt o'tgach o'zi yo'qoladi.
function getBreakInfo(date) {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const hh = parseInt(hhmm.slice(0, 2), 10);
  if (hh === 12) return { active: true, range: '12:00–13:00', ends: '13:00', label: 'Kunduzgi tushlik' };
  if (hh === 0)  return { active: true, range: '00:00–01:00', ends: '01:00', label: 'Tungi tushlik' };
  return { active: false };
}

// Cycle-time modal — stanok → mahsulotlar → sekund/dona
function CycleTimeModal({ machine, canWrite, onClose }) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [seconds, setSeconds] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['machine-cycle-times', machine?.id],
    queryFn: () => machinesAPI.getCycleTimes(machine.id).then(r => r.data),
    enabled: !!machine,
  });
  const { data: prodData } = useQuery({
    queryKey: ['products-all-for-cycle'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
    enabled: !!machine,
  });

  const saveMut = useMutation({
    mutationFn: () => machinesAPI.setCycleTime(machine.id, { product_id: productId, cycle_seconds: parseFloat(seconds) }),
    onSuccess: () => {
      toast.success('Cycle-time saqlandi');
      setProductId(''); setSeconds('');
      qc.invalidateQueries({ queryKey: ['machine-cycle-times', machine.id] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });
  const delMut = useMutation({
    mutationFn: (pid) => machinesAPI.deleteCycleTime(machine.id, pid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-cycle-times', machine.id] }),
  });

  if (!machine) return null;
  const rows = data?.cycle_times || [];
  const products = (prodData?.products || []).filter(p => p.kind !== 'KOMPONENT');

  return (
    <Modal open onClose={onClose} title={`⏱ Cycle-time — ${machine.name}`}>
      <div className="space-y-4">
        {canWrite && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label text-xs">Mahsulot</label>
              <select value={productId} onChange={e => setProductId(e.target.value)} className="select">
                <option value="">Tanlang...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="label text-xs">Sekund/dona</label>
              <input type="number" min="0" step="0.1" value={seconds}
                onChange={e => setSeconds(e.target.value)} className="input" placeholder="18" />
            </div>
            <button onClick={() => {
              if (!productId) return toast.error('Mahsulot tanlang');
              if (!(parseFloat(seconds) > 0)) return toast.error('Sekund kiriting');
              saveMut.mutate();
            }} disabled={saveMut.isPending} className="btn-primary btn-sm h-[38px]"><Plus size={14} /></button>
          </div>
        )}
        <div className="border-t pt-3">
          {isLoading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yuklanmoqda...</p>
          ) : !rows.length ? (
            <p className="text-center text-gray-400 py-4 text-sm">Hali mahsulot qo'shilmagan</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.product_id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{r.product_name || '—'}</div>
                    <div className="text-xs text-gray-400">
                      {r.cycle_seconds} sek/dona
                      {r.cycle_seconds > 0 && <> · ~{Math.round(3600 / r.cycle_seconds)} dona/soat</>}
                    </div>
                  </div>
                  {canWrite && (
                    <button onClick={() => delMut.mutate(r.product_id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Holat / nosozlik modal — status o'zgartirish + nosozlik (vaqt oralig'i + sabab) jurnali
function DowntimeModal({ machine, canWrite, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ started_at: '', ended_at: '', reason: '', status: 'BROKEN' });

  const { data, isLoading } = useQuery({
    queryKey: ['machine-downtime', machine?.id],
    queryFn: () => machinesAPI.getDowntime(machine.id).then(r => r.data),
    enabled: !!machine,
  });

  const statusMut = useMutation({
    mutationFn: ({ status, reason }) => machinesAPI.updateStatus(machine.id, { status, reason }),
    onSuccess: () => {
      toast.success('Holat yangilandi');
      qc.invalidateQueries({ queryKey: ['machine-downtime', machine.id] });
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
  });
  const addMut = useMutation({
    mutationFn: () => machinesAPI.addDowntime(machine.id, form),
    onSuccess: () => {
      toast.success('Nosozlik yozildi');
      setForm({ started_at: '', ended_at: '', reason: '', status: 'BROKEN' });
      qc.invalidateQueries({ queryKey: ['machine-downtime', machine.id] });
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  if (!machine) return null;
  const rows = data?.downtime || [];

  return (
    <Modal open onClose={onClose} title={`🔧 Holat / Nosozlik — ${machine.name}`}>
      <div className="space-y-4">
        {canWrite && (
          <div>
            <label className="label text-xs">Joriy holat</label>
            <div className="flex gap-2">
              {[
                { value: 'WORKING', label: 'Ishlayapti' },
                { value: 'SERVICE', label: "Ta'mirda" },
                { value: 'BROKEN', label: 'Buzilgan' },
              ].map(o => (
                <button key={o.value}
                  onClick={() => {
                    if (o.value === 'WORKING') return statusMut.mutate({ status: 'WORKING' });
                    const reason = window.prompt(`${o.label} — sabab (ixtiyoriy):`) || '';
                    statusMut.mutate({ status: o.value, reason });
                  }}
                  className={`btn-sm flex-1 rounded-lg ${machine.status === o.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {canWrite && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-semibold text-gray-600">Nosozlik qo'shish (vaqt oralig'i + sabab)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label text-xs">Boshlanishi</label>
                <input type="datetime-local" value={form.started_at}
                  onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))} className="input text-xs" />
              </div>
              <div>
                <label className="label text-xs">Tugashi (ixtiyoriy)</label>
                <input type="datetime-local" value={form.ended_at}
                  onChange={e => setForm(f => ({ ...f, ended_at: e.target.value }))} className="input text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="select text-xs w-28">
                <option value="BROKEN">Buzilgan</option>
                <option value="SERVICE">Ta'mirda</option>
              </select>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Sabab" className="input text-xs flex-1" />
              <button onClick={() => { if (!form.started_at) return toast.error('Boshlanish vaqtini kiriting'); addMut.mutate(); }}
                disabled={addMut.isPending} className="btn-primary btn-sm"><Plus size={14} /></button>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-gray-600 mb-1.5">Nosozlik tarixi</div>
          {isLoading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yuklanmoqda...</p>
          ) : !rows.length ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yozuvlar yo'q</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {rows.map(d => (
                <div key={d.id} className="text-sm border-b border-gray-50 last:border-0 pb-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`badge ${d.status === 'BROKEN' ? 'badge-red' : d.status === 'MOLD' ? 'badge-blue' : 'badge-yellow'}`}>
                      {d.status === 'MOLD' ? 'Qalip almashish' : (STATUS[d.status]?.label || d.status)}
                    </span>
                    <span className="text-xs text-gray-400">{d.ended_at ? 'Yopilgan' : 'Davom etmoqda'}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmtDT(d.started_at)} → {d.ended_at ? fmtDT(d.ended_at) : '...'}</div>
                  {d.reason && <div className="text-xs text-gray-700 mt-0.5">Sabab: {d.reason}</div>}
                  {d.recorded_by_name && <div className="text-[11px] text-gray-400">Qayd etdi: {d.recorded_by_name}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Pause sababi — Nosoz / Buzilgan / Qalip almashmoqda (qalipga o'rtacha vaqt)
function PauseReasonModal({ machine, pending, onConfirm, onClose }) {
  const [kind, setKind] = useState('NOSOZ');
  const [reason, setReason] = useState('');
  const [moldMin, setMoldMin] = useState('');

  const opts = [
    { v: 'NOSOZ',    label: 'Nosoz',             Icon: Wrench,        on: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
    { v: 'BUZILGAN', label: 'Buzilgan',          Icon: AlertTriangle, on: 'border-red-400 bg-red-50 text-red-700' },
    { v: 'QOLIP',    label: 'Qalip almashmoqda', Icon: RefreshCw,     on: 'border-blue-400 bg-blue-50 text-blue-700' },
  ];

  const confirm = () => {
    if (kind === 'QOLIP' && !(parseFloat(moldMin) >= 0)) return toast.error("Qalip almashish vaqtini kiriting (daqiqa)");
    const composed = kind === 'QOLIP'
      ? `Qalip almashmoqda${moldMin ? ` (~${moldMin} daqiqa)` : ''}${reason ? ' — ' + reason : ''}`
      : (reason || (kind === 'BUZILGAN' ? 'Buzilgan' : 'Nosoz'));
    onConfirm({ pause_kind: kind, reason: composed, mold_minutes: kind === 'QOLIP' ? moldMin : null });
  };

  return (
    <Modal open onClose={onClose} title={`⏸ To'xtatish — ${machine.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Stanok nima sababdan to'xtatildi?</p>
        <div className="grid grid-cols-3 gap-2">
          {opts.map(({ v, label, Icon, on }) => (
            <button key={v} onClick={() => setKind(v)}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border text-xs font-medium transition text-center ${
                kind === v ? on + ' ring-2 ring-offset-1 ring-blue-200' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>

        {kind === 'QOLIP' && (
          <div>
            <label className="label text-xs">O'rtacha qalip almashish vaqti (daqiqa) *</label>
            <input type="number" min="0" step="1" value={moldMin}
              onChange={e => setMoldMin(e.target.value)} className="input" placeholder="masalan: 15" autoFocus />
          </div>
        )}

        <div>
          <label className="label text-xs">Izoh (ixtiyoriy)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} className="input" placeholder="Qo'shimcha izoh..." />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Bekor</button>
          <button onClick={confirm} disabled={pending} className="btn-primary flex-1">
            {pending ? 'Saqlanmoqda...' : "To'xtatish"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function MachinesPage() {
  const { isOwner, isProductionHead, isCycleTime } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editMachine, setEditMachine] = useState(null);
  const [cycleFor, setCycleFor] = useState(null);     // cycle-time modal
  const [downtimeFor, setDowntimeFor] = useState(null); // holat/nosozlik modal
  const [choosing, setChoosing] = useState(false);    // "Stanok yoki Mashina" tanlash
  const [pauseFor, setPauseFor] = useState(null);     // pause sababi modali (qaysi stanok)
  const [now, setNow] = useState(() => new Date());   // tushlik vaqtini jonli kuzatish

  // Har 30 soniyada vaqtni yangilab, tushlik holatini avtomatik yoqib/o'chiramiz
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const breakInfo = getBreakInfo(now);

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

  // Play/pause — play=ishga tushadi, pause=sabab bilan to'xtaydi
  const runningMutation = useMutation({
    mutationFn: (payload) => machinesAPI.setRunning(payload.id, payload),
    onSuccess: (_d, payload) => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      toast.success(payload.is_running ? 'Ishga tushdi' : "To'xtatildi");
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (m) => {
    setEditMachine(m);
    Object.entries(m).forEach(([k, v]) => setValue(k, v));
    setShowModal(true);
  };

  // Qo'shish tugmasi bosilganda — avval "Stanok yoki Mashina" so'raladi
  const openAdd = (type) => {
    reset({ type, status: 'WORKING' });
    setEditMachine(null);
    setChoosing(false);
    setShowModal(true);
  };

  const canWrite = isOwner() || isProductionHead() || isCycleTime();
  const machines = data?.machines || [];
  const working = machines.filter(m => m.status === 'WORKING').length;
  const broken = machines.filter(m => m.status === 'BROKEN').length;
  const service = machines.filter(m => m.status === 'SERVICE').length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mashinalar</h1>
        {canWrite && (
          <button onClick={() => setChoosing(true)} className="btn-primary btn-sm">
            <Plus size={14} /> Qo'shish
          </button>
        )}
      </div>

      {/* Tushlik (obed) — vaqt kelganda avtomatik chiqadi */}
      {breakInfo.active && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 flex items-center gap-2 text-sm font-medium">
          <Coffee size={16} className="shrink-0" />
          <span>
            Hozir tushlik vaqti (obed): <strong>{breakInfo.range}</strong>. Stanoklar <strong>{breakInfo.ends}</strong> da ishga qaytadi — smenadagilar shu vaqtda alishishi mumkin.
          </span>
        </div>
      )}

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
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-600">{m.type === 'MASHINA' ? 'Mashina' : 'Stanok'}</span>
                      {' · '}{m.location || 'Joyi ko\'rsatilmagan'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button
                      onClick={() => m.is_running ? setPauseFor(m) : runningMutation.mutate({ id: m.id, is_running: 1 })}
                      disabled={runningMutation.isPending}
                      title={m.is_running ? "To'xtatish" : 'Ishga tushirish'}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                        m.is_running
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}>
                      {m.is_running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                    </button>
                  )}
                  {breakInfo.active && (
                    <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1"><Coffee size={11} /> Tushlik</span>
                  )}
                  <span className={st.cls}>{st.label}</span>
                </div>
              </div>

              {/* To'xtatilgan bo'lsa — sababi */}
              {!m.is_running && m.pause_reason && (
                <div className={`mb-3 text-xs rounded-lg border px-2.5 py-1.5 flex items-center gap-1.5 ${
                  m.pause_status === 'BROKEN' ? 'bg-red-50 border-red-200 text-red-700'
                  : m.pause_status === 'MOLD' ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}>
                  {m.pause_status === 'MOLD' ? <RefreshCw size={12} className="shrink-0" /> : <Pause size={12} className="shrink-0" />}
                  <span><span className="font-semibold">To'xtatildi:</span> {m.pause_reason}</span>
                </div>
              )}

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

              <div className="flex gap-2 mt-2">
                <button onClick={() => setCycleFor(m)}
                  className="btn-sm flex-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                  <Timer size={13} /> Cycle-time
                </button>
                <button onClick={() => setDowntimeFor(m)}
                  className="btn-sm flex-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                  <Wrench size={13} /> Holat/Nosozlik
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditMachine(null); }}
        title={editMachine ? 'Mashinani tahrirlash' : 'Yangi Mashina'}>
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Turi</label>
            <select {...register('type')} className="select">
              <option value="STANOK">Stanok</option>
              <option value="MASHINA">Mashina</option>
            </select>
          </div>
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

      {/* "Nima qo'shamiz?" — Stanok yoki Mashina */}
      <Modal open={choosing} onClose={() => setChoosing(false)} title="Nima qo'shamiz?">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => openAdd('STANOK')}
            className="flex flex-col items-center gap-2 py-6 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition">
            <Cog size={30} className="text-blue-600" />
            <span className="font-semibold text-gray-800">Stanok</span>
          </button>
          <button onClick={() => openAdd('MASHINA')}
            className="flex flex-col items-center gap-2 py-6 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition">
            <Cog size={30} className="text-gray-500" />
            <span className="font-semibold text-gray-800">Mashina</span>
          </button>
        </div>
      </Modal>

      {cycleFor && <CycleTimeModal machine={cycleFor} canWrite={canWrite} onClose={() => setCycleFor(null)} />}
      {downtimeFor && <DowntimeModal machine={downtimeFor} canWrite={canWrite} onClose={() => setDowntimeFor(null)} />}
      {pauseFor && (
        <PauseReasonModal
          machine={pauseFor}
          pending={runningMutation.isPending}
          onClose={() => setPauseFor(null)}
          onConfirm={(payload) => { runningMutation.mutate({ id: pauseFor.id, is_running: 0, ...payload }); setPauseFor(null); }}
        />
      )}
    </div>
  );
}
