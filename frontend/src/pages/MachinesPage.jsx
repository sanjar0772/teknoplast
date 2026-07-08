import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Cog, AlertTriangle, CheckCircle, Wrench, Timer, Trash2, Play, Pause, Coffee, RefreshCw, BarChart3, FileSpreadsheet, FileText, QrCode, Download, Users, Camera, Search, Layers, Pencil } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { machinesAPI, employeesAPI, productsAPI, moldsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmtN = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Toshkent bo'yicha mahalliy sana (UTC emas)
const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthStart = () => localDay().slice(0, 8) + '01';

// Stanoklar ishlab chiqarish statistikasi — davr tanlab, ekranda ko'rish + Excel/PDF yuklab olish
function MachineStatsPanel() {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(localDay());
  const [downloading, setDownloading] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['machine-stats', start, end],
    queryFn: () => machinesAPI.getStats({ start_date: start, end_date: end }).then(r => r.data),
    enabled: !!start && !!end,
  });

  const download = async (kind) => {
    if (!start || !end) return toast.error('Sana oralig\'ini tanlang');
    setDownloading(kind);
    try {
      const params = { start_date: start, end_date: end };
      const res = kind === 'excel' ? await machinesAPI.statsExcel(params) : await machinesAPI.statsPdf(params);
      const type = kind === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = `stanoklar-statistika-${start}_${end}.${kind === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(kind === 'excel' ? "Excel yuklab bo'lmadi" : "PDF yuklab bo'lmadi");
    } finally {
      setDownloading('');
    }
  };

  const summary = data?.summary || [];
  const producing = summary.filter(r => parseFloat(r.total_produced) > 0);
  const grandTotal = summary.reduce((a, r) => a + parseFloat(r.total_produced || 0), 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-emerald-700">
          <BarChart3 size={16} /> Stanoklar ishlab chiqarish statistikasi
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={start} max={end || undefined}
            onChange={e => e.target.value && setStart(e.target.value)} className="input text-sm py-1.5 w-40" />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" value={end} min={start || undefined} max={localDay()}
            onChange={e => e.target.value && setEnd(e.target.value)} className="input text-sm py-1.5 w-40" />
          <button onClick={() => download('excel')} disabled={downloading === 'excel'} className="btn-secondary btn-sm">
            <FileSpreadsheet size={14} /> {downloading === 'excel' ? 'Yuklanmoqda...' : 'Excel'}
          </button>
          <button onClick={() => download('pdf')} disabled={downloading === 'pdf'} className="btn-secondary btn-sm">
            <FileText size={14} /> {downloading === 'pdf' ? 'Yuklanmoqda...' : 'PDF'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        Har stanok o'z operatori (stanokchi) chiqargan mahsulot bo'yicha hisoblanadi.
      </p>

      {isLoading ? (
        <p className="text-center text-gray-400 py-6 text-sm">Yuklanmoqda...</p>
      ) : isError ? (
        <p className="text-center text-red-400 py-6 text-sm">Statistikani yuklab bo'lmadi</p>
      ) : !producing.length ? (
        <p className="text-center text-gray-400 py-6 text-sm">Bu davrda stanoklar bo'yicha ishlab chiqarish yo'q</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-2">Stanok</th>
                <th className="py-2 px-2">Operator</th>
                <th className="py-2 px-2 text-center">Ish kunlari</th>
                <th className="py-2 px-2 text-center">Mahsulot turlari</th>
                <th className="py-2 pl-2 text-right">Jami chiqargan</th>
              </tr>
            </thead>
            <tbody>
              {producing.map(r => (
                <tr key={r.machine_id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-2 font-medium text-gray-800">{r.machine_name}</td>
                  <td className="py-2 px-2 text-gray-600">{r.operator_name || '—'}</td>
                  <td className="py-2 px-2 text-center text-gray-600">{r.work_days || 0}</td>
                  <td className="py-2 px-2 text-center text-gray-600">{r.product_count || 0}</td>
                  <td className="py-2 pl-2 text-right font-semibold text-gray-900">{fmtN(r.total_produced)} dona</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-2 pr-2" colSpan={4}>JAMI:</td>
                <td className="py-2 pl-2 text-right text-emerald-700">{fmtN(grandTotal)} dona</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

// Stanok QR begiki — chop etib mashinaga yopishtirish uchun
function MachineBadgeCard({ machine }) {
  return (
    <div style={{
      width: '7cm', border: '2px solid #2563eb', borderRadius: '6px',
      padding: '10px', fontFamily: 'Arial, sans-serif', background: 'white',
      display: 'inline-block', margin: '4px', verticalAlign: 'top',
      boxSizing: 'border-box', pageBreakInside: 'avoid',
    }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px', marginBottom: '5px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1d4ed8', letterSpacing: '1px' }}>TEKNOPLAST</div>
        <div style={{ fontSize: '8px', color: '#9ca3af' }}>Stanok / Mashina</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
        <QRCodeSVG value={`teknoplast-machine-${machine.id}`} size={85} level="M" includeMargin={false} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{machine.name}</div>
        <span style={{
          background: machine.type === 'MASHINA' ? '#fef3c7' : '#dbeafe',
          color: machine.type === 'MASHINA' ? '#92400e' : '#1d4ed8',
          padding: '1px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold',
        }}>
          {machine.type === 'MASHINA' ? 'Mashina' : 'Stanok'}
        </span>
        <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '4px' }}>ID: {String(machine.id).slice(0, 8)}</div>
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
                  {d.mold_product_name && <div className="text-xs text-blue-700 mt-0.5">Qolip: {d.mold_product_name}</div>}
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

const shiftLabel = (s) => s === '2-SMENA' ? '2-Smena' : s === '1-SMENA' ? '1-Smena' : '';

// Smena almashish — stanokning joriy operatorini (1-smena/2-smena) almashtirish + tarix
// QR begik ichidagi qiymat: "teknoplast-emp-<id>" — id'ni ajratib olamiz (Xodimlar begiki bilan bir xil format)
const parseEmpIdFromQr = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/teknoplast-emp-(.+)$/i);
  return m ? m[1] : s;
};

function ShiftChangeModal({ machine, employees, canWrite, onClose }) {
  const qc = useQueryClient();
  const [toOperator, setToOperator] = useState('');
  const [note, setNote] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const scannerRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['machine-shift-changes', machine?.id],
    queryFn: () => machinesAPI.getShiftChanges(machine.id).then(r => r.data),
    enabled: !!machine,
  });

  const changeMut = useMutation({
    mutationFn: (operatorId) => machinesAPI.changeShift(machine.id, { to_operator_id: operatorId, note }),
    onSuccess: (_res, operatorId) => {
      const emp = (employees?.employees || []).find(e => e.id === operatorId);
      toast.success(`Smena almashtirildi${emp ? ` — ${emp.name}` : ''}`);
      setToOperator(''); setNote('');
      qc.invalidateQueries({ queryKey: ['machine-shift-changes', machine.id] });
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const stopScan = () => {
    const qr = scannerRef.current;
    if (qr && qr.isScanning) { qr.stop().then(() => qr.clear()).catch(() => {}); }
    scannerRef.current = null;
  };

  // QR skanerlangan begikni operator sifatida qabul qilamiz — ro'yxatdan qidirib
  // o'tirmasdan, to'g'ridan-to'g'ri smenani almashtiramiz.
  const handleScannedBadge = (raw) => {
    const id = parseEmpIdFromQr(raw);
    const emp = (employees?.employees || []).find(e => e.id === id);
    if (!emp) { toast.error("Bu QR stanokchi begiki emas yoki mos kelmadi"); return; }
    stopScan();
    setScanOpen(false);
    changeMut.mutate(id);
  };

  useEffect(() => {
    if (!scanOpen) return;
    try {
      const qr = new Html5Qrcode('machine-shift-qr-reader');
      scannerRef.current = qr;
      qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decoded) => { handleScannedBadge(decoded); },
        () => {}
      ).catch(() => {
        toast('Kamera ishlamasa, ro\'yxatdan tanlang', { icon: 'ℹ️' });
      });
    } catch (e) {
      toast.error('Kamera: ' + (e.message || 'Xato'));
    }
    return () => { stopScan(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen]);

  useEffect(() => () => stopScan(), []);

  if (!machine) return null;
  const rows = data?.shift_changes || [];

  return (
    <Modal open onClose={() => { stopScan(); onClose(); }} title={`👥 Smena almashtirish — ${machine.name}`}>
      <div className="space-y-4">
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          Hozirgi operator: <b className="text-gray-900">{machine.operator_name || 'Belgilanmagan'}</b>
          {machine.operator_shift && <span className="text-xs text-gray-400"> ({shiftLabel(machine.operator_shift)})</span>}
        </div>

        {canWrite && (
          <div className="space-y-2">
            {scanOpen ? (
              <div className="space-y-2">
                <div id="machine-shift-qr-reader" className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: 200 }} />
                <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
                  <Camera size={12} /> Kamerani stanokchi QR begikiga to'g'rilang — o'qilishi bilan smena almashadi
                </p>
                <button onClick={() => { stopScan(); setScanOpen(false); }} className="btn-secondary w-full">Bekor</button>
              </div>
            ) : (
              <>
                <button onClick={() => setScanOpen(true)}
                  className="btn-sm w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-2 flex items-center gap-1.5 justify-center">
                  <QrCode size={14} /> QR begikni skanerlash (tezkor)
                </button>
                <div className="flex items-center gap-2 text-xs text-gray-300">
                  <div className="flex-1 border-t border-gray-100" /> yoki ro'yxatdan <div className="flex-1 border-t border-gray-100" />
                </div>
                <div>
                  <label className="label text-xs">Yangi operator (smenaga kiruvchi) *</label>
                  <select value={toOperator} onChange={e => setToOperator(e.target.value)} className="select">
                    <option value="">Tanlang...</option>
                    {(employees?.employees || []).map(e => (
                      <option key={e.id} value={e.id}>{e.name}{e.shift ? ` (${shiftLabel(e.shift)})` : ''}</option>
                    ))}
                  </select>
                </div>
                <input value={note} onChange={e => setNote(e.target.value)} className="input" placeholder="Izoh (ixtiyoriy)" />
                <button
                  onClick={() => { if (!toOperator) return toast.error('Operatorni tanlang'); changeMut.mutate(toOperator); }}
                  disabled={changeMut.isPending} className="btn-primary w-full">
                  {changeMut.isPending ? 'Saqlanmoqda...' : 'Smenani almashtirish'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-gray-600 mb-1.5">Smena almashish tarixi</div>
          {isLoading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yuklanmoqda...</p>
          ) : !rows.length ? (
            <p className="text-center text-gray-400 py-4 text-sm">Hali almashinuv bo'lmagan</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {rows.map(r => (
                <div key={r.id} className="text-sm border-b border-gray-50 last:border-0 pb-1.5">
                  <div className="text-gray-800">{r.from_operator_name || '—'} → <b>{r.to_operator_name}</b></div>
                  <div className="text-xs text-gray-400">{fmtDT(r.changed_at)}{r.changed_by_name ? ` · ${r.changed_by_name}` : ''}</div>
                  {r.note && <div className="text-xs text-gray-600">{r.note}</div>}
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
function PauseReasonModal({ machine, pending, onConfirm, onClose, initialKind }) {
  const [kind, setKind] = useState(initialKind || 'NOSOZ');
  const [reason, setReason] = useState('');
  const [moldMin, setMoldMin] = useState('');
  const [moldProductId, setMoldProductId] = useState('');
  const [selectedMoldName, setSelectedMoldName] = useState(''); // ro'yxatdan tanlangan qolip nomi (faqat matn uchun)

  const { data: prodData } = useQuery({
    queryKey: ['products-all-for-mold'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
    enabled: !!machine,
  });
  // Qolip tayyor mahsulot yoki komponent (detal) uchun ham bo'lishi mumkin — ikkalasi ham ko'rsatiladi
  const products = prodData?.products || [];

  const { data: moldsData } = useQuery({
    queryKey: ['molds-for-pause'],
    queryFn: () => moldsAPI.getAll().then(r => r.data),
    enabled: !!machine,
  });
  const activeMolds = (moldsData?.molds || []).filter(mo => mo.status === 'AKTIV');

  const opts = [
    { v: 'NOSOZ',    label: 'Nosoz',             Icon: Wrench,        on: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
    { v: 'BUZILGAN', label: 'Buzilgan',          Icon: AlertTriangle, on: 'border-red-400 bg-red-50 text-red-700' },
    { v: 'QOLIP',    label: 'Qalip almashmoqda', Icon: RefreshCw,     on: 'border-blue-400 bg-blue-50 text-blue-700' },
  ];

  const pickMold = (mo) => { setMoldProductId(mo.product_id); setSelectedMoldName(mo.name); };

  const confirm = () => {
    if (kind === 'QOLIP' && !moldProductId) return toast.error("Almashtirilayotgan qolipni (mahsulotni) tanlang");
    if (kind === 'QOLIP' && !(parseFloat(moldMin) >= 0)) return toast.error("Qalip almashish vaqtini kiriting (daqiqa)");
    const moldProductName = products.find(p => p.id === moldProductId)?.name || '';
    const moldLabel = selectedMoldName ? `${selectedMoldName} (${moldProductName})` : moldProductName;
    const composed = kind === 'QOLIP'
      ? `Qalip almashmoqda${moldLabel ? ` → ${moldLabel}` : ''}${moldMin ? ` (~${moldMin} daqiqa)` : ''}${reason ? ' — ' + reason : ''}`
      : (reason || (kind === 'BUZILGAN' ? 'Buzilgan' : 'Nosoz'));
    onConfirm({ pause_kind: kind, reason: composed, mold_minutes: kind === 'QOLIP' ? moldMin : null, product_id: kind === 'QOLIP' ? moldProductId : null });
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
          <>
            {activeMolds.length > 0 && (
              <div>
                <label className="label text-xs">Ro'yxatdan qolip tanlash (tezkor)</label>
                <div className="flex flex-wrap gap-1.5">
                  {activeMolds.map(mo => (
                    <button key={mo.id} type="button" onClick={() => pickMold(mo)}
                      className={`px-2.5 py-1 rounded-lg border text-xs ${
                        moldProductId === mo.product_id && selectedMoldName === mo.name
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {mo.name} <span className="opacity-60">· {mo.product_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label text-xs">Qaysi qolipga (mahsulotga) almashtirilyapti? *</label>
              <select value={moldProductId} onChange={e => { setMoldProductId(e.target.value); setSelectedMoldName(''); }} className="select" autoFocus>
                <option value="">Tanlang...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.kind === 'KOMPONENT' ? ' — Komponent' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">O'rtacha qalip almashish vaqti (daqiqa) *</label>
              <input type="number" min="0" step="1" value={moldMin}
                onChange={e => setMoldMin(e.target.value)} className="input" placeholder="masalan: 15" />
            </div>
          </>
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

// Stanok QR begisi skanerlanganda ochiladigan tezkor amallar markazi —
// bitta joydan smena almashtirish, qolip almashtirish, holat/nosozlik va h.k.
function MachineHubModal({ machine, canWrite, onClose, onAction }) {
  if (!machine) return null;
  const st = STATUS[machine.status] || STATUS.WORKING;
  return (
    <Modal open onClose={onClose} title={machine.name}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
          <span className="text-gray-600">
            {machine.type === 'MASHINA' ? 'Mashina' : 'Stanok'}{machine.location ? ` · ${machine.location}` : ''}
          </span>
          <span className={st.cls}>{st.label}</span>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Operator:</span>
            <span>
              {machine.operator_name || '—'}
              {machine.operator_name && machine.operator_shift && (
                <span className="text-xs text-gray-400"> ({shiftLabel(machine.operator_shift)})</span>
              )}
            </span>
          </div>
          {machine.current_mold_name && (
            <div className="flex justify-between">
              <span className="text-gray-500">Joriy kalip:</span>
              <span className="font-medium text-indigo-700">{machine.current_mold_name}</span>
            </div>
          )}
          {machine.current_product_name && (
            <div className="flex justify-between">
              <span className="text-gray-500">Joriy qolip:</span>
              <span className="font-medium text-blue-700">{machine.current_product_name}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {canWrite && (
            <button onClick={() => onAction('toggle')}
              className={`btn-sm col-span-2 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center ${
                machine.is_running ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}>
              {machine.is_running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {machine.is_running ? "To'xtatish" : 'Ishga tushirish'}
            </button>
          )}
          <button onClick={() => onAction('shift')}
            className="btn-sm bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
            <Users size={14} /> Smena
          </button>
          {canWrite && (
            <button onClick={() => onAction('mold')}
              className="btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
              <RefreshCw size={14} /> Qolip almashtirish
            </button>
          )}
          {canWrite && (
            <button onClick={() => onAction('kalip-assign')}
              className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
              <Layers size={14} /> Kalip belgilash
            </button>
          )}
          <button onClick={() => onAction('downtime')}
            className="btn-sm bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
            <Wrench size={14} /> Holat/Nosozlik
          </button>
          <button onClick={() => onAction('cycle')}
            className="btn-sm bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
            <Timer size={14} /> Cycle-time
          </button>
          <button onClick={() => onAction('qr')}
            className="btn-sm col-span-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-2.5 flex items-center gap-1.5 justify-center">
            <QrCode size={14} /> QR kodni ko'rish
          </button>
        </div>
      </div>
    </Modal>
  );
}

const MOLD_STATUS = {
  AKTIV:   { label: 'Aktiv',    cls: 'badge-green' },
  TAMIRDA: { label: "Ta'mirda", cls: 'badge-yellow' },
  NOSOZ:   { label: 'Nosoz',    cls: 'badge-red' },
};

// Qaliplar ro'yxati — haqiqiy jismoniy qoliplarni kiritish/tahrirlash
// (nomi/kodi, qaysi mahsulot/komponent, necha ko'ylik, holati, joylashuvi)
function MoldsModal({ canWrite, onClose }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', product_id: '', cavity_count: '', status: 'AKTIV', location: '', notes: '' });

  const { data: moldsData, isLoading } = useQuery({
    queryKey: ['molds'],
    queryFn: () => moldsAPI.getAll().then(r => r.data),
  });
  const { data: prodData } = useQuery({
    queryKey: ['products-all-for-molds'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });
  const products = prodData?.products || [];
  const molds = moldsData?.molds || [];

  const resetForm = () => { setEditId(null); setForm({ name: '', product_id: '', cavity_count: '', status: 'AKTIV', location: '', notes: '' }); };

  const saveMut = useMutation({
    mutationFn: () => editId ? moldsAPI.update(editId, form) : moldsAPI.create(form),
    onSuccess: () => {
      toast.success(editId ? 'Qolip yangilandi' : "Qolip qo'shildi");
      qc.invalidateQueries({ queryKey: ['molds'] });
      qc.invalidateQueries({ queryKey: ['molds-for-pause'] });
      resetForm();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const delMut = useMutation({
    mutationFn: (id) => moldsAPI.remove(id),
    onSuccess: () => {
      toast.success("Qolip o'chirildi");
      qc.invalidateQueries({ queryKey: ['molds'] });
      qc.invalidateQueries({ queryKey: ['molds-for-pause'] });
    },
  });

  const startEdit = (mo) => {
    setEditId(mo.id);
    setForm({ name: mo.name, product_id: mo.product_id, cavity_count: mo.cavity_count || '', status: mo.status || 'AKTIV', location: mo.location || '', notes: mo.notes || '' });
  };

  return (
    <Modal open onClose={onClose} title="🧩 Qaliplar">
      <div className="space-y-4">
        {canWrite && (
          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-600">{editId ? 'Qolipni tahrirlash' : 'Yangi qolip qoʻshish'}</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nomi/kodi (masalan: QP-014)" className="input text-sm" />
              <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className="select text-sm">
                <option value="">Mahsulot tanlang...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.kind === 'KOMPONENT' ? ' — Komponent' : ''}</option>)}
              </select>
              <input type="number" min="1" value={form.cavity_count} onChange={e => setForm(f => ({ ...f, cavity_count: e.target.value }))}
                placeholder="Ko'ylik soni (ixtiyoriy)" className="input text-sm" />
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="select text-sm">
                <option value="AKTIV">Aktiv</option>
                <option value="TAMIRDA">Ta'mirda</option>
                <option value="NOSOZ">Nosoz</option>
              </select>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Joylashuvi (ixtiyoriy)" className="input text-sm col-span-2" />
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Izoh (ixtiyoriy)" className="input text-sm col-span-2" />
            </div>
            <div className="flex gap-2">
              {editId && <button onClick={resetForm} className="btn-secondary btn-sm flex-1">Bekor</button>}
              <button
                onClick={() => {
                  if (!form.name.trim()) return toast.error('Nomini kiriting');
                  if (!form.product_id) return toast.error('Mahsulotni tanlang');
                  saveMut.mutate();
                }}
                disabled={saveMut.isPending} className="btn-primary btn-sm flex-1">
                {saveMut.isPending ? 'Saqlanmoqda...' : editId ? 'Yangilash' : "Qo'shish"}
              </button>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          {isLoading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yuklanmoqda...</p>
          ) : !molds.length ? (
            <p className="text-center text-gray-400 py-4 text-sm">Hali qolip qo'shilmagan</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {molds.map(mo => (
                <div key={mo.id} className="flex items-center justify-between gap-2 text-sm border-b border-gray-50 last:border-0 pb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                      {mo.name}
                      <span className={MOLD_STATUS[mo.status]?.cls || 'badge-gray'}>{MOLD_STATUS[mo.status]?.label || mo.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {mo.product_name || '—'}{mo.cavity_count ? ` · ${mo.cavity_count} ko'ylik` : ''}{mo.location ? ` · ${mo.location}` : ''}
                    </div>
                    {mo.current_machine_name && (
                      <div className="text-xs text-indigo-600 truncate">📍 {mo.current_machine_name}'da o'rnatilgan</div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(mo)} className="text-blue-500 hover:text-blue-700 p-1"><Pencil size={14} /></button>
                      <button onClick={() => { if (window.confirm(`"${mo.name}" o'chirilsinmi?`)) delMut.mutate(mo.id); }}
                        className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                    </div>
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

// Kalip belgilash — stanokka molds ro'yxatidan jismoniy qolip biriktirish/yechish
// (Qolip almashtirish (pause) — to'xtash sababini yozadi; bu esa registrdagi
// aniq jismoniy qolipni doimiy biriktirib qo'yadi, tarixi bilan.)
function MoldAssignModal({ machine, canWrite, onClose }) {
  const qc = useQueryClient();
  const [searchText, setSearchText] = useState(''); // yozib qidirish maydoni
  const [selection, setSelection] = useState(''); // "mold:<id>" yoki "product:<id>" — searchText mos kelganda to'ladi
  const [moldName, setMoldName] = useState(''); // yangi kalipga o'zi yozadigan nom (ixtiyoriy)
  const [note, setNote] = useState('');

  const { data: moldsData } = useQuery({
    queryKey: ['molds'],
    queryFn: () => moldsAPI.getAll().then(r => r.data),
  });
  const { data: prodData } = useQuery({
    queryKey: ['products-all-for-mold'],
    queryFn: () => productsAPI.getAll({ is_active: 'true' }).then(r => r.data),
  });
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['machine-mold-changes', machine?.id],
    queryFn: () => machinesAPI.getMoldChanges(machine.id).then(r => r.data),
    enabled: !!machine,
  });

  const molds = moldsData?.molds || [];
  const products = prodData?.products || [];
  const rows = historyData?.mold_changes || [];

  // Yozib qidirish uchun bitta ro'yxatga birlashtirilgan variantlar (kalip + mahsulot/komponent)
  const candidates = [
    ...molds.map(mo => ({
      key: `mold:${mo.id}`,
      label: `🧩 ${mo.name}${mo.product_name ? ` (${mo.product_name})` : ''}${mo.current_machine_id && mo.current_machine_id !== machine.id ? ` — hozir: ${mo.current_machine_name}` : ''}`,
    })),
    ...products.map(p => ({
      key: `product:${p.id}`,
      label: `📦 ${p.name}${p.kind === 'KOMPONENT' ? ' (komponent)' : ''}`,
    })),
  ];

  const handleSearchChange = (val) => {
    setSearchText(val);
    const match = candidates.find(c => c.label === val);
    setSelection(match ? match.key : '');
  };

  const assignMut = useMutation({
    mutationFn: (sel) => {
      const [kind, id] = sel.split(':');
      return machinesAPI.assignMold(machine.id, kind === 'mold'
        ? { mold_id: id, note }
        : { product_id: id, mold_name: moldName.trim() || undefined, note });
    },
    onSuccess: () => {
      toast.success('Kalip biriktirildi');
      setSearchText(''); setSelection(''); setMoldName(''); setNote('');
      qc.invalidateQueries({ queryKey: ['machine-mold-changes', machine.id] });
      qc.invalidateQueries({ queryKey: ['machines'] });
      qc.invalidateQueries({ queryKey: ['molds'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  const unassignMut = useMutation({
    mutationFn: () => machinesAPI.assignMold(machine.id, { mold_id: null, note }),
    onSuccess: () => {
      toast.success('Kalip yechildi');
      setSearchText(''); setSelection(''); setNote('');
      qc.invalidateQueries({ queryKey: ['machine-mold-changes', machine.id] });
      qc.invalidateQueries({ queryKey: ['machines'] });
      qc.invalidateQueries({ queryKey: ['molds'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Xato'),
  });

  if (!machine) return null;

  return (
    <Modal open onClose={onClose} title={`🧩 Kalip belgilash — ${machine.name}`}>
      <div className="space-y-4">
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          Joriy kalip: <b className="text-gray-900">{machine.current_mold_name || 'Biriktirilmagan'}</b>
          {machine.current_mold_location && <span className="text-xs text-gray-400"> ({machine.current_mold_location})</span>}
        </div>

        {canWrite && (
          <div className="space-y-2">
            <div>
              <label className="label text-xs">Mahsulot/komponent yoki ro'yxatdagi kalip</label>
              <input
                type="text"
                list="mold-assign-candidates"
                value={searchText}
                onChange={e => handleSearchChange(e.target.value)}
                className="input"
                placeholder="Yozib qidiring..."
              />
              <datalist id="mold-assign-candidates">
                {candidates.map(c => <option key={c.key} value={c.label} />)}
              </datalist>
              {searchText && !selection && (
                <p className="text-xs text-amber-600 mt-1">Ro'yxatdan mos variantni tanlang</p>
              )}
            </div>
            {selection.startsWith('product:') && (
              <input value={moldName} onChange={e => setMoldName(e.target.value)} className="input"
                placeholder="Kalip nomi (ixtiyoriy — yozsangiz, shu nom bilan yangi kalip qo'shiladi)" />
            )}
            <input value={note} onChange={e => setNote(e.target.value)} className="input" placeholder="Izoh (ixtiyoriy)" />
            <div className="flex gap-2">
              <button
                onClick={() => { if (!selection) return toast.error('Mahsulot yoki kalipni tanlang'); assignMut.mutate(selection); }}
                disabled={assignMut.isPending} className="btn-primary flex-1">
                {assignMut.isPending ? 'Saqlanmoqda...' : 'Biriktirish'}
              </button>
              {machine.current_mold_id && (
                <button onClick={() => unassignMut.mutate()} disabled={unassignMut.isPending} className="btn-secondary">
                  Yechish
                </button>
              )}
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-gray-600 mb-1.5">Kalip biriktirish tarixi</div>
          {isLoading ? (
            <p className="text-center text-gray-400 py-4 text-sm">Yuklanmoqda...</p>
          ) : !rows.length ? (
            <p className="text-center text-gray-400 py-4 text-sm">Hali biriktirilmagan</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {rows.map(r => (
                <div key={r.id} className="text-sm border-b border-gray-50 last:border-0 pb-1.5">
                  <div className="text-gray-800">{r.from_mold_name || '—'} → <b>{r.to_mold_name || 'Yechildi'}</b></div>
                  <div className="text-xs text-gray-400">{fmtDT(r.changed_at)}{r.changed_by_name ? ` · ${r.changed_by_name}` : ''}</div>
                  {r.note && <div className="text-xs text-gray-600">{r.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function MachinesPage() {
  const { isOwner, isProductionHead, isCycleTime, isKirimchi } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editMachine, setEditMachine] = useState(null);
  const [cycleFor, setCycleFor] = useState(null);     // cycle-time modal
  const [downtimeFor, setDowntimeFor] = useState(null); // holat/nosozlik modal
  const [choosing, setChoosing] = useState(false);    // "Stanok yoki Mashina" tanlash
  const [pauseFor, setPauseFor] = useState(null);     // pause sababi modali (qaysi stanok)
  const [now, setNow] = useState(() => new Date());   // tushlik vaqtini jonli kuzatish
  const [qrMachine, setQrMachine] = useState(null);   // bitta stanok QR begiki
  const [qrBulk, setQrBulk] = useState(false);        // hamma stanok QR begiklari
  const [shiftFor, setShiftFor] = useState(null);     // smena almashtirish modali (qaysi stanok)
  const [moldsOpen, setMoldsOpen] = useState(false);  // qaliplar ro'yxati modali
  const [moldAssignFor, setMoldAssignFor] = useState(null); // kalip belgilash modali (qaysi stanok)
  const [pauseInitialKind, setPauseInitialKind] = useState('NOSOZ'); // pause modali qaysi sabab bilan ochilsin
  const [hubMachine, setHubMachine] = useState(null); // stanok QR skanerlanganda ochiladigan amallar markazi
  const [pageScanOpen, setPageScanOpen] = useState(false); // sahifa darajasidagi stanok QR skaneri
  const [pageScanManual, setPageScanManual] = useState('');
  const pageScannerRef = useRef(null);

  const stopPageScan = () => {
    const qr = pageScannerRef.current;
    if (qr && qr.isScanning) { qr.stop().then(() => qr.clear()).catch(() => {}); }
    pageScannerRef.current = null;
  };

  // Stanok QR begisi ("teknoplast-machine-<id>") skanerlanganda — o'sha stanokning
  // tezkor amallar markazini ochamiz (ro'yxatdan qidirib o'tirmasdan)
  const handlePageScanned = (raw) => {
    const m = String(raw || '').trim().match(/teknoplast-machine-(.+)$/i);
    const id = m ? m[1] : String(raw || '').trim();
    const machine = (data?.machines || []).find(x => x.id === id);
    if (!machine) { toast.error('Stanok topilmadi — QR mos kelmadi'); return; }
    stopPageScan();
    setPageScanOpen(false);
    setPageScanManual('');
    setHubMachine(machine);
  };

  useEffect(() => {
    if (!pageScanOpen) return;
    try {
      const qr = new Html5Qrcode('machine-hub-qr-reader');
      pageScannerRef.current = qr;
      qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decoded) => { handlePageScanned(decoded); },
        () => {}
      ).catch(() => {
        toast('Kamera ishlamasa, kodni qo\'lda kiriting', { icon: 'ℹ️' });
      });
    } catch (e) {
      toast.error('Kamera: ' + (e.message || 'Xato'));
    }
    return () => { stopPageScan(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageScanOpen]);

  // Amallar markazidagi tugmalar — mavjud modallarni shu stanok uchun ochadi
  const handleHubAction = (key) => {
    const m = (data?.machines || []).find(x => x.id === hubMachine.id) || hubMachine;
    setHubMachine(null);
    if (key === 'toggle') {
      if (m.is_running) { setPauseInitialKind('NOSOZ'); setPauseFor(m); }
      else runningMutation.mutate({ id: m.id, is_running: 1 });
    } else if (key === 'mold') {
      setPauseInitialKind('QOLIP');
      setPauseFor(m);
    } else if (key === 'kalip-assign') {
      setMoldAssignFor(m);
    } else if (key === 'shift') {
      setShiftFor(m);
    } else if (key === 'downtime') {
      setDowntimeFor(m);
    } else if (key === 'cycle') {
      setCycleFor(m);
    } else if (key === 'qr') {
      setQrMachine(m);
    }
  };

  // Begiklarni bitta tugma bilan PNG qilib yuklab olish (Xodimlar sahifasidagi kabi)
  const downloadMachineBadges = async (list) => {
    const zone = document.querySelector('.machine-badge-print-zone');
    if (!zone || !list?.length) return;
    const svgs = zone.querySelectorAll('svg');
    const loadImg = (svgEl) => new Promise((res, rej) => {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    try {
      const qrImgs = await Promise.all(Array.from(svgs).map(loadImg));
      const S = 3;
      const bw = 260, bh = 200, gap = 10;
      const cols = list.length === 1 ? 1 : Math.min(3, list.length);
      const rows = Math.ceil(list.length / cols);
      const W = cols * bw + (cols + 1) * gap;
      const H = rows * bh + (rows + 1) * gap;
      const canvas = document.createElement('canvas');
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext('2d');
      ctx.scale(S, S);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      list.forEach((m, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = gap + col * (bw + gap), y = gap + row * (bh + gap);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
        ctx.fillStyle = '#1d4ed8'; ctx.font = 'bold 16px Arial';
        ctx.fillText('TEKNOPLAST', x + bw / 2, y + 24);
        ctx.fillStyle = '#9ca3af'; ctx.font = '9px Arial';
        ctx.fillText('Stanok / Mashina', x + bw / 2, y + 38);
        const qr = qrImgs[i];
        if (qr) ctx.drawImage(qr, x + (bw - 110) / 2, y + 46, 110, 110);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 14px Arial';
        ctx.fillText(String(m.name || '').slice(0, 26), x + bw / 2, y + 176);
        ctx.fillStyle = '#1d4ed8'; ctx.font = '11px Arial';
        ctx.fillText(m.type === 'MASHINA' ? 'Mashina' : 'Stanok', x + bw / 2, y + 192);
      });
      canvas.toBlob((b) => {
        if (!b) { toast.error('Yuklab bo\'lmadi'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = list.length === 1
          ? `qr-stanok-${String(list[0].name || 'stanok').replace(/[^A-Za-z0-9]+/g, '_')}.png`
          : 'qr-stanoklar.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.success('Yuklab olindi');
      }, 'image/png');
    } catch {
      toast.error('Yuklab bo\'lmadi');
    }
  };

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

  const canWrite = isOwner() || isProductionHead() || isCycleTime() || isKirimchi();
  const machines = data?.machines || [];
  const working = machines.filter(m => m.status === 'WORKING').length;
  const broken = machines.filter(m => m.status === 'BROKEN').length;
  const service = machines.filter(m => m.status === 'SERVICE').length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Mashinalar</h1>
        <div className="flex gap-2">
          <button onClick={() => setPageScanOpen(true)}
            className="btn-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 flex items-center gap-1">
            <Camera size={14} /> QR skanerlash
          </button>
          <button onClick={() => setQrBulk(true)}
            className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 flex items-center gap-1">
            <QrCode size={14} /> Hamma QR
          </button>
          <button onClick={() => setMoldsOpen(true)}
            className="btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 flex items-center gap-1">
            <Layers size={14} /> Qaliplar
          </button>
          {canWrite && (
            <button onClick={() => setChoosing(true)} className="btn-primary btn-sm">
              <Plus size={14} /> Qo'shish
            </button>
          )}
        </div>
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

      {/* Stanoklar ishlab chiqarish statistikasi — PDF/Excel */}
      {canWrite && <MachineStatsPanel />}

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
                      onClick={() => { if (m.is_running) { setPauseInitialKind('NOSOZ'); setPauseFor(m); } else { runningMutation.mutate({ id: m.id, is_running: 1 }); } }}
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
                  <span>
                    {m.operator_name || '—'}
                    {m.operator_name && m.operator_shift && (
                      <span className="text-xs text-gray-400"> ({shiftLabel(m.operator_shift)})</span>
                    )}
                  </span>
                </div>
                {m.current_mold_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Joriy kalip:</span>
                    <span className="font-medium text-indigo-700">
                      {m.current_mold_name}{m.current_mold_location ? ` (${m.current_mold_location})` : ''}
                    </span>
                  </div>
                )}
                {m.current_product_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Joriy qolip:</span>
                    <span className="font-medium text-blue-700">{m.current_product_name}</span>
                  </div>
                )}
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

              <button onClick={() => setShiftFor(m)}
                className="btn-sm w-full mt-3 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg px-2 flex items-center gap-1.5 justify-center">
                <Users size={14} /> Smena almashtirish
              </button>

              <button onClick={() => setMoldAssignFor(m)}
                className="btn-sm w-full mt-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 flex items-center gap-1.5 justify-center">
                <Layers size={14} /> Kalip belgilash
              </button>

              {canWrite && (
                <div className="flex gap-2 mt-2">
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
                <button onClick={() => setQrMachine(m)}
                  className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 flex items-center gap-1 justify-center">
                  <QrCode size={13} /> QR
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
      {shiftFor && (
        <ShiftChangeModal
          machine={machines.find(x => x.id === shiftFor.id) || shiftFor}
          employees={employees}
          canWrite={canWrite}
          onClose={() => setShiftFor(null)}
        />
      )}
      {pauseFor && (
        <PauseReasonModal
          machine={pauseFor}
          pending={runningMutation.isPending}
          initialKind={pauseInitialKind}
          onClose={() => setPauseFor(null)}
          onConfirm={(payload) => { runningMutation.mutate({ id: pauseFor.id, is_running: 0, ...payload }); setPauseFor(null); }}
        />
      )}
      {hubMachine && (
        <MachineHubModal
          machine={machines.find(x => x.id === hubMachine.id) || hubMachine}
          canWrite={canWrite}
          onClose={() => setHubMachine(null)}
          onAction={handleHubAction}
        />
      )}

      {moldsOpen && <MoldsModal canWrite={canWrite} onClose={() => setMoldsOpen(false)} />}

      {moldAssignFor && (
        <MoldAssignModal
          machine={machines.find(x => x.id === moldAssignFor.id) || moldAssignFor}
          canWrite={canWrite}
          onClose={() => setMoldAssignFor(null)}
        />
      )}

      {/* Sahifa darajasidagi QR skaner — stanokni skanerlab, uning amallar markazini ochish */}
      {pageScanOpen && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center pt-16 p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { stopPageScan(); setPageScanOpen(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Stanok QR begisini skanerlash</h3>
              <button onClick={() => { stopPageScan(); setPageScanOpen(false); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div id="machine-hub-qr-reader" className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: 220 }} />
              <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
                <Camera size={12} /> Kamerani stanok QR begisiga to'g'rilang — o'qilgach amallar menyusi ochiladi
              </p>
              <div className="relative mt-4 pt-4 border-t border-gray-200">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={pageScanManual} onChange={e => setPageScanManual(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePageScanned(pageScanManual)}
                  placeholder="Yoki kodni qo'lda: teknoplast-machine-..." className="input pl-8 text-sm" autoFocus />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bitta stanok QR begiki */}
      {qrMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQrMachine(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Stanok QR kodi</h3>
              <button onClick={() => setQrMachine(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="machine-badge-print-zone flex justify-center">
              <MachineBadgeCard machine={qrMachine} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQrMachine(null)} className="btn-secondary flex-1">Yopish</button>
              <button onClick={() => downloadMachineBadges([qrMachine])} className="btn-primary flex-1 flex items-center justify-center gap-1">
                <Download size={14} /> Yuklab olish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hamma stanok/mashina QR begiklari */}
      {qrBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQrBulk(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[88vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Barcha QR Kodlar</h3>
                <p className="text-xs text-gray-400 mt-0.5">{machines.length} ta stanok/mashina</p>
              </div>
              <button onClick={() => setQrBulk(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="machine-badge-print-zone flex flex-wrap gap-1 overflow-y-auto flex-1 justify-center">
              {!machines.length ? (
                <p className="text-center text-gray-400 py-8 w-full">Stanok/mashina topilmadi</p>
              ) : machines.map(m => (
                <MachineBadgeCard key={m.id} machine={m} />
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQrBulk(false)} className="btn-secondary flex-1">Yopish</button>
              <button onClick={() => downloadMachineBadges(machines)} className="btn-primary flex-1 flex items-center justify-center gap-1">
                <Download size={14} /> Hammasini yuklab olish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
