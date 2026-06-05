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
    const { text, language } = req.body;
    const lang = language === 'ru' ? 'ru' : 'uz';
    if (!text?.trim()) return res.status(400).json({ error: lang === 'ru' ? 'Текст пустой' : 'Matn bo\'sh' });

    if (!claude) {
      return res.json({ response: lang === 'ru' ? 'Ахмад: нужен API ключ' : 'Ahmad: API kaliti kerak' });
    }

    const system = lang === 'ru'
      ? `Вы Ахмад — голосовой помощник завода пластиковых изделий Технопласт.
Если пользователь просит выполнить операцию (продажа, расход, приход, новый клиент) — вызовите соответствующий инструмент.
Если просит отчёт/статистику — вызовите get_report.
Если это вопрос — ответьте кратко на русском. Представляйтесь как Ахмад. Числа: 1 000 000 сум.`
      : `Siz Ahmad — Teknoplast plastik zavod ovozli yordamchisisiz.
Agar foydalanuvchi amal bajarishni so'rasa (sotuv, xarajat, kirim, yangi mijoz) — mos toolni chaqiring.
Agar hisobot/statistika so'rasa — get_report toolini chaqiring.
Agar oddiy savol bo'lsa — o'zbek tilida qisqa javob bering. O'zingizni Ahmad deb tanishtiring. Raqamlar: 1 000 000 so'm.`;

    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: [{ role: 'user', content: text }],
    });

    const textBlock = msg.content.find(b => b.type === 'text');
    const toolBlock = msg.content.find(b => b.type === 'tool_use');

    // Tool chaqirilmadi — oddiy javob
    if (!toolBlock) {
      return res.json({ response: textBlock?.text || (lang === 'ru' ? 'Не понял.' : 'Tushunmadim.') });
    }

    const lead = textBlock?.text ? textBlock.text + '\n' : '';

    // get_report — darhol bajaramiz (ruxsat shart emas)
    if (toolBlock.name === 'get_report') {
      const period = toolBlock.input?.period || 'today';
      const data = await gatherReport(period);
      return res.json({ response: reportToText(data, lang) });
    }

    // Yozuv amallari — tasdiqlash uchun action qaytaramiz
    const inp = toolBlock.input || {};
    let action = null;
    let desc = '';

    if (toolBlock.name === 'create_sale') {
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
