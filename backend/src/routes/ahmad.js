const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { query, getClient } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  dest: '/tmp/ahmad-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Faqat rasm fayllari'), false);
  },
});

let claude;
try {
  claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (e) {
  console.log('Ahmad: Anthropic API kaliti topilmadi');
}

const MODEL = 'claude-sonnet-4-6';

// ---------- Yordamchilar ----------
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU'); // 1 000 000 ko'rinishi

// Mahsulotni nom yoki kod bo'yicha topish
async function findProduct(nameOrCode) {
  if (!nameOrCode) return null;
  const term = String(nameOrCode).trim();
  // Aniq nom
  let r = await query(
    "SELECT id, name, price, stock_quantity FROM products WHERE LOWER(name)=LOWER($1) AND is_active=1 LIMIT 1",
    [term]
  );
  if (r.rows.length) return r.rows[0];
  // Qisman nom
  r = await query(
    "SELECT id, name, price, stock_quantity FROM products WHERE LOWER(name) LIKE LOWER($1) AND is_active=1 ORDER BY length(name) ASC LIMIT 1",
    [`%${term}%`]
  );
  if (r.rows.length) return r.rows[0];
  // Kod (description ichida "Kod: XX")
  r = await query(
    "SELECT id, name, price, stock_quantity FROM products WHERE LOWER(description) LIKE LOWER($1) AND is_active=1 LIMIT 1",
    [`%${term}%`]
  );
  return r.rows.length ? r.rows[0] : null;
}

function genOrderRef() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `AHM-${ymd}-${rnd}`;
}

// ---------- TOOL DEFINITIONS ----------
const TOOLS = [
  {
    name: 'create_sale',
    description: 'Sotuvni ro\'yxatga olish. Foydalanuvchi biror mahsulot sotilgani haqida aytganda chaqiriladi.',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Mahsulot nomi yoki kodi' },
        quantity: { type: 'number', description: 'Dona soni' },
        unit_price: { type: 'number', description: 'Bitta donaning narxi so\'mda. Aytilmasa yubormang.' },
        customer_name: { type: 'string', description: 'Mijoz ismi (ixtiyoriy)' },
      },
      required: ['product_name', 'quantity'],
    },
  },
  {
    name: 'add_expense',
    description: 'Xarajat (rasxod) qo\'shish. Pul sarflangani haqida aytilganda.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['RAW_MATERIAL', 'ENERGY', 'MAINTENANCE', 'SALARY', 'TRANSPORT', 'OTHER'], description: 'Xarajat turi. Xom ashyo=RAW_MATERIAL, elektr/gaz=ENERGY, tamir=MAINTENANCE, maosh=SALARY, transport=TRANSPORT, boshqa=OTHER' },
        amount: { type: 'number', description: 'Summa so\'mda' },
        description: { type: 'string', description: 'Izoh' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'add_customer',
    description: 'Yangi mijoz (haridor) qo\'shish.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        company_name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_intake',
    description: 'Ombnorga mahsulot kirimini ro\'yxatga olish (tasdiqlash uchun PENDING holatda yaratiladi).',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_name: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['product_name', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_report',
    description: 'Hisobot/statistika berish: bugungi yoki oylik sotuv, kam qolgan mahsulotlar, qarzdorlar. Foydalanuvchi hisobot, holat, statistika so\'raganda.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'month'], description: 'today=bugun, month=shu oy' },
      },
    },
  },
  {
    name: 'update_price',
    description: 'Mahsulot narxini o\'zgartirish. Masalan "gul tuvak narxini 8000 qil".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        new_price: { type: 'number' },
      },
      required: ['product_name', 'new_price'],
    },
  },
  {
    name: 'update_stock',
    description: 'Mahsulot ombordagi sonini o\'zgartirish. Masalan "chelak omborini 50 qil".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        new_quantity: { type: 'number' },
      },
      required: ['product_name', 'new_quantity'],
    },
  },
  {
    name: 'lookup',
    description: 'Mahsulot narxi yoki ombordagi sonini bilish (faqat o\'qish). Masalan "gul tuvak narxi qancha?", "omborda nechta chelak bor?".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        what: { type: 'string', enum: ['price', 'stock', 'both'], description: 'price=narx, stock=ombor, both=ikkalasi' },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'list_debtors',
    description: 'Qarzdorlar ro\'yxatini berish. "Kim qarzdor?", "qarzdorlar".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'record_payment',
    description: 'Mijoz to\'lovini yozish. Masalan "Dilshod 500000 to\'ladi".',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        amount: { type: 'number' },
      },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'generate_document',
    description: 'Hujjat tayyorlash: oylik hisobot PDF yoki sotuvlar Excel. "oylik hisobotni Excel qil", "PDF hisobot".',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['monthly_pdf', 'sales_excel'], description: 'monthly_pdf=oylik PDF, sales_excel=sotuvlar Excel' },
        month: { type: 'string', description: 'YYYY-MM, aytilmasa shu oy' },
      },
      required: ['doc_type'],
    },
  },
];

