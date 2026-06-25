import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { salesAPI } from '../services/api';
import { downloadQR } from '../utils/qr';
import { RANG_COLORS } from '../constants/colors';
import { COMPANY } from '../constants/company';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));
const balfmt = (n) => (parseFloat(n) > 0 ? '+' : '') + fmt(n);
const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

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

const parsePaymentBreakdown = (sale) => {
  const notes = sale?.notes || '';
  const parts = [];
  const parseAmt = (m) => parseFloat((m?.[1] || '0').replace(/[^\d.]/g, '')) || 0;
  const cashMatch = notes.match(/Naqd:\s*([\d\s,.]+)/);
  const cardMatch = notes.match(/Karta:\s*([\d\s,.]+)/);
  const bankMatch = notes.match(/Bank:\s*([\d\s,.]+)/);
  const paymeMatch = notes.match(/Payme:\s*([\d\s,.]+)/);
  if (cashMatch) parts.push({ label: 'Naqd', amount: parseAmt(cashMatch), icon: '💵' });
  if (cardMatch) parts.push({ label: 'Karta', amount: parseAmt(cardMatch), icon: '💳' });
  if (bankMatch) parts.push({ label: 'Bank', amount: parseAmt(bankMatch), icon: '🏦' });
  if (paymeMatch) parts.push({ label: 'Pay Me', amount: parseAmt(paymeMatch), icon: '📱' });
  return parts;
};

