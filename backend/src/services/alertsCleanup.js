/**
 * BIR MARTALIK smart_alerts tozalash + bazani siqish (egasi talabi 2026-07-23:
 * "Railway diski to'lib qolyapti").
 *
 * SABAB: soatlik alert cron'idagi dedup so'rovi $3 parametrini IKKI joyda
 * ishlatgan — SQLite adapter parametrlarni tartib bo'yicha joylagani uchun
 * subquery'dagi message=$3 doim NULL bo'lib, takror tekshiruvi ishlamagan.
 * Natija: smart_alerts'da 558 000+ takror qator (~77 MB), baza 126 MB.
 * (Cron so'rovi index.js'da $4 bilan tuzatildi — endi qayta yig'ilmaydi.)
 *
 * BU XIZMAT (sentinel bilan, faqat bir marta):
 *  1. smart_alerts'ni butunlay tozalaydi (bu jadval har soatda qayta
 *     hisoblanadigan eslatmalar — biznes ma'lumoti YO'Q, o'chirish xavfsiz)
 *  2. VACUUM — bazani siqadi (bo'shagan sahifalar faylni katta qilib turadi)
 *  3. Eski (126 MB'lik shishgan) kunlik backuplarni o'chirib, darhol yangi
 *     kichik backup oladi — disk shu zahoti bo'shaydi
 *
 * XAVFSIZLIK: bayroq VACUUM'dan OLDIN qo'yiladi — VACUUM biror sabab bilan
 * yiqilsa ham (masalan xotira), keyingi restartlarda qayta urinib boot-loop
 * bo'lmaydi (qatorlar baribir o'chirilgan bo'ladi).
 */
const db = require('../db');
const { runBackup, deleteAllBackups } = require('./backupService');
const { ensureFlagsTable, isFlagSet } = require('./salesReset');

const FLAG = 'smart_alerts_cleaned_2026_07_23';

async function ensureAlertsCleaned() {
  try {
    await ensureFlagsTable();
    if (await isFlagSet(FLAG)) {
      console.log(`🧹 smart_alerts tozalash (${FLAG}) allaqachon bajarilgan — o'tkazildi`);
      return;
    }

    const n = await db.query('SELECT COUNT(*) AS cnt FROM smart_alerts')
      .then(r => parseInt(r.rows[0]?.cnt ?? r.rows[0]?.['COUNT(*)'] ?? 0))
      .catch(() => 0);

    // 1) Takror alertlarni o'chirish (jadval har soatda qayta to'ladi)
    await db.query('DELETE FROM smart_alerts');

    // Sentinel — VACUUM'dan OLDIN (boot-loop himoyasi)
    await db.query('INSERT INTO app_flags (key, value) VALUES ($1, $2)', [FLAG, new Date().toISOString()]);

    // 2) Bazani siqish — o'chirilgan 550k qator joyini fayldan bo'shatadi
    try {
      await db.query('VACUUM');
      console.log('🗜️ VACUUM bajarildi — baza siqildi');
    } catch (e) {
      console.error('VACUUM xato (davom etilmoqda):', e.message);
    }

    // Siqilgan holatni darhol diskka yozamiz
    try { if (db.saveDBSync) db.saveDBSync(); } catch (e) { /* PG rejimida yo'q */ }

    // 3) Shishgan eski backuplar o'rniga yangi kichik backup
    try { deleteAllBackups(); runBackup(); } catch (e) { console.error('Backup almashtirish xato:', e.message); }

    console.log(`🧹 smart_alerts tozalandi: ${n} ta takror alert o'chirildi, baza siqildi, backuplar yangilandi`);
  } catch (e) {
    console.error('smart_alerts tozalash xato:', e.message);
  }
}

module.exports = { ensureAlertsCleaned, FLAG };
