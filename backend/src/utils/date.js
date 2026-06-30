/**
 * Toshkent (O'zbekiston, UTC+5) bo'yicha sana yordamchilari.
 *
 * MUAMMO: Railway serveri UTC da ishlaydi. `new Date().toISOString()` UTC sanani
 * beradi. Egasi UTC+5 da — ertalab soat 05:00 gacha qilingan amal UTC'da hali
 * KECHAGI kun bo'ladi, shuning uchun sana bir kun orqaga surilib yoziladi
 * (masalan bugun 30-kun bo'lsa-da, to'lov "29" bo'lib chiqadi).
 *
 * YECHIM: hozirgi vaqtga +5 soat qo'shib, keyin sanani olamiz.
 */
const UZB_OFFSET_MS = 5 * 60 * 60 * 1000;

// 'YYYY-MM-DD' — Toshkent bo'yicha bugun
function todayUZB() {
  return new Date(Date.now() + UZB_OFFSET_MS).toISOString().slice(0, 10);
}

// 'YYYY-MM' — Toshkent bo'yicha joriy oy
function monthUZB() {
  return new Date(Date.now() + UZB_OFFSET_MS).toISOString().slice(0, 7);
}

module.exports = { todayUZB, monthUZB };