const getPaymentLabel = (sale) => {
  const notes = sale?.notes || '';
  if (sale?.status === 'PAID') {
    if (notes.includes('Karta')) return '💳 Karta';
    if (notes.includes('Naqd')) return '💵 Naqd';
    return "✅ To'langan";
  }
  if (sale?.status === 'PARTIALLY_PAID') return "Qisman to'langan";
  return '📝 Qarz';
};

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

  if (isLoading) return <div className="text-center py-20 text-gray-400">Yuklanmoqda...</div>;

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
  const credit = Math.max(0, paid - total);
  const paymentParts = parsePaymentBreakdown(sale);
  const discMatch = (sale.notes || '').match(/Chegirma:\s*([\d\s,.]+)/);
  const discountAmt = discMatch ? parseFloat(discMatch[1].replace(/[^\d.]/g, '')) || 0 : 0;
  const customerPhone = sale.customer_full_phone || sale.customer_phone;
  const invoiceUrl = `${window.location.origin}/invoice/${sale.order_ref || sale.id}`;
  const grouped = groupInvoiceRows(rows);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-base font-bold text-gray-900">
          Schyot-faktura{sale.order_ref ? ` № ${sale.order_ref}` : ''}
        </h1>
        <div className="flex gap-1.5">
          <button onClick={() => navigate(-1)} className="btn-secondary btn-sm text-xs">
            <ArrowLeft size={12} /> Orqaga
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm text-xs">
            <Printer size={12} /> Chop
          </button>
          <button onClick={() => { downloadQR('invoice-qr-canvas', `qr-${sale.order_ref || sale.id}`); toast.success('QR kod yuklab olindi'); }} className="btn-secondary btn-sm text-xs">
            <Download size={12} /> QR
          </button>
          <button onClick={downloadPdf} className="btn-primary btn-sm text-xs">
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      {/* Faktura */}
      <div id="invoice-print" className="card p-4 max-w-2xl mx-auto print:shadow-none print:border-none text-[13px]">
        {/* Header — yetkazib beruvchi rekvizitlari + QR */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-3 gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">{COMPANY.name}</h2>
            <div className="text-[11px] text-gray-500 leading-snug mt-0.5 space-y-px">
              <div>Манзил: {COMPANY.address}</div>
              <div>Тел: {COMPANY.phone} · ИНН: {COMPANY.inn}</div>
              <div>Х/р: {COMPANY.account} · МФО: {COMPANY.mfo}</div>
              <div>Банк: {COMPANY.bank}</div>
            </div>
          </div>
          <div className="flex flex-col items-center flex-shrink-0">
            <QRCodeSVG id="invoice-qr" value={invoiceUrl} size={64} />
            <QRCodeCanvas id="invoice-qr-canvas" value={invoiceUrl} size={512} className="hidden" />
            <span className="text-[9px] text-gray-400 mt-0.5">Tizimda ko'rish</span>
          </div>
        </div>

        {/* Faktura raqami + sana */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">SCHYOT-FAKTURA № {sale.order_ref || sale.id}</h3>
          <span className="text-xs text-gray-500">Sana: {new Date(sale.sale_date).toLocaleDateString('uz-UZ')}</span>
        </div>

        {/* Sotuvchi / Xaridor — ixcham 1 qator */}
        <div className="flex justify-between text-xs text-gray-600 mb-3">
          <div>
            <span className="text-gray-400">Sotuvchi: </span>
            <span className="font-medium text-gray-800">{sale.created_by_name || COMPANY.name}</span>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Xaridor: </span>
            <span className="font-medium text-gray-800">
              {sale.customer_full_name || sale.customer_name || "Noma'lum"}
            </span>
            {customerPhone && <span className="text-gray-400"> · {customerPhone}</span>}
          </div>
        </div>

        {/* Jadval */}
        <table className="w-full text-[13px] mb-3">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500 text-xs">
              <th className="text-left py-1 w-6">#</th>
              <th className="text-left py-1">Mahsulot</th>
              <th className="text-center py-1 w-12">Son</th>
              <th className="text-right py-1 w-20">Narx</th>
              <th className="text-right py-1 w-24">Summa</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g, i) => {
              const hasColor = g.items.some(x => x.rang && String(x.rang).trim());
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 text-gray-400">{i + 1}</td>
                  <td className="py-1">
                    <span className="font-medium text-gray-900">{g.product_name}</span>
                    {hasColor && (
                      <span className="ml-1.5 text-[11px] text-gray-400">
                        {g.items.map((x, j) => (
                          <span key={j} className="inline-flex items-center gap-0.5 mr-2">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: RANG_COLORS[x.rang] || '#999', border: '1px solid #ddd' }} />
                            {rangLabel(x.rang)}:{x.quantity}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-center">{g.qty}</td>
                  <td className="py-1 text-right text-gray-600">{fmt(g.unit_price)}</td>
                  <td className="py-1 text-right font-semibold text-blue-700">{fmt(g.sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Jami + To'lov */}
        <div className="flex items-start justify-between pt-1">
          <div className="text-xs text-gray-500 space-y-0.5">
            {/* To'lov usullari faqat dastlabki to'lov summasiga mos kelsa ko'rsatamiz
                (qarz to'lovlari notes'ga yozilmaydi — shu sabab umumiy "To'langan"ni alohida chiqaramiz) */}
            {paymentParts.length > 0 && Math.abs(paymentParts.reduce((s, p) => s + p.amount, 0) - paid) < 1 &&
              paymentParts.map((p, i) => (
                <div key={i}>{p.icon} {p.label}: <span className="font-medium text-gray-700">{fmt(p.amount)}</span></div>
              ))}
            {paid > 0 && <div className="text-green-600 font-medium">✅ To'langan: {fmt(paid)}</div>}
            {debt > 0 && <div className="text-red-500 font-medium">📝 Qarz: {fmt(debt)}</div>}
            {credit > 0 && <div className="text-blue-600 font-medium">💰 Haqdor (oshiqcha): +{fmt(credit)}</div>}
            {paid <= 0 && debt <= 0 && credit <= 0 && <div>{getPaymentLabel(sale)}</div>}
          </div>
          <div className="text-right">
            {discountAmt > 0 && (
              <>
                <div className="text-[11px] text-gray-500">Oraliq: {fmt(total + discountAmt)} so'm</div>
                <div className="text-[11px] text-rose-600 mb-0.5">Chegirma: −{fmt(discountAmt)} so'm</div>
              </>
            )}
            <span className="text-xs text-gray-400">Jami: </span>
            <span className="text-xl font-bold text-blue-700">{fmt(total)} <span className="text-sm font-medium">so'm</span></span>
          </div>
        </div>

        {/* Mijoz balansi — eski qarzlar bilan */}
        {sale.balance_after != null && (sale.balance_before !== 0 || sale.balance_after !== 0) && (
          <div className="mt-3 pt-2 border-t border-dashed border-gray-200 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Savdodan oldingi balans:</span>
              <span className={`font-semibold ${sale.balance_before < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(sale.balance_before)} so'm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Savdodan keyingi balans:</span>
              <span className={`font-bold ${sale.balance_after < 0 ? 'text-red-600' : 'text-blue-700'}`}>{balfmt(sale.balance_after)} so'm</span>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-300 mt-4 text-center">
          TEKNOPLAST tizimi · QR kod orqali tekshiring
        </p>
      </div>
    </div>
  );
}
