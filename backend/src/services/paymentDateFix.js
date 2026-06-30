/**
 * BIR MARTALIK: UTC xatosi tufayli noto'g'ri (bir kun orqaga surilgan) sana bilan
 * yozilган qarz to'lovlarini to'g'rilash.
 *
 * Muammo: backend `payment_date` ni `new Date().toISOString().slice(0,10)` (UTC sana)
 * bilan yozardi. Egasi UTC+5 (Toshkent) da — ertalab soat 05:00 gacha qilinган to'lov
 * UTC'da hali KECHAGI kun bo'lib, sana bir kun orqaga surilib yozilган
 * (masalan bugun 30 bo'lsa-da, to'lov "29" bo'lib chiqib, "Bugun" filtrida yo'qolган).
 * (Yangi to'lovlar v93+ da todayUZB() bilan to'g'ri yoziladi.)
 *
 * Yechim: created_at — to'lov yozilган aniq vaqt (server UTC timestamp). Uning Toshkent
 * sanasi (+5 soat) = to'lov haqiqatan qilinган kun. Agar payment_date shu Toshkent
 * sanasidan OLDIN bo'lsa (bug yo'nalishi) — payment_date'ni o'sha Toshkent sanasiga
 * to'g'rilaymiz.
 *
 * Xavfsizlik: sentinel (app_flags 'payment_date_fix_v1') — faqat bir marta ishlaydi.
 * Faqat so'nggi 30 kundagi to'lovlar, faqat bug yo'nalishida tekshiriladi.
 */
const db = require('../db');

const UZB_OFFSET_MS = 5 * 60 * 60 * 1000;

// SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) ni Toshkent sanasiga ('YYYY-MM-DD') aylantirish
function tashkentDate(createdAt) {
  const raw = String(createdAt || '').slice(0, 19).replace('T', ' ');
  if (raw.length < 10) return null;
  const utc = new Date(raw.replace(' ', 'T') + 'Z'); // UTC sifatida o'qish
  if (isNaN(utc.getTime())) return null;
  return new Date(utc.getTime() + UZB_OFFSET_MS).toISOString().slice(0, 10);
}

async function ensurePaymentDatesFixed() {
  try {
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    } catch (e) { /* jadval boshqa joyda yaratilган bo'lishi mumkin */ }

    // Sentinel — faqat bir marta
    try {
      const f = await db.query("SELECT 1 AS x FROM app_flags WHERE key = 'payment_date_fix_v1' LIMIT 1");
      if (f.rows.length) { console.log("💳 Payment date fix allaqachon bajarilган — o'tkazildi"); return; }
    } catch (e) { /* app_flags hali yo'q bo'lishi mumkin — davom etamiz */ }

    // So'nggi 30 kunda yozilган to'lovlar (created_at — server UTC vaqti)
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    let rows = [];
    try {
      rows = (await db.query(
        'SELECT id, payment_date, created_at FROM payments WHERE created_at >= $1',
        [since]
      )).rows;
    } catch (e) { console.error('Payment date fix query xato:', e.message); return; }

    let fixed = 0;
    for (const r of rows) {
      const trueDate = tashkentDate(r.created_at);
      if (!trueDate) continue;
      const payDate = String(r.payment_date || '').slice(0, 10);
      // Faqat bug yo'nalishi: to'lov sanasi haqiqiy (Toshkent) kunidan oldin
      if (payDate && payDate < trueDate) {
        try {
          await db.query('UPDATE payments SET payment_date = $1 WHERE id = $2', [trueDate, r.id]);
          fixed++;
        } catch (e) { /* bittasi xato bo'lsa davom etamiz */ }
      }
    }

    try { await db.query("INSERT INTO app_flags (key, value) VALUES ('payment_date_fix_v1', $1)", [String(fixed)]); } catch (e) {}
    console.log(`💳 Payment date fix: ${fixed} ta to'lov sanasi Toshkent kuniga to'g'rilandi`);
  } catch (e) {
    console.error('Payment date fix xato:', e.message);
  }
}

module.exports = { ensurePaymentDatesFixed };
