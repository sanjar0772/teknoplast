import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, X, Users, Trash2, QrCode, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
// Ikki bo'lim (egasi talabi): ishlab chiqarish xodimlari (dona bay) ALOHIDA,
// qolganlari (oylik maosh) ALOHIDA ko'rsatiladi.
const PROD_TYPES = { STANOKCHI: TYPES.STANOKCHI, DETALCHI: TYPES.DETALCHI };
const MONTHLY_TYPES = Object.fromEntries(Object.entries(TYPES).filter(([k]) => !PIECE_RATE.includes(k)));
// STANOKCHI va DETALCHI 2 smenada ishlaydi — smena (1-Smena / 2-Smena) tanlanadi.
const HAS_SHIFT = ['STANOKCHI', 'DETALCHI'];
const hasShift = (t) => HAS_SHIFT.includes(t);

function BadgeCard({ emp }) {
  return (
    <div style={{
      width: '7cm', border: '2px solid #2563eb', borderRadius: '6px',
      padding: '10px', fontFamily: 'Arial, sans-serif', background: 'white',
      display: 'inline-block', margin: '4px', verticalAlign: 'top',
      boxSizing: 'border-box', pageBreakInside: 'avoid',
    }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px', marginBottom: '5px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1d4ed8', letterSpacing: '1px' }}>TEKNOPLAST</div>
        <div style={{ fontSize: '8px', color: '#9ca3af' }}>Plastik mahsulotlar zavodi</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
        <QRCodeSVG value={`teknoplast-emp-${emp.id}`} size={85} level="M" includeMargin={false} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{emp.name}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{
            background: emp.type === 'STANOKCHI' ? '#dbeafe' : '#fef3c7',
            color: emp.type === 'STANOKCHI' ? '#1d4ed8' : '#92400e',
            padding: '1px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold',
          }}>
            {TYPES[emp.type] || emp.type}
          </span>
          {hasShift(emp.type) && emp.shift && (
            <span style={{
              background: emp.shift === '2-SMENA' ? '#ede9fe' : '#e0f2fe',
              color: emp.shift === '2-SMENA' ? '#7c3aed' : '#0369a1',
              padding: '1px 7px', borderRadius: '4px', fontSize: '9px',
            }}>
              {SHIFTS[emp.shift] || emp.shift}
            </span>
          )}
        </div>
        <div style={{ fontSize: '8px', color: '#d1d5db', marginTop: '4px' }}>ID: {String(emp.id).slice(0, 8)}</div>
      </div>
    </div>
  );
}

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
  const { isOwner, isProductionHead, isKirimchi, user } = useAuthStore();
  const kirimchiOnly = user?.role === 'KIRIMCHI';
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [filter, setFilter] = useState({ type: '', search: '' });
  const [qrEmployee, setQrEmployee] = useState(null);
  const [qrBulk, setQrBulk] = useState(false);
  // Bo'lim: PRODUCTION = stanokchi/detalchi (dona bay), MONTHLY = qolganlar (oylik).
  // KIRIMCHI faqat ishlab chiqarish xodimlarini boshqaradi — unga faqat shu bo'lim.
  const [tab, setTab] = useState('PRODUCTION');
  const switchTab = (t) => { setTab(t); setFilter(f => ({ ...f, type: '', shift: '' })); };

  // Begiklarni BITTA tugma bilan to'g'ridan-to'g'ri rasm (PNG) qilib yuklab olish.
  // Yangi oyna OCHILMAYDI — QR to'liq chiqadi, keyin chop etib bejik qilib tarqatasiz.
  const downloadBadges = async (emps) => {
    const zone = document.querySelector('.badge-print-zone');
    if (!zone || !emps?.length) return;
    const svgs = zone.querySelectorAll('svg'); // har begikdagi QR (tartibi emps bilan bir xil)
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
      const S = 3;                       // yuqori sifat (3x)
      const bw = 260, bh = 210, gap = 10;
      const cols = emps.length === 1 ? 1 : Math.min(3, emps.length);
      const rows = Math.ceil(emps.length / cols);
      const W = cols * bw + (cols + 1) * gap;
      const H = rows * bh + (rows + 1) * gap;
      const canvas = document.createElement('canvas');
      canvas.width = W * S; canvas.height = H * S;
      const ctx = canvas.getContext('2d');
      ctx.scale(S, S);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      emps.forEach((emp, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = gap + col * (bw + gap), y = gap + row * (bh + gap);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
        ctx.fillStyle = '#1d4ed8'; ctx.font = 'bold 16px Arial';
        ctx.fillText('TEKNOPLAST', x + bw / 2, y + 24);
        ctx.fillStyle = '#9ca3af'; ctx.font = '9px Arial';
        ctx.fillText('Plastik mahsulotlar zavodi', x + bw / 2, y + 38);
        const qr = qrImgs[i];
        if (qr) ctx.drawImage(qr, x + (bw - 110) / 2, y + 46, 110, 110);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 14px Arial';
        ctx.fillText(String(emp.name || '').slice(0, 26), x + bw / 2, y + 176);
        ctx.fillStyle = '#1d4ed8'; ctx.font = '11px Arial';
        const t = (TYPES[emp.type] || emp.type) + (hasShift(emp.type) && emp.shift ? ' · ' + (SHIFTS[emp.shift] || emp.shift) : '');
        ctx.fillText(t, x + bw / 2, y + 195);
      });
      canvas.toBlob((b) => {
        if (!b) { toast.error('Yuklab bo\'lmadi'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = emps.length === 1
          ? `qr-begik-${String(emps[0].name || 'xodim').replace(/[^A-Za-z0-9]+/g, '_')}.png`
          : 'qr-begiklar.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.success('Yuklab olindi');
      }, 'image/png');
    } catch {
      toast.error('Yuklab bo\'lmadi');
    }
  };

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
    // Ochilgan bo'limga mos tur: ishlab chiqarishda STANOKCHI, oylikda ISHCHI
    const defType = tab === 'PRODUCTION' ? 'STANOKCHI' : 'ISHCHI';
    reset({ type: defType, shift: '1-SMENA', salary_type: 'FIXED', monthly_salary: '', salary_percent: '', bonus_percent: '', hire_date: new Date().toISOString().slice(0, 10) });
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

  const canWrite = isOwner() || isProductionHead();
  // KIRIMCHI faqat yangi xodim (stanokchi/detalchi) qo'shishi va tahrirlashi mumkin
  const canAdd = canWrite || isKirimchi();
  const canEditPiece = isKirimchi(); // faqat stanokchi/detalchi tahrirlash

  // Ochiq bo'limga tegishli xodimlar (ishlab chiqarish yoki oylik)
  const tabEmployees = (data?.employees || []).filter(e =>
    tab === 'PRODUCTION' ? isPieceRate(e.type) : !isPieceRate(e.type)
  );
  const prodCount = (data?.employees || []).filter(e => e.is_active && isPieceRate(e.type)).length;
  const monthlyCount = (data?.employees || []).filter(e => e.is_active && !isPieceRate(e.type)).length;

  const typeCount = tabEmployees.reduce((acc, e) => {
    if (e.is_active) acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  // Bo'limga mos tur ro'yxati (filtr va modal uchun)
  const tabTypes = tab === 'PRODUCTION' ? PROD_TYPES : MONTHLY_TYPES;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Xodimlar</h1>
        <div className="flex gap-2">
          {tab === 'PRODUCTION' && (
            <button onClick={() => setQrBulk(true)}
              className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 flex items-center gap-1">
              <QrCode size={14} /> Hamma QR
            </button>
          )}
          {canAdd && (
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus size={14} /> Xodim qo'shish
            </button>
          )}
        </div>
      </div>

      {/* Ikki bo'lim: ishlab chiqarish (dona bay) va oylik xodimlar */}
      <div className="flex gap-2">
        <button onClick={() => switchTab('PRODUCTION')}
          className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all ${
            tab === 'PRODUCTION'
              ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-200'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}>
          <div className={`font-bold text-sm ${tab === 'PRODUCTION' ? 'text-orange-700' : 'text-gray-700'}`}>
            🏭 Ishlab chiqarish xodimlari <span className="ml-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700 px-2 py-0.5">{prodCount}</span>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">Stanokchi va detalchilar — haqi chiqargan mahsulotga qarab (dona bay)</div>
        </button>
        {!kirimchiOnly && (
          <button onClick={() => switchTab('MONTHLY')}
            className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all ${
              tab === 'MONTHLY'
                ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}>
            <div className={`font-bold text-sm ${tab === 'MONTHLY' ? 'text-emerald-700' : 'text-gray-700'}`}>
              💼 Oylik xodimlar <span className="ml-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">{monthlyCount}</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Qolgan barcha xodimlar — belgilangan oylik yoki foiz bilan</div>
          </button>
        )}
      </div>

      {/* Stats — faqat xodimi bor turlar ko'rsatiladi (ochiq bo'lim bo'yicha) */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(tabTypes).filter(([key]) => (typeCount[key] || 0) > 0).map(([key, label]) => (
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
          {Object.entries(tabTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {hasShift(filter.type) && (
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
            <tr><th>Ismi</th><th>Turi</th>{tab === 'PRODUCTION' && <th>Smena</th>}<th>{tab === 'PRODUCTION' ? 'Haq' : 'Oylik'}</th><th>Telefon</th><th>Yollangan sana</th><th>Holat</th>{(canWrite || canEditPiece) && <th>Amal</th>}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !tabEmployees.length ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" /><br />Xodim topilmadi
              </td></tr>
            ) : tabEmployees.map(emp => (
              <tr key={emp.id}>
                <td className="font-medium">{emp.name}</td>
                <td><span className="badge-blue">{TYPES[emp.type] || emp.type}</span></td>
                {tab === 'PRODUCTION' && (
                  <td>
                    {hasShift(emp.type)
                      ? <span className={`badge ${emp.shift === '2-SMENA' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {SHIFTS[emp.shift] || emp.shift || '1-Smena'}
                        </span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                )}
                <td>
                  {isPieceRate(emp.type)
                    ? <span className="text-xs text-orange-600">Dona haqi (mahsulotga qarab)</span>
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
                {(canWrite || (canEditPiece && isPieceRate(emp.type))) && (
                  <td className="flex gap-1 flex-wrap">
                    {(emp.type === 'STANOKCHI' || emp.type === 'DETALCHI') && (
                      <button onClick={() => setQrEmployee(emp)}
                        title="QR Begik chop etish"
                        className="btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 flex items-center gap-1">
                        <QrCode size={12} /> Begik
                      </button>
                    )}
                    <button onClick={() => openEdit(emp)} className="btn-secondary btn-sm">Tahrirlash</button>
                    {canWrite && (
                      <>
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
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bitta xodim QR begik */}
      {qrEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQrEmployee(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">QR Begik</h3>
              <button onClick={() => setQrEmployee(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="badge-print-zone flex justify-center">
              <BadgeCard emp={qrEmployee} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQrEmployee(null)} className="btn-secondary flex-1">Yopish</button>
              <button onClick={() => downloadBadges([qrEmployee])} className="btn-primary flex-1 flex items-center justify-center gap-1">
                <Download size={14} /> Yuklab olish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hamma stanokchi+detalchi QR begiklar */}
      {qrBulk && (() => {
        const pieceWorkers = (data?.employees || []).filter(e => e.is_active && (e.type === 'STANOKCHI' || e.type === 'DETALCHI'));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setQrBulk(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[88vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">Barcha QR Begiklar</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{pieceWorkers.length} ta stanokchi/detalchi</p>
                </div>
                <button onClick={() => setQrBulk(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="badge-print-zone flex flex-wrap gap-1 overflow-y-auto flex-1 justify-center">
                {pieceWorkers.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 w-full">Faol stanokchi/detalchi topilmadi</p>
                ) : pieceWorkers.map(emp => (
                  <BadgeCard key={emp.id} emp={emp} />
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setQrBulk(false)} className="btn-secondary flex-1">Yopish</button>
                <button onClick={() => downloadBadges(pieceWorkers)} className="btn-primary flex-1 flex items-center justify-center gap-1">
                  <Download size={14} /> Hammasini yuklab olish
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditEmployee(null); }}
        title={editEmployee ? 'Xodimni tahrirlash' : 'Yangi Xodim'}>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Ismi *</label>
            <input {...register('name', { required: true })} className="input" placeholder="To'liq ismi" />
          </div>
          <div>
            <label className="label">Turi *</label>
            {/* Tur ro'yxati ochiq bo'limga mos: ishlab chiqarishda stanokchi/detalchi, oylikda qolganlar */}
            <select {...register('type', { required: true })} className="select">
              {Object.entries(kirimchiOnly ? PROD_TYPES : tabTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(watchedType === 'STANOKCHI' || watchedType === 'DETALCHI') && (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                {watchedType === 'STANOKCHI'
                  ? 'Stanokchi haqi chiqargan mahsulotiga qarab (tayyor/yarim tayyor dona narxi) — "Mahsulotlar" sahifasida belgilanadi.'
                  : 'Detalchi haqi mahsulot dona narxidan (yarim tayyor) — "Mahsulotlar" sahifasida belgilanadi.'}
              </div>
            )}
          </div>
          {hasShift(watchedType) && (
            <div>
              <label className="label">Smena *</label>
              <select {...register('shift', { required: hasShift(watchedType) })} className="select">
                <option value="1-SMENA">1-Smena (Ertalab)</option>
                <option value="2-SMENA">2-Smena (Kechqurun)</option>
              </select>
            </div>
          )}
          {!hasShift(watchedType) && watchedType && (
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
