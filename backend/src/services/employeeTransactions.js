/**
 * Xodim moliyaviy amallari — Premiya, Qo'shimcha oylik, Avans, Jarima, Boshqa rashodlar.
 * Oy davomida istalgan kuni qo'shiladi (masalan 15-kuni avans berilsa).
 * "Oylik hisoblash" (salaries.js /calculate) shu oyning barcha amallarini
 * yig'ib, PREMIYA+QOSHIMCHA ni bonusga, AVANS+JARIMA+BOSHQA ni jarimaga qo'shadi.
 *
 * Ishora (yo'nalish) turga qarab avtomatik: foydalanuvchi doim musbat summa kiritadi.
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';

const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS employee_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id),
      type VARCHAR(20) NOT NULL,
      amount NUMERIC(16,2) NOT NULL DEFAULT 0,
      txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
      month VARCHAR(7) NOT NULL,
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS employee_transactions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      txn_date TEXT NOT NULL DEFAULT (date('now')),
      month TEXT NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

// Turlar: PREMIYA/QOSHIMCHA — oylikka QO'SHILADI (bonus); AVANS/JARIMA/BOSHQA — AYRILADI (jarima)
const TYPES = ['PREMIYA', 'QOSHIMCHA', 'AVANS', 'JARIMA', 'BOSHQA'];
const ADD_TYPES = ['PREMIYA', 'QOSHIMCHA'];   // sof maoshga qo'shiladi
const SUB_TYPES = ['AVANS', 'JARIMA', 'BOSHQA']; // sof maoshdan ayriladi

let _ready = false;
async function ensureEmployeeTransactionsSchema() {
  if (_ready) return;
  try {
    await db.query(DDL);
    _ready = true;
  } catch (e) {
    console.error('employee_transactions DDL xato:', e.message);
  }
}

// Berilgan oy uchun xodimning PREMIYA+QOSHIMCHA yig'indisi (bonusga qo'shiladi)
// va AVANS+JARIMA+BOSHQA yig'indisi (jarimaga qo'shiladi) — oylik hisoblashda ishlatiladi.
async function getMonthTotals(employeeId, month) {
  const r = await db.query(
    'SELECT type, COALESCE(SUM(amount),0) AS total FROM employee_transactions WHERE employee_id=$1 AND month=$2 GROUP BY type',
    [employeeId, month]
  );
  let add = 0, sub = 0;
  for (const row of r.rows) {
    const t = parseFloat(row.total) || 0;
    if (ADD_TYPES.includes(row.type)) add += t;
    else if (SUB_TYPES.includes(row.type)) sub += t;
  }
  return { add, sub };
}

module.exports = { ensureEmployeeTransactionsSchema, getMonthTotals, TYPES, ADD_TYPES, SUB_TYPES };
