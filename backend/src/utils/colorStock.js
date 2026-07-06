/**
 * Rang bo'yicha ombor (product_color_stock) bilan ishlash.
 * `q` — query funksiyasi: tranzaksiya ichida client.query, aks holda db.query.
 * rang bo'sh ('') bo'lsa "Rangsiz" bucket sifatida saqlanadi.
 */

// Rang bo'yicha ombordagi sonni o'qiydi
async function getColorStock(q, product_id, rang) {
  const key = rang || '';
  const r = await q(
    'SELECT quantity FROM product_color_stock WHERE product_id=$1 AND rang=$2',
    [product_id, key]
  );
  return r.rows.length ? parseFloat(r.rows[0].quantity || 0) : 0;
}

// Rang bo'yicha ombordagi sonni delta ga o'zgartiradi (delta manfiy bo'lishi mumkin).
// Ombor HECH QACHON 0 dan past tushmaydi (manfiy qoldiqdan himoya).
async function addColorStock(q, product_id, rang, delta) {
  if (!product_id || !delta) return;
  const key = rang || '';
  const ex = await q(
    'SELECT quantity FROM product_color_stock WHERE product_id=$1 AND rang=$2',
    [product_id, key]
  );
  if (ex.rows.length) {
    const cur = parseFloat(ex.rows[0].quantity || 0);
    const next = Math.max(0, cur + delta);
    await q(
      'UPDATE product_color_stock SET quantity = $1 WHERE product_id=$2 AND rang=$3',
      [next, product_id, key]
    );
  } else {
    // Yangi bucket — manfiy delta bo'lsa 0 dan boshlaymiz
    await q(
      'INSERT INTO product_color_stock (product_id, rang, quantity) VALUES ($1,$2,$3)',
      [product_id, key, Math.max(0, delta)]
    );
  }
}

// Rang buketiga "joy" (ombordagi joylashuv) ustunini qo'shish — idempotent, ham PG ham SQLite.
// Startда bir marta chaqiriladi (index.js). Ustun bor bo'lsa xato beriladi — e'tiborsiz qoldiramiz.
async function ensureColorLocationColumn() {
  const db = require('../db');
  const USE_PG = process.env.USE_POSTGRES === 'true';
  const sql = USE_PG
    ? `ALTER TABLE product_color_stock ADD COLUMN IF NOT EXISTS joy TEXT`
    : `ALTER TABLE product_color_stock ADD COLUMN joy TEXT`;
  try { await db.query(sql); } catch (e) { /* ustun allaqachon bor */ }
}

module.exports = { getColorStock, addColorStock, ensureColorLocationColumn };
