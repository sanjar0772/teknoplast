/**
 * Xom ashyo qabul aktlari — server jadvali.
 * Sotuvchidan xom ashyo qabul qilinadi: tarozida tortiladi (brutto − tara = netto),
 * summa belgilanadi, sotuvchi va oluvchi imzolaydi (chekda imzo joylari).
 * Har qabul avtomatik Xarajatlar (RAW_MATERIAL) sifatida ham yoziladi — expense_id bog'lanadi.
 * Idempotent — har startda xavfsiz chaqiriladi (taroziSchema bilan bir xil uslub).
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';

const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS xom_ashyo_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_no INTEGER,
      sotuvchi TEXT,
      oluvchi TEXT,
      mahsulot TEXT,
      brutto NUMERIC(14,2) NOT NULL DEFAULT 0,
      tara NUMERIC(14,2) NOT NULL DEFAULT 0,
      netto NUMERIC(14,2) NOT NULL DEFAULT 0,
      summa NUMERIC(16,2) NOT NULL DEFAULT 0,
      izoh TEXT,
      sana VARCHAR(10),
      expense_id UUID,
      created_by UUID,
      branch_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS xom_ashyo_receipts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      receipt_no INTEGER,
      sotuvchi TEXT,
      oluvchi TEXT,
      mahsulot TEXT,
      brutto REAL NOT NULL DEFAULT 0,
      tara REAL NOT NULL DEFAULT 0,
      netto REAL NOT NULL DEFAULT 0,
      summa REAL NOT NULL DEFAULT 0,
      izoh TEXT,
      sana TEXT,
      expense_id TEXT,
      created_by TEXT,
      branch_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

async function ensureXomAshyoSchema() {
  if (_ready) return;
  try {
    await db.query(DDL);
    _ready = true;
    console.log('✅ Xom ashyo sxemasi tayyor');
  } catch (e) {
    console.error('Xom ashyo DDL xato:', e.message);
  }
}

module.exports = { ensureXomAshyoSchema };
