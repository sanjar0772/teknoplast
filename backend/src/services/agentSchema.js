/**
 * Agent tizimi — shaxsiy ma'lumotlar, GPS joylashuv, mijoz lokatsiyasi.
 * - users: passport, address, birth_date (agent shaxsiy ma'lumotlari)
 * - users: last_lat, last_lng, last_location_at (agentning oxirgi joylashuvi)
 * - customers: latitude, longitude (mijoz do'koni/manzili lokatsiyasi)
 * - agent_locations: joylashuv tarixi (kun davomida qayerlarda bo'lgani)
 * Idempotent — har startda xavfsiz chaqiriladi (branchSchema bilan bir xil uslub).
 */
const db = require('../db');

const USE_PG = process.env.USE_POSTGRES === 'true';

const DDL_LOCATIONS = USE_PG
  ? `CREATE TABLE IF NOT EXISTS agent_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      lat NUMERIC(10,6) NOT NULL,
      lng NUMERIC(10,6) NOT NULL,
      accuracy NUMERIC(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS agent_locations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

async function ensureAgentSchema() {
  if (_ready) return;
  try {
    await db.query(DDL_LOCATIONS);
    const addCols = USE_PG
      ? [
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS passport VARCHAR(40)`,
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`,
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date VARCHAR(10)`,
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lat NUMERIC(10,6)`,
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lng NUMERIC(10,6)`,
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP`,
          `ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,6)`,
          `ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,6)`,
        ]
      : [
          `ALTER TABLE users ADD COLUMN passport TEXT`,
          `ALTER TABLE users ADD COLUMN address TEXT`,
          `ALTER TABLE users ADD COLUMN birth_date TEXT`,
          `ALTER TABLE users ADD COLUMN last_lat REAL`,
          `ALTER TABLE users ADD COLUMN last_lng REAL`,
          `ALTER TABLE users ADD COLUMN last_location_at TEXT`,
          `ALTER TABLE customers ADD COLUMN latitude REAL`,
          `ALTER TABLE customers ADD COLUMN longitude REAL`,
        ];
    for (const sql of addCols) {
      try { await db.query(sql); } catch (e) { /* ustun allaqachon mavjud */ }
    }
    _ready = true;
    console.log('✅ Agent sxemasi tayyor');
  } catch (e) {
    console.error('Agent DDL xato:', e.message);
  }
}

module.exports = { ensureAgentSchema };
