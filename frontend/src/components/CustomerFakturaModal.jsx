import { X, Printer } from 'lucide-react';
import { COMPANY } from '../constants/company';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

// Mijozning barcha harakatlari (xarid + to'lov + vozvrat) bo'yicha schyot-faktura.
// rows — [{ date, type, label, sign, amount }], totals — { xarid, tolov, vozvrat, qoldiq }.
export default function CustomerFakturaModal({ customer, rows = [], totals = {}, onClose }) {
  if (!customer) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 bg-white rounded-full p-1 shadow print:hidden">
          <X size={18} />
        </button>
        <div id="customer-faktura-print" className="px-6 py-6 text-[13px] text-gray-900">
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
            <h3 className="text-sm font-bold">MIJOZ SCHYOT-FAKTURASI — BARCHA HARAKATLAR</h3>
            <span className="text-xs text-gray-500">Sana: {new Date().toLocaleDateString('uz-UZ')}</span>
          </div>

          <div className="text-xs text-gray-600 mb-3">
            <span className="text-gray-400">Xaridor: </span>
            <span className="font-medium text-gray-800">{customer.name}</span>
            {customer.phone && <span className="text-gray-400"> · {customer.phone}</span>}
          </div>

          <table className="w-full text-[13px] mb-3">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500 text-xs">
                <th className="text-left py-1 w-24">Sana</th>
                <th className="text-left py-1 w-20">Turi</th>
                <th className="text-left py-1">Tafsilot</th>
                <th className="text-right py-1 w-32">Summa</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={4} className="py-3 text-center text-gray-400">Harakatlar yo'q</td></tr>
              ) : rows.map((e, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 whitespace-nowrap">{new Date(e.date).toLocaleDateString('uz-UZ')}</td>
                  <td className="py-1">{e.type}</td>
                  <td className="py-1 text-gray-700">{e.label}</td>
                  <td className={`py-1 text-right font-semibold ${e.sign < 0 ? 'text-green-700' : 'text-blue-700'}`}>
                    {e.sign < 0 ? '−' : '+'}{fmt(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-1.5" colSpan={3}>Qoldiq qarz</td>
                <td className="py-1.5 text-right text-red-600">{fmt(totals.qoldiq)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-xs text-gray-600 border-t border-gray-200 pt-2">
            <div>Jami xarid: <span className="font-semibold text-blue-700">{fmt(totals.xarid)}</span></div>
            <div>Jami to'langan: <span className="font-semibold text-green-700">{fmt(totals.tolov)}</span></div>
            <div>Jami vozvrat: <span className="font-semibold text-orange-700">{fmt(totals.vozvrat)}</span></div>
            <div>Qoldiq qarz: <span className="font-bold text-red-600">{fmt(totals.qoldiq)} so'm</span></div>
          </div>

          <div className="flex justify-between mt-10 text-xs text-gray-600">
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Yetkazib beruvchi (imzo)</div></div>
            <div className="text-center"><div className="border-t border-gray-400 w-44 pt-1">Xaridor (imzo)</div></div>
          </div>

          <p className="text-[10px] text-gray-300 mt-4 text-center">TEKNOPLAST tizimi · mijoz hisoboti</p>
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
