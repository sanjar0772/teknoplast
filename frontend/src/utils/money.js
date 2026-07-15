// So'm summasini matndan xavfsiz o'qish.
// So'm narxlari doim butun son (kasr ishlatilmaydi), shuning uchun
// bo'sh joy, vergul VA nuqta — hammasi ming ajratgich deb qaraladi.
// Masalan: "15 000", "15,000", "15.000" → 15000
export function parseSom(v) {
  if (v == null) return 0;
  const cleaned = String(v).replace(/[\s.,]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}
