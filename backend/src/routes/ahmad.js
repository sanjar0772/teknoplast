const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { query, getClient } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { parseProductName } = require('../utils/parseProductName');

const router = express.Router();
router.use(authenticate);

// Qo'llab-quvvatlanadigan fayl turlari (kengaytma bo'yicha)
const SUPPORTED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',        // rasm
  '.pdf',                                            // PDF
  '.xlsx', '.xls',                                   // Excel
  '.csv', '.txt', '.tsv',                            // matn/jadval
  '.docx',                                           // Word
]);

function isSupportedFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (SUPPORTED_EXT.has(ext)) return true;
  // Ba'zi brauzerlar kengaytmasiz yuboradi — mimetype bo'yicha ham tekshiramiz
  const m = file.mimetype || '';
  return m.startsWith('image/') || m === 'application/pdf' || m.startsWith('text/');
}

const upload = multer({
  dest: '/tmp/ahmad-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isSupportedFile(file)) cb(null, true);
    else cb(new Error('Qo\'llab-quvvatlanmaydigan fayl turi'), false);
  },
});

// ---------- Ovozdan matnga (STT) — Groq Whisper, o'zbekchani yaxshi tushunadi ----------
// Audio fayllar uchun alohida multer (rasm filtridan o'tmaydi)
const audioUpload = multer({
  dest: '/tmp/ahmad-audio/',
  limits: { fileSize: 25 * 1024 * 1024 },
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// whisper-large-v3 — eng aniq multilingual model (o'zbek tilini qo'llab-quvvatlaydi)
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3';

// Whisper'ga "kontekst" beruvchi prompt — Teknoplast lug'ati bilan tanishni kuchaytiradi.
// (Whisper prompt'dagi so'zlar va uslubni hisobga oladi -> o'zbekcha atamalarni aniqroq yozadi)
const UZ_STT_PROMPT =
  "Lola, Teknoplast zavodi yordamchisi. O'zbek tilidagi buyruq. " +
  "Atamalar: mahsulot, sotuv, ombor, narx, dona, so'm, qarz, qarzdor, mijoz, xodim, " +
  "ish haqi, hisobot, prixod, naqd, plastik, quvur, fitting, kran, smena, tarif. " +
  "Masalan: bugungi sotuvni ayt, omborda nechta bor, qarzdorlar ro'yxatini ko'rsat.";
const RU_STT_PROMPT =
  "Лола, помощница завода Технопласт. Команда на русском. " +
  "Термины: товар, продажа, склад, цена, штука, сумма, долг, должник, клиент, сотрудник, отчёт, приход, смена, тариф.";

// Audio buffer -> matn (Groq Whisper, OpenAI-mos endpoint). Node 20: global fetch/FormData/Blob.
async function transcribeWithGroq(buffer, filename, lang) {
  if (!GROQ_API_KEY) throw new Error('NO_GROQ_KEY');
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename || 'audio.webm');
  form.append('model', GROQ_STT_MODEL);
  form.append('language', lang === 'ru' ? 'ru' : 'uz'); // tilni majburlash -> aniqlik oshadi
  form.append('prompt', lang === 'ru' ? RU_STT_PROMPT : UZ_STT_PROMPT);
  form.append('temperature', '0');
  form.append('response_format', 'json');

  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`GROQ_${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return (data.text || '').trim();
}

// ---------- UzbekVoice.ai — o'zbekka maxsus STT (Whisper'dan ko'ra aniqroq) ----------
const UZBEKVOICE_API_KEY = process.env.UZBEKVOICE_API_KEY;

// Javobdan transkript matnini turli shakllardan mustahkam ajratib olish
function extractUzbekVoiceText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const cands = [
    data.text, data.transcript, data.transcription,
    data.result?.text, data.result?.conversation_text, data.result?.transcript,
    data.data?.text, data.data?.transcript,
    typeof data.result === 'string' ? data.result : null,
    typeof data.data === 'string' ? data.data : null,
  ];
  for (const c of cands) if (typeof c === 'string' && c.trim()) return c;
  // result/segments massiv bo'lsa — birlashtiramiz
  const arr = Array.isArray(data.result) ? data.result
            : Array.isArray(data.segments) ? data.segments
            : Array.isArray(data.data) ? data.data : null;
  if (arr) {
    const joined = arr.map(s => (s && (s.text || s.transcript)) || '').join(' ').trim();
    if (joined) return joined;
  }
  return '';
}

// Audio buffer -> matn (UzbekVoice.ai). blocking=true => javob darhol qaytadi.
async function transcribeWithUzbekVoice(buffer, filename, lang) {
  if (!UZBEKVOICE_API_KEY) throw new Error('NO_UZBEKVOICE_KEY');
  const fn = filename || 'audio.wav';
  // UzbekVoice fayl turiga e'tibor beradi — to'g'ri content-type beramiz
  const type = fn.endsWith('.wav') ? 'audio/wav'
             : fn.endsWith('.mp3') ? 'audio/mpeg'
             : fn.endsWith('.ogg') ? 'audio/ogg'
             : fn.endsWith('.m4a') ? 'audio/mp4'
             : 'application/octet-stream';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), fn);
  form.append('language', lang === 'ru' ? 'ru' : 'uz');
  form.append('model', 'general');
  form.append('blocking', 'true');        // sinxron — javobni darhol oladi (webhook kerak emas)
  form.append('return_offsets', 'false');
  form.append('run_diarization', 'false');

  const resp = await fetch('https://uzbekvoice.ai/api/v1/stt', {
    method: 'POST',
    headers: { Authorization: UZBEKVOICE_API_KEY }, // hujjatda Bearer YO'Q — to'g'ridan-to'g'ri kalit
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`UZBEKVOICE_${resp.status}: ${errText.slice(0, 300)}`);
  }
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await resp.json() : await resp.text();
  return extractUzbekVoiceText(data).trim();
}

// ---------- UzbekVoice.ai — matndan ovozga (TTS), tabiiy o'zbek ovozi ----------
// UzbekVoice'da o'zbek ovozlari: "lola", "shoira" (ikkalasi ayol). Erkak ovozi yo'q.
const UZBEKVOICE_TTS_VOICE = process.env.UZBEKVOICE_TTS_VOICE || 'lola';

// Matn -> audio URL (UzbekVoice WAV faylga presigned havola qaytaradi)
async function synthesizeWithUzbekVoice(text, voice) {
  if (!UZBEKVOICE_API_KEY) throw new Error('NO_UZBEKVOICE_KEY');
  const resp = await fetch('https://uzbekvoice.ai/api/v1/tts', {
    method: 'POST',
    headers: { Authorization: UZBEKVOICE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: voice || UZBEKVOICE_TTS_VOICE, blocking: 'true' }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`UZBEKVOICE_TTS_${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data?.result?.url || '';
}

// ---------- Narx/miqdor tozalash: "5 000", "5,000", "5.000" → 5000 ----------
function cleanNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number' && !isNaN(v)) return v;
  const s = String(v).replace(/\s+/g, '').replace(/,/g, '');
  return parseFloat(s) || 0;
}

// Matndan barcha to'liq { ... } obyektlarni ajratib, alohida parse qilish.
// JSON uzilib qolgan (truncated) bo'lsa ham ishlaydi — to'liq obyektlarni oladi.
function extractObjects(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        let s = text.slice(start, i + 1).replace(/,\s*([\]}])/g, '$1');
        try { out.push(JSON.parse(s)); } catch { /* buzuq obyekt — o'tkazamiz */ }
        start = -1;
      }
    }
  }
  return out;
}

// ---------- Claude javobidan JSON massivni mustahkam ajratish ----------
// ```json ... ```, ``` ... ```, [ ... ], yoki UZILGAN JSON — barchasini tutadi
function extractJsonArray(text) {
  if (!text) return null;
  const candidates = [];
  let m = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (m) candidates.push(m[1]);
  m = text.match(/```\s*([\s\S]*?)\s*```/);
  if (m) candidates.push(m[1]);
  // balansli [ ... ] massiv
  const start = text.indexOf('[');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') {
        depth--;
        if (depth === 0) { candidates.push(text.slice(start, i + 1)); break; }
      }
    }
  }
  // 1) To'liq, to'g'ri JSON massivni sinaymiz
  for (let raw of candidates) {
    if (!raw) continue;
    let s = raw.trim().replace(/,\s*([\]}])/g, '$1');
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch { /* keyingisi */ }
  }
  // 2) JSON uzilgan bo'lsa — har bir { ... } obyektni alohida ajratamiz
  const objs = extractObjects(text);
  if (objs.length) return objs;
  return null;
}

// ---------- Fayldan matn ajratish (Excel / Word / CSV / TXT) ----------
async function excelToText(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  let out = '';
  wb.eachSheet((sheet) => {
    out += `\n# Varaq: ${sheet.name}\n`;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values || []).slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object') return String(v.text ?? v.result ?? v.hyperlink ?? '');
        return String(v);
      });
      if (vals.some((x) => x !== '')) out += vals.join('\t') + '\n';
    });
  });
  return out.trim();
}

async function docxToText(buffer) {
  const mammoth = require('mammoth'); // ixtiyoriy dependency
  const { value } = await mammoth.extractRawText({ buffer });
  return (value || '').trim();
}

// Buffer -> Claude uchun content bloki yoki matn. {block} yoki {text} qaytaradi.
async function fileToContent(buffer, ext, mediaType) {
  // Rasm
  if (mediaType.startsWith('image/') && !['.xlsx', '.xls', '.docx', '.csv', '.txt', '.tsv', '.pdf'].includes(ext)) {
    return { block: { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } } };
  }
  // PDF
  if (ext === '.pdf' || mediaType === 'application/pdf') {
    return { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } } };
  }
  // Excel
  if (ext === '.xlsx') {
    return { text: await excelToText(buffer) };
  }
  if (ext === '.xls') {
    // exceljs faqat .xlsx o'qiydi
    throw new Error('UNSUPPORTED_XLS');
  }
  // Word
  if (ext === '.docx') {
    return { text: await docxToText(buffer) };
  }
  // CSV / TXT / TSV yoki text/* mimetype
  if (['.csv', '.txt', '.tsv'].includes(ext) || mediaType.startsWith('text/')) {
    return { text: buffer.toString('utf-8').trim() };
  }
  throw new Error('UNSUPPORTED_TYPE');
}

