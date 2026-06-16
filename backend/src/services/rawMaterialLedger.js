/**
 * Xom ashyo aylma daftari (movement ledger).
 *
 * Har bir xom ashyo +/- harakati shu daftarga yoziladi:
 *   KIRIM      — xarid/kirim (signed_qty = +qty)
 *   SARF       — ishlatildi/chiqim (signed_qty = -qty)
 *   KOREKSIYA  — qo'lda tuzatish (signed_qty = delta, ± bo'lishi mumkin)
 *
 * Bu daftar mavjud raw_materials.stock_balance mantig'iga TEGMAYDI — yonida
 * ishlaydi va istalgan davr uchun to'g'ri hisobot beradi:
 *   Yakuniy qoldiq = Boshlang'ich + Kirim - Sarf (+/- Koreksiya)
 *
 * Ikkala bazada ishlaydi: PostgreSQL (to'g'ridan-to'g'ri) va SQLite
 * (db qatlamidagi convertSQL PG-dialektni avtomatik o'giradi).
 */
const db = require('../db');

// DDL ni baza turiga qarab ajratamiz (db/index.js bilan bir xil yondashuv).
// MUHIM: convertSQL `gen_random_uuid()` ni avval 'UUID_PLACEHOLDER' ga o'giradi va
// UUID-PK qoidasi ishlamay qoladi — shu sabab SQLite uchun aniq SQLite DDL beramiz.
const USE_PG = process.env.USE_POSTGRES === 'true';
const DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS raw_material_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      raw_material_id UUID,
      material_name VARCHAR(120),
      unit VARCHAR(20),
      type VARCHAR(20) NOT NULL,
      qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      signed_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
      unit_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
      total_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
      supplier_name VARCHAR(120),
      note TEXT,
      moved_at DATE,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS raw_material_movements (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      raw_material_id TEXT,
      material_name TEXT,
      unit TEXT,
      type TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      signed_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      supplier_name TEXT,
      note TEXT,
      moved_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

let _ready = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function signedFor(type, qty) {
  if (type === 'SARF') return -Math.abs(qty);
  if (type === 'KIRIM') return Math.abs(qty);
  return qty; // KOREKSIYA — qty allaqachon ishorali (delta)
}

/**
 * Bitta harakatni daftarga yozadi.
 * @param runner client (tranzaksiya ichida) yoki db.query (mustaqil)
 */
async function recordMovement(runner, m) {
  const q = typeof runner === 'function' ? runner : runner.query.bind(runner);
  const qty = Math.abs(parseFloat(m.qty) || 0);
  const signed = signedFor(m.type, m.type === 'KOREKSIYA' ? (parseFloat(m.qty) || 0) : qty);
  const unitCost = parseFloat(m.unit_cost) || 0;
  const totalCost = m.total_cost != null ? parseFloat(m.total_cost) : Math.abs(signed) * unitCost;
  await q(
    `INSERT INTO raw_material_movements
       (raw_material_id, material_name, unit, type, qty, signed_qty, unit_cost, total_cost, supplier_name, note, moved_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      m.raw_material_id || null,
      m.material_name || null,
      m.unit || 'kg',
      m.type,
      Math.abs(signed),
      signed,
      unitCost,
      totalCost,
      m.supplier_name || null,
      m.note || null,
      m.moved_at || today(),
      m.created_by || null,
    ]
  );
}

/**
 * Daftar jadvalini yaratadi va (bo'sh bo'lsa) mavjud xom ashyolardan
 * boshlang'ich harakatlarni to'ldiradi. Crash-proof: xato bo'lsa ham
 * server ishdan chiqmaydi, mavjud oqimlar buzilmaydi.
 */
async function ensureLedger() {
  if (_ready) return;
  try {
    await db.query(DDL);
  } catch (e) {
    console.error('Ledger DDL xato:', e.message);
    return; // jadval yaratilmasa — backfill ham qilmaymiz
  }

  try {
    const cnt = await db.query('SELECT COUNT(*) AS c FROM raw_material_movements');
    const c = parseInt(cnt.rows?.[0]?.c ?? cnt.rows?.[0]?.count ?? 0, 10);
    if (c === 0) {
      const mats = await db.query(
        `SELECT id, name, unit, quantity, price_per_unit, stock_balance, supplier_name, received_date
         FROM raw_materials WHERE is_active = true`
      );
      for (const r of mats.rows) {
        const qty = parseFloat(r.quantity) || 0;
        const bal = parseFloat(r.stock_balance) || 0;
        const price = parseFloat(r.price_per_unit) || 0;
        const recvDate = (r.received_date && String(r.received_date).slice(0, 10)) || today();
        // Dastlabki KIRIM — butun kelgan miqdor
        if (qty > 0) {
          await recordMovement(db.query, {
            raw_material_id: r.id, material_name: r.name, unit: r.unit,
            type: 'KIRIM', qty, unit_cost: price, supplier_name: r.supplier_name,
            note: "Boshlang'ich qoldiq (avtomatik)", moved_at: recvDate,
          });
        }
        // Agar hozirgi qoldiq kelgan miqdordan kam bo'lsa — ishlatilgan qismni SARF qilamiz,
        // shunda daftar bo'yicha yakuniy qoldiq hozirgi stock_balance ga teng bo'ladi.
        const used = qty - bal;
        if (used > 0.0001) {
          await recordMovement(db.query, {
            raw_material_id: r.id, material_name: r.name, unit: r.unit,
            type: 'SARF', qty: used, unit_cost: price, supplier_name: r.supplier_name,
            note: "Boshlang'ich sarf (avtomatik)", moved_at: recvDate,
          });
        }
      }
      console.log(`📒 Xom ashyo daftari to'ldirildi: ${mats.rows.length} ta material`);
    }

    // Tekislash (reconciliation) — har boot'da bir marta.
    // Daftar bo'yicha yakuniy qoldiq haqiqiy stock_balance ga teng bo'lmasa
    // (masalan, chiqim daftarga yozilmay qolgan bo'lsa), farqni yozamiz:
    //   stock kam  -> SARF (ishlatilgan, ammo yozilmagan chiqim)
    //   stock ko'p -> KIRIM (yozilmagan kirim)
    // Idempotent: teng bo'lsa hech narsa qilmaydi -> ikki marta sanalmaydi.
    try {
      const all = await db.query(
        `SELECT id, name, unit, price_per_unit, supplier_name, stock_balance
           FROM raw_materials WHERE is_active = true`
      );
      let fixed = 0;
      for (const r of all.rows) {
        const led = await db.query(
          'SELECT COALESCE(SUM(signed_qty),0) AS closing FROM raw_material_movements WHERE raw_material_id = $1',
          [r.id]
        );
        const closing = parseFloat(led.rows?.[0]?.closing) || 0;
        const bal = parseFloat(r.stock_balance) || 0;
        const price = parseFloat(r.price_per_unit) || 0;
        const diff = bal - closing;
        if (Math.abs(diff) > 0.0001) {
          await recordMovement(db.query, {
            raw_material_id: r.id, material_name: r.name, unit: r.unit,
            type: diff < 0 ? 'SARF' : 'KIRIM', qty: Math.abs(diff),
            unit_cost: price, supplier_name: r.supplier_name,
            note: 'Tekislash (avtomatik)',
          });
          fixed++;
        }
      }
      if (fixed) console.log(`📒 Daftar tekislandi: ${fixed} ta material`);
    } catch (e) {
      console.error('Ledger tekislash xato:', e.message);
    }

    _ready = true;
  } catch (e) {
    console.error('Ledger backfill xato:', e.message);
  }
}

