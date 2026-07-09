// Mijozning barcha harakatlari (xarid + to'lov + vozvrat) — birlashtirilgan ro'yxat.
// customersAPI.getById() qaytargan detail obyektidan { rows, totals } yasaydi.
// Xarid asl summasida (joriy total + shu savdoning vozvratlari) olinadi, shunda
// xarid − to'lov − vozvrat = qoldiq qarz (stats bilan mos).
// CustomersPage va DebtsPage (Haqdorlar fakturasi) shu funksiyani ishlatadi.

const PAY_METHOD = { CASH: '💵 Naqd', CARD: '💳 Karta', TRANSFER: '🏦 Bank', PAYME: '📱 Pay Me', CLICK: '⚡ Click', DISCOUNT: '🏷️ Skidka', PURCHASE: '📥 Sexdan tovar', OTHER: 'Boshqa' };

// Bitta "to'lov" bosilishi bir nechta qarzga (savdoga) taqsimlanib, bir nechta
// payments qatoriga yozilishi mumkin (FIFO). Ularning barchasi bir xil payment_ref
// bilan belgilanadi — shu bo'yicha guruhlab, BITTA operatsiya = BITTA qator qilamiz,
// shunda kiritilgan summa (masalan 4 000 000) fakturada ham aynan shu summa bo'lib chiqadi.
// Eski (payment_ref'siz) yozuvlar daqiqa+usul bo'yicha guruhlanadi.
export function groupPaymentsByOperation(payments) {
  const groups = {};
  const order = [];
  (payments || []).forEach(p => {
    const amt = parseFloat(p.amount) || 0;
    const key = p.payment_ref
      || (p.created_at ? `${String(p.created_at).slice(0, 16)}|${p.method || ''}` : p.id);
    if (!groups[key]) { groups[key] = { date: p.payment_date, methods: new Set(), amount: 0 }; order.push(key); }
    const g = groups[key];
    g.amount += amt;
    if (p.method) g.methods.add(p.method);
  });
  return order.map(key => groups[key]);
}

export function buildCustomerLedger(detail) {
  if (!detail) return { rows: [], totals: { xarid: 0, tolov: 0, vozvrat: 0, qoldiq: 0 } };
  const retBySale = {};
  (detail.returns || []).forEach(r => {
    if (r.sale_id) retBySale[r.sale_id] = (retBySale[r.sale_id] || 0) + (parseFloat(r.amount) || 0);
  });
  const rows = [];
  let xarid = 0, tolov = 0, vozvrat = 0;
  const salesByRef = {};
  (detail.sales || []).forEach(s => {
    const ref = s.order_ref || s.id;
    if (!salesByRef[ref]) salesByRef[ref] = [];
    salesByRef[ref].push(s);
  });
  Object.entries(salesByRef).forEach(([ref, items]) => {
    const totalAmt = items.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0) + (retBySale[s.id] || 0), 0);
    xarid += totalAmt;
    if (items.length === 1) {
      rows.push({ date: items[0].sale_date, type: 'Xarid', label: items[0].product_name, sign: 1, amount: totalAmt });
    } else {
      rows.push({
        date: items[0].sale_date, type: 'Xarid', sign: 1, amount: totalAmt, ref,
        label: `${items.length} ta mahsulot`,
        items: items.map(s => ({
          name: s.product_name, quantity: s.quantity, unit: s.unit,
          amount: (parseFloat(s.total_amount) || 0) + (retBySale[s.id] || 0),
        })),
      });
    }
  });
  // To'lovlarni OPERATSIYA bo'yicha jamlaymiz — har operatsiya (bitta "To'lov" bosilishi) = 1 qator.
  (detail.payments || []).forEach(p => { tolov += parseFloat(p.amount) || 0; });
  groupPaymentsByOperation(detail.payments).forEach(g => {
    const labels = [...g.methods].map(m => PAY_METHOD[m] || m);
    rows.push({ date: g.date, type: "To'lov", label: labels.join(', ') || '—', sign: -1, amount: g.amount });
  });
  (detail.returns || []).forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    vozvrat += amt;
    rows.push({ date: r.return_date, type: 'Vozvrat', label: `${r.product_name || 'Mahsulot'}${r.rang ? ' · ' + r.rang : ''}`, sign: -1, amount: amt });
  });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  const qoldiq = detail.stats?.total_debt != null ? parseFloat(detail.stats.total_debt) : (xarid - tolov - vozvrat);
  return { rows, totals: { xarid, tolov, vozvrat, qoldiq } };
}
