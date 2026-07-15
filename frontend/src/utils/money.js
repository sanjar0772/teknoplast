// So'm summasini matndan xavfsiz o'qish.
//
// Egasi narxni turlicha yozadi:
//   - ming ajratgich sifatida bo'sh joy yoki nuqta:  "15 000" / "15.000" → 15000
//   - haqiqiy kasr (masalan prayslistdagi narxlar):   "33280.08"        → 33280.08
//
// Shuning uchun nuqtani KO'R-KO'RONA olib tashlamaymiz (aks holda 33280.08
// → 3328008 bo'lib, narx 100 barobar oshib ketadi). Farqlash qoidasi:
//   - Bir nechta nuqta (masalan "3.328.008") → hammasi ming ajratgich, olib tashlanadi.
//   - Bitta nuqta + keyin ANIQ 3 ta raqam ("15.000") → ming ajratgich, olib tashlanadi.
//   - Bitta nuqta + keyin 1, 2 yoki 4+ raqam ("33280.08") → kasr, saqlanadi.
export function parseSom(v) {
  if (v == null) return 0;
  // bo'sh joy va vergul (ming ajratgich) olib tashlanadi
  let s = String(v).trim().replace(/\s/g, '').replace(/,/g, '');
  if (s === '') return 0;

  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount >= 2) {
    // bir nechta nuqta — hammasi ming ajratgich
    s = s.replace(/\./g, '');
  } else if (dotCount === 1) {
    const after = s.split('.')[1] || '';
    if (after.length === 3) {
      // "15.000" kabi — ming ajratgich
      s = s.replace(/\./g, '');
    }
    // aks holda ("33280.08") kasr sifatida saqlanadi
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