/**
 * Tanlangan davr uchun Boshlang'ich/Kirim/Sarf/Yakuniy qoldiqni
 * xom ashyo nomi bo'yicha birlashtiradi.
 */
async function getLedgerRangeSummary(start_date, end_date) {
  // Davr boshigacha bo'lgan harakatlar — boshlang'ich qoldiq
  const opening = await db.query(
    `SELECT material_name AS name, unit, COALESCE(SUM(signed_qty),0) AS opening
       FROM raw_material_movements WHERE moved_at < $1
      GROUP BY material_name, unit`,
    [start_date]
  );
  // Davr ichidagi kirim/sarf/koreksiya
  const inRange = await db.query(
    `SELECT material_name AS name, unit,
            COALESCE(SUM(CASE WHEN type='KIRIM' THEN qty ELSE 0 END),0)        AS kirim_qty,
            COALESCE(SUM(CASE WHEN type='KIRIM' THEN total_cost ELSE 0 END),0) AS kirim_cost,
            COALESCE(SUM(CASE WHEN type='SARF'  THEN qty ELSE 0 END),0)        AS sarf_qty,
            COALESCE(SUM(CASE WHEN type='SARF'  THEN total_cost ELSE 0 END),0) AS sarf_cost,
            COALESCE(SUM(CASE WHEN type='KOREKSIYA' THEN signed_qty ELSE 0 END),0) AS korr_net
       FROM raw_material_movements WHERE moved_at >= $1 AND moved_at <= $2
      GROUP BY material_name, unit`,
    [start_date, end_date]
  );

  const byKey = {};
  const ensure = (name, unit) => {
    const k = `${name}||${unit || ''}`;
    if (!byKey[k]) byKey[k] = {
      name, unit: unit || 'kg', opening: 0,
      kirim_qty: 0, kirim_cost: 0, sarf_qty: 0, sarf_cost: 0, korr_net: 0,
    };
    return byKey[k];
  };
  opening.rows.forEach(r => { ensure(r.name, r.unit).opening = parseFloat(r.opening) || 0; });
  inRange.rows.forEach(r => {
    const e = ensure(r.name, r.unit);
    e.kirim_qty = parseFloat(r.kirim_qty) || 0;
    e.kirim_cost = parseFloat(r.kirim_cost) || 0;
    e.sarf_qty = parseFloat(r.sarf_qty) || 0;
    e.sarf_cost = parseFloat(r.sarf_cost) || 0;
    e.korr_net = parseFloat(r.korr_net) || 0;
  });

  return Object.values(byKey)
    .map(e => ({
      name: e.name,
      unit: e.unit,
      opening: e.opening,
      kirim_qty: e.kirim_qty,
      kirim_cost: e.kirim_cost,
      sarf_qty: e.sarf_qty,
      sarf_cost: e.sarf_cost,
      closing: e.opening + e.kirim_qty - e.sarf_qty + e.korr_net,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

module.exports = { ensureLedger, recordMovement, getLedgerRangeSummary };
