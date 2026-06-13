import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { salesAPI } from '../services/api';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// To'lov turini sotuv yozuvidan aniqlaymiz:
//  - status === PAID  va notes ichida "Karta"/"Naqd" bo'lsa — shu nom ko'rsatiladi
//  - status === PAID  lekin notes'da to'lov turi yo'q bo'lsa — "To'langan"
//  - status === PARTIALLY_PAID — "Qisman to'langan"
//  - aks holda (PENDING va h.k.) — "Qarz"
const getPaymentInfo = (sale) => {
  const notes = sale?.notes || '';
  if (sale?.status === 'PAID') {
    if (notes.includes('Karta')) return { label: '💳 Karta', cls: 'badge-blue' };
    if (notes.includes('Naqd')) return { label: '💵 Naqd', cls: 'badge-green' };
    return { label: "✅ To'langan", cls: 'badge-green' };
  }
  if (sale?.status === 'PARTIALLY_PAID') {
    return { label: "Qisman to'langan", cls: 'badge-blue' };
  }
  return { label: '📝 Qarz', cls: 'badge-yellow' };
};

// Alohida "Schyot-faktura" ko'rish sahifasi — /invoice/:id
// Sotuv (chek/buyurtma) bo'yicha to'liq hujjatni ko'rsatadi, PDF yuklab olish
// va chop etish imkoniyati bilan. PDF ichidagi QR kod ham shu sahifaga olib keladi.
export default function InvoicePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => salesAPI.getById(id).then(r => r.data),
    retry: false,
  });

  const downloadPdf = async () => {
    try {
      const res = await salesAPI.downloadInvoicePdf(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `schyot-faktura-${data?.sale?.order_ref || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Hujjatni yuklab bo'lmadi");
    }
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Yuklanmoqda...</div>;
  }

  if (isError || !data?.sale) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-gray-400">Hujjat topilmadi</p>
        <button onClick={() => navigate('/sales')} className="btn-secondary btn-sm">
          <ArrowLeft size={14} /> Sotuvlarga qaytish
        </button>
      </div>
    );
  }

  const { sale, items } = data;
  const rows = (items && items.length) ? items : [sale];
  const total = rows.reduce((s, it) => s + parseFloat(it.total_amount || 0), 0);
  const paymentInfo = getPaymentInfo(sale);
  const customerPhone = sale.customer_full_phone || sale.customer_phone;
  const invoiceUrl = `${window.location.origin}/invoice/${sale.order_ref || sale.id}`;

  return (
    <div className="space-y-6">
      <div className="page-header print:hidden">
        <h1 className="page-title">
          Schyot-faktura{sale.order_ref ? ` № ${sale.order_ref}` : ''}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/sales')} className="btn-secondary btn-sm">
            <ArrowLeft size={14} /> Orqaga
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm">
            <Printer size={14} /> Chop etish
          </button>
          <button onClick={downloadPdf} className="btn-primary btn-sm">
            <Download size={14} /> PDF yuklash
          </button>
        </div>
      </div>

      <div id="invoice-print" className="card p-6 max-w-3xl mx-auto print:shadow-none print:border-none">
        <div className="flex items-start justify-between border-b pb-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">TEKNOPLAST</h2>
            <p className="text-sm text-gray-500">Schyot-faktura № {sale.order_ref || sale.id}</p>
            <p className="text-sm text-gray-500">
              Sana: {new Date(sale.sale_date).toLocaleDateString('uz-UZ')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={paymentInfo.cls}>{paymentInfo.label}</span>
            <div className="flex flex-col items-center">
              <QRCodeSVG value={invoiceUrl} size={88} />
              <p className="text-[10px] text-gray-400 mt-1">Tizimda ko'rish</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase mb-1">Sotuvchi</p>
            <p className="font-medium text-gray-900">TEKNOPLAST MCHJ</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase mb-1">Xaridor</p>
            <p className="font-medium text-gray-900">
              {sale.customer_full_name || sale.customer_name || "Noma'lum"}
            </p>
            {customerPhone && (
              <p className="text-gray-500">Tel: {customerPhone}</p>
            )}
            {sale.customer_address && <p className="text-gray-500">{sale.customer_address}</p>}
          </div>
        </div>

        <div className="table-container mb-4">
          <table className="table">
            <thead>
              <tr>
                <th>№</th><th>Mahsulot</th><th>Birlik</th><th>Miqdor</th><th>Narx</th><th>Summa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={it.id || i}>
                  <td>{i + 1}</td>
                  <td className="font-medium">{it.product_name}</td>
                  <td>{it.unit}</td>
                  <td>{it.quantity}</td>
                  <td>{fmt(it.unit_price)} so'm</td>
                  <td className="font-semibold text-blue-700">{fmt(it.total_amount)} so'm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="text-right">
            <p className="text-sm text-gray-500">Jami summa</p>
            <p className="text-2xl font-bold text-blue-700">{fmt(total)} so'm</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-8 text-center">
          Hujjat Texno Plast tizimi orqali avtomatik generatsiya qilindi. Haqiqiyligini QR kod orqali tekshiring.
        </p>
      </div>
    </div>
  );
}
