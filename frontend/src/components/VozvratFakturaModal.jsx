import { X, Printer } from 'lucide-react';
import { COMPANY } from '../constants/company';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Vozvrat schyot-fakturasi — rasmiy hujjat ko'rinishida (chek emas).
// ret — sale_returns yozuvi (product_name, quantity, unit_price, amount, refund_amount,
// loss_amount, condition, reason, rang, return_date, order_ref, customer_name).
export default function VozvratFakturaModal({ ret, customerName, onClose }) {
  if (!ret) return null;
  const defective = ret.condition === 'DEFECTIVE';
  const no = ret.order_ref || (ret.id ? String(ret.id).slice(0, 8) : '—');
  const customer = customerName || ret.customer_name || "Noma'lum";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow print:hidden">
          <X size={18} />
        </button>
        <div id="vozvrat-faktura-print" className="px-6 py-6 text-[13px] text-gray-900">
          {/* Header — yetkazib beruvchi rekvizitlari */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-3 gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight">{COMPANY.name}</h2>
              <div className="text-[11px] text-gray-500 leading-snug mt-0.5 space-y-px">
                <div>Манзил: {COMPANY.address}</div>
                <div>Тел: {COMPANY.phone} · ИНН: {COMPANY.inn}</div>
                <div>Х/р: {COMPANY.account} · МФО: {COMPANY.mfo}</div>
                <div>Банк: {COMPANY.bank}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">VOZVRAT SCHYOT-FAKTURASI № {no}</h3>
            <span className="text-xs text-gray-500">Sana: {new Date(ret.return_date || ret.created_at).toLocaleDateString('uz-UZ')}</span>
          </div>

          <div className="flex justify-between text-xs text-gray-600 mb-3">
            <div><span className="text-gray-400">Sotuvchi: </span><span className="font-medium text-gray-800">{COMPANY.name}</span></div>
            <div className="text-right"><span className="text-gray-400">Xaridor: </span><span className="font-medium text-gray-800">{customer}</span></div>
          </div>

          <table className="w-full text-[13px] mb-3">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500 text-xs">
                <th className="text-left py-1 w-6">#</th>
                <th className="text-left py-1">Qaytarilgan mahsulot</th>
                <th className="text-center py-1 w-16">Soni</th>
                <th className="text-right py-1 w-24">Narx</th>
                <th className="text-right py-1 w-28">Summa</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1 text-gray-400">1</td>
                <td className="py-1">
                  <span className="font-medium text-gray-900">{ret.product_name || 'Mahsulot'}</span>
                  {ret.rang && <span className="ml-1.5 text-[11px] text-gray-400">{ret.rang}</span>}
                </td>
                <td className="py-1 text-center">{fmt(ret.quantity)} {ret.unit || 'dona'}</td>
                <td className="py-1 text-right text-gray-600">{fmt(ret.unit_price)}</td>
                <td className="py-1 text-right font-semibold text-blue-700">{fmt(ret.amount)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex items-start justify-between pt-1">
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>Holati: <span className="font-medium text-gray-700">{defective ? 'Brak (ziyon)' : 'Omborga qaytdi'}</span></div>
              {defective && parseFloat(ret.loss_amount) > 0 && (
                <div className="text-red-500 font-medium">Ziyon: {fmt(ret.loss_amount)} so'm</div>
              )}
              {parseFloat(ret.refund_amount) > 0 && (
                <div className="text-blue-600 font-medium">Qaytarilgan pul: {fmt(ret.refund_amount)} so'm</div>
              )}
              {ret.reason && <div>Sabab: <span className="text-gray-700">{ret.reason}</span></div>}
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">Vozvrat summasi: </span>
              <span className="text-xl font-bold text-blue-700">{fmt(ret.amount)} <span className="text-sm font-medium">so'm</span></span>
            </div>
          </div>

          <div className="flex justify-between mt-10 text-xs text-gray-600">
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Qabul qildi (imzo)</div></div>
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Xaridor (imzo)</div></div>
          </div>

          <p className="text-[10px] text-gray-300 mt-4 text-center">TEKNOPLAST tizimi · vozvrat hujjati</p>
        </div>

        <div className="flex gap-2 px-6 pb-5 print:hidden">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Yopish</button>
          <button onClick={() => window.print()} className="btn-primary flex-1 text-sm">
            <Printer size={13} /> Chop etish
          </button>
        </div>
      </div>
    </div>
  );
}
