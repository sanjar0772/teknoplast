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
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const db = require('./db');

const app = express();

app.set('trust proxy', 1);
// GZIP siqish (v233 upgrade): JS/CSS/JSON javoblar ~4x kichik yuklanadi —
// dastur ochilishi va API javoblari sezilarli tezlashadi.
app.use(compression());
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
app.use('/api/drobilka', require('./routes/drobilka'));
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
  res.json({ version: 'dublikat-tozalandi', commit: 'v258' });
});

// VAQTINCHALIK — to'liq salomatlik diagnostikasi (read-only). O'CHIRILADI.
app.get('/api/_diag/e1a8b46f565a3e6cbefb015a/health', async (req, res) => {
  try {
    const out = {};
    const chk = async (name, sql) => {
      try {
        const rows = (await db.query(sql)).rows;
        out[name] = { count: rows.length, sample: rows.slice(0, 6) };
      } catch (e) { out[name] = { error: e.message }; }
    };
    // ── SAVDO / MOLIYA ──
    await chk('A_overpay_single', `SELECT id, order_ref, customer_name, total_amount, payment_amount FROM sales WHERE payment_amount > total_amount + 1 ORDER BY (payment_amount-total_amount) DESC LIMIT 30`);
    await chk('B_paid_but_owes', `SELECT id, order_ref, customer_name, total_amount, payment_amount, status FROM sales WHERE status='PAID' AND total_amount - payment_amount > 1 LIMIT 30`);
    await chk('C_pending_but_paid', `SELECT id, order_ref, customer_name, total_amount, payment_amount, status FROM sales WHERE status='PENDING' AND payment_amount > 1 LIMIT 30`);
    await chk('D_partial_but_full', `SELECT id, order_ref, customer_name, total_amount, payment_amount, status FROM sales WHERE status='PARTIALLY_PAID' AND total_amount - payment_amount <= 0.01 AND total_amount > 0 LIMIT 30`);
    await chk('E_bad_status', `SELECT id, order_ref, customer_name, status FROM sales WHERE status NOT IN ('PAID','PENDING','PARTIALLY_PAID') LIMIT 30`);
    await chk('F_negatives', `SELECT id, order_ref, customer_name, total_amount, payment_amount, quantity FROM sales WHERE total_amount < 0 OR payment_amount < 0 OR quantity < 0 LIMIT 30`);
    await chk('G_dup_rows', `SELECT order_ref, product_id, COALESCE(rang,'') rang, unit_price, quantity, COUNT(*) n FROM sales WHERE order_ref IS NOT NULL GROUP BY order_ref, product_id, COALESCE(rang,''), unit_price, quantity HAVING COUNT(*) > 1 LIMIT 30`);
    await chk('H_total_mismatch', `SELECT id, order_ref, customer_name, total_amount, quantity, unit_price FROM sales WHERE ABS(total_amount - quantity*unit_price) > 1 LIMIT 30`);
    // ── TO'LOV JADVALI ──
    await chk('I_orphan_payments', `SELECT id, sale_id, amount, method FROM payments WHERE sale_id NOT IN (SELECT id FROM sales) LIMIT 30`);
    await chk('J_payments_gt_pa', `SELECT s.id, s.order_ref, s.customer_name, s.payment_amount, (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id) AS sum_pay FROM sales s WHERE (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id) > s.payment_amount + 1 ORDER BY sum_pay - s.payment_amount DESC LIMIT 30`);
    // J2: vozvrat bilan IZOHLANMAYDIGAN mismatch (haqiqiy anomaliya)
    await chk('J2_unexplained', `SELECT s.id, s.order_ref, s.customer_name, s.payment_amount,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id) AS sum_pay,
      (SELECT COALESCE(SUM(refund_amount),0) FROM sale_returns WHERE sale_id=s.id) AS refunds
      FROM sales s WHERE (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id)
        > s.payment_amount + (SELECT COALESCE(SUM(refund_amount),0) FROM sale_returns WHERE sale_id=s.id) + 1 LIMIT 30`);
    // A2: HAQIQIY savdoda (total>0) izohsiz ortiqcha to'lov (vozvrat hisobga olib)
    await chk('A2_unexplained_overpay', `SELECT s.id, s.order_ref, s.customer_name, s.total_amount, s.payment_amount,
      (SELECT COALESCE(SUM(refund_amount),0) FROM sale_returns WHERE sale_id=s.id) AS refunds
      FROM sales s WHERE s.total_amount > 0 AND s.payment_amount - s.total_amount
        > (SELECT COALESCE(SUM(refund_amount),0) FROM sale_returns WHERE sale_id=s.id) + 1
      ORDER BY s.payment_amount - s.total_amount DESC LIMIT 30`);
    // ── OMBOR ──
    await chk('K_neg_stock', `SELECT id, name, stock_quantity FROM products WHERE stock_quantity < 0 LIMIT 30`);
    await chk('L_color_drift', `SELECT p.id, p.name, p.stock_quantity, (SELECT COALESCE(SUM(quantity),0) FROM product_color_stock cs WHERE cs.product_id=p.id) AS buckets FROM products p WHERE p.is_active=1 AND ABS(p.stock_quantity - (SELECT COALESCE(SUM(quantity),0) FROM product_color_stock cs WHERE cs.product_id=p.id)) > 0.5 AND (SELECT COUNT(*) FROM product_color_stock cs WHERE cs.product_id=p.id) > 0 LIMIT 40`);
    await chk('M_neg_color', `SELECT product_id, rang, quantity FROM product_color_stock WHERE quantity < 0 LIMIT 30`);
    await chk('N_semi_neg', `SELECT id, name, semi_stock_quantity FROM products WHERE semi_stock_quantity < 0 LIMIT 30`);
    // ── BOG'LIQLIK ──
    await chk('O_orphan_customer', `SELECT id, order_ref, customer_name, customer_id FROM sales WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers) LIMIT 30`);
    await chk('P_deleted_product', `SELECT COUNT(*) AS cnt FROM sales WHERE product_id NOT IN (SELECT id FROM products)`);
    // J2 — aynan anomal qatorlar (sum_pay > payment_amount) va ularning HAMMA to'lov yozuvlari
    await chk('Z_anom_sales', `SELECT s.id, s.order_ref, s.quantity, s.unit_price, s.total_amount, s.payment_amount, s.status,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id) AS sum_pay
      FROM sales s WHERE s.order_ref='28-07-2026-030'
        AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=s.id) > s.payment_amount + 1 ORDER BY s.id`);
    await chk('Z_anom_pays', `SELECT p.sale_id, p.amount, p.method, p.payment_ref, p.created_at, p.notes FROM payments p
      WHERE p.sale_id IN (SELECT id FROM sales WHERE order_ref='28-07-2026-030'
        AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=sales.id) > sales.payment_amount + 1) ORDER BY p.sale_id, p.created_at`);
    // ── UMUMIY SANOQ ──
    const counts = (await db.query(`SELECT (SELECT COUNT(*) FROM sales) AS sales, (SELECT COUNT(*) FROM payments) AS payments, (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM customers) AS customers`)).rows[0];
    out._totals = counts;
    res.json(out);
  } catch (e) { res.json({ error: e.message, stack: e.stack }); }
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
const { runBackup, pruneBackups } = require('./services/backupService');
cron.schedule('0 2 * * *', () => {
  console.log('🕑 Kunlik avtomatik backup boshlandi...');
  runBackup();
});

// Disk tozalash: eski backup nusxalari startupda ham tozalanadi
// (Railway diski to'lib qolmasligi uchun — KEEP=5, avval 14 edi)
try { pruneBackups(); } catch (e) { console.error('Backup prune xato:', e.message); }

// Smart alerts — har soat tekshirish
cron.schedule('0 * * * *', async () => {
  try {
    const aiService = require('./services/aiService');
    const alerts = await aiService.checkAlerts(db);
    for (const alert of alerts) {
      // MUHIM: $3 ni subquery'da QAYTA ishlatib bo'lmaydi — SQLite adapter
      // parametrlarni tartib bo'yicha joylaydi, message=$3 NULL bo'lib qolib
      // dedup ishlamasdi (558k takror qator, 77MB — 2026-07-23 tozalandi).
      // Shuning uchun $4 + parametr ikki marta beriladi.
      await db.query(
        `INSERT INTO smart_alerts (type, severity, message)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM smart_alerts WHERE message=$4 AND is_resolved=false
         )`,
        [alert.type, alert.severity, alert.message, alert.message]
      );
    }
    if (alerts.length) console.log(`🔔 ${alerts.length} ta alert tekshirildi`);
  } catch (err) {
    console.error('Alert tekshirishda xato:', err.message);
  }
});

// Eski alertlarni kunlik tozalash (30 kundan oshgan) — jadval qayta shishmasin.
// Sana JS'da hisoblanadi (adapterdagi INTERVAL konversiyasiga ishonmaymiz).
cron.schedule('30 2 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await db.query('DELETE FROM smart_alerts WHERE triggered_date < $1', [cutoff]);
  } catch (err) {
    console.error('Alert tozalashda xato:', err.message);
  }
});

