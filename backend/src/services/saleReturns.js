/**
 * Sotuvdan qaytarish (vozvrat) — ombor va moliyani avtomatik to'g'rilaydi.
 * Qisman qaytarish mumkin; sabab majburiy.
 *
 * Jadval idempotent yaratiladi (PG va SQLite). Mavjud sales/payments
 * mantig'iga tegmaydi — har bir vozvrat alohida yozuv sifatida saqlanadi.
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';
const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS sale_returns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID,
      product_id UUID,
      customer_id UUID,
      quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
      unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      refund_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      rang VARCHAR(40),
      reason TEXT NOT NULL,
      return_date DATE,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS sale_returns (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      sale_id TEXT,
      product_id TEXT,
      customer_id TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      rang TEXT,
      reason TEXT NOT NULL,
      return_date TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

async function ensureReturnsSchema() {
  if (_ready) return;
  try {
    await db.query(DDL);
    // Brak/ziyon uchun yangi ustunlar — idempotent (mavjud bazaga ham qo'shiladi)
    //  condition: 'GOOD' (yaxshi — omborga qaytadi) | 'DEFECTIVE' (brak — ziyon)
    //  loss_amount: brak bo'lsa ziyon summasi
    const addCols = USE_PG
      ? [
          `ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS condition VARCHAR(20) DEFAULT 'GOOD'`,
          `ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS loss_amount NUMERIC(18,2) DEFAULT 0`,
        ]
      : [
          `ALTER TABLE sale_returns ADD COLUMN condition TEXT DEFAULT 'GOOD'`,
          `ALTER TABLE sale_returns ADD COLUMN loss_amount REAL DEFAULT 0`,
        ];
    for (const sql of addCols) {
      try { await db.query(sql); } catch (e) { /* ustun allaqachon mavjud — o'tkazamiz */ }
    }
    _ready = true;
  } catch (e) {
    console.error('Sale returns DDL xato:', e.message);
  }
}

module.exports = { ensureReturnsSchema };
