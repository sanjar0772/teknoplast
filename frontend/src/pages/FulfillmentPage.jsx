import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine, X, Truck, FileDown, Eye, Camera, Search, CheckCircle, Clock } from 'lucide-react';
import { fulfillmentAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function FulfillmentPage() {
  const { isOmborchi } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState('PENDING');
  const [detailRef, setDetailRef] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef(null);

  const canDeliver = isOmborchi();

  const { data, isLoading } = useQuery({
    queryKey: ['fulfillment', tab],
    queryFn: () => fulfillmentAPI.getAll({ status: tab }).then(r => r.data),
  });
  const { data: detail } = useQuery({
    queryKey: ['fulfillment-order', detailRef],
    queryFn: () => fulfillmentAPI.getByRef(detailRef).then(r => r.data),
    enabled: !!detailRef,
  });

  const deliverMutation = useMutation({
    mutationFn: (ref) => fulfillmentAPI.deliver(ref),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['fulfillment'] });
      setDetailRef(null);
    },
  });

  // QR kamera skani (opsional — agar kamera ishlamasa, qo'lda kod bilan davom etish)
  useEffect(() => {
    if (!scanOpen) return;
    try {
      const qr = new Html5Qrcode('qr-reader');
      scannerRef.current = qr;
      qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decoded) => {
          stopScan();
          setScanOpen(false);
          setDetailRef(decoded.trim());
          toast.success('✅ QR o\'qildi: ' + decoded.trim());
        },
        () => {}
      ).catch(() => {
        toast.info('Kamera ishlamasa, qo\'lda kod kiritish tugmasini ishlating');
      });
    } catch (e) {
      toast.error('Kamera: ' + (e.message || 'Xato'));
    }
    return () => { stopScan(); };
    // eslint-disable-next-line
  }, [scanOpen]);

  const stopScan = () => {
    const qr = scannerRef.current;
    if (qr && qr.isScanning) { qr.stop().then(() => qr.clear()).catch(() => {}); }
    scannerRef.current = null;
  };

  const downloadNakladnoy = async (ref) => {
    try {
      const res = await fulfillmentAPI.nakladnoy(ref);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `nakladnoy-${ref}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Nakladnoy yuklab bo\'lmadi'); }
  };

  const openManual = () => {
    const code = manualCode.trim();
    if (!code) return toast.error('Kodni kiriting');
    setDetailRef(code); setManualCode('');
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Buyurtmalarni berish (Ombor)</h1>
        <button onClick={() => setScanOpen(true)} className="btn-primary btn-sm">
          <ScanLine size={14} /> QR skanerlash
        </button>
      </div>

      {/* Manual code + tabs */}
      <div className="card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2">
          {['PENDING', 'DELIVERED'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t === 'PENDING' ? 'Kutilayotgan' : 'Berilgan'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && openManual()}
              placeholder="QR kodni qo'lda: ORD-..." className="input pl-8 w-56 text-sm" />
          </div>
          <button onClick={openManual} className="btn-secondary btn-sm">Ochish</button>
        </div>
      </div>

      {/* Orders table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Buyurtma (QR)</th><th>Mijoz</th><th>Sana</th><th>Xil</th><th>Miqdor</th><th>Jami</th><th>Amal</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Yuklanmoqda...</td></tr>
            ) : !data?.orders?.length ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">
                {tab === 'PENDING' ? <><CheckCircle size={26} className="mx-auto mb-2 text-green-400" />Kutilayotgan buyurtma yo'q</> : 'Berilgan buyurtma yo\'q'}
              </td></tr>
            ) : data.orders.map(o => (
              <tr key={o.order_ref}>
                <td className="font-mono text-xs font-semibold text-blue-700">{o.order_ref}</td>
                <td>{o.customer_name || <span className="text-gray-400">—</span>}</td>
                <td className="whitespace-nowrap">{new Date(o.sale_date).toLocaleDateString('uz-UZ')}</td>
                <td>{o.item_count} xil</td>
                <td>{fmt(o.total_qty)}</td>
                <td className="font-semibold text-blue-700">{fmt(o.total)}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => setDetailRef(o.order_ref)} className="btn-secondary btn-sm"><Eye size={12} /> Ko'rish</button>
                    <button onClick={() => downloadNakladnoy(o.order_ref)} className="btn-secondary btn-sm"><FileDown size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scan modal */}
      <Modal open={scanOpen} onClose={() => { stopScan(); setScanOpen(false); }} title="QR kodni skanerlash yoki kodni kiritish" wide>
        <div className="space-y-3">
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: 200 }} />
          <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
            <Camera size={12} /> Kamerani QR kodga to'g'rilang (yoki pastda kodni yozing)
          </p>
          <div className="relative mt-4 pt-4 border-t border-gray-200">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (setDetailRef(manualCode.trim()), stopScan(), setScanOpen(false), setManualCode(''))}
              placeholder="QR kod: ORD-..." className="input pl-8 text-sm" autoFocus />
          </div>
        </div>
      </Modal>

      {/* Order detail modal */}
      <Modal open={!!detailRef} onClose={() => setDetailRef(null)} title={`Buyurtma: ${detailRef || ''}`} wide>
        {!detail ? <p className="text-center py-8 text-gray-400">Yuklanmoqda...</p> : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{detail.customer_name || 'Noma\'lum mijoz'}</p>
                {detail.customer_phone && <p className="text-sm text-gray-400">{detail.customer_phone}</p>}
              </div>
              <span className={detail.fulfillment_status === 'DELIVERED' ? 'badge-green' : 'badge-yellow'}>
                {detail.fulfillment_status === 'DELIVERED' ? 'Berilgan' : 'Kutilmoqda'}
              </span>
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="table text-sm">
                <thead><tr><th>Mahsulot</th><th>Beriladigan miqdor</th><th>Summa</th></tr></thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id}>
                      <td className="font-medium">{it.product_name}</td>
                      <td className="font-bold text-blue-700">{fmt(it.quantity)} {it.unit}</td>
                      <td>{fmt(it.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
              <span className="text-sm text-gray-500">Jami summa</span>
              <span className="font-bold text-lg">{fmt(detail.total)} so'm</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => downloadNakladnoy(detailRef)} className="btn-secondary flex-1"><FileDown size={14} /> Nakladnoy</button>
              {canDeliver && detail.fulfillment_status !== 'DELIVERED' && (
                <button onClick={() => deliverMutation.mutate(detailRef)} disabled={deliverMutation.isPending} className="btn-success flex-1">
                  <Truck size={14} /> {deliverMutation.isPending ? 'Saqlanmoqda...' : 'Berildi (yetkazildi)'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
