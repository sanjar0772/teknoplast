const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Siz Ahmad — Teknoplast plastik mahsulotlar fabrikasining yordamchisisiz.
O'zbek yoki rus tilida javob bering (foydalanuvchi tiliga qarab).
Aniq, qisqa va foydali javoblar bering. O'zingizni "Ahmad" deb tanishtiring.
Raqamlarni formatlang: 1 000 000 so'm ko'rinishida. Foizlarni ham ko'rsating.
Tavsiyalar bering va muammolarga yechim toping.`;

async function callClaude(prompt, maxTokens = 2000, systemOverride = null) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemOverride || SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function analyzeSalaries(salaryData, month) {
  const dataStr = JSON.stringify(salaryData, null, 2);
  const prompt = `${month} oyiga xodimlar maosh ma'lumotlari:
${dataStr}

Quyidagilarni tahlil qiling:
1. Eng ko'p va kam ishlagan xodimlar
2. O'rtacha ishlash miqdori
3. Anomaliyalar (juda ko'p yoki juda kam)
4. Bonus/jarima tavsiyalari
5. Umumiy oylik xarajati va prognoz

JSON formatida javob bering:
{
  "summary": "umumiy xulosa",
  "top_workers": ["..."],
  "low_workers": ["..."],
  "anomalies": ["..."],
  "recommendations": ["..."],
  "total_salary": 0,
  "average_salary": 0
}`;

  try {
    const text = await callClaude(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { summary: text, recommendations: [] };
  } catch {
    return { summary: 'Tahlil amalga oshmadi', recommendations: [] };
  }
}

async function forecastSales(salesData) {
  const dataStr = JSON.stringify(salesData, null, 2);
  const prompt = `Oxirgi 6 oylik sotuv ma'lumotlari:
${dataStr}

Quyidagilarni tahlil qiling:
1. Sotuv trendi (o'sish yoki pasayish)
2. Eng ko'p sotiladigan mahsulotlar
3. Mavsumiy o'zgarishlar
4. Keyingi oy uchun prognoz
5. Narx strategiyasi tavsiyalari

JSON formatida javob bering:
{
  "trend": "o'sish/pasayish/barqaror",
  "trend_percentage": 0,
  "top_products": ["..."],
  "seasonal_notes": "...",
  "next_month_forecast": 0,
  "recommendations": ["..."],
  "insights": "..."
}`;

  try {
    const text = await callClaude(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { insights: text, recommendations: [] };
  } catch {
    return { insights: 'Prognoz amalga oshmadi', recommendations: [] };
  }
}

async function optimizeExpenses(currentData, prevData, month) {
  const prompt = `${month} oy xarajatlari:
Joriy oy: ${JSON.stringify(currentData)}
O'tgan oy: ${JSON.stringify(prevData)}

Quyidagilarni tahlil qiling:
1. Eng katta xarajat kategoriyalari
2. O'tgan oy bilan taqqoslash
3. Noto'g'ri yoki ortiqcha xarajatlar
4. Tejash imkoniyatlari
5. Budget tavsiyalari

JSON formatida javob bering:
{
  "total_current": 0,
  "total_previous": 0,
  "change_percentage": 0,
  "biggest_expenses": ["..."],
  "savings_opportunities": ["..."],
  "recommendations": ["..."],
  "summary": "..."
}`;

  try {
    const text = await callClaude(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { summary: text, recommendations: [] };
  } catch {
    return { summary: 'Tahlil amalga oshmadi', recommendations: [] };
  }
}

async function chat(question, context, user, language) {
  // Til: 'ru' bo'lsa rus tilida, aks holda o'zbek tilida
  const isRu = language === 'ru';

  const systemPrompt = isRu
    ? `Вы Ахмад — помощник завода пластиковых изделий Технопласт.
Отвечайте ТОЛЬКО на русском языке. Кратко, точно и полезно. Представляйтесь как "Ахмад".
Форматируйте числа: 1 000 000 сум. Показывайте проценты.
Давайте рекомендации и решайте проблемы.`
    : `Siz Ahmad — Teknoplast plastik mahsulotlar fabrikasining yordamchisisiz.
FAQAT o'zbek tilida javob bering. Qisqa, aniq va foydali. O'zingizni "Ahmad" deb tanishtiring.
Raqamlarni formatlang: 1 000 000 so'm. Foizlarni ko'rsating.
Tavsiyalar bering va muammolarga yechim toping.`;

  const prompt = isRu
    ? `Пользователь: ${user.full_name} (${user.role})
Текущие данные: ${JSON.stringify(context)}

Вопрос: ${question}

Краткий и точный ответ на русском языке. Числа пишите полностью.`
    : `Foydalanuvchi: ${user.full_name} (${user.role})
Joriy ma'lumotlar: ${JSON.stringify(context)}

Savol: ${question}

Qisqa va aniq javob o'zbek tilida bering. Raqamlarni to'liq yozing.`;

  try {
    return await callClaude(prompt, 1000, systemPrompt);
  } catch (err) {
    return isRu
      ? 'Извините, сейчас не могу ответить. Попробуйте позже.'
      : 'Kechirasiz, hozir javob bera olmayman. Keyinroq urinib ko\'ring.';
  }
}

async function generateProductionReport(productionData, month) {
  const prompt = `${month} oyiga ishlab chiqarish hisoboti ma'lumotlari:
${JSON.stringify(productionData, null, 2)}

Rasmiy hisobot yozing:
- Umumiy ishlab chiqarish hajmi
- Xodimlar unumdorligi
- Mashinalar ishlash holati
- Xom ashyo iste'moli
- Muammolar va yechimlar
- Keyingi oy uchun tavsiyalar

Hisobotni o'zbek tilida professional uslubda yozing.`;

  try {
    return await callClaude(prompt, 3000);
  } catch {
    return 'Hisobot yaratilmadi. API xatosi.';
  }
}

async function checkAlerts(db) {
  const alerts = [];
  const { query } = db;

  const lowStock = await query('SELECT name, stock_quantity FROM products WHERE stock_quantity < 10 AND is_active=true');
  lowStock.rows.forEach(p => {
    alerts.push({
      type: 'LOW_STOCK',
      severity: p.stock_quantity === 0 ? 'CRITICAL' : 'HIGH',
      message: `${p.name} mahsuloti omborda kam: ${p.stock_quantity} dona qoldi`,
    });
  });

  const lowRawMaterials = await query('SELECT name, stock_balance, min_stock_level FROM raw_materials WHERE stock_balance <= min_stock_level AND is_active=true');
  lowRawMaterials.rows.forEach(rm => {
    alerts.push({
      type: 'LOW_STOCK',
      severity: 'HIGH',
      message: `${rm.name} xom ashyosi tugayapti: ${rm.stock_balance} qoldi`,
    });
  });

  const brokenMachines = await query('SELECT name FROM machines WHERE status IN (\'BROKEN\', \'SERVICE\') AND is_active=true');
  brokenMachines.rows.forEach(m => {
    alerts.push({
      type: 'MAINTENANCE',
      severity: 'MEDIUM',
      message: `${m.name} mashina ta'mirda yoki buzilgan`,
    });
  });

  return alerts;
}

module.exports = { analyzeSalaries, forecastSales, optimizeExpenses, chat, generateProductionReport, checkAlerts };