// ---------- Hisobot ma'lumotlari ----------
async function gatherReport(period) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  if (period === 'month') {
    const [sales, expenses, lowStock, debts] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) t, COUNT(*) c FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM')=$1`, [month]),
      query(`SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM')=$1`, [month]),
      query(`SELECT COUNT(*) c FROM products WHERE stock_quantity < 10 AND is_active=1`),
      query(`SELECT COALESCE(SUM(total_amount-payment_amount),0) t, COUNT(*) c FROM sales WHERE status!='PAID' AND (total_amount-payment_amount)>0.01`),
    ]);
    return {
      period: 'month', month,
      salesTotal: sales.rows[0].t, salesCount: sales.rows[0].c,
      expensesTotal: expenses.rows[0].t,
      profit: Number(sales.rows[0].t) - Number(expenses.rows[0].t),
      lowStock: lowStock.rows[0].c,
      debtTotal: debts.rows[0].t, debtCount: debts.rows[0].c,
    };
  }

  // today
  const [sales, intakes, lowStock, debts, topLow] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0) t, COUNT(*) c FROM sales WHERE strftime('%Y-%m-%d',sale_date)=$1`, [today]),
    query(`SELECT COUNT(*) c FROM product_intakes WHERE strftime('%Y-%m-%d',created_at)=$1`, [today]),
    query(`SELECT COUNT(*) c FROM products WHERE stock_quantity < 10 AND is_active=1`),
    query(`SELECT COALESCE(SUM(total_amount-payment_amount),0) t, COUNT(*) c FROM sales WHERE status!='PAID' AND (total_amount-payment_amount)>0.01`),
    query(`SELECT name, stock_quantity FROM products WHERE stock_quantity < 10 AND is_active=1 ORDER BY stock_quantity ASC LIMIT 5`),
  ]);
  return {
    period: 'today', today,
    salesTotal: sales.rows[0].t, salesCount: sales.rows[0].c,
    intakesCount: intakes.rows[0].c,
    lowStock: lowStock.rows[0].c,
    lowStockTop: topLow.rows,
    debtTotal: debts.rows[0].t, debtCount: debts.rows[0].c,
  };
}

function reportToText(r, lang) {
  const ru = lang === 'ru';
  if (r.period === 'month') {
    return ru
      ? `Отчёт за месяц. Продажи: ${fmt(r.salesTotal)} сум (${r.salesCount} операций). Расходы: ${fmt(r.expensesTotal)} сум. Прибыль: ${fmt(r.profit)} сум. Заканчивающихся товаров: ${r.lowStock}. Должники: ${r.debtCount} на сумму ${fmt(r.debtTotal)} сум.`
      : `Oylik hisobot. Sotuv: ${fmt(r.salesTotal)} so'm (${r.salesCount} ta). Xarajat: ${fmt(r.expensesTotal)} so'm. Foyda: ${fmt(r.profit)} so'm. Kam qolgan mahsulot: ${r.lowStock} ta. Qarzdorlar: ${r.debtCount} ta, jami ${fmt(r.debtTotal)} so'm.`;
  }
  const lowList = (r.lowStockTop || []).map(p => `${p.name} (${p.stock_quantity})`).join(', ');
  if (ru) {
    let t = `Отчёт за сегодня. Продажи: ${fmt(r.salesTotal)} сум (${r.salesCount} операций). Приходов: ${r.intakesCount}. Заканчивается товаров: ${r.lowStock}.`;
    if (lowList) t += ` Внимание: ${lowList}.`;
    if (Number(r.debtTotal) > 0) t += ` Должники: ${r.debtCount} на ${fmt(r.debtTotal)} сум.`;
    return t;
  }
  let t = `Bugungi hisobot. Sotuv: ${fmt(r.salesTotal)} so'm (${r.salesCount} ta). Kirim: ${r.intakesCount} ta. Kam qolgan mahsulot: ${r.lowStock} ta.`;
  if (lowList) t += ` Diqqat: ${lowList}.`;
  if (Number(r.debtTotal) > 0) t += ` Qarzdorlar: ${r.debtCount} ta, ${fmt(r.debtTotal)} so'm.`;
  return t;
}