let claude;
try {
  claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (e) {
  console.log('Ahmad: Anthropic API kaliti topilmadi');
}

// Ahmad "miyasi" — eng kuchli Opus model (aqlliroq, o'zbekchani ravon tushunadi va yozadi)
const MODEL = process.env.AHMAD_MODEL || 'claude-opus-4-8';

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
// O'qish (barcha foydalanuvchilar)
const READ_TOOLS = [
  {
    name: 'get_report',
    description: 'Hisobot/statistika: bugungi yoki oylik sotuv, xarajat, foyda, kam qolgan mahsulotlar, qarzdorlar.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'month'], description: 'today=bugun, month=shu oy' },
      },
    },
  },
  {
    name: 'product_stats',
    description: "Barcha mahsulotlar bo'yicha sotuv statistikasi: har bir mahsulot qancha sotilgan (dona) va qancha daromad keltirgan. Vaqt oralig'i berilsa (masalan 'may oyida', '1-iyundan 15-iyungacha', 'bugun', 'shu oy') o'sha davr bo'yicha ko'rsatadi. 'Mahsulotlar statistikasi', 'qaysi mahsulot ko'p sotildi', 'to'liq sotuv statistikasi', 'статистика товаров'.",
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'month', 'all'], description: "today=bugun, month=shu oy, all=butun davr (standart). start_date/end_date berilsa o'sha ustun." },
        start_date: { type: 'string', description: 'YYYY-MM-DD — davr boshi (ixtiyoriy)' },
        end_date: { type: 'string', description: 'YYYY-MM-DD — davr oxiri (ixtiyoriy)' },
        limit: { type: 'number', description: "Nechta mahsulot ko'rsatilsin (standart 50; 'hammasi' so'ralsa katta son, mas. 500)" },
      },
    },
  },
  {
    name: 'lookup',
    description: 'Mahsulot narxi yoki ombordagi sonini bilish. "gul tuvak narxi qancha?", "omborda nechta chelak bor?".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        what: { type: 'string', enum: ['price', 'stock', 'both'] },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'list_debtors',
    description: 'Qarzdorlar ro\'yxati. "Kim qarzdor?", "qarzdorlar ro\'yxati".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_employees',
    description: 'Xodimlar ro\'yxati. "1-smena stanokchilar kim?", "qancha xodim bor?", "2-smena ro\'yxati".',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['STANOKCHI', 'DETALCHI', 'ISHCHI', 'OSHPAZ', 'SHOFIR', 'BUGALTER', 'SIFAT', 'CALL_CENTER', 'YORDAMCHI', 'DROBILKA', 'ELEKTRIK', 'USTA', 'OHRANA', 'SKLAD', 'TEHNOLOG', 'MARKETING', 'BOSHQA'] },
        shift: { type: 'string', enum: ['1-SMENA', '2-SMENA'] },
      },
    },
  },
  {
    name: 'generate_document',
    description: 'Hujjat: oylik hisobot PDF yoki sotuvlar Excel.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['monthly_pdf', 'sales_excel'] },
        month: { type: 'string', description: 'YYYY-MM, aytilmasa shu oy' },
      },
      required: ['doc_type'],
    },
  },
];

