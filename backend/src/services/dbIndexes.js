/**
 * Baza indekslari (v233 tizim upgrade) — so'rovlarni tezlashtirish.
 *
 * MA'LUMOTGA TEGMAYDI: indeks — jadval ustiga qo'shimcha "mundarija",
 * qatorlarni o'zgartirmaydi, faqat qidiruvni tezlashtiradi.
 * Idempotent: CREATE INDEX IF NOT EXISTS — har startupda xavfsiz chaqiriladi.
 * Har biri alohida try/catch — jadval/ustun bo'lmasa o'tkazib yuboriladi.
 */
const db = require('../db');

// Eng ko'p so'raladigan yo'llar bo'yicha (Tarix, Qarzlar, Maoshlar, Kassa, filial ajratish)
const INDEXES = [
  // Savdolar — sana, mijoz, filial, order_ref (kassa/faktura), mahsulot, holat
  `CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_order_ref ON sales(order_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`,
  // To'lovlar — savdoga bog'lash, sana, ref (kassa kunlik)
  `CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(payment_ref)`,
  // Ishlab chiqarish va oyliklar
  `CREATE INDEX IF NOT EXISTS idx_emp_prod_emp_month ON employee_production(employee_id, month)`,
  `CREATE INDEX IF NOT EXISTS idx_emp_prod_date ON employee_production(production_date)`,
  `CREATE INDEX IF NOT EXISTS idx_emp_txn_emp_month ON employee_transactions(employee_id, month)`,
  // Mijozlar/mahsulotlar — filial ajratish har so'rovda ishlatiladi
  `CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id)`,
  // Rang ombori
  `CREATE INDEX IF NOT EXISTS idx_pcs_product ON product_color_stock(product_id)`,
  // Vozvratlar
  `CREATE INDEX IF NOT EXISTS idx_returns_sale ON sale_returns(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_returns_customer ON sale_returns(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_returns_branch ON sale_returns(branch_id)`,
  // Filial ombori/transferlar
  `CREATE INDEX IF NOT EXISTS idx_branch_stock ON branch_stock(branch_id, product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_branch_transfers ON branch_transfers(branch_id)`,
  // Jurnal va eslatmalar
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON smart_alerts(is_resolved)`,
];

async function ensureIndexes() {
  let ok = 0, skipped = 0;
  for (const sql of INDEXES) {
    try { await db.query(sql); ok++; } catch (e) { skipped++; /* jadval/ustun yo'q — o'tkazamiz */ }
  }
  console.log(`⚡ Baza indekslari tayyor: ${ok} ta (${skipped} ta o'tkazildi)`);
}

module.exports = { ensureIndexes };
