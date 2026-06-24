/**
 * BIR MARTALIK: noto'g'ri sana bilan yozilган savdolarni to'g'rilash.
 *
 * Muammo: frontend savdo sessiyasi localStorage'da saqlanardi va eski `saleDate`
 * ni qayta tiklamasdi (v75 da tuzatildi). Shu sabab bugun qilingan savdolar
 * eski (kechagi) sana bilan yozilib qolgan.
 *
 * Yechim: order_ref (ORD-YYYYMMDD-XXXX) ichidagi sana — savdo haqiqatan yaratilган
 * kun (server sanasi). Agar sale_date order_ref sanasidan OLDIN bo'lsa (bug yo'nalishi)
 * va savdo so'nggi 3 kunda yaratilган bo'lsa — sale_date'ni order_ref sanasiga to'g'rilaymiz.
 *
 * Xavfsizlik: sentinel (app_flags 'sale_date_fix_v1') — faqat bir marta ishlaydi.
 * Faqat order_ref'li (QuickSale) savdolarga tegadi; qo'lda qo'shilган qarzlar (order_ref yo'q) tegilmaydi.
 */
const db = require('../db');

async function ensureSaleDatesFixed() {
  try {
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    } catch (e) { /* jadval boshqa joyda yaratilган bo'lishi mumkin */ }

    // Sentinel — faqat bir marta
    try {
      const f = await db.query("SELECT 1 AS x FROM app_flags WHERE key = 'sale_date_fix_v1' LIMIT 1");
      if (f.rows.length) { console.log("🗓 Sale date fix allaqachon bajarilgan — o'tkazildi"); return; }
    } catch (e) { /* app_flags hali yo'q bo'lishi mumkin — davom etamiz */ }

    // So'nggi 3 kunda yaratilган, order_ref'li savdolar (created_at — server UTC vaqti)
    const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    let rows = [];
    try {
      rows = (await db.query(
        "SELECT id, order_ref, sale_date FROM sales WHERE order_ref LIKE 'ORD-%' AND created_at >= $1",
        [since]
      )).rows;
    } catch (e) { console.error('Sale date fix query xato:', e.message); return; }

    let fixed = 0;
    for (const r of rows) {
      const m = String(r.order_ref || '').match(/^ORD-(\d{4})(\d{2})(\d{2})-/);
      if (!m) continue;
      const refDate = `${m[1]}-${m[2]}-${m[3]}`;
      const saleDate = String(r.sale_date || '').slice(0, 10);
      // Faqat bug yo'nalishi: savdo sanasi order_ref sanasidan oldin (eski sessiya sanasi)
      if (saleDate && saleDate < refDate) {
        try {
          await db.query('UPDATE sales SET sale_date = $1 WHERE id = $2', [refDate, r.id]);
          fixed++;
        } catch (e) { /* bittasi xato bo'lsa davom etamiz */ }
      }
    }

    try { await db.query("INSERT INTO app_flags (key, value) VALUES ('sale_date_fix_v1', $1)", [String(fixed)]); } catch (e) {}
    console.log(`🗓 Sale date fix: ${fixed} ta savdo sanasi order_ref sanasiga to'g'rilandi`);
  } catch (e) {
    console.error('Sale date fix xato:', e.message);
  }
}

module.exports = { ensureSaleDatesFixed };