// Yozish (faqat OWNER/admin)
const WRITE_TOOLS = [
  {
    name: 'create_sale',
    description: 'Sotuvni ro\'yxatga olish. "50 dona chelak 7000 dan sotildi".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        quantity: { type: 'number' },
        unit_price: { type: 'number', description: 'Aytilmasa yubormang' },
        customer_name: { type: 'string', description: 'Ixtiyoriy' },
      },
      required: ['product_name', 'quantity'],
    },
  },
  {
    name: 'add_expense',
    description: 'Xarajat qo\'shish. "Elektr uchun 500000 xarajat qo\'sh".',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['RAW_MATERIAL', 'ENERGY', 'MAINTENANCE', 'SALARY', 'TRANSPORT', 'OTHER'] },
        amount: { type: 'number' },
        description: { type: 'string' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'add_customer',
    description: 'Yangi mijoz qo\'shish.',
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
    description: 'Omborga mahsulot kirimi (tasdiqlash kerak).',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { product_name: { type: 'string' }, quantity: { type: 'number' } },
            required: ['product_name', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'update_price',
    description: 'Mahsulot narxini o\'zgartirish. "gul tuvak narxini 8000 qil".',
    input_schema: {
      type: 'object',
      properties: { product_name: { type: 'string' }, new_price: { type: 'number' } },
      required: ['product_name', 'new_price'],
    },
  },
  {
    name: 'update_stock',
    description: 'Mahsulot ombordagi sonini o\'zgartirish.',
    input_schema: {
      type: 'object',
      properties: { product_name: { type: 'string' }, new_quantity: { type: 'number' } },
      required: ['product_name', 'new_quantity'],
    },
  },
  {
    name: 'record_payment',
    description: 'Mijoz qarz to\'lovini yozish. "Dilshod 500000 to\'ladi".',
    input_schema: {
      type: 'object',
      properties: { customer_name: { type: 'string' }, amount: { type: 'number' } },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'add_production',
    description: 'Xodim ishlab chiqarishini yozish. "Sarvar bugun 200 chelak yasadi".',
    input_schema: {
      type: 'object',
      properties: {
        employee_name: { type: 'string' },
        product_name: { type: 'string', description: 'Ixtiyoriy' },
        quantity: { type: 'number' },
        date: { type: 'string', description: 'YYYY-MM-DD, aytilmasa bugun' },
        production_type: { type: 'string', enum: ['FINISHED', 'SEMI_FINISHED'], description: 'Stanokchi uchun: tayyor=FINISHED, yarim tayyor=SEMI_FINISHED. Aytilmasa FINISHED.' },
      },
      required: ['employee_name', 'quantity'],
    },
  },
  {
    name: 'add_employee',
    description: 'Yangi xodim qo\'shish. "Sarvar Toshmatov stanokchi 1-smena". Kunlik tarif YO\'Q — haq mahsulot/maosh orqali.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'To\'liq ismi' },
        type: { type: 'string', enum: ['STANOKCHI', 'DETALCHI', 'ISHCHI', 'OSHPAZ', 'SHOFIR', 'BUGALTER', 'SIFAT', 'CALL_CENTER', 'YORDAMCHI', 'DROBILKA', 'ELEKTRIK', 'USTA', 'OHRANA', 'SKLAD', 'TEHNOLOG', 'MARKETING', 'BOSHQA'], description: 'Xodim turi' },
        shift: { type: 'string', enum: ['1-SMENA', '2-SMENA'], description: 'Smena (STANOKCHI uchun)' },
        phone: { type: 'string', description: 'Telefon (ixtiyoriy)' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'remove_employee',
    description: 'Xodimni nofaol qilish (o\'chirish). "Sarvarni ishdan bo\'shat", "Xasanni o\'chir".',
    input_schema: {
      type: 'object',
      properties: { employee_name: { type: 'string' } },
      required: ['employee_name'],
    },
  },
  {
    name: 'update_employee',
    description: 'Xodim ma\'lumotini o\'zgartirish: smena, tarif, telefon. "Sarvarni 2-smenaga o\'tkaz", "Xasan tarifini 60000 qil".',
    input_schema: {
      type: 'object',
      properties: {
        employee_name: { type: 'string' },
        shift: { type: 'string', enum: ['1-SMENA', '2-SMENA'], description: 'Yangi smena' },
        daily_tariff: { type: 'number', description: 'Yangi kunlik tarif' },
        phone: { type: 'string', description: 'Yangi telefon' },
      },
      required: ['employee_name'],
    },
  },
  {
    name: 'add_user',
    description: 'Yangi TIZIM FOYDALANUVCHISI (login akkaunt) yaratish — xodimga tizimga kirish huquqi berish. "Azizga sotuvchi akkaunt och", "buxgalter uchun login yarat". MUHIM: parolni tizim avtomatik yaratadi — foydalanuvchidan parol SO\'RAMANG va parolni qabul qilmang. Faqat EGA.',
    input_schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'To\'liq ism' },
        phone: { type: 'string', description: 'Telefon raqami (login uchun), masalan +998901234567' },
        role: { type: 'string', enum: ['OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD', 'KIRIMCHI', 'OMBORCHI'], description: 'Rol: OWNER=ega, ACCOUNTANT=buxgalter, SALES_HEAD=sotuv boshlig\'i, PRODUCTION_HEAD=ishlab chiqarish boshlig\'i, KIRIMCHI=kirimchi, OMBORCHI=omborchi' },
      },
      required: ['full_name', 'phone', 'role'],
    },
  },
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
const READ_TOOL_NAMES = new Set(READ_TOOLS.map(t => t.name));

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
async function commandHandler(req, res) {
  try {
    const { text, language, history } = req.body;
    const lang = language === 'ru' ? 'ru' : 'uz';
    if (!text?.trim()) return res.status(400).json({ error: lang === 'ru' ? 'Текст пустой' : 'Matn bo\'sh' });

    if (!claude) {
      return res.json({ response: lang === 'ru' ? 'Лола: нужен API ключ' : 'Lola: API kaliti kerak' });
    }

    const isOwner = req.user?.role === 'OWNER';
    const activeTools = isOwner ? ALL_TOOLS : READ_TOOLS;

    const system = lang === 'ru'
      ? `Вы Лола — умная голосовая помощница завода Технопласт (пластиковые изделия).
Роль текущего пользователя: ${isOwner ? 'АДМИНИСТРАТОР (все права)' : 'СОТРУДНИК (только просмотр)'}.
${isOwner
  ? 'Вы можете выполнять любые операции: продажи, расходы, приход, сотрудники, производство, цены, склад.'
  : 'Вы можете только просматривать: отчёты, остатки, сотрудников, должников. Изменения — только для администратора.'}
Инструменты: get_report (отчёт), product_stats (статистика товаров за период), lookup (цена/склад), list_debtors (должники), get_employees (сотрудники), generate_document (PDF/Excel)${isOwner ? ', create_sale, add_expense, add_customer, create_intake, update_price, update_stock, record_payment, add_production, add_employee, remove_employee, update_employee, add_user (создать логин-аккаунт)' : ''}.
Помните историю разговора (до 6 сообщений). Краткие ответы. Числа: 1 000 000 сум. Представляйтесь как Лола.
Вы УМЕЕТЕ читать файлы (PDF, фото, Excel, Word) — если пользователь хочет прислать файл, пусть нажмёт кнопку прикрепления (скрепка). НИКОГДА не говорите "не могу читать PDF/файлы".
ВАЖНО: без *, #, эмодзи, маркдауна — только чистый текст (ответ озвучивается).`
      : `Siz Lola — Teknoplast plastik buyumlar zavodining aqlli yordamchisisiz.
Joriy foydalanuvchi roli: ${isOwner ? 'ADMIN (to\'liq huquq)' : 'XODIM (faqat ko\'rish)'}.
${isOwner
  ? 'Siz har qanday amalni bajara olasiz: sotuv, xarajat, kirim, xodim, ishlab chiqarish, narx, ombor.'
  : 'Siz faqat ko\'ra olasiz: hisobot, ombor, xodimlar, qarzdorlar. O\'zgartirish faqat admin uchun.'}
Toollar: get_report, product_stats (mahsulotlar statistikasi — davr bo'yicha), lookup, list_debtors, get_employees, generate_document${isOwner ? ', create_sale, add_expense, add_customer, create_intake, update_price, update_stock, record_payment, add_production, add_employee, remove_employee, update_employee, add_user (login akkaunt yaratish)' : ''}.

MUHIM — O'ZBEK TILINI TUSHUNISH:
- Foydalanuvchi matni OVOZLI buyruqdan kelishi mumkin. Unda tanish/imlo xatolari, kirill harflar yoki rus so'zlari aralash bo'lishi mumkin. Matn biroz buzuq bo'lsa ham NIYATNI keng va aqlli tushuning — ortiqcha qayta so'ramang.
- O'zbekcha so'zlashuv va lahja shakllarini tushuning, masalan: "qancha pul tushdi" (=bugungi sotuv), "kim qarzdor / qarzdorlar kim", "nechta qoldi" (=ombor), "sotildi / sotib oldim / sotvoldim", "yozib qoy / qoshib qoy" (=qo'shish), "ochirib tashla" (=o'chirish), "narxini kotar / tushir / ozgartir", "ishladi / yasadi" (=ishlab chiqarish).
- Raqamlar o'zbekcha yoki ruscha aytilishi mumkin — to'g'ri songa aylantiring: "besh ming"=5000, "ellik dona"=50, "to'rt yuz ming"=400000, "bir yarim million"=1500000, "ikki yuz ellik ming"=250000.
- Buyruq biroz noaniq bo'lsa ham — eng ehtimolli amalni tanlang va tegishli toolni chaqiring. Faqat HAQIQATAN tushunarsiz bo'lsa qisqa aniqlovchi savol bering.
- Mahsulot yoki xodim nomi to'liq/aniq bo'lmasa ham — nomni qanday eshitilgan bo'lsa shundayligicha toolga uzating (tizim qisman nom bo'yicha izlaydi).

Suhbat tarixini esda tuting (6 xabar). Javoblar QISQA va aniq. Raqamlar: 1 000 000 so'm ko'rinishida. O'zingizni Lola deb tanishtiring.
Siz fayl ham O'QIY OLASIZ (PDF, rasm, Excel, Word) — foydalanuvchi fayl yubormoqchi bo'lsa, biriktirish (qisqich) tugmasidan foydalansin. HECH QACHON "PDF/fayl o'qiy olmayman" demang.
JAVOBNI DOIM O'ZBEK TILIDA bering (foydalanuvchi matni kirill yoki aralash bo'lsa ham). *, #, emoji, markdown ISHLATMANG — faqat toza matn (ovozda o'qiladi).`;

    // Ahmadni aqlliroq qilamiz: bugungi sana + chuqur niyat + ravon o'zbekcha + faqat yakuniy javob
    const todayStr = new Date().toISOString().slice(0, 10);
    const smartAddon = lang === 'ru'
      ? `\n\nДОПОЛНИТЕЛЬНО (самое важное):
- Сегодня: ${todayStr}. Периоды «сегодня», «вчера», «за месяц», «май», «с 1 по 15 июня» считайте от этой даты и передавайте в инструмент как start_date/end_date (YYYY-MM-DD).
- Глубоко понимайте намерение пользователя. Даже короткую или неясную команду трактуйте логично и выбирайте правильный инструмент. Уточняющий вопрос задавайте только если без него действительно никак.
- Отвечайте кратко, ясно и грамотно. Пишите только ИТОГОВЫЙ ответ — без рассуждений, без фраз вроде «я сделал», без лишних пояснений.`
      : `\n\nQO'SHIMCHA KO'RSATMALAR (eng muhim):
- Bugungi sana: ${todayStr}. «bugun», «kecha», «shu oy», «may oyi», «1-iyundan 15-igacha» kabi davrlarni shu sanadan hisoblab, toolga start_date/end_date (YYYY-MM-DD) bering.
- Foydalanuvchi niyatini chuqur tushuning. Buyruq qisqa yoki noaniq bo'lsa ham mantiqan to'g'ri ma'noni toping va to'g'ri toolni tanlang. Faqat chindan zarur bo'lsagina bitta qisqa aniqlovchi savol bering.
- Javobni faqat RAVON, tabiiy va grammatik to'g'ri o'zbek tilida bering — xato qilmang.
- Faqat YAKUNIY javobni yozing: o'ylash bosqichlarini, «men shuni qildim» kabi gaplarni va ortiqcha izohlarni yozmang. Qisqa va aniq.`;
    const systemFull = system + smartAddon;

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
      max_tokens: 1536,
      system: systemFull,
      tools: activeTools,
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

    if (toolBlock.name === 'product_stats') {
      const limit = Math.min(Math.max(parseInt(inp.limit) || 50, 1), 500);
      const params = [];
      let where = '';
      let label;
      if (inp.start_date && inp.end_date) {
        where = 'WHERE s.sale_date >= $1 AND s.sale_date <= $2';
        params.push(inp.start_date, inp.end_date);
        label = `${inp.start_date} — ${inp.end_date}`;
      } else if (inp.period === 'today') {
        where = "WHERE strftime('%Y-%m-%d', s.sale_date) = $1";
        params.push(new Date().toISOString().slice(0, 10));
        label = lang === 'ru' ? 'за сегодня' : 'bugun';
      } else if (inp.period === 'month') {
        where = "WHERE TO_CHAR(s.sale_date,'YYYY-MM') = $1";
        params.push(new Date().toISOString().slice(0, 7));
        label = lang === 'ru' ? 'за месяц' : 'shu oy';
      } else {
        where = '';
        label = lang === 'ru' ? 'за всё время' : 'butun davr';
      }
      const rows = (await query(
        `SELECT p.name, COALESCE(SUM(s.quantity),0) qty, COALESCE(SUM(s.total_amount),0) revenue
         FROM sales s JOIN products p ON s.product_id = p.id
         ${where}
         GROUP BY p.name ORDER BY revenue DESC LIMIT $${params.length + 1}`,
        [...params, limit]
      )).rows;
      if (!rows.length) {
        return res.json({ response: lang === 'ru' ? `Продаж (${label}) нет.` : `${label} bo'yicha sotuv yo'q.` });
      }
      const totalQty = rows.reduce((a, r) => a + Number(r.qty || 0), 0);
      const totalRev = rows.reduce((a, r) => a + Number(r.revenue || 0), 0);
      const list = rows.map((r, i) => `${i + 1}. ${r.name}: ${fmt(r.qty)} ${lang === 'ru' ? 'шт' : 'dona'}, ${fmt(r.revenue)} ${lang === 'ru' ? 'сум' : "so'm"}`).join('\n');
      const head = lang === 'ru'
        ? `Статистика товаров (${label}). Всего ${rows.length} наименований, ${fmt(totalQty)} шт, ${fmt(totalRev)} сум:\n`
        : `Mahsulotlar statistikasi (${label}). Jami ${rows.length} xil, ${fmt(totalQty)} dona, ${fmt(totalRev)} so'm:\n`;
      return res.json({ response: head + list });
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

    if (toolBlock.name === 'get_employees') {
      const params = [];
      let idx = 1;
      let sql = "SELECT name, type, shift, daily_tariff, phone FROM employees WHERE is_active=1";
      if (inp.type) { sql += ` AND type=$${idx++}`; params.push(inp.type); }
      if (inp.shift) { sql += ` AND shift=$${idx++}`; params.push(inp.shift); }
      sql += ' ORDER BY shift, name LIMIT 30';
      const emps = await query(sql, params);
      if (!emps.rows.length) return res.json({ response: lang === 'ru' ? 'Сотрудники не найдены.' : 'Xodimlar topilmadi.' });
      const SHIFT_LABEL = { '1-SMENA': '1-Smena', '2-SMENA': '2-Smena' };
      const TYPE_LABEL = { STANOKCHI: 'Stanokchi', DETALCHI: 'Detalchi', ISHCHI: 'Ishchi', OSHPAZ: 'Oshpaz', SHOFIR: 'Shofir', BUGALTER: 'Bugalter', SIFAT: 'Sifat nazorati', CALL_CENTER: 'Call center', YORDAMCHI: 'Yordamchi', DROBILKA: 'Drobilka', ELEKTRIK: 'Elektrik', USTA: 'Usta', OHRANA: 'Ohrana', SKLAD: 'Sklad', TEHNOLOG: 'Tehnolog', MARKETING: 'Marketing', BOSHQA: 'Boshqa' };
      const list = emps.rows.map(e => {
        const shift = e.type === 'STANOKCHI' ? ` (${SHIFT_LABEL[e.shift] || e.shift})` : '';
        return `${e.name} — ${TYPE_LABEL[e.type] || e.type}${shift}`;
      }).join('; ');
      const total = emps.rows.length;
      return res.json({ response: lang === 'ru' ? `Сотрудников: ${total}. ${list}.` : `Xodimlar: ${total} ta. ${list}.` });
    }

    if (toolBlock.name === 'add_production') {
      // Xodimni topamiz
      const empR = await query(
        "SELECT id, name, type, daily_tariff FROM employees WHERE LOWER(name) LIKE LOWER($1) AND is_active=1 LIMIT 1",
        [`%${inp.employee_name}%`]
      );
      if (!empR.rows.length) {
        return res.json({ response: lang === 'ru' ? `Сотрудник "${inp.employee_name}" не найден.` : `"${inp.employee_name}" xodim topilmadi.` });
      }
      const emp = empR.rows[0];
      const product = inp.product_name ? await findProduct(inp.product_name) : null;
      const prodDate = inp.date || new Date().toISOString().slice(0, 10);
      const month = prodDate.slice(0, 7);
      const qty = Number(inp.quantity) || 0;

      // Ishlab chiqarish turi: STANOKCHI tayyor/yarim; DETALCHI doim yarim tayyor
      let ptype = inp.production_type === 'SEMI_FINISHED' ? 'SEMI_FINISHED' : 'FINISHED';
      if (emp.type === 'DETALCHI') ptype = 'SEMI_FINISHED';

      // Stanokchi/detalchi — mahsulot dona narxidan; boshqalar — kunlik tarif
      let rate = Number(emp.daily_tariff) || 0;
      let calcAmount;
      if (product && (emp.type === 'STANOKCHI' || emp.type === 'DETALCHI')) {
        const pr = await query('SELECT stanokchi_rate, stanokchi_semi_rate, detalchi_rate FROM products WHERE id=$1', [product.id]);
        const prow = pr.rows[0] || {};
        if (emp.type === 'STANOKCHI') rate = (ptype === 'SEMI_FINISHED' ? prow.stanokchi_semi_rate : prow.stanokchi_rate) || 0;
        else rate = prow.detalchi_rate || 0;
        calcAmount = qty * rate;
      } else {
        calcAmount = rate; // kunlik ishchi — kunlik tarif
      }

      action = {
        type: 'ADD_PRODUCTION',
        data: {
          employee_id: emp.id, employee_name: emp.name,
          product_id: product?.id || null, product_name: product?.name || inp.product_name || null,
          quantity: qty, production_date: prodDate, month,
          daily_tariff: rate, calculated_amount: calcAmount, production_type: ptype,
        },
      };
      desc = lang === 'ru'
        ? `Производство: ${emp.name} — ${inp.quantity} шт${product ? ', ' + product.name : ''} (${prodDate})`
        : `Ishlab chiqarish: ${emp.name} — ${inp.quantity} dona${product ? ', ' + product.name : ''} (${prodDate})`;
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

    // ===== XODIM AMALLAR (OWNER only) =====
    if (toolBlock.name === 'add_employee') {
      const exists = await query(
        "SELECT id FROM employees WHERE LOWER(name)=LOWER($1) AND is_active=1 LIMIT 1",
        [inp.name]
      );
      if (exists.rows.length) {
        return res.json({ response: lang === 'ru' ? `Сотрудник "${inp.name}" уже существует.` : `"${inp.name}" xodim allaqachon mavjud.` });
      }
      const TYPE_LABEL = { STANOKCHI: 'Stanokchi', DETALCHI: 'Detalchi', ISHCHI: 'Ishchi', OSHPAZ: 'Oshpaz', SHOFIR: 'Shofir', BUGALTER: 'Bugalter', SIFAT: 'Sifat nazorati', CALL_CENTER: 'Call center', YORDAMCHI: 'Yordamchi', DROBILKA: 'Drobilka', ELEKTRIK: 'Elektrik', USTA: 'Usta', OHRANA: 'Ohrana', SKLAD: 'Sklad', TEHNOLOG: 'Tehnolog', MARKETING: 'Marketing', BOSHQA: 'Boshqa' };
      action = { type: 'ADD_EMPLOYEE', data: {
        name: inp.name, type: inp.type || 'ISHCHI',
        shift: inp.shift || '1-SMENA', daily_tariff: inp.daily_tariff || 0, phone: inp.phone || null,
      }};
      desc = lang === 'ru'
        ? `Добавить сотрудника: ${inp.name} — ${TYPE_LABEL[inp.type] || inp.type}${inp.type === 'STANOKCHI' ? ', смена ' + (inp.shift || '1-SMENA') : ''}`
        : `Xodim qo'shish: ${inp.name} — ${TYPE_LABEL[inp.type] || inp.type}${inp.type === 'STANOKCHI' ? ', smena ' + (inp.shift || '1-SMENA') : ''}`;
    } else if (toolBlock.name === 'remove_employee') {
      const empR = await query(
        "SELECT id, name FROM employees WHERE LOWER(name) LIKE LOWER($1) AND is_active=1 LIMIT 1",
        [`%${inp.employee_name}%`]
      );
      if (!empR.rows.length) return res.json({ response: lang === 'ru' ? `Сотрудник "${inp.employee_name}" не найден.` : `"${inp.employee_name}" xodim topilmadi.` });
      action = { type: 'REMOVE_EMPLOYEE', data: { employee_id: empR.rows[0].id, employee_name: empR.rows[0].name } };
      desc = lang === 'ru' ? `Уволить: ${empR.rows[0].name}` : `Xodimni o'chirish: ${empR.rows[0].name}`;
    } else if (toolBlock.name === 'update_employee') {
      const empR = await query(
        "SELECT id, name, shift, daily_tariff, phone FROM employees WHERE LOWER(name) LIKE LOWER($1) AND is_active=1 LIMIT 1",
        [`%${inp.employee_name}%`]
      );
      if (!empR.rows.length) return res.json({ response: lang === 'ru' ? `Сотрудник "${inp.employee_name}" не найден.` : `"${inp.employee_name}" xodim topilmadi.` });
      const emp = empR.rows[0];
      const changes = [];
      if (inp.shift) changes.push(lang === 'ru' ? `смена → ${inp.shift}` : `smena → ${inp.shift}`);
      if (inp.daily_tariff) changes.push(lang === 'ru' ? `тариф → ${fmt(inp.daily_tariff)} сум` : `tarif → ${fmt(inp.daily_tariff)} so'm`);
      if (inp.phone) changes.push(`tel → ${inp.phone}`);
      action = { type: 'UPDATE_EMPLOYEE', data: {
        employee_id: emp.id, employee_name: emp.name,
        shift: inp.shift || emp.shift, daily_tariff: inp.daily_tariff || emp.daily_tariff, phone: inp.phone || emp.phone,
      }};
      desc = lang === 'ru'
        ? `Изменить данные ${emp.name}: ${changes.join(', ')}`
        : `${emp.name} ma'lumotlarini o'zgartirish: ${changes.join(', ')}`;
    } else if (toolBlock.name === 'add_user') {
      const ROLE_LABEL = { OWNER: 'Ega (to\'liq huquq)', ACCOUNTANT: 'Buxgalter', SALES_HEAD: 'Sotuv boshlig\'i', PRODUCTION_HEAD: 'Ishlab chiqarish boshlig\'i', KIRIMCHI: 'Kirimchi', OMBORCHI: 'Omborchi' };
      const role = String(inp.role || '').toUpperCase();
      const phone = String(inp.phone || '').trim();
      // Telefon allaqachon bandmi?
      const dup = await query('SELECT id FROM users WHERE phone=$1', [phone]);
      if (dup.rows.length) {
        return res.json({ response: lang === 'ru' ? `Пользователь с телефоном ${phone} уже существует.` : `${phone} telefonli foydalanuvchi allaqachon mavjud.` });
      }
      action = { type: 'ADD_USER', data: { full_name: inp.full_name, phone, role } };
      const warn = role === 'OWNER' ? (lang === 'ru' ? ' (ВНИМАНИЕ: ЕГА — полный доступ!)' : ' (DIQQAT: EGA — to\'liq huquq!)') : '';
      desc = lang === 'ru'
        ? `Новый пользователь: ${inp.full_name} — ${ROLE_LABEL[role] || role}, тел: ${phone}. Пароль создаст система.${warn}`
        : `Yangi foydalanuvchi: ${inp.full_name} — ${ROLE_LABEL[role] || role}, tel: ${phone}. Parolni tizim yaratadi.${warn}`;
    }

    return res.json({
      response: lead + desc,
      action: action ? { ...action, description: desc } : null,
    });
  } catch (err) {
    console.error('Ahmad command error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
router.post('/command', commandHandler);

// Buyruqni dasturiy bajarish (avtonom /auto uchun) — { response, action } qaytaradi
function runCommand(user, text, language) {
  return new Promise((resolve) => {
    const fakeRes = {
      _status: 200,
      status() { return this; },
      json(body) { resolve(body || {}); },
    };
    Promise.resolve(commandHandler({ user, body: { text, language, history: [] } }, fakeRes))
      .catch(e => resolve({ response: 'Xato: ' + e.message }));
  });
}

// ---------- POST /api/ahmad/auto — AVTONOM ko'p bosqichli bajaruvchi (faqat EGA) ----------
// Vazifani qadamlarga bo'lib, har birini o'zi bajaradi. Xavfli amallar (xodim/foydalanuvchi
// o'chirish/yaratish) avtonom bajarilMAYDI — ular o'tkazib yuboriladi (qo'lda tasdiqlash kerak).
const AUTO_BLOCKED_ACTIONS = new Set(['REMOVE_EMPLOYEE', 'ADD_USER']);
router.post('/auto', async (req, res) => {
  try {
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!claude) return res.status(503).json({ error: lang === 'ru' ? 'AI не настроен' : 'AI sozlanmagan' });
    if (req.user?.role !== 'OWNER') return res.status(403).json({ error: lang === 'ru' ? 'Только админ' : 'Faqat ega' });
    const task = String(req.body.task || '').trim();
    if (!task) return res.status(400).json({ error: lang === 'ru' ? 'Задача не указана' : 'Vazifa kiritilmagan' });

    // 1) Vazifani oddiy qadam-buyruqlarga bo'lamiz
    const planSys = lang === 'ru'
      ? `Разбейте задачу на ВЫПОЛНИМЫЕ шаги-команды для ассистента Лолы. ВАЖНО:
- Каждый шаг — ПОЛНАЯ, самостоятельная команда со ВСЕМИ деталями (название товара, число, сумма внутри шага).
- НЕ разбивайте одну операцию на "найти" + "изменить" — делайте одной командой. Пример: "измени цену гул тувак на 9000" (один шаг).
- Если задача — одна операция, верните ОДИН шаг.
- НЕ удаляйте сотрудников/пользователей.
Верните ТОЛЬКО JSON-массив строк: ["команда1","команда2"]. Максимум 6.`
      : `Vazifani BAJARILADIGAN qadam-buyruqlarga bo'ling (Lola yordamchi uchun). MUHIM:
- Har qadam TO'LIQ, mustaqil buyruq bo'lsin — barcha tafsilot (mahsulot nomi, son, summa) qadam ICHIDA bo'lsin.
- Bitta amalni "izlash" + "o'zgartirish"ga BO'LMANG — bitta to'liq buyruq qiling. Masalan: "gul tuvak narxini 9000 qil" (bitta qadam).
- Agar vazifa bitta amaldan iborat bo'lsa — BITTA qadam qaytaring.
- Xodim/foydalanuvchi O'CHIRMANG.
FAQAT JSON massiv qaytaring: ["buyruq1","buyruq2"]. Ko'pi 6.`;
    const planMsg = await claude.messages.create({
      model: MODEL, max_tokens: 600, system: planSys,
      messages: [{ role: 'user', content: task }],
    });
    const planText = planMsg.content.find(b => b.type === 'text')?.text || '';
    let steps = [];
    try { const m = planText.match(/\[[\s\S]*\]/); if (m) steps = JSON.parse(m[0]); } catch {}
    steps = (Array.isArray(steps) ? steps : []).filter(s => typeof s === 'string' && s.trim()).slice(0, 6);
    if (!steps.length) steps = [task];

    // 2) Har qadamni bajaramiz
    const log = [];
    for (const step of steps) {
      const out = await runCommand(req.user, step, lang);
      if (out.action) {
        if (AUTO_BLOCKED_ACTIONS.has(out.action.type)) {
          log.push({ step, status: 'skipped', message: (lang === 'ru' ? 'Опасное действие — подтвердите вручную: ' : 'Xavfli amal — qo\'lda tasdiqlang: ') + (out.action.description || out.action.type) });
        } else {
          const ex = await executeAction(out.action, req.user);
          const ok = ex.body && ex.body.success !== false && !ex.body.error;
          log.push({ step, status: ok ? 'done' : 'failed', message: ex.body?.message || ex.body?.error || (ok ? 'bajarildi' : 'xato') });
        }
      } else {
        log.push({ step, status: 'info', message: out.response || '' });
      }
    }

    // 3) Yakuniy hisobot (qisqa)
    const doneN = log.filter(l => l.status === 'done').length;
    const summary = lang === 'ru'
      ? `Готово. Выполнено шагов: ${doneN}/${steps.length}.`
      : `Tayyor. Bajarilgan qadamlar: ${doneN}/${steps.length}.`;

    res.json({ task, steps, log, summary });
  } catch (err) {
    console.error('auto error:', err.message);
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

// ---------- POST /api/ahmad/worker-briefing — proaktiv "AI Ishchi" brifingi ----------
// Claude menejer-ishchi kabi: ma'lumotni o'zi yig'ib, ogohlantirish + bugungi vazifa +
// tahlil/prognoz + tavsiya beradi. XAVFSIZ: faqat maslahat, hech narsani o'zgartirmaydi.
router.post('/worker-briefing', async (req, res) => {
  try {
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!claude) return res.status(503).json({ error: lang === 'ru' ? 'AI не настроен' : 'AI sozlanmagan' });

    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);

    const [todayR, monthR] = await Promise.all([gatherReport('today'), gatherReport('month')]);
    const [planRow, debtors, broken, prodToday, topProd] = await Promise.all([
      query("SELECT value FROM system_settings WHERE key='monthly_sales_plan'"),
      query(`SELECT COALESCE(c.name, s.customer_name, 'Noma''lum') name, SUM(s.total_amount - s.payment_amount) debt
             FROM sales s LEFT JOIN customers c ON s.customer_id=c.id
             WHERE s.status!='PAID' AND (s.total_amount - s.payment_amount)>0.01
             GROUP BY COALESCE(c.name, s.customer_name) ORDER BY debt DESC LIMIT 5`),
      query("SELECT COUNT(*) c FROM machines WHERE status='BROKEN'"),
      query(`SELECT COALESCE(SUM(quantity_produced),0) q FROM employee_production WHERE production_date=$1`, [today]),
      query(`SELECT p.name, SUM(s.quantity) qty, SUM(s.total_amount) rev FROM sales s JOIN products p ON s.product_id=p.id
             WHERE TO_CHAR(s.sale_date,'YYYY-MM')=$1 GROUP BY p.name ORDER BY rev DESC LIMIT 5`, [month]),
    ]);
    const plan = planRow.rows.length ? Number(planRow.rows[0].value) || 0 : 0;
    const salesMonth = Number(monthR.salesTotal) || 0;
    const overagePct = plan > 0 && salesMonth > plan ? Math.round((salesMonth - plan) / plan * 1000) / 10 : 0;

    const data = {
      sana: today,
      bugun: { sotuv: todayR.salesTotal, sotuv_soni: todayR.salesCount, kirim: todayR.intakesCount, ishlab_chiqarish_dona: prodToday.rows[0].q },
      oy: { sotuv: monthR.salesTotal, xarajat: monthR.expensesTotal, foyda: monthR.profit },
      reja: { summa: plan, bajarilish_foiz: plan > 0 ? Math.round(salesMonth / plan * 100) : null, rejadan_oshgan_foiz: overagePct },
      ombor_kam_qolgan: { soni: todayR.lowStock, royxat: todayR.lowStockTop },
      qarz: { jami: todayR.debtTotal, mijoz_soni: todayR.debtCount, eng_kattalari: debtors.rows },
      mashina_buzilgan_soni: broken.rows[0].c,
      oylik_top_mahsulot: topProd.rows,
    };

    const system = lang === 'ru'
      ? `Вы — проактивный AI-сотрудник завода Технопласт (пластиковые изделия). Действуйте как опытный менеджер: сами изучите данные, найдите проблемы, определите приоритеты дня, дайте прогноз и практические рекомендации.
БЕЗОПАСНЫЙ режим: только предупреждения и советы — НИЧЕГО не меняйте.
Верните ТОЛЬКО JSON-объект (без markdown): {"alerts":[".."],"priorities":[".."],"insights":[".."],"recommendations":[".."]}.
alerts=срочные проблемы; priorities=что сделать сегодня; insights=анализ и прогноз; recommendations=советы. Каждый пункт — короткая строка. На русском. Числа: 1 000 000.`
      : `Siz — Teknoplast plastik zavodining proaktiv AI-ishchisisiz. Tajribali menejer kabi ish tuting: ma'lumotni o'zingiz o'rganing, muammolarni toping, bugungi ustuvor vazifalarni aniqlang, prognoz va amaliy tavsiyalar bering.
XAVFSIZ rejim: faqat ogohlantirish va maslahat — HECH NARSANI o'zgartirmang.
FAQAT JSON obyekt qaytaring (markdownsiz): {"alerts":[".."],"priorities":[".."],"insights":[".."],"recommendations":[".."]}.
alerts=shoshilinch muammolar; priorities=bugun bajarilsin; insights=tahlil va prognoz; recommendations=maslahatlar. Har band — qisqa satr. O'zbekcha. Raqamlar: 1 000 000.`;

    const msg = await claude.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: (lang === 'ru' ? 'Данные (JSON):\n' : 'Ma\'lumotlar (JSON):\n') + JSON.stringify(data) }],
    });

    const txt = msg.content.find(b => b.type === 'text')?.text || '';
    let briefing = null;
    try { const m = txt.match(/\{[\s\S]*\}/); if (m) briefing = JSON.parse(m[0]); } catch {}
    if (!briefing || typeof briefing !== 'object') {
      briefing = { alerts: [], priorities: [], insights: [txt].filter(Boolean), recommendations: [] };
    }
    for (const k of ['alerts', 'priorities', 'insights', 'recommendations']) {
      if (!Array.isArray(briefing[k])) briefing[k] = briefing[k] ? [String(briefing[k])] : [];
    }

    res.json({ briefing, data, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('worker-briefing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/ahmad/debt-reminder — qarzdorga eslatma matni (call-center) ----------
// XAVFSIZ: faqat matn yozadi, hech narsa yubormaydi/o'zgartirmaydi. Ega nusxa olib jo'natadi.
router.post('/debt-reminder', async (req, res) => {
  try {
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!claude) return res.status(503).json({ error: lang === 'ru' ? 'AI не настроен' : 'AI sozlanmagan' });
    const { customer, debt, days_old, tone } = req.body;
    const firm = tone === 'firm';
    const system = lang === 'ru'
      ? `Вы — вежливый сотрудник call-центра завода Технопласт. Напишите КОРОТКОЕ сообщение клиенту-должнику (для SMS/Telegram) с напоминанием об оплате задолженности. ${firm ? 'Тон: настойчивый, но уважительный.' : 'Тон: мягкий, дружелюбный.'} Без markdown и эмодзи. Только текст сообщения, на русском. Сумму пишите как 1 000 000 сум. В конце — Технопласт.`
      : `Siz — Teknoplast zavodining xushmuomala call-markaz xodimisiz. Qarzdor mijozga to'lov haqida ESLATMA xabarini yozing (SMS/Telegram uchun), QISQA va aniq. ${firm ? 'Ohang: qat\'iy, lekin hurmatli.' : 'Ohang: yumshoq, do\'stona.'} Markdown va emoji ishlatmang. Faqat xabar matni, o'zbekcha. Summani 1 000 000 so'm ko'rinishida yozing. Oxirida — Teknoplast.`;
    const userMsg = lang === 'ru'
      ? `Клиент: ${customer || 'клиент'}; сумма долга: ${debt || 0} сум; просрочка: ${days_old || 0} дней.`
      : `Mijoz: ${customer || 'mijoz'}; qarz summasi: ${debt || 0} so'm; muddat: ${days_old || 0} kun.`;
    const msg = await claude.messages.create({
      model: MODEL, max_tokens: 400, system,
      messages: [{ role: 'user', content: userMsg }],
    });
    const message = (msg.content.find(b => b.type === 'text')?.text || '').trim();
    res.json({ message });
  } catch (err) {
    console.error('debt-reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/ahmad/read-image ----------
router.post('/read-image', upload.single('image'), async (req, res) => {
  try {
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!req.file) return res.status(400).json({ error: lang === 'ru' ? 'Файл не загружен' : 'Fayl yuklanmadi' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const mediaType = req.file.mimetype || '';
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    try { fs.unlinkSync(req.file.path); } catch {}

    if (!claude) {
      return res.json({ response: lang === 'ru' ? 'Лола: нужен API ключ' : 'Lola: API kaliti kerak', text: '' });
    }

    // Faylni Claude uchun content blokiga aylantiramiz (xatosiz)
    let content;
    try {
      content = await fileToContent(fileBuffer, ext, mediaType);
    } catch (e) {
      let msg;
      if (e.message === 'UNSUPPORTED_XLS') {
        msg = lang === 'ru'
          ? 'Старый формат .xls не поддерживается. Сохраните как .xlsx и отправьте снова.'
          : 'Eski .xls format qo\'llab-quvvatlanmaydi. .xlsx sifatida saqlab qayta yuboring.';
      } else if (e.code === 'MODULE_NOT_FOUND') {
        msg = lang === 'ru'
          ? 'Чтение Word (.docx) пока недоступно. Отправьте PDF, изображение, Excel или текст.'
          : 'Word (.docx) o\'qish hozircha mavjud emas. PDF, rasm, Excel yoki matn yuboring.';
      } else {
        msg = lang === 'ru'
          ? 'Этот формат не поддерживается. Отправьте изображение, PDF, Excel (.xlsx), CSV, TXT или Word (.docx).'
          : 'Bu format qo\'llab-quvvatlanmaydi. Rasm, PDF, Excel (.xlsx), CSV, TXT yoki Word (.docx) yuboring.';
      }
      return res.json({ response: msg, text: '' });
    }

    // Matnli format bo'sh chiqsa
    if (content.text !== undefined && !content.text.trim()) {
      return res.json({ response: lang === 'ru' ? 'Файл пустой или не удалось прочитать данные.' : 'Fayl bo\'sh yoki ma\'lumot o\'qilmadi.', text: '' });
    }

    const isOwner = req.user?.role === 'OWNER';
    const roleNote = isOwner
      ? (lang === 'ru' ? 'Пользователь — АДМИНИСТРАТОР с полными правами.' : 'Foydalanuvchi — TO\'LIQ HUQUQLI ADMIN.')
      : (lang === 'ru' ? 'Пользователь — сотрудник (только просмотр).' : 'Foydalanuvchi — xodim (faqat ko\'rish).');

    const systemPrompt = lang === 'ru'
      ? `Вы Лола — помощница завода Технопласт. ${roleNote}
Внимательно прочитайте предоставленный файл и извлеките ВСЮ информацию.

ПРАВИЛА ВЫБОРА ТИПА (kind):
- "employee" — список сотрудников/рабочих (имена + должность/смена/тариф)
- "customer" — список КЛИЕНТОВ/покупателей (имя или фирма + телефон/адрес/долг; БЕЗ товаров и цен)
- "sale"     — накладная на ПРОДАЖУ, чек, исходящая накладная (продали клиенту)
- "intake"   — накладная ПРИХОДА от поставщика (получили товар)
- "product"  — ПРАЙС-ЛИСТ, каталог, список товаров с ценами, просто список продуктов

ВАЖНО:
- Список людей или фирм с телефоном/адресом, БЕЗ колонки товара/цены → ВСЕГДА "customer"
- Файл с товарами и ценами (прайс, каталог, price-list) → ВСЕГДА "product"
- Если неясно → "product"

ВАЖНЫЕ ПРАВИЛА:
1. НИКОГДА не говорите "не могу прочитать" — всегда извлекайте данные
2. Числа возвращайте как числа (не строки): цена 5000, количество 10
3. Отсутствующие поля: числа = 0, строки = ""

Верните JSON массив в блоке \`\`\`json:
- "sale":     {"name":"название","quantity":1,"price":5000,"kind":"sale"}
- "intake":   {"name":"название","quantity":10,"price":5000,"kind":"intake"}
- "employee": {"name":"ФИО","type":"ISHCHI","shift":"1-SMENA","daily_tariff":50000,"phone":"","kind":"employee"}
- "customer": {"name":"имя клиента или фирма","phone":"+998...","company_name":"","address":"","kind":"customer"}
- "product":  {"name":"название","quantity":100,"price":5000,"rang":"qizil","kind":"product"}
ВАЖНО: определите ЦВЕТ ("rang": qizil/ko'k/oq/yashil/sariq/qora/pushti/kulrang...) и КОЛИЧЕСТВО ("quantity"). Если цвет в названии ("... кизил") — выведите его в "rang" латиницей.

Отвечайте кратко на русском языке.`
      : `Siz Lola — Teknoplast plastik zavod yordamchisisiz. ${roleNote}
Berilgan faylni DIQQAT BILAN o'qing va barcha ma'lumotlarni chiqaring.

TURNING TANLANISH QOIDALARI (kind):
- "employee" — xodimlar/ishchilar ro'yxati (ism + lavozim/smena/tarif)
- "customer" — MIJOZLAR/xaridorlar ro'yxati (ism yoki firma + telefon/manzil/qarz; mahsulot va narx ustuni YO'Q)
- "sale"     — SOTUV nakladnoyi, chek, mijozga berilgan tovar
- "intake"   — KIRIM nakladnoyi, yetkazib beruvchidan kelgan tovar
- "product"  — NARXNOMA, katalog, tovar ro'yxati narxlar bilan, oddiy mahsulot ro'yxati

MUHIM:
- Odamlar yoki firmalar ro'yxati telefon/manzil bilan, mahsulot/narx ustuni YO'Q bo'lsa → DOIMO "customer"
- Narxlar bilan mahsulotlar bo'lsa (narxnoma, price-list) → DOIMO "product"
- Noaniq bo'lsa → "product"

MUHIM QOIDALAR:
1. HECH QACHON "o'kiy olmayman" DEMANG — doimo ma'lumot chiqaring
2. Sonlarni son sifatida qaytaring (string emas): narx 5000, miqdor 10
3. Ko'rsatilmagan maydonlar: sonlar = 0, matnlar = ""

\`\`\`json blokida massiv qaytaring:
- "sale":     {"name":"mahsulot nomi","quantity":1,"price":5000,"kind":"sale"}
- "intake":   {"name":"mahsulot nomi","quantity":10,"price":5000,"kind":"intake"}
- "employee": {"name":"ism familiya","type":"ISHCHI","shift":"1-SMENA","daily_tariff":50000,"phone":"","kind":"employee"}
- "customer": {"name":"mijoz ismi yoki firma","phone":"+998...","company_name":"","address":"","kind":"customer"}
- "product":  {"name":"mahsulot nomi","quantity":100,"price":5000,"rang":"qizil","kind":"product"}
MUHIM: mahsulotning RANGINI ("rang": qizil/ko'k/oq/yashil/sariq/qora/pushti/kulrang...) va SONINI ("quantity") aniqlab yozing. Rang nom ichida bo'lsa ham ("... кизил") uni "rang"ga lotincha chiqaring.

O'zbek tilida qisqa javob bering.`;

    // Content bloklarini yig'amiz
    const instruction = lang === 'ru' ? 'Прочитайте и извлеките все данные.' : 'O\'qing va barcha ma\'lumotlarni chiqaring.';
    const userContent = [];
    if (content.block) userContent.push(content.block);
    if (content.text !== undefined) {
      const label = lang === 'ru' ? 'Содержимое файла:' : 'Fayl mazmuni:';
      // Juda uzun matnni cheklaymiz (token chegarasi uchun)
      const body = content.text.length > 60000 ? content.text.slice(0, 60000) : content.text;
      userContent.push({ type: 'text', text: `${label}\n${body}` });
    }
    userContent.push({ type: 'text', text: instruction });

    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 8000, // ko'p mahsulotli ro'yxat uzilib qolmasligi uchun
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const responseText = textBlock ? textBlock.text : '';
    let action = null;
    const items = extractJsonArray(responseText);
    console.log(`Ahmad read-image: JSON ${items ? items.length + ' ta element topildi' : 'TOPILMADI'}`);
    if (items && items.length) {
      // kind ni eng ko'p uchragan turdan aniqlaymiz (ba'zi elementlarda yo'q bo'lishi mumkin)
      const kindCount = {};
      for (const it of items) { const k = it.kind || 'product'; kindCount[k] = (kindCount[k] || 0) + 1; }
      const kind = Object.keys(kindCount).sort((a, b) => kindCount[b] - kindCount[a])[0] || 'product';
      if (kind === 'sale') {
        action = { type: 'BULK_SALES', data: { items }, description: lang === 'ru' ? `${items.length} та продаж добавить?` : `${items.length} ta sotuv qo'shaylikmi?` };
      } else if (kind === 'intake') {
        action = { type: 'BULK_INTAKE', data: { items }, description: lang === 'ru' ? `${items.length} позиций прихода добавить?` : `${items.length} ta kirim qo'shaylikmi?` };
      } else if (kind === 'employee') {
        const list = items.map(e => `${e.name} (${e.type || 'ISHCHI'}${e.shift ? ', ' + e.shift : ''})`).join(', ');
        action = { type: 'BULK_ADD_EMPLOYEES', data: items, description: lang === 'ru' ? `Добавить ${items.length} сотрудников: ${list}` : `${items.length} ta xodim qo'shilsinmi: ${list}` };
      } else if (kind === 'customer') {
        const nameList = items.slice(0, 6).map(c => c.name).filter(Boolean).join(', ') + (items.length > 6 ? '...' : '');
        action = { type: 'BULK_ADD_CUSTOMERS', data: items, description: lang === 'ru' ? `Добавить ${items.length} клиентов: ${nameList}` : `${items.length} ta mijoz qo'shilsinmi: ${nameList}` };
      } else {
        const nameList = items.slice(0, 5).map(i => i.name).join(', ') + (items.length > 5 ? '...' : '');
        action = { type: 'ADD_PRODUCTS', data: items, description: lang === 'ru' ? `${items.length} товаров добавить в базу? (${nameList})` : `${items.length} ta mahsulot bazaga qo'shaylikmi? (${nameList})` };
      }
    }

    // Javob matnidan JSON bloklarni va XOM JSON ni (fence'siz) tozalaymiz
    let cleanResponse = responseText
      .replace(/```json[\s\S]*?```/gi, '')   // ```json ... ```
      .replace(/```[\s\S]*?```/g, '')         // ``` ... ```
      .replace(/\[\s*\{[\s\S]*?\}\s*\]?/g, '') // xom [ {...}, {...} ] massiv (uzilgan bo'lsa ham)
      .replace(/\{[^{}]*"kind"[^{}]*\}/g, '')  // alohida qolgan { ... "kind" ... } obyektlar
      .replace(/,\s*$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Agar action bor bo'lsa — har doim toza, tushunarli xabar beramiz
    if (action) {
      cleanResponse = lang === 'ru'
        ? `Файл прочитан. ${action.description}`
        : `Fayl o'qildi. ${action.description}`;
    } else if (!cleanResponse) {
      cleanResponse = lang === 'ru'
        ? 'Файл прочитан, но данные не распознаны. Попробуйте более чёткий файл.'
        : 'Fayl o\'qildi, lekin ma\'lumot aniqlanmadi. Aniqroq fayl yuboring.';
    }

    res.json({
      response: cleanResponse,
      text: responseText,
      action,
    });
  } catch (err) {
    console.error('Ahmad read-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/ahmad/confirm-action ----------
async function confirmActionHandler(req, res) {
  try {
    const { action } = req.body;
    if (!action?.type) return res.status(400).json({ error: 'Action kerak' });

    // Yozish amallarini faqat OWNER bajarishi mumkin
    const READ_ONLY_ACTIONS = new Set(['GET_REPORT', 'LOOKUP', 'LIST_DEBTORS', 'GET_EMPLOYEES']);
    if (!READ_ONLY_ACTIONS.has(action.type) && req.user?.role !== 'OWNER') {
      return res.status(403).json({ success: false, message: 'Bu amalni faqat admin bajarishi mumkin' });
    }

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
          [d.product_id, d.quantity, d.unit_price, total, d.customer_name || 'Lola', new Date().toISOString().slice(0, 10), req.user.id, genOrderRef()]
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
        [d.category || 'OTHER', d.amount, d.description || 'Lola orqali', new Date().toISOString().slice(0, 10), req.user.id]
      );
      return res.json({ success: true, message: `Xarajat yozildi: ${fmt(d.amount)} so'm` });
    }

    // --- Yangi tizim foydalanuvchisi (login akkaunt) — faqat EGA ---
    if (action.type === 'ADD_USER') {
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const d = action.data || {};
      const ROLES = ['OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD', 'KIRIMCHI', 'OMBORCHI'];
      const full_name = String(d.full_name || '').trim();
      const phone = String(d.phone || '').trim();
      const role = String(d.role || '').toUpperCase();
      if (!full_name || !phone) return res.json({ success: false, message: 'Ism va telefon kerak' });
      if (!ROLES.includes(role)) return res.json({ success: false, message: 'Noto\'g\'ri rol' });
      const dup = await query('SELECT id FROM users WHERE phone=$1', [phone]);
      if (dup.rows.length) return res.json({ success: false, message: `${phone} telefonli foydalanuvchi allaqachon mavjud` });
      // Kuchli vaqtinchalik parol (chalkash belgilarsiz: 0/O, 1/l/I yo'q)
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lc = 'abcdefghijkmnpqrstuvwxyz', nn = '23456789';
      const pick = s => s[crypto.randomInt(s.length)];
      const tempPass = pick(A) + pick(A) + pick(lc) + pick(lc) + pick(nn) + pick(nn) + pick(nn) + pick(nn);
      const hash = await bcrypt.hash(tempPass, 10);
      await query('INSERT INTO users (phone, password_hash, full_name, role) VALUES ($1,$2,$3,$4)', [phone, hash, full_name, role]);
      return res.json({
        success: true,
        message: `Foydalanuvchi yaratildi: ${full_name} (${role})\n📱 Login (telefon): ${phone}\n🔑 Vaqtinchalik parol: ${tempPass}\n\n⚠️ Parolni xodimga yetkazing. U kirgach "Parolni o'zgartirish" orqali yangilasin. Bu parol qayta ko'rsatilmaydi.`,
      });
    }

    // --- Mijoz ---
    if (action.type === 'ADD_CUSTOMER') {
      const d = action.data;
      await query(
        'INSERT INTO customers (name, phone, company_name, address, customer_type, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [d.name, d.phone || null, d.company_name || null, d.address || null, 'RETAIL', req.user.id]
      );
      return res.json({ success: true, message: `Mijoz qo'shildi: ${d.name}` });
    }

    // --- Ko'plab mijoz (PDF/rasm/Excel ro'yxatidan) ---
    if (action.type === 'BULK_ADD_CUSTOMERS') {
      let added = 0, skipped = 0;
      for (const c of (action.data || [])) {
        try {
          const name = (c.name || c.nomi || c.fio || c.ism || '').toString().trim();
          if (!name) { skipped++; continue; }
          const phone   = (c.phone || c.tel || c.telefon || '').toString().trim() || null;
          const company = (c.company_name || c.firma || c.company || c.kompaniya || '').toString().trim() || null;
          const address = (c.address || c.manzil || c.addr || c.adres || '').toString().trim() || null;
          // Takror bo'lmasligi uchun: shu nom (va tel) allaqachon bo'lsa o'tkazamiz
          const exists = await query(
            'SELECT id FROM customers WHERE LOWER(name)=LOWER($1) LIMIT 1', [name]
          );
          if (exists.rows.length) { skipped++; continue; }
          await query(
            'INSERT INTO customers (name, phone, company_name, address, customer_type, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
            [name, phone, company, address, 'RETAIL', req.user.id]
          );
          added++;
        } catch (e) { console.error('BULK_ADD_CUSTOMERS item error:', e.message); skipped++; }
      }
      return res.json({ success: true, message: `${added} ta mijoz qo'shildi${skipped ? ', ' + skipped + ' ta o\'tkazildi (takror/bo\'sh)' : ''}` });
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
          if (p) {
            const price = cleanNum(it.price ?? it.unit_price ?? 0);
            // Agar narx berilgan bo'lsa — mahsulot narxini yangilaymiz
            if (price > 0) {
              await query('UPDATE products SET price=$1, updated_at=NOW() WHERE id=$2', [price, p.id]);
            }
            resolved.push({ product_id: p.id, quantity: cleanNum(it.quantity) || 1 });
          }
        }
        items = resolved;
      }
      if (!items.length) return res.json({ success: false, message: 'Mahsulot topilmadi' });
      const client = await getClient();
      try {
        await client.query('BEGIN');
        const intakeR = await client.query(
          `INSERT INTO product_intakes (status, notes, created_by) VALUES ('PENDING', $1, $2) RETURNING id`,
          ['Lola orqali', req.user.id]
        );
        const intakeId = intakeR.rows[0].id;
        for (const it of items) {
          await client.query('INSERT INTO intake_items (intake_id, product_id, quantity) VALUES ($1,$2,$3)', [intakeId, it.product_id, parseInt(it.quantity)]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return res.json({ success: true, message: `Kirim yaratildi (${items.length} ta), tasdiqlash kutilmoqda` });
    }

    // --- Ko'plab sotuv (rasm/PDF/hisobotdan) ---
    if (action.type === 'BULK_SALES') {
      const list = action.data.items || action.data || [];
      let added = 0, notFound = 0, failed = 0;
      const missing = [];
      for (const it of list) {
        try {
          const p = await findProduct(it.name || it.product_name);
          if (!p) { notFound++; if (missing.length < 6) missing.push(it.name || it.product_name); continue; }
          const price = cleanNum(it.price) || cleanNum(p.price);
          const qty = cleanNum(it.quantity) || 1;
          const total = price * qty;
          const client = await getClient();
          try {
            await client.query('BEGIN');
            await client.query(
              `INSERT INTO sales (product_id, quantity, unit_price, total_amount, customer_name, sale_date, status, payment_amount, created_by, order_ref)
               VALUES ($1,$2,$3,$4,$5,$6,'PENDING',0,$7,$8)`,
              [p.id, qty, price, total, 'Lola', new Date().toISOString().slice(0, 10), req.user.id, genOrderRef()]
            );
            // Ombor yetmasa ham yozamiz (tarixiy hisobot), lekin manfiyga tushirmaymiz
            await client.query('UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2', [qty, p.id]);
            await client.query('COMMIT');
            added++;
          } catch (e) { await client.query('ROLLBACK'); failed++; } finally { client.release(); }
        } catch { failed++; }
      }
      let msg = `${added} ta sotuv yozildi`;
      if (notFound) msg += `; ${notFound} ta mahsulot bazadan topilmadi${missing.length ? ' (' + missing.join(', ') + ')' : ''}`;
      if (failed) msg += `; ${failed} ta xato`;
      return res.json({ success: added > 0, message: msg });
    }

    // --- Ishlab chiqarish yozuvi ---
    if (action.type === 'ADD_PRODUCTION') {
      const d = action.data;
      const client = await getClient();
      try {
        await client.query('BEGIN');
        // Shu xodimning shu kungi eski yozuvlarini tozalaymiz (ombor qaytadi) — keyin yangisini qo'shamiz.
        // (employee_production endi bir kunda ko'p mahsulotni qo'llab-quvvatlaydi, UNIQUE cheklov yo'q.)
        const existing = await client.query(
          'SELECT product_id, quantity_produced FROM employee_production WHERE employee_id=$1 AND production_date=$2',
          [d.employee_id, d.production_date]
        );
        for (const row of existing.rows) {
          if (row.product_id) {
            await client.query('UPDATE products SET stock_quantity = stock_quantity - $1, updated_at=NOW() WHERE id=$2', [row.quantity_produced, row.product_id]);
          }
        }
        await client.query('DELETE FROM employee_production WHERE employee_id=$1 AND production_date=$2', [d.employee_id, d.production_date]);
        await client.query(
          `INSERT INTO employee_production
            (employee_id, product_id, production_date, quantity_produced, daily_tariff, calculated_amount, month, notes, production_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [d.employee_id, d.product_id || null, d.production_date, d.quantity, d.daily_tariff, d.calculated_amount, d.month, 'Lola orqali', d.production_type || 'FINISHED']
        );
        if (d.product_id) {
          await client.query('UPDATE products SET stock_quantity = stock_quantity + $1, updated_at=NOW() WHERE id=$2', [d.quantity, d.product_id]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return res.json({ success: true, message: `Ishlab chiqarish yozildi: ${d.employee_name} — ${d.quantity} dona` });
    }

    // --- Ko'plab mahsulot (rasmdan/PDFdan/Exceldan) ---
    if (action.type === 'ADD_PRODUCTS') {
      let added = 0, updated = 0, skipped = 0;
      for (const p of action.data) {
        try {
          const name = (p.name || p.nomi || '').trim();
          if (!name) { skipped++; continue; }
          const price    = cleanNum(p.price ?? p.narx ?? p.unit_price ?? 0);
          const quantity = cleanNum(p.quantity ?? p.miqdor ?? p.soni ?? p.stock_quantity ?? 0);
          // RANG va RAZMER: berilgan bo'lsa o'sha, bo'lmasa nomdan ajratamiz
          const parsed = parseProductName(name) || {};
          const rang = (p.rang || p.color || p.rangi || parsed.rang || '').toString().trim() || null;
          const base_name = parsed.base_name || name;
          const razmer = (p.razmer || p.size || parsed.razmer || '').toString().trim() || null;
          // Allaqachon mavjud bo'lsa — narx/miqdor/rang yangilash
          const exists = await query(
            'SELECT id FROM products WHERE LOWER(name)=LOWER($1) LIMIT 1',
            [name]
          );
          if (exists.rows.length) {
            const row = exists.rows[0];
            const updates = ['updated_at=NOW()'];
            const vals = [];
            let idx = 1;
            if (price > 0) { updates.push(`price=$${idx++}`); vals.push(price); }
            if (quantity > 0) { updates.push(`stock_quantity=$${idx++}`); vals.push(quantity); }
            if (rang) { updates.push(`rang=$${idx++}`); vals.push(rang); }
            vals.push(row.id);
            await query(`UPDATE products SET ${updates.join(',')} WHERE id=$${idx}`, vals);
            updated++;
          } else {
            await query(
              'INSERT INTO products (name, type, price, unit, stock_quantity, rang, base_name, razmer, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)',
              [name, 'PLASTIK', price, 'dona', quantity, rang, base_name, razmer]
            );
            added++;
          }
        } catch (e) { console.error('ADD_PRODUCTS item error:', e.message); skipped++; }
      }
      const total = added + updated;
      return res.json({
        success: true,
        message: `${total} ta mahsulot: ${added} yangi qo'shildi, ${updated} ta narx/miqdor yangilandi${skipped ? ', ' + skipped + ' ta o\'tkazildi' : ''}`,
      });
    }

    // --- Xodim qo'shish ---
    if (action.type === 'ADD_EMPLOYEE') {
      const d = action.data;
      await query(
        'INSERT INTO employees (name, type, shift, daily_tariff, phone, hire_date) VALUES ($1,$2,$3,$4,$5,$6)',
        [d.name, d.type, d.shift || '1-SMENA', d.daily_tariff || 0, d.phone || null, new Date().toISOString().slice(0, 10)]
      );
      return res.json({ success: true, message: `Xodim qo'shildi: ${d.name}` });
    }

    // --- Ko'plab xodim qo'shish (rasmdan) ---
    if (action.type === 'BULK_ADD_EMPLOYEES') {
      let added = 0;
      for (const e of (action.data || [])) {
        try {
          await query(
            'INSERT INTO employees (name, type, shift, daily_tariff, phone, hire_date) VALUES ($1,$2,$3,$4,$5,$6)',
            [e.name, e.type || 'ISHCHI', e.shift || '1-SMENA', e.daily_tariff || 0, e.phone || null, new Date().toISOString().slice(0, 10)]
          );
          added++;
        } catch {}
      }
      return res.json({ success: true, message: `${added} ta xodim qo'shildi` });
    }

    // --- Xodimni nofaol qilish ---
    if (action.type === 'REMOVE_EMPLOYEE') {
      const d = action.data;
      await query('UPDATE employees SET is_active=0, updated_at=NOW() WHERE id=$1', [d.employee_id]);
      return res.json({ success: true, message: `${d.employee_name} nofaol qilindi` });
    }

    // --- Xodim ma'lumotini yangilash ---
    if (action.type === 'UPDATE_EMPLOYEE') {
      const d = action.data;
      await query(
        'UPDATE employees SET shift=$1, daily_tariff=$2, phone=$3, updated_at=NOW() WHERE id=$4',
        [d.shift, d.daily_tariff, d.phone, d.employee_id]
      );
      return res.json({ success: true, message: `${d.employee_name} ma'lumotlari yangilandi` });
    }

    res.status(400).json({ error: 'Noma\'lum action turi' });
  } catch (err) {
    console.error('Ahmad confirm-action error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
router.post('/confirm-action', confirmActionHandler);

// Amalni dasturiy bajarish (avtonom /auto uchun) — confirm-action mantig'ini qayta ishlatadi (fake res orqali)
function executeAction(action, user) {
  return new Promise((resolve) => {
    const fakeRes = {
      _status: 200,
      status(c) { this._status = c; return this; },
      json(body) { resolve({ status: this._status, body }); },
    };
    Promise.resolve(confirmActionHandler({ user, body: { action } }, fakeRes))
      .catch(e => resolve({ status: 500, body: { error: e.message } }));
  });
}

// ---------- Ovozli buyruq: audio yuborish -> matn ----------
// Birinchi UzbekVoice.ai (o'zbekka maxsus), bo'lmasa/ishlamasa Groq Whisper (zaxira).
router.post('/transcribe', audioUpload.single('audio'), async (req, res) => {
  const lang = req.body.language === 'ru' ? 'ru' : 'uz';
  try {
    if (!req.file) {
      return res.status(400).json({ error: lang === 'ru' ? 'Аудио не загружено' : 'Audio yuklanmadi' });
    }
    if (!UZBEKVOICE_API_KEY && !GROQ_API_KEY) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(503).json({
        error: lang === 'ru'
          ? 'Голосовое распознавание не настроено (нужен UZBEKVOICE_API_KEY или GROQ_API_KEY на сервере).'
          : "Ovoz tanish sozlanmagan (serverda UZBEKVOICE_API_KEY yoki GROQ_API_KEY kerak).",
      });
    }

    const buffer = fs.readFileSync(req.file.path);
    const filename = req.file.originalname || 'audio.webm';
    try { fs.unlinkSync(req.file.path); } catch {}

    let text = '';
    let engine = '';
    let uvError = '';
    // 1) UzbekVoice (o'zbekka maxsus) — kalit bo'lsa birinchi shu
    if (UZBEKVOICE_API_KEY) {
      try {
        text = await transcribeWithUzbekVoice(buffer, filename, lang);
        engine = 'uzbekvoice';
      } catch (e) {
        uvError = e.message;
        console.error('[ahmad/transcribe] UzbekVoice xato:', e.message);
      }
    }
    // 2) Natija bo'sh yoki UzbekVoice yo'q bo'lsa — Groq Whisper zaxira (agar kalit bo'lsa)
    if (!text && GROQ_API_KEY) {
      text = await transcribeWithGroq(buffer, filename, lang);
      engine = engine ? engine + '+groq' : 'groq';
    }

    // UzbekVoice xato berdi va zaxira yo'q — sababini ekranda ko'rsatamiz (sozlash uchun)
    if (!text && uvError) {
      return res.status(502).json({
        error: (lang === 'ru' ? 'UzbekVoice xatosi: ' : 'UzbekVoice xatosi: ') + uvError,
      });
    }

    return res.json({ text, engine });
  } catch (e) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    console.error('[ahmad/transcribe]', e.message);
    return res.status(500).json({
      error: lang === 'ru' ? 'Ошибка распознавания голоса' : 'Ovozni tanishda xatolik',
    });
  }
});

// ---------- Matndan ovozga (TTS) — UzbekVoice Lola ovozi ----------
// { url } qaytaradi (audio WAV havolasi). Frontend o'shani ijro etadi.
// UzbekVoice'da faqat o'zbek ovozlari bor — rus tili uchun frontend brauzer ovoziga qaytadi.
router.post('/tts', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim().slice(0, 1000);
    const lang = req.body.language === 'ru' ? 'ru' : 'uz';
    if (!text) return res.status(400).json({ error: 'Matn bo\'sh' });
    if (!UZBEKVOICE_API_KEY) return res.status(503).json({ error: "TTS sozlanmagan (UZBEKVOICE_API_KEY kerak)" });
    // UzbekVoice ovozlari faqat o'zbekcha — rus uchun url bermaymiz (frontend brauzer ovozida o'qiydi)
    if (lang === 'ru') return res.json({ url: null });
    const url = await synthesizeWithUzbekVoice(text, UZBEKVOICE_TTS_VOICE);
    return res.json({ url });
  } catch (e) {
    console.error('[ahmad/tts]', e.message);
    return res.status(502).json({ error: 'TTS xatosi: ' + e.message });
  }
});

module.exports = router;
