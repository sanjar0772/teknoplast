// Texno-Innovator (bito.online) qarzdorlar ro'yxatini TEKNOPLAST bazasiga import qilish (idempotent).
//
// Mantiq (foydalanuvchi talabi bo'yicha):
//  - Har bir qarzdorni telefon yoki ism bo'yicha bazadagi mijoz bilan solishtiramiz.
//  - Topilsa — o'sha mijozga qarz qo'shamiz. Topilmasa — yangi mijoz yaratib, qarz qo'yamiz.
//  - Qarz "boshlang'ich qarz" sotuvi sifatida saqlanadi (maxsus placeholder mahsulotda),
//    shu tariqa u avtomatik mijoz kartasida, qarzdorlar ro'yxatida va Ahmadda ko'rinadi.
//
// Idempotentlik: bir mijozga import qarzi faqat BIR MARTA yoziladi (placeholder mahsulot
// bo'yicha tekshiriladi). Hammasi placeholder mahsulot + izoh bilan belgilangani uchun
// kerak bo'lsa keyin oson tozalash mumkin.

const db = require('../db');
const debtors = require('../data/debtors2026');

const PLACEHOLDER_NAME = 'Бошланғич қарз (импорт)';
const IMPORT_NOTE = 'Бошланғич қарз — bito import 2026-06-20';

// Telefonni normallashtirish: faqat raqamlar, oxirgi 9 ta (mamlakat kodisiz solishtirish)
function normPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : d;
}
// Ismni normallashtirish: trim + kichik harf + ortiqcha bo'shliqlarni siqish
function normName(n) {
  return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getOwnerUserId(client) {
  let r = await client.query("SELECT id FROM users WHERE role = $1 ORDER BY created_at LIMIT 1", ['OWNER']);
  if (r.rows.length) return r.rows[0].id;
  r = await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
  return r.rows.length ? r.rows[0].id : null;
}

async function ensurePlaceholderProduct(client) {
  const r = await client.query('SELECT id FROM products WHERE name = $1 LIMIT 1', [PLACEHOLDER_NAME]);
  if (r.rows.length) return r.rows[0].id;
  const ins = await client.query(
    `INSERT INTO products (name, type, description, price, daily_production, stock_quantity, unit, rang, kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [PLACEHOLDER_NAME, 'Хизмат', 'BITO_DEBT_IMPORT', 0, 0, 0, 'dona', null, 'KOMPONENT']
  );
  return ins.rows[0].id;
}

// Asosiy import. Qaytaradi: { created, matched, skipped, total, addedDebt }
async function importDebtors2026() {
  const client = await db.getClient();
  let created = 0, matched = 0, skipped = 0, addedDebt = 0;
  try {
    await client.query('BEGIN');

    const ownerId = await getOwnerUserId(client);
    if (!ownerId) throw new Error('OWNER foydalanuvchi topilmadi — import to\'xtatildi');
    const productId = await ensurePlaceholderProduct(client);
    const saleDate = new Date().toISOString().slice(0, 10);

    // Mavjud mijozlarni xotiraga olib, tez qidirish indekslari quramiz
    const allCust = await client.query('SELECT id, name, phone FROM customers');
    const byPhone = new Map(), byName = new Map();
    for (const c of allCust.rows) {
      const np = normPhone(c.phone); if (np) byPhone.set(np, c.id);
      const nn = normName(c.name);   if (nn && !byName.has(nn)) byName.set(nn, c.id);
    }

    for (const d of debtors) {
      const np = normPhone(d.phone);
      const nn = normName(d.name);
      let custId = (np && byPhone.get(np)) || byName.get(nn) || null;

      if (custId) {
        matched++;
      } else {
        const ins = await client.query(
          `INSERT INTO customers (name, phone, customer_type, notes, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [d.name, d.phone || null, 'RETAIL', 'bito import 2026-06-20', ownerId]
        );
        custId = ins.rows[0].id;
        created++;
        if (np) byPhone.set(np, custId);
        if (nn && !byName.has(nn)) byName.set(nn, custId);
      }

      // Idempotentlik: shu mijozda allaqachon import qarzi (placeholder sotuv) bormi?
      const exist = await client.query(
        'SELECT id FROM sales WHERE customer_id = $1 AND product_id = $2 LIMIT 1',
        [custId, productId]
      );
      if (exist.rows.length) { skipped++; continue; }

      const debt = Math.round(parseFloat(d.debt) || 0);
      if (debt <= 0) { skipped++; continue; }

      await client.query(
        `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
           customer_name, sale_date, status, payment_amount, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [productId, custId, 1, debt, debt, d.name, saleDate, 'PENDING', 0, IMPORT_NOTE, ownerId]
      );
      addedDebt += debt;
    }

    await client.query('COMMIT');
    return { created, matched, skipped, total: debtors.length, addedDebt };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Server bootda avtomatik — FAQAT BIR MARTA (sentinel: placeholder mahsulotda sotuv bormi).
async function ensureDebtors2026() {
  try {
    const r = await db.query(
      `SELECT COUNT(*) as cnt FROM sales s JOIN products p ON s.product_id = p.id WHERE p.name = $1`,
      [PLACEHOLDER_NAME]
    );
    const cnt = parseInt(r.rows[0]?.cnt ?? r.rows[0]?.['COUNT(*)'] ?? 0);
    if (cnt > 0) {
      console.log('💳 Qarzdorlar allaqachon import qilingan — o\'tkazildi');
      return;
    }
    const res = await importDebtors2026();
    console.log(`💳 Qarzdorlar import qilindi — ${res.created} yangi mijoz, ${res.matched} mavjudga qo'shildi, ${res.skipped} o'tkazildi (jami qarz: ${Math.round(res.addedDebt).toLocaleString()})`);
  } catch (e) {
    console.error('Qarzdorlar seed xato:', e.message);
  }
}

module.exports = { importDebtors2026, ensureDebtors2026, PLACEHOLDER_NAME };
