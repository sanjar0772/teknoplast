// Tizimdagi BARCHA ranglar — yagona manba.
// Kirim, Ishlab chiqarish, Sotuv (QuickSale), Mahsulotlar sahifalari shu yerdan oladi.
// Yangi rang qo'shish kerak bo'lsa — faqat shu faylga qo'shing.

// Tanlanadigan ranglar ro'yxati (dropdown). Rus harflarida.
// Оқ va Қора saqlanadi — bazada shu nomlar bilan mahsulot bo'lishi mumkin.
export const RANGLAR = [
  'Оқ', 'Қора',
  'Серый', 'Ментол', 'Красный', 'Розовый', 'Жёлтый', 'Оранжевый',
  'Голубой', 'Зелёный', 'Светло-зелёный', 'Фиолетовый', 'Эрон', 'Малина', 'Золотой',
];

// Rang -> hex (rangli nuqta ko'rsatish uchun).
export const RANG_COLORS = {
  'Оқ': '#d1d5db', 'Қора': '#1a1a1a',
  'Серый': '#6b7280', 'Ментол': '#5eead4', 'Красный': '#ef4444', 'Розовый': '#ec4899',
  'Жёлтый': '#eab308', 'Оранжевый': '#f97316', 'Голубой': '#7dd3fc', 'Зелёный': '#22c55e',
  'Светло-зелёный': '#86efac', 'Фиолетовый': '#8b5cf6', 'Эрон': '#14b8a6', 'Малина': '#be123c',
  'Золотой': '#d4af37',

  // Eski (legacy) qiymatlar — bazadagi mavjud yozuvlar rangli nuqta bilan ko'rinishi uchun.
  // Ro'yxatda (RANGLAR) ko'rsatilmaydi, faqat ko'rsatish (display) uchun.
  'Қизил': '#ef4444', 'Кўк': '#3b82f6', 'Яшил': '#22c55e', 'Сариқ': '#eab308', 'Тўқ сариқ': '#f97316',
};
