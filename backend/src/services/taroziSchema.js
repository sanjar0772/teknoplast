/**
 * Tarozi (weighbridge) cheklari — server jadvali.
 * Avval faqat localStorage edi; endi chek serverga saqlanadi (admin ko'radi).
 * Idempotent — har startda xavfsiz chaqiriladi (agentSchema bilan bir xil uslub).
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';

const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS tarozi_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_no INTEGER,
      mashina VARCHAR(40),
      mahsulot TEXT,
      haydovchi TEXT,
      brutto NUMERIC(14,2) NOT NULL DEFAULT 0,
      tara NUMERIC(14,2) NOT NULL DEFAULT 0,
      netto NUMERIC(14,2) NOT NULL DEFAULT 0,
      sana VARCHAR(10),
      created_by UUID,
      branch_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS tarozi_receipts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      receipt_no INTEGER,
      mashina TEXT,
      mahsulot TEXT,
      haydovchi TEXT,
      brutto REAL NOT NULL DEFAULT 0,
      tara REAL NOT NULL DEFAULT 0,
      netto REAL NOT NULL DEFAULT 0,
      sana TEXT,
      created_by TEXT,
      branch_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

// Mashina turi (Damas, Labo, ...) — mavjud jadvalga ustun qo'shish (idempotent)
const ALTER_MASHINA_TURI = USE_PG
  ? `ALTER TABLE tarozi_receipts ADD COLUMN IF NOT EXISTS mashina_turi VARCHAR(40)`
  : `ALTER TABLE tarozi_receipts ADD COLUMN mashina_turi TEXT`;

let _ready = false;

async function ensureTaroziSchema() {
  if (_ready) return;
  try {
    await db.query(DDL);
    // Ustun allaqachon mavjud bo'lsa — SQLite xato beradi, e'tiborsiz qoldiramiz
    try { await db.query(ALTER_MASHINA_TURI); } catch (e) { /* ustun bor */ }
    _ready = true;
    console.log('✅ Tarozi sxemasi tayyor');
  } catch (e) {
    console.error('Tarozi DDL xato:', e.message);
  }
}

module.exports = { ensureTaroziSchema };
