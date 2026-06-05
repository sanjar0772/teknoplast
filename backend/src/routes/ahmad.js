const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { query } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  dest: '/tmp/ahmad-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Faqat rasm fayllari'), false);
  },
});

// Anthropic client
let claude;
try {
  claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (e) {
  console.log('Ahmad: Anthropic API kaliti topilmadi, basic mode');
}

// POST /api/ahmad/read-image — Rasm o'qish (nakladnoy, chek, hujjat)
router.post('/read-image', upload.single('image'), async (req, res) => {
  try {
    const { language } = req.body;
    const lang = language === 'ru' ? 'ru' : 'uz';

    if (!req.file) {
      return res.status(400).json({
        error: lang === 'uz' ? 'Rasm yuklanmadi' : 'Изображение не загружено',
      });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    if (!claude) {
      return res.json({
        response: lang === 'uz'
          ? 'Ahmad: Rasmni o\'qish uchun API kaliti kerak'
          : 'Ахмад: Для чтения изображения нужен API ключ',
        text: '',
      });
    }

    const systemPrompt = lang === 'uz'
      ? `Siz Ahmad — Teknoplast zavod yordamchisisiz. Rasmni diqqat bilan o'qing.
         Agar bu nakladnoy, chek yoki hujjat bo'lsa — barcha ma'lumotlarni chiqaring:
         mahsulot nomlari, miqdorlar, narxlar, sanalar, yetkazuvchi/mijoz ma'lumotlari.
         Agar tizimga qo'shish mumkin bo'lsa — taklif qiling.
         O'zbek tilida javob bering.`
      : `Вы Ахмад — помощник завода Технопласт. Внимательно прочитайте изображение.
         Если это накладная, чек или документ — извлеките все данные:
         названия товаров, количества, цены, даты, данные поставщика/клиента.
         Если возможно добавить в систему — предложите.
         Отвечайте на русском языке.`;

    const message = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: lang === 'uz'
              ? 'Bu rasmni o\'qi va barcha ma\'lumotlarni chiqar. Agar nakladnoy/chek bo\'lsa, mahsulotlar ro\'yxatini JSON formatida ham ber.'
              : 'Прочитайте это изображение и извлеките все данные. Если это накладная/чек, дайте список товаров в JSON формате.',
          },
        ],
      }],
    });

    const responseText = message.content[0].text;

    // Try to extract action (if nakladnoy detected)
    let action = null;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[1]);
        if (Array.isArray(extracted) && extracted.length > 0) {
          action = {
            type: 'ADD_PRODUCTS',
            data: extracted,
            description: lang === 'uz'
              ? `${extracted.length} ta mahsulot topildi. Tizimga qo'shaylikmi?`
              : `Найдено ${extracted.length} товаров. Добавить в систему?`,
          };
        }
      } catch {}
    }

    res.json({
      response: responseText.replace(/```json[\s\S]*?```/g, '').trim(),
      text: responseText,
      extracted: jsonMatch ? jsonMatch[1] : null,
      action,
    });
  } catch (err) {
    console.error('Ahmad read-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ahmad/confirm-action — Tizimga qo'shish
router.post('/confirm-action', async (req, res) => {
  try {
    const { action } = req.body;

    if (!action || !action.type) {
      return res.status(400).json({ error: 'Action kerak' });
    }

    if (action.type === 'ADD_PRODUCTS') {
      let added = 0;
      for (const p of action.data) {
        try {
          await query(
            'INSERT INTO products (name, type, price, unit, stock_quantity) VALUES ($1,$2,$3,$4,$5)',
            [p.name || p.nomi, 'PLASTIK', p.price || p.narx || 0, 'dona', p.quantity || p.miqdor || 0]
          );
          added++;
        } catch (e) {
          console.log('Ahmad add product error:', e.message);
        }
      }

      return res.json({
        success: true,
        message: `${added} ta mahsulot tizimga qo'shildi`,
      });
    }

    if (action.type === 'ADD_SALE') {
      const { product_id, quantity, unit_price, customer_name } = action.data;
      const total = quantity * unit_price;
      await query(
        'INSERT INTO sales (product_id, quantity, unit_price, total_amount, customer_name, sale_date, status, created_by) VALUES ($1,$2,$3,$4,$5,datetime(\'now\'),\'COMPLETED\',$6)',
        [product_id, quantity, unit_price, total, customer_name || 'Noma\'lum', req.user.id]
      );
      return res.json({ success: true, message: 'Sotuv yozildi' });
    }

    if (action.type === 'ADD_INTAKE') {
      return res.json({ success: true, message: 'Kirim yozildi' });
    }

    res.status(400).json({ error: 'Noma\'lum action turi' });
  } catch (err) {
    console.error('Ahmad confirm-action error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
