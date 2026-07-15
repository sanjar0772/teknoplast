// product_recipes jadvali — mahsulot xom ashyo retsepti (ko'p ingredient, birlik: kg yoki g).
const USE_PG = process.env.USE_POSTGRES === 'true';
const db = require('../db');

const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS product_recipes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      raw_material_id UUID REFERENCES raw_materials(id),
      ingredient_type VARCHAR(20) NOT NULL DEFAULT 'XOM_ASHYO',
      qty_per_unit NUMERIC(16,4) NOT NULL DEFAULT 0,
      unit VARCHAR(10) NOT NULL DEFAULT 'g',
      rang VARCHAR(40),
      note VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, raw_material_id)
    )`
  : `CREATE TABLE IF NOT EXISTS product_recipes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      raw_material_id TEXT REFERENCES raw_materials(id),
      ingredient_type TEXT NOT NULL DEFAULT 'XOM_ASHYO',
      qty_per_unit REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'g',
      rang TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, raw_material_id)
    )`;

async function ensureRecipeSchema() {
  try {
    await db.query(DDL);
    // BOM komponent vazni (gramm) — PG uchun migratsiya
    await db.query('ALTER TABLE product_bom ADD COLUMN weight_grams REAL DEFAULT 0').catch(() => {});
    // Maxsus ingredientlar (kalsiy/rang/drobilka) — eski jadvalga ustunlar (PG; SQLite'da
    // db/index.js dagi relaxRecipeRawMaterialConstraint qayta quradi)
    await db.query("ALTER TABLE product_recipes ADD COLUMN ingredient_type VARCHAR(20) NOT NULL DEFAULT 'XOM_ASHYO'").catch(() => {});
    await db.query('ALTER TABLE product_recipes ADD COLUMN rang VARCHAR(40)').catch(() => {});
    if (USE_PG) {
      await db.query('ALTER TABLE product_recipes ALTER COLUMN raw_material_id DROP NOT NULL').catch(() => {});
    }
    console.log('🧪 product_recipes jadvali tayyor');
  } catch (e) {
    console.error('Recipe schema xato:', e.message);
  }
}

module.exports = { ensureRecipeSchema };
