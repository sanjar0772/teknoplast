/**
 * Inventarizatsiya tarixi — har bir sanab-tekshirishda o'zgargan mahsulot uchun
 * bitta yozuv saqlanadi: dastlabki qoldiq, sanalган qoldiq, farq (+/−), sabab, kim.
 *
 * Jadval idempotent yaratiladi (PG va SQLite). Ombor qoldig'i (products.stock_quantity)
 * alohida to'g'rilanadi — bu jadval faqat TARIX/hisobot uchun.
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';
const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS inventory_audits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID,
      product_name TEXT,
      rang VARCHAR(40),
      old_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
      new_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
      delta NUMERIC(14,3) NOT NULL DEFAULT 0,
      reason TEXT,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS inventory_audits (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      product_id TEXT,
      product_name TEXT,
      rang TEXT,
      old_qty REAL NOT NULL DEFAULT 0,
      new_qty REAL NOT NULL DEFAULT 0,
      delta REAL NOT NULL DEFAULT 0,
      reason TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

async function ensureInventoryAuditSchema() {
  if (_ready) return;
  try {
    await db.query(DDL);
    _ready = true;
  } catch (e) {
    console.error('Inventory audit DDL xato:', e.message);
  }
}

module.exports = { ensureInventoryAuditSchema };
