import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { salesAPI } from '../services/api';
import { RANG_COLORS } from '../constants/colors';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

// Bir xil mahsulotni (nom + narx) bitta qatorga birlashtiradi; ranglar ichida ko'rsatiladi
function groupInvoiceRows(rows) {
  const order = [], map = {};
  rows.forEach(it => {
    const key = `${it.product_name || ''}||${it.unit_price}`;
    if (!map[key]) {
      map[key] = { product_name: it.product_name, unit: it.unit, unit_price: it.unit_price, items: [], qty: 0, sum: 0 };
      order.push(map[key]);
    }
    const g = map[key];
    g.items.push(it);
    g.qty += parseFloat(it.quantity) || 0;
    g.sum += parseFloat(it.total_amount) || 0;
  });
  return order;
}

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

const parsePaymentBreakdown = (sale) => {
  const notes = sale?.notes || '';
  const parts = [];
  const parseAmt = (m) => parseFloat((m?.[1] || '0').replace(/[^\d.]/g, '')) || 0;
  const cashMatch = notes.match(/Naqd:\s*([\d\s,.]+)/);
  const cardMatch = notes.match(/Karta:\s*([\d\s,.]+)/);
  const bankMatch = notes.match(/Bank:\s*([\d\s,.]+)/);
  if (cashMatch) parts.push({ label: 'Naqd', amount: parseAmt(cashMatch), icon: '💵' });
  if (cardMatch) parts.push({ label: 'Karta', amount: parseAmt(cardMatch), icon: '💳' });
  if (bankMatch) parts.push({ label: 'Bank', amount: parseAmt(bankMatch), icon: '🏦' });
  return parts;
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
  const paid = rows.reduce((s, it) => s + parseFloat(it.payment_amount || 0), 0);
  const debt = Math.max(0, total - paid);
  const paymentInfo = getPaymentInfo(sale);
  const paymentParts = parsePaymentBreakdown(sale);
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
            {sale.created_by_name && (
              <p className="text-gray-500">{sale.created_by_name}</p>
            )}
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
              {groupInvoiceRows(rows).map((g, i) => {
                const hasColor = g.items.some(x => x.rang && String(x.rang).trim());
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="font-medium">
                      <div>{g.product_name}</div>
                      {hasColor && (
                        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {g.items.map((x, j) => (
                            <span key={j} className="inline-flex items-center gap-1">
                              <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: RANG_COLORS[x.rang] || '#999', border: '1px solid #ddd' }} />
                              {rangLabel(x.rang)}: {x.quantity}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{g.unit}</td>
                    <td>{g.qty}</td>
                    <td>{fmt(g.unit_price)} so'm</td>
                    <td className="font-semibold text-blue-700">{fmt(g.sum)} so'm</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-end">
          <div className="space-y-1">
            {paymentParts.length > 0 ? (
              <>
                <p className="text-xs text-gray-400 uppercase">To'lov tafsiloti</p>
                {paymentParts.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700">
                    {p.icon} {p.label}: <span className="font-semibold">{fmt(p.amount)} so'm</span>
                  </p>
                ))}
                {debt > 0 && (
                  <p className="text-sm text-red-600">
                    📝 Qarz: <span className="font-semibold">{fmt(debt)} so'm</span>
                  </p>
                )}
              </>
            ) : (
              <span className={paymentInfo.cls}>{paymentInfo.label}</span>
            )}
          </div>
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
