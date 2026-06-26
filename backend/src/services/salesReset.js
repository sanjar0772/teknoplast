/**
 * BIR MARTALIK "sotuv + qarz tozalash" — egasi talabi (2026-06-22).
 *
 * Egasi: barcha sotuv tarixi va qarzlarni (shu jumladan bito.online importidagi
 * eski qarzlarni) butunlay o'chirishni so'radi. Ombor (stock) o'zgartirilmaydi,
 * mahsulotlar va mijozlar saqlanadi.
 *
 * XAVFSIZLIK:
 *  - Sentinel: app_flags jadvalidagi 'sales_wiped_2026_06_22' bayrog'i.
 *    Bayroq tozalashdan KEYIN ham qoladi (o'chirilmaydi) — shuning uchun bu amal
 *    HECH QACHON ikkinchi marta ishlamaydi. Egasi keyin kiritadigan yangi
 *    sotuvlar BUTUNLAY XAVFSIZ.
 *  - 'debtors_import_disabled' bayrog'i ham qo'yiladi — bito qarzdorlar ro'yxati
 *    keyingi qayta ishga tushishlarda QAYTA import bo'lmaydi (qarzlar qaytmaydi).
 *  - O'chirishdan OLDIN to'liq zaxira nusxa olinadi (Railway diskida /data/backups).
 */
const db = require('../db');
const { runBackup } = require('./backupService');

const USE_PG = process.env.USE_POSTGRES === 'true';
const FLAG = 'sales_wiped_2026_06_22';

const FLAGS_DDL = USE_PG
  ? `CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(80) PRIMARY KEY,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  : `CREATE TABLE IF NOT EXISTS app_flags (
      key TEXT PRIMARY KEY,
      value TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;

// app_flags jadvali boshqa xizmatlar (masalan debtorsSeed) uchun ham kerak
async function ensureFlagsTable() {
  try { await db.query(FLAGS_DDL); } catch (e) { console.error('app_flags DDL xato:', e.message); }
}

async function isFlagSet(key) {
  try {
    const r = await db.query('SELECT 1 AS x FROM app_flags WHERE key = $1 LIMIT 1', [key]);
    return r.rows.length > 0;
  } catch { return false; }
}

async function countRows(table) {
  try {
    const r = await db.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
    return parseInt(r.rows[0]?.cnt ?? r.rows[0]?.['COUNT(*)'] ?? 0);
  } catch { return 0; }
}

async function ensureSalesWiped(flag = FLAG) {
  try {
    await ensureFlagsTable();

    if (await isFlagSet(flag)) {
      console.log(`🧹 Sotuv/qarz tozalash (${flag}) allaqachon bajarilgan — o'tkazildi`);
      return;
    }

    // 1) O'chirishdan OLDIN zaxira nusxa (xavfsizlik to'ri)
    try { runBackup(); } catch (e) { console.error('Tozalashdan oldin backup xato:', e.message); }

    // 2) Nechta yozuv borligini sanaymiz (adapterda rowCount ishonchsiz)
    const salesN = await countRows('sales');
    const payN = await countRows('payments');

    // 3) Tranzaksiyada tozalaymiz
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      try { await client.query('DELETE FROM payments'); } catch (e) { /* jadval bo'lmasligi mumkin */ }
      try { await client.query('DELETE FROM sale_returns'); } catch (e) { /* jadval bo'lmasligi mumkin */ }
      await client.query('DELETE FROM sales');
      // Sentinel + import bloki
      await client.query('INSERT INTO app_flags (key, value) VALUES ($1, $2)', [flag, new Date().toISOString()]);
      try {
        await client.query('INSERT INTO app_flags (key, value) VALUES ($1, $2)', ['debtors_import_disabled', '1']);
      } catch (e) { /* allaqachon bor bo'lishi mumkin */ }
      await client.query('COMMIT');
      console.log(`🧹 Tozalash bajarildi: ${salesN} ta sotuv, ${payN} ta to'lov o'chirildi. Qarzlar = 0. Import bloklandi.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Sotuv tozalash xato:', e.message);
  }
}

module.exports = { ensureSalesWiped, ensureFlagsTable, isFlagSet, FLAG };
