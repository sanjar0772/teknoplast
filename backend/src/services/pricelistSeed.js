// Texno Innovator 2026 prayslistini bazaga yuklash (idempotent).
// Ham tugma (POST /api/products/import-pricelist), ham server boot uchun ishlatiladi.

const db = require('../db');
const pricelist = require('../data/pricelist2026');

// Asosiy upsert: lotin -> kirill nom, to'liq kod, Оқ rang.
// Mavjudini topib yangilaydi (ombor/narxga tegmaydi), yo'qini 1000 dona bilan qo'shadi.
// Qaytaradi: { created, updated, total }.
async function importPricelist2026() {
  const client = await db.getClient();
  let created = 0, updated = 0;
  try {
    await client.query('BEGIN');
    for (const item of pricelist) {
      // 1) kod (description) + narx bo'yicha, 2) bo'lmasa eski nom bo'yicha
      let existing = await client.query(
        'SELECT id FROM products WHERE description = $1 AND price = $2 LIMIT 1',
        [item.code, item.price]
      );
      if (!existing.rows.length) {
        existing = await client.query('SELECT id FROM products WHERE name = $1 LIMIT 1', [item.name]);
      }
      if (existing.rows.length) {
        await client.query(
          'UPDATE products SET name=$1, type=$2, description=$3, rang=$4, updated_at=NOW() WHERE id=$5',
          [item.name, `Kod ${item.code}`, item.code, 'Оқ', existing.rows[0].id]
        );
        updated++;
      } else {
        await client.query(
          'INSERT INTO products (name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, rang, kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [item.name, `Kod ${item.code}`, item.code || null, item.price, 0, 1000, null, 'dona', 'Оқ', 'TAYYOR']
        );
        created++;
      }
    }
    await client.query('COMMIT');
    return { created, updated, total: pricelist.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Server ishga tushganda avtomatik yuklash — FAQAT BIR MARTA.
// Sentinel ('Бачок 100л' nomli mahsulot) mavjud bo'lsa, demak allaqachon yuklangan —
// o'tkazib yuboramiz (qo'lda tahrirlangan mahsulotlar ustiga yozilmasin).
async function ensurePricelist2026() {
  try {
    const sentinel = await db.query('SELECT id FROM products WHERE name = $1 LIMIT 1', ['Бачок 100л']);
    if (sentinel.rows && sentinel.rows.length) {
      console.log('📋 Praysist 2026 allaqachon yuklangan — o\'tkazildi');
      return;
    }
    const res = await importPricelist2026();
    console.log(`📋 Praysist 2026 avtomatik yuklandi — ${res.created} yangi, ${res.updated} yangilandi (jami ${res.total})`);
  } catch (e) {
    console.error('Praysist seed xato:', e.message);
  }
}

module.exports = { importPricelist2026, ensurePricelist2026 };