// ---------- POST /api/ahmad/command ----------
// Tabiiy tildagi buyruq -> javob yoki amal (tasdiqlash uchun)
router.post('/command', async (req, res) => {
  try {
    const { text, language, history } = req.body;
    const lang = language === 'ru' ? 'ru' : 'uz';
    if (!text?.trim()) return res.status(400).json({ error: lang === 'ru' ? 'Текст пустой' : 'Matn bo\'sh' });

    if (!claude) {
      return res.json({ response: lang === 'ru' ? 'Ахмад: нужен API ключ' : 'Ahmad: API kaliti kerak' });
    }

    const system = lang === 'ru'
      ? `Вы Ахмад — голосовой помощник завода пластиковых изделий Технопласт.
Используйте инструменты для операций: продажа, расход, приход, новый клиент, изменить цену, изменить склад, оплата долга.
Для отчётов — get_report. Для поиска цены/остатка — lookup. Для должников — list_debtors. Для документов — generate_document.
Помните предыдущие сообщения разговора. Если это вопрос — ответьте кратко на русском. Представляйтесь как Ахмад. Числа: 1 000 000 сум.`
      : `Siz Ahmad — Teknoplast plastik zavod ovozli yordamchisisiz.
Amallar uchun toollardan foydalaning: sotuv, xarajat, kirim, yangi mijoz, narx o'zgartirish, ombor o'zgartirish, qarz to'lovi.
Hisobot uchun get_report. Narx/ombor qidirish uchun lookup. Qarzdorlar uchun list_debtors. Hujjat uchun generate_document.
Oldingi suhbat xabarlarini eslab qoling. Oddiy savol bo'lsa — o'zbek tilida qisqa javob. O'zingizni Ahmad deb tanishtiring. Raqamlar: 1 000 000 so'm.`;

    // Suhbat xotirasi — oxirgi 6 ta xabar
    const messages = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.role && h.text) messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.text) });
      }
    }
    messages.push({ role: 'user', content: text });

    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const textBlock = msg.content.find(b => b.type === 'text');
    const toolBlock = msg.content.find(b => b.type === 'tool_use');

    // Tool chaqirilmadi — oddiy javob
    if (!toolBlock) {
      return res.json({ response: textBlock?.text || (lang === 'ru' ? 'Не понял.' : 'Tushunmadim.') });
    }

    const lead = textBlock?.text ? textBlock.text + '\n' : '';
    const inp = toolBlock.input || {};

    // ===== DARHOL bajariladigan (read-only) toollar =====
    if (toolBlock.name === 'get_report') {
      const data = await gatherReport(inp.period || 'today');
      return res.json({ response: reportToText(data, lang) });
    }

    if (toolBlock.name === 'lookup') {
      const p = await findProduct(inp.product_name);
      if (!p) return res.json({ response: lang === 'ru' ? `Товар "${inp.product_name}" не найден.` : `"${inp.product_name}" topilmadi.` });
      const what = inp.what || 'both';
      let r;
      if (what === 'price') r = lang === 'ru' ? `${p.name}: цена ${fmt(p.price)} сум.` : `${p.name}: narxi ${fmt(p.price)} so'm.`;
      else if (what === 'stock') r = lang === 'ru' ? `${p.name}: на складе ${p.stock_quantity} шт.` : `${p.name}: omborda ${p.stock_quantity} dona.`;
      else r = lang === 'ru' ? `${p.name}: цена ${fmt(p.price)} сум, на складе ${p.stock_quantity} шт.` : `${p.name}: narxi ${fmt(p.price)} so'm, omborda ${p.stock_quantity} dona.`;
      return res.json({ response: r });
    }

    if (toolBlock.name === 'list_debtors') {
      const debtors = await query(`
        SELECT COALESCE(c.name, s.customer_name, 'Noma''lum') as name,
               SUM(s.total_amount - s.payment_amount) as debt
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.status!='PAID' AND (s.total_amount - s.payment_amount) > 0.01
        GROUP BY COALESCE(c.name, s.customer_name)
        ORDER BY debt DESC LIMIT 8
      `);
      if (!debtors.rows.length) return res.json({ response: lang === 'ru' ? 'Должников нет.' : 'Qarzdorlar yo\'q.' });
      const list = debtors.rows.map(d => `${d.name} — ${fmt(d.debt)}`).join('; ');
      const total = debtors.rows.reduce((a, d) => a + Number(d.debt), 0);
      return res.json({ response: lang === 'ru' ? `Должники: ${list}. Итого: ${fmt(total)} сум.` : `Qarzdorlar: ${list}. Jami: ${fmt(total)} so'm.` });
    }

    if (toolBlock.name === 'generate_document') {
      const month = inp.month || new Date().toISOString().slice(0, 7);
      const docType = inp.doc_type === 'sales_excel' ? 'sales_excel' : 'monthly_pdf';
      const document = { kind: docType, month };
      const r = docType === 'sales_excel'
        ? (lang === 'ru' ? `Excel с продажами за ${month} готов. Нажмите для скачивания.` : `${month} sotuvlar Excel tayyor. Yuklab olish uchun bosing.`)
        : (lang === 'ru' ? `PDF отчёт за ${month} готов. Нажмите для скачивания.` : `${month} oylik PDF hisobot tayyor. Yuklab olish uchun bosing.`);
      return res.json({ response: r, document });
    }

    // ===== TASDIQLASH talab qiladigan (write) toollar =====
    let action = null;
    let desc = '';

    if (toolBlock.name === 'update_price') {
      const p = await findProduct(inp.product_name);
      if (!p) return res.json({ response: lang === 'ru' ? `Товар "${inp.product_name}" не найден.` : `"${inp.product_name}" topilmadi.` });
      action = { type: 'UPDATE_PRICE', data: { product_id: p.id, product_name: p.name, new_price: inp.new_price } };
      desc = lang === 'ru'
        ? `Изменить цену: ${p.name} — ${fmt(p.price)} → ${fmt(inp.new_price)} сум`
        : `Narxni o'zgartirish: ${p.name} — ${fmt(p.price)} → ${fmt(inp.new_price)} so'm`;
    } else if (toolBlock.name === 'update_stock') {
      const p = await findProduct(inp.product_name);
      if (!p) return res.json({ response: lang === 'ru' ? `Товар "${inp.product_name}" не найден.` : `"${inp.product_name}" topilmadi.` });
      action = { type: 'UPDATE_STOCK', data: { product_id: p.id, product_name: p.name, new_quantity: inp.new_quantity } };
      desc = lang === 'ru'
        ? `Изменить склад: ${p.name} — ${p.stock_quantity} → ${inp.new_quantity} шт`
        : `Omborni o'zgartirish: ${p.name} — ${p.stock_quantity} → ${inp.new_quantity} dona`;
    } else if (toolBlock.name === 'record_payment') {
      action = { type: 'RECORD_PAYMENT', data: { customer_name: inp.customer_name, amount: inp.amount } };
      desc = lang === 'ru'
        ? `Оплата долга: ${inp.customer_name} — ${fmt(inp.amount)} сум`
        : `Qarz to'lovi: ${inp.customer_name} — ${fmt(inp.amount)} so'm`;
    } else if (toolBlock.name === 'create_sale') {
      const product = await findProduct(inp.product_name);
      if (!product) {
        return res.json({ response: (lang === 'ru' ? `Товар "${inp.product_name}" не найден.` : `"${inp.product_name}" mahsuloti topilmadi.`) });
      }
      const price = inp.unit_price || product.price;
      const total = price * inp.quantity;
      action = { type: 'CREATE_SALE', data: { product_id: product.id, product_name: product.name, quantity: inp.quantity, unit_price: price, customer_name: inp.customer_name || null } };
      desc = lang === 'ru'
        ? `Продажа: ${product.name} — ${inp.quantity} шт × ${fmt(price)} = ${fmt(total)} сум${inp.customer_name ? ', клиент: ' + inp.customer_name : ''}. (Остаток: ${product.stock_quantity})`
        : `Sotuv: ${product.name} — ${inp.quantity} dona × ${fmt(price)} = ${fmt(total)} so'm${inp.customer_name ? ', mijoz: ' + inp.customer_name : ''}. (Omborda: ${product.stock_quantity})`;
    } else if (toolBlock.name === 'add_expense') {
      action = { type: 'ADD_EXPENSE', data: { category: inp.category || 'OTHER', amount: inp.amount, description: inp.description || '' } };
      desc = lang === 'ru'
        ? `Расход: ${fmt(inp.amount)} сум (${inp.category || 'OTHER'})${inp.description ? ' — ' + inp.description : ''}`
        : `Xarajat: ${fmt(inp.amount)} so'm (${inp.category || 'OTHER'})${inp.description ? ' — ' + inp.description : ''}`;
    } else if (toolBlock.name === 'add_customer') {
      action = { type: 'ADD_CUSTOMER', data: { name: inp.name, phone: inp.phone || null, company_name: inp.company_name || null } };
      desc = lang === 'ru'
        ? `Новый клиент: ${inp.name}${inp.phone ? ', тел: ' + inp.phone : ''}`
        : `Yangi mijoz: ${inp.name}${inp.phone ? ', tel: ' + inp.phone : ''}`;
    } else if (toolBlock.name === 'create_intake') {
      // Mahsulotlarni tekshiramiz
      const items = [];
      const notFound = [];
      for (const it of (inp.items || [])) {
        const p = await findProduct(it.product_name);
        if (p) items.push({ product_id: p.id, product_name: p.name, quantity: it.quantity });
        else notFound.push(it.product_name);
      }
      if (!items.length) {
        return res.json({ response: lang === 'ru' ? 'Товары не найдены.' : 'Mahsulotlar topilmadi.' });
      }
      action = { type: 'CREATE_INTAKE', data: { items } };
      const list = items.map(i => `${i.product_name}: ${i.quantity}`).join(', ');
      desc = lang === 'ru'
        ? `Приход (на подтверждение): ${list}${notFound.length ? '. Не найдено: ' + notFound.join(', ') : ''}`
        : `Kirim (tasdiqlash uchun): ${list}${notFound.length ? '. Topilmadi: ' + notFound.join(', ') : ''}`;
    }

    return res.json({
      response: lead + desc,
      action: action ? { ...action, description: desc } : null,
    });
  } catch (err) {
    console.error('Ahmad command error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- GET /api/ahmad/daily-report ----------
router.get('/daily-report', async (req, res) => {
  try {
    const lang = req.query.language === 'ru' ? 'ru' : 'uz';
    const data = await gatherReport('today');
    res.json({ response: reportToText(data, lang), data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/ahmad/read-image ----------
router.post('/read-image', upload.single('image'), async (req, res) => {
  try {
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!req.file) return res.status(400).json({ error: lang === 'ru' ? 'Изображение не загружено' : 'Rasm yuklanmadi' });

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';
    fs.unlinkSync(req.file.path);

    if (!claude) {
      return res.json({ response: lang === 'ru' ? 'Ахмад: нужен API ключ' : 'Ahmad: API kaliti kerak', text: '' });
    }

    const systemPrompt = lang === 'ru'
      ? `Вы Ахмад — помощник завода Технопласт. Внимательно прочитайте изображение (накладная, чек, список заказа, прайс).
Извлеките товары: название, количество, цену. Если это список продаж/прихода — дайте JSON массив в блоке \`\`\`json.
Каждый элемент: {"name":"...","quantity":N,"price":N,"kind":"sale|intake|product"}. Отвечайте на русском.`
      : `Siz Ahmad — Teknoplast yordamchisisiz. Rasmni diqqat bilan o'qing (nakladnoy, chek, buyurtma ro'yxati, narxnoma).
Mahsulotlarni chiqaring: nom, miqdor, narx. Agar sotuv/kirim ro'yxati bo'lsa — \`\`\`json blokida massiv bering.
Har biri: {"name":"...","quantity":N,"price":N,"kind":"sale|intake|product"}. O'zbek tilida javob bering.`;

    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: lang === 'ru' ? 'Прочитайте и извлеките все данные.' : 'O\'qing va barcha ma\'lumotlarni chiqaring.' },
        ],
      }],
    });

    const responseText = message.content[0].text;
    let action = null;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const items = JSON.parse(jsonMatch[1]);
        if (Array.isArray(items) && items.length) {
          const kind = items[0].kind || 'product';
          if (kind === 'sale') {
            action = { type: 'BULK_SALES', data: { items }, description: lang === 'ru' ? `${items.length} продаж добавить?` : `${items.length} ta sotuv qo'shaylikmi?` };
          } else if (kind === 'intake') {
            action = { type: 'BULK_INTAKE', data: { items }, description: lang === 'ru' ? `${items.length} позиций прихода добавить?` : `${items.length} ta kirim qo'shaylikmi?` };
          } else {
            action = { type: 'ADD_PRODUCTS', data: items, description: lang === 'ru' ? `${items.length} товаров добавить?` : `${items.length} ta mahsulot qo'shaylikmi?` };
          }
        }
      } catch {}
    }

    res.json({
      response: responseText.replace(/```json[\s\S]*?```/g, '').trim(),
      text: responseText,
      action,
    });
  } catch (err) {
    console.error('Ahmad read-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/ahmad/confirm-action ----------
router.post('/confirm-action', async (req, res) => {
  try {
    const { action } = req.body;
    if (!action?.type) return res.status(400).json({ error: 'Action kerak' });

    // --- Bitta sotuv ---
    if (action.type === 'CREATE_SALE') {
      const d = action.data;
      const product = await query('SELECT id, stock_quantity FROM products WHERE id=$1', [d.product_id]);
      if (!product.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
      if (product.rows[0].stock_quantity < d.quantity) {
        return res.json({ success: false, message: `Omborda yetarli emas. Mavjud: ${product.rows[0].stock_quantity}` });
      }
      const total = d.quantity * d.unit_price;
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO sales (product_id, quantity, unit_price, total_amount, customer_name, sale_date, status, payment_amount, created_by, order_ref)
           VALUES ($1,$2,$3,$4,$5,$6,'PENDING',0,$7,$8)`,
          [d.product_id, d.quantity, d.unit_price, total, d.customer_name || 'Ahmad', new Date().toISOString().slice(0, 10), req.user.id, genOrderRef()]
        );
        await client.query('UPDATE products SET stock_quantity = stock_quantity - $1, updated_at=NOW() WHERE id=$2', [d.quantity, d.product_id]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return res.json({ success: true, message: `Sotuv yozildi: ${fmt(total)} so'm` });
    }

    // --- Xarajat ---
    if (action.type === 'ADD_EXPENSE') {
      const d = action.data;
      await query(
        'INSERT INTO expenses (category, amount, description, expense_date, created_by) VALUES ($1,$2,$3,$4,$5)',
        [d.category || 'OTHER', d.amount, d.description || 'Ahmad orqali', new Date().toISOString().slice(0, 10), req.user.id]
      );
      return res.json({ success: true, message: `Xarajat yozildi: ${fmt(d.amount)} so'm` });
    }

    // --- Mijoz ---
    if (action.type === 'ADD_CUSTOMER') {
      const d = action.data;
      await query(
        'INSERT INTO customers (name, phone, company_name, customer_type, created_by) VALUES ($1,$2,$3,$4,$5)',
        [d.name, d.phone || null, d.company_name || null, 'RETAIL', req.user.id]
      );
      return res.json({ success: true, message: `Mijoz qo'shildi: ${d.name}` });
    }

    // --- Narx o'zgartirish ---
    if (action.type === 'UPDATE_PRICE') {
      const d = action.data;
      await query('UPDATE products SET price=$1, updated_at=NOW() WHERE id=$2', [d.new_price, d.product_id]);
      return res.json({ success: true, message: `${d.product_name} narxi ${fmt(d.new_price)} so'm bo'ldi` });
    }

    // --- Ombor o'zgartirish ---
    if (action.type === 'UPDATE_STOCK') {
      const d = action.data;
      await query('UPDATE products SET stock_quantity=$1, updated_at=NOW() WHERE id=$2', [parseInt(d.new_quantity), d.product_id]);
      return res.json({ success: true, message: `${d.product_name} ombori ${d.new_quantity} dona bo'ldi` });
    }

    // --- Qarz to'lovi ---
    if (action.type === 'RECORD_PAYMENT') {
      const d = action.data;
      // Mijozning to'lanmagan sotuvlarini eski sanadan boshlab to'laymiz
      const unpaid = await query(`
        SELECT s.id, (s.total_amount - s.payment_amount) as debt, s.total_amount, s.payment_amount
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.status!='PAID' AND (s.total_amount - s.payment_amount) > 0.01
          AND (LOWER(c.name) LIKE LOWER($1) OR LOWER(s.customer_name) LIKE LOWER($1))
        ORDER BY s.sale_date ASC
      `, [`%${d.customer_name}%`]);

      if (!unpaid.rows.length) {
        return res.json({ success: false, message: `${d.customer_name} uchun qarz topilmadi` });
      }

      let remaining = Number(d.amount);
      let paidCount = 0;
      for (const sale of unpaid.rows) {
        if (remaining <= 0) break;
        const debt = Number(sale.debt);
        const pay = Math.min(remaining, debt);
        const newPaid = Number(sale.payment_amount) + pay;
        const newStatus = newPaid >= Number(sale.total_amount) ? 'PAID' : 'PARTIAL';
        await query('UPDATE sales SET payment_amount=$1, status=$2 WHERE id=$3', [newPaid, newStatus, sale.id]);
        remaining -= pay;
        paidCount++;
      }
      return res.json({ success: true, message: `${d.customer_name}: ${fmt(d.amount)} so'm to'lov yozildi (${paidCount} ta sotuv)` });
    }

    // --- Kirim (PENDING) ---
    if (action.type === 'CREATE_INTAKE' || action.type === 'BULK_INTAKE') {
      let items = action.data.items || action.data;
      // BULK_INTAKE (rasmdan) — nomlarni product_id ga aylantiramiz
      if (action.type === 'BULK_INTAKE') {
        const resolved = [];
        for (const it of items) {
          const p = await findProduct(it.name || it.product_name);
          if (p) resolved.push({ product_id: p.id, quantity: it.quantity });
        }
        items = resolved;
      }
      if (!items.length) return res.json({ success: false, message: 'Mahsulot topilmadi' });
      const client = await getClient();
      try {
        await client.query('BEGIN');
        const intakeR = await client.query(
          `INSERT INTO product_intakes (status, notes, created_by) VALUES ('PENDING', $1, $2) RETURNING id`,
          ['Ahmad orqali', req.user.id]
        );
        const intakeId = intakeR.rows[0].id;
        for (const it of items) {
          await client.query('INSERT INTO intake_items (intake_id, product_id, quantity) VALUES ($1,$2,$3)', [intakeId, it.product_id, parseInt(it.quantity)]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return res.json({ success: true, message: `Kirim yaratildi (${items.length} ta), tasdiqlash kutilmoqda` });
    }

    // --- Ko'plab sotuv (rasmdan) ---
    if (action.type === 'BULK_SALES') {
      let added = 0;
      for (const it of action.data.items) {
        try {
          const p = await findProduct(it.name || it.product_name);
          if (!p) continue;
          const price = it.price || p.price;
          const qty = parseInt(it.quantity) || 1;
          if (p.stock_quantity < qty) continue;
          const total = price * qty;
          const client = await getClient();
          try {
            await client.query('BEGIN');
            await client.query(
              `INSERT INTO sales (product_id, quantity, unit_price, total_amount, customer_name, sale_date, status, payment_amount, created_by, order_ref)
               VALUES ($1,$2,$3,$4,$5,$6,'PENDING',0,$7,$8)`,
              [p.id, qty, price, total, 'Ahmad', new Date().toISOString().slice(0, 10), req.user.id, genOrderRef()]
            );
            await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2', [qty, p.id]);
            await client.query('COMMIT');
            added++;
          } catch (e) { await client.query('ROLLBACK'); } finally { client.release(); }
        } catch {}
      }
      return res.json({ success: true, message: `${added} ta sotuv yozildi` });
    }

    // --- Ko'plab mahsulot (rasmdan) ---
    if (action.type === 'ADD_PRODUCTS') {
      let added = 0;
      for (const p of action.data) {
        try {
          await query(
            'INSERT INTO products (name, type, price, unit, stock_quantity) VALUES ($1,$2,$3,$4,$5)',
            [p.name || p.nomi, 'PLASTIK', p.price || p.narx || 0, 'dona', p.quantity || p.miqdor || 0]
          );
          added++;
        } catch {}
      }
      return res.json({ success: true, message: `${added} ta mahsulot qo'shildi` });
    }

    res.status(400).json({ error: 'Noma\'lum action turi' });
  } catch (err) {
    console.error('Ahmad confirm-action error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
