/**
 * BIR MARTALIK: rang bo'yicha ombor (product_color_stock) buketlarini umumiy
 * qoldiq (products.stock_quantity) bilan moslashtirish.
 *
 * Muammo (v22 dan oldingi "fantom ombor"): mahsulotda umumiy qoldiq 5100 dona
 * ko'rinadi, lekin rang buketlari yig'indisi atigi 100 (masalan Rangsiz=100).
 * Qolgan 5000 hech qaysi rangga biriktirilmaganligi uchun SOTIB BO'LMAYDI —
 * savdo oynasida "Rangsiz (100)" deb chiqadi (chunki savdo rang buketidan tekshiradi).
 *
 * Yechim: har bir mahsulotda  farq = stock_quantity − (buketlar yig'indisi)  > 0 bo'lsa,
 * farqni mahsulotning O'Z rangi buketiga qo'shamiz (products.rang bo'sh bo'lsa Rangsiz '').
 * Shunda butun qoldiq sotiladigan bo'ladi. Yig'indi qoldiqdan KO'P bo'lsa tegmaymiz.
 *
 * Xavfsizlik: sentinel (app_flags 'color_stock_reconcile_v1') — faqat bir marta ishlaydi,
 * shu sababli davom etayotgan savdo/ishlab chiqarish bilan urishmaydi.
 */
const db = require('../db');
const { addColorStock } = require('../utils/colorStock');

async function ensureColorStockReconciled() {
  try {
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    } catch (e) { /* jadval boshqa joyda yaratilган bo'lishi mumkin */ }

    // Sentinel — faqat bir marta
    try {
      const f = await db.query("SELECT 1 AS x FROM app_flags WHERE key = 'color_stock_reconcile_v1' LIMIT 1");
      if (f.rows.length) { console.log('🎨 Rang ombori moslashtirish allaqachon bajarilgan — o\'tkazildi'); return; }
    } catch (e) { /* app_flags hali yo'q bo'lishi mumkin — davom etamiz */ }

    let prods = [];
    try {
      prods = (await db.query(
        "SELECT id, COALESCE(rang,'') AS rang, stock_quantity FROM products WHERE is_active = true",
        []
      )).rows;
    } catch (e) { console.error('Rang ombori reconcile query (products) xato:', e.message); return; }

    let sums = [];
    try {
      sums = (await db.query(
        'SELECT product_id, SUM(quantity) AS s FROM product_color_stock GROUP BY product_id',
        []
      )).rows;
    } catch (e) { console.error('Rang ombori reconcile query (buckets) xato:', e.message); return; }

    const sumMap = new Map(sums.map(r => [String(r.product_id), parseFloat(r.s || 0)]));

    let fixed = 0;
    for (const p of prods) {
      const total = parseFloat(p.stock_quantity || 0);
      const bucket = sumMap.get(String(p.id)) || 0;
      const diff = Math.round(total - bucket);
      if (diff > 0) {
        try {
          await addColorStock(db.query, p.id, p.rang || '', diff);
          fixed++;
        } catch (e) { /* bittasi xato bo'lsa davom etamiz */ }
      }
    }

    try { await db.query("INSERT INTO app_flags (key, value) VALUES ('color_stock_reconcile_v1', $1)", [String(fixed)]); } catch (e) {}
    console.log(`🎨 Rang ombori moslashtirildi: ${fixed} ta mahsulotda yetishmayotgan qoldiq o'z rangiga qo'shildi`);
  } catch (e) {
    console.error('Rang ombori reconcile xato:', e.message);
  }
}

module.exports = { ensureColorStockReconciled };