// Oylik texnik xizmat (v233): har oyning 1-kuni 03:00 da VACUUM — baza siqiladi,
// o'chirilgan yozuvlar joyi bo'shatiladi (ma'lumotga tegmaydi, faqat fayl kichrayadi).
cron.schedule('0 3 1 * *', async () => {
  try {
    await db.query('VACUUM');
    if (db.saveDBSync) db.saveDBSync();
    console.log('🗜️ Oylik VACUUM bajarildi — baza siqildi');
  } catch (err) {
    console.error('Oylik VACUUM xato:', err.message);
  }
});

// Baza indekslari (v233 upgrade) — so'rovlar tez ishlashi uchun, idempotent
require('./services/dbIndexes')
  .ensureIndexes()
  .catch(e => console.error('Indeks yaratish xato:', e.message));

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

// Mahsulot retsept jadvali (product_recipes) — PostgreSQL uchun runtime DDL
require('./services/recipeSchema')
  .ensureRecipeSchema()
  .catch(e => console.error('Recipe schema xato:', e.message));

// Xom ashyo turlarini avtomatik yuklash (faqat bir marta, jadval bo'sh bo'lsa)
require('./services/rawMaterialSeed')
  .ensureRawMaterialSeed()
  .catch(e => console.error('Raw material seed xato:', e.message));

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
  .catch(e => console.error('Sotuv tozalash (2026-06-26) init xato:', e.message))
  // BIR MARTALIK (egasi talabi 2026-07-22): FILIAL tizimidagi SINOV savdolarini tozalash.
  // FAQAT filial savdolari (branch_id bor) + ularning to'lovlari/vozvratlari o'chadi.
  // Zavod savdolari, filial ombori/mahsulot/mijozlarga TEGILMAYDI. Backup avtomatik.
  .then(() => require('./services/branchSalesReset').ensureBranchSalesWiped())
  .catch(e => console.error('Filial savdo tozalash init xato:', e.message))
  // BIR MARTALIK (2026-07-23): smart_alerts'dagi 558k takror qatorni tozalash,
  // VACUUM bilan bazani siqish, shishgan backuplarni yangilash (disk bo'shaydi).
  .then(() => require('./services/alertsCleanup').ensureAlertsCleaned())
  .catch(e => console.error('Alerts tozalash init xato:', e.message));

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
