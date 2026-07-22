/**
 * BIR MARTALIK "FILIAL savdolarini tozalash" — egasi talabi (2026-07-22).
 *
 * Egasi: filial tizimidagi barcha savdolar SINOV uchun kiritilgan edi —
 * hammasini o'chirishni so'radi. FAQAT filial ichi tozalanadi:
 *   - sales WHERE branch_id IS NOT NULL (filial savdolari, dostavka zakazlari ham)
 *   - o'sha savdolarga tegishli payments (to'lovlar) — filial mijozlar qarzi 0 bo'ladi
 *   - filial sale_returns (vozvratlar)
 *
 * TEGILMAYDI (egasi talabi — "boshqa hech narsaga tegma"):
 *   - Zavod savdolari (branch_id IS NULL) va zavod qarzlari
 *   - Filial mahsulotlari, mijozlari, ombori (branch_stock), transferlar
 *   - Xarajatlar, ishlab chiqarish, boshqa hamma narsa
 *
 * XAVFSIZLIK (salesReset.js bilan bir xil uslub):
 *  - Sentinel: app_flags dagi 'branch_sales_wiped_2026_07_22' bayrog'i —
 *    bu amal HECH QACHON ikkinchi marta ishlamaydi. Egasi keyin kiritadigan
 *    yangi filial savdolari BUTUNLAY XAVFSIZ.
 *  - O'chirishdan OLDIN to'liq zaxira nusxa olinadi.
 */
const db = require('../db');
const { runBackup } = require('./backupService');
const { ensureFlagsTable, isFlagSet } = require('./salesReset');

const FLAG = 'branch_sales_wiped_2026_07_22';

async function countQ(sql) {
  try {
    const r = await db.query(sql);
    return parseInt(r.rows[0]?.cnt ?? r.rows[0]?.['COUNT(*)'] ?? 0);
  } catch { return 0; }
}

async function ensureBranchSalesWiped() {
  try {
    await ensureFlagsTable();

    if (await isFlagSet(FLAG)) {
      console.log(`🧹 Filial savdolarini tozalash (${FLAG}) allaqachon bajarilgan — o'tkazildi`);
      return;
    }

    // 1) O'chirishdan OLDIN zaxira nusxa (xavfsizlik to'ri)
    try { runBackup(); } catch (e) { console.error('Filial tozalashdan oldin backup xato:', e.message); }

    // 2) Nechta yozuv borligini sanaymiz (adapterda rowCount ishonchsiz)
    const salesN = await countQ('SELECT COUNT(*) AS cnt FROM sales WHERE branch_id IS NOT NULL');
    const payN = await countQ(
      'SELECT COUNT(*) AS cnt FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE branch_id IS NOT NULL)'
    );

    // 3) Tranzaksiyada tozalaymiz — FAQAT filial yozuvlari
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      try {
        await client.query(
          'DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE branch_id IS NOT NULL)'
        );
      } catch (e) { /* jadval bo'lmasligi mumkin */ }
      try {
        await client.query(
          `DELETE FROM sale_returns
           WHERE branch_id IS NOT NULL
              OR sale_id IN (SELECT id FROM sales WHERE branch_id IS NOT NULL)`
        );
      } catch (e) { /* jadval bo'lmasligi mumkin */ }
      await client.query('DELETE FROM sales WHERE branch_id IS NOT NULL');
      // Sentinel — qayta ishlamasligi uchun
      await client.query('INSERT INTO app_flags (key, value) VALUES ($1, $2)', [FLAG, new Date().toISOString()]);
      await client.query('COMMIT');
      console.log(`🧹 Filial tozalash bajarildi: ${salesN} ta filial savdosi, ${payN} ta to'lov o'chirildi. Zavod savdolariga tegilmadi.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Filial savdo tozalash xato:', e.message);
  }
}

module.exports = { ensureBranchSalesWiped, FLAG };
