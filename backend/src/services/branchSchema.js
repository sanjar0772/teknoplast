/**
 * Filial (branch) tizimi — jadvallar va ustunlar.
 * - branches: filiallar ro'yxati (faqat sotuv nuqtasi, ishlab chiqarish yo'q)
 * - branch_stock: filial ombori (mahsulot + rang bo'yicha qoldiq)
 * - branch_transfers: zavod ↔ filial tovar ko'chirish tarixi
 * - users.branch_id: foydalanuvchi qaysi filialga biriktirilgan
 * - sales.branch_id: savdo qaysi filialdan bo'ldi (NULL = zavod)
 * - sales.delivery_type: PICKUP (o'zi oldi) | DELIVERY (dostavka)
 * Idempotent — har startda xavfsiz chaqiriladi (saleReturns bilan bir xil uslub).
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';

const DDL_BRANCHES = USE_PG
  ? `CREATE TABLE IF NOT EXISTS branches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      address TEXT,
      phone VARCHAR(40),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

const DDL_STOCK = USE_PG
  ? `CREATE TABLE IF NOT EXISTS branch_stock (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_id UUID NOT NULL,
      product_id UUID NOT NULL,
      rang VARCHAR(40),
      quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS branch_stock (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      branch_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      rang TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )`;

const DDL_TRANSFERS = USE_PG
  ? `CREATE TABLE IF NOT EXISTS branch_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_id UUID NOT NULL,
      product_id UUID NOT NULL,
      rang VARCHAR(40),
      quantity NUMERIC(14,3) NOT NULL,
      direction VARCHAR(6) NOT NULL DEFAULT 'IN',
      note TEXT,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS branch_transfers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      branch_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      rang TEXT,
      quantity REAL NOT NULL,
      direction TEXT NOT NULL DEFAULT 'IN',
      note TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

async function ensureBranchSchema() {
  if (_ready) return;
  try {
    await db.query(DDL_BRANCHES);
    await db.query(DDL_STOCK);
    await db.query(DDL_TRANSFERS);
    // Mavjud jadvallarga ustun qo'shish — idempotent.
    // MUHIM: branch_id NULL = ZAVOD (asosiy tizim). Filial foydalanuvchisida branch_id bo'ladi.
    // products/customers/sale_returns ham filial bo'yicha to'liq ajratiladi (asosiy tizimga tegmaydi).
    const addCols = USE_PG
      ? [
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID`,
          `ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch_id UUID`,
          `ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(12) DEFAULT 'PICKUP'`,
          `ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID`,
          `ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID`,
          `ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS branch_id UUID`,
        ]
      : [
          `ALTER TABLE users ADD COLUMN branch_id TEXT`,
          `ALTER TABLE sales ADD COLUMN branch_id TEXT`,
          `ALTER TABLE sales ADD COLUMN delivery_type TEXT DEFAULT 'PICKUP'`,
          `ALTER TABLE products ADD COLUMN branch_id TEXT`,
          `ALTER TABLE customers ADD COLUMN branch_id TEXT`,
          `ALTER TABLE sale_returns ADD COLUMN branch_id TEXT`,
        ];
    for (const sql of addCols) {
      try { await db.query(sql); } catch (e) { /* ustun allaqachon mavjud */ }
    }
    _ready = true;
    console.log('✅ Filial (branch) sxemasi tayyor');
  } catch (e) {
    console.error('Branch DDL xato:', e.message);
  }
}

// Filial omboriga qo'shish/ayirish — ON CONFLICT ishlatmaymiz (SQLite adapter
// cheklovi: ON CONFLICT haqiqiy UNIQUE indeks talab qiladi). SELECT → UPDATE/INSERT.
async function addBranchStock(q, branchId, productId, rang, delta) {
  const r = (rang && String(rang).trim()) ? String(rang).trim() : null;
  const cond = r === null ? "(rang IS NULL OR rang = '')" : 'rang = $3';
  const params = r === null ? [branchId, productId] : [branchId, productId, r];
  const found = await q(
    `SELECT id, quantity FROM branch_stock WHERE branch_id = $1 AND product_id = $2 AND ${cond}`,
    params
  );
  if (found.rows.length) {
    await q(
      `UPDATE branch_stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
      [delta, found.rows[0].id]
    );
  } else {
    await q(
      `INSERT INTO branch_stock (branch_id, product_id, rang, quantity) VALUES ($1, $2, $3, $4)`,
      [branchId, productId, r, delta]
    );
  }
}

// Filial omboridagi qoldiq (mahsulot + rang bo'yicha)
async function getBranchStock(q, branchId, productId, rang) {
  const r = (rang && String(rang).trim()) ? String(rang).trim() : null;
  const cond = r === null ? "(rang IS NULL OR rang = '')" : 'rang = $3';
  const params = r === null ? [branchId, productId] : [branchId, productId, r];
  const res = await q(
    `SELECT COALESCE(SUM(quantity), 0) AS qty FROM branch_stock WHERE branch_id = $1 AND product_id = $2 AND ${cond}`,
    params
  );
  return parseFloat(res.rows[0]?.qty || 0);
}

// Zavod (asosiy) mahsulotlar katalogini filialga NUSXALASH.
// Faqat sotiladigan (TAYYOR) mahsulotlar; qoldiq 0 dan boshlanadi (filial o'zi kiritadi).
// Idempotent: filialda shu nomli mahsulot bo'lsa — qayta nusxalanmaydi (yangi mahsulotlarni
// keyin ham qo'shib olish uchun qayta ishga tushirsa bo'ladi). Zavod mahsulotlariga TEGMAYDI.
async function copyProductsToBranch(q, branchId) {
  if (!branchId) throw new Error('branchId kerak');
  const existing = (await q(
    'SELECT name FROM products WHERE branch_id = $1', [branchId]
  )).rows;
  const have = new Set(existing.map(r => String(r.name)));
  const main = (await q(
    `SELECT name, base_name, razmer, type, description, price, cost_price, unit, rang, kind
     FROM products
     WHERE branch_id IS NULL AND is_active = true AND (kind IS NULL OR kind != 'KOMPONENT')
       AND (description IS NULL OR description != 'MANUAL_DEBT')
     ORDER BY name`, []
  )).rows;
  let copied = 0;
  for (const p of main) {
    if (have.has(String(p.name))) continue;
    await q(
      `INSERT INTO products
         (name, base_name, razmer, type, description, price, cost_price,
          daily_production, stock_quantity, unit, rang, kind, is_active, branch_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
      [p.name, p.base_name || null, p.razmer || null, p.type || null, p.description || null,
       p.price || 0, p.cost_price || 0, 0, 0, p.unit || 'dona', p.rang || null,
       p.kind === 'KOMPONENT' ? 'KOMPONENT' : 'TAYYOR', true, branchId]
    );
    copied++;
  }
  return { copied, total_main: main.length };
}

module.exports = { ensureBranchSchema, addBranchStock, getBranchStock, copyProductsToBranch };
