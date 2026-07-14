require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Railway volume papkasini oldindan yaratamiz (DATABASE_PATH uchun)
if (process.env.DATABASE_PATH) {
  const dir = path.dirname(process.env.DATABASE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const db = require('./db');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Juda ko\'p urinish. 15 daqiqadan so\'ng qayta urinib ko\'ring.' },
});
app.use('/api/auth/login', loginLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/intakes', require('./routes/intakes'));
app.use('/api/fulfillment', require('./routes/fulfillment'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/production', require('./routes/production'));
app.use('/api/salaries', require('./routes/salaries'));
app.use('/api/salary-slip', require('./routes/salary-slip'));
app.use('/api/products', require('./routes/products'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/molds', require('./routes/molds'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ahmad', require('./routes/ahmad'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/tarozi', require('./routes/tarozi'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// Deploy versiyasini tekshirish uchun (auth talab qilinmaydi)
app.get('/api/version', (req, res) => {
  res.json({ version: 'tayyor-narx-bosh-qolmaydi', commit: 'v190' });
});

// Frontend static files (Railway uchun - Nginx yo'q)
const frontendDist = path.join(__dirname, '../../frontend/dist');
// Hashli fayllar (assets/) abadiy keshlanadi, index.html esa HECH QACHON keshlanmaydi
app.use(express.static(frontendDist, {
  setHeaders: (res, filePath) => {
    // index.html, service worker va manifest — HECH QACHON keshlanmaydi (tez yangilanish uchun)
    if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\.(js|css|woff2?|png|jpg|jpeg|svg|gif|webp)$/.test(filePath)) {
      // Vite hashli nom beradi — xavfsiz uzoq kesh
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Digital Asset Links — Android TWA/APK ilovasi brauzer manzil satrisiz, TO'LIQ
// EKRANDA ochilishi uchun zarur. PWABuilder APK yasaganda bergan JSON'ni Railway'da
// ASSETLINKS_JSON env'iga qo'ying (eng oson — qayta deploy kerak emas), yoki
// frontend/public/.well-known/assetlinks.json fayliga yozing.
// MUHIM: bu route SPA fallback'dan OLDIN turishi shart (aks holda index.html qaytadi).
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (process.env.ASSETLINKS_JSON) return res.send(process.env.ASSETLINKS_JSON);
  const f = path.join(frontendDist, '.well-known', 'assetlinks.json');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.send('[]');
});

// SPA fallback — barcha yo'llar index.html'ga (kesh yo'q)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

// Avtomatik zaxira — har kuni soat 02:00 da
const { runBackup } = require('./services/backupService');
cron.schedule('0 2 * * *', () => {
  console.log('🕑 Kunlik avtomatik backup boshlandi...');
  runBackup();
});

// Smart alerts — har soat tekshirish
cron.schedule('0 * * * *', async () => {
  try {
    const aiService = require('./services/aiService');
    const alerts = await aiService.checkAlerts(db);
    for (const alert of alerts) {
      await db.query(
        `INSERT INTO smart_alerts (type, severity, message)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM smart_alerts WHERE message=$3 AND is_resolved=false
             AND triggered_date > NOW() - INTERVAL '24 hours'
         )`,
        [alert.type, alert.severity, alert.message]
      );
    }
    if (alerts.length) console.log(`🔔 ${alerts.length} ta yangi alert yaratildi`);
  } catch (err) {
    console.error('Alert tekshirishda xato:', err.message);
  }
});

// Xom ashyo aylma daftarini tayyorlash (idempotent, crash-proof)
require('./services/rawMaterialLedger')
  .ensureLedger()
  .catch(e => console.error('Ledger init xato:', e.message));

// Sotuvdan qaytarish (vozvrat) jadvalini tayyorlash
require('./services/saleReturns')
  .ensureReturnsSchema()
  .catch(e => console.error('Sale returns init xato:', e.message));

// Filial (branch) tizimi jadvallarini tayyorlash
require('./services/branchSchema')
  .ensureBranchSchema()
  .catch(e => console.error('Branch schema init xato:', e.message));

// Agent tizimi (profil, GPS joylashuv, mijoz lokatsiyasi) jadvallarini tayyorlash
require('./services/agentSchema')
  .ensureAgentSchema()
  .catch(e => console.error('Agent schema init xato:', e.message));

// Tarozi (weighbridge) cheklari jadvalini tayyorlash
require('./services/taroziSchema')
  .ensureTaroziSchema()
  .catch(e => console.error('Tarozi schema init xato:', e.message));

// Inventarizatsiya tarixi jadvalini tayyorlash
require('./services/inventoryAudit')
  .ensureInventoryAuditSchema()
  .catch(e => console.error('Inventory audit init xato:', e.message));

// Texno Innovator 2026 prayslistini avtomatik yuklash (faqat bir marta, sentinel bilan himoyalangan)
require('./services/pricelistSeed')
  .ensurePricelist2026()
  .catch(e => console.error('Praysist seed init xato:', e.message));

// BIR MARTALIK sotuv+qarz tozalash (egasi talabi 2026-06-22) — keyin bito qarzdorlar importi.
// Tartib MUHIM: avval tozalash bayrog'i qo'yiladi, keyin import o'sha bayroqni ko'rib o'zini bloklaydi
// (aks holda tozalashdan keyin eski qarzlar qayta import bo'lib qolardi).
require('./services/salesReset')
  .ensureSalesWiped()
  .catch(e => console.error('Sotuv tozalash init xato:', e.message))
  .then(() => require('./services/debtorsSeed').ensureDebtors2026())
  .catch(e => console.error('Qarzdorlar seed init xato:', e.message))
  // BIR MARTALIK (egasi talabi 2026-06-26): 2026-06-22 dan keyin yig'ilgan yangi
  // sotuv+qarzlarni yana tozalash. Backup avtomatik olinadi; ombor/mahsulot/mijoz saqlanadi.
  // Yangi sentinel bayroq → faqat bir marta ishlaydi, keyingi sotuvlar xavfsiz.
  .then(() => require('./services/salesReset').ensureSalesWiped('sales_wiped_2026_06_26'))
  .catch(e => console.error('Sotuv tozalash (2026-06-26) init xato:', e.message));

// BIR MARTALIK: eski sessiya sanasi tufayli noto'g'ri yozilган savdo sanalarini
// order_ref (haqiqiy yaratilган kun) bo'yicha to'g'rilash (sentinel bilan himoyalangan).
require('./services/saleDateFix')
  .ensureSaleDatesFixed()
  .catch(e => console.error('Sale date fix init xato:', e.message));

// BIR MARTALIK: UTC xatosi tufayli bir kun orqaga surilган qarz to'lovi sanalarini
// (masalan bugun qilingan to'lov "29" bo'lib chiqqani) Toshkent kuniga to'g'rilash.
require('./services/paymentDateFix')
  .ensurePaymentDatesFixed()
  .catch(e => console.error('Payment date fix init xato:', e.message));

// BIR MARTALIK: rang ombori (product_color_stock) buketlarini umumiy qoldiq bilan
// moslashtirish — v22 dan oldingi "fantom ombor" (sotib bo'lmaydigan qoldiq) ni tuzatadi.
require('./services/colorStockReconcile')
  .ensureColorStockReconciled()
  .catch(e => console.error('Rang ombori reconcile init xato:', e.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Teknoplast Backend: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${process.env.FRONTEND_PORT || 5173}`);
  console.log(`🌍 Muhit: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
