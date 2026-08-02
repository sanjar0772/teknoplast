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
app.use('/api/xom-ashyo', require('./routes/xomAshyo'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// Deploy versiyasini tekshirish uchun (auth talab qilinmaydi)
app.get('/api/version', (req, res) => {
  res.json({ version: 'faktura15-fix', commit: 'v267f' });
});

// ===== VAQTINCHALIK DIAGNOSTIKA (faqat o'qish, kalit bilan) — Faktura 15 tuzatish uchun.
// Keyin O'CHIRILADI. =====
app.get('/api/_diag_f15/:key', async (req, res) => {
  if (req.params.key !== 'f15diag_Qk93xZ') return res.status(404).end();
  try {
    const { query } = require('./db');
    const ORDER = '02-08-2026-015';
    const lines = (await query(
      `SELECT s.id, s.product_id, COALESCE(p.name,'[deleted]') AS product_name, s.quantity, s.unit_price,
              s.total_amount, s.payment_amount, s.status, s.rang, s.customer_id, s.customer_name,
              s.notes, s.sale_date, s.branch_id, s.created_by, s.created_at
       FROM sales s LEFT JOIN products p ON s.product_id = p.id
       WHERE s.order_ref = $1 ORDER BY s.created_at, s.rowid`, [ORDER]
    )).rows;
    const pays = (await query(
      `SELECT pm.id, pm.sale_id, pm.amount, pm.method, pm.payment_date, pm.notes, pm.payment_ref
       FROM payments pm JOIN sales s ON pm.sale_id = s.id
       WHERE s.order_ref = $1 ORDER BY pm.created_at`, [ORDER]
    )).rows;
    // Mijoz umumiy balansi
    let custBalance = null;
    if (lines.length && lines[0].customer_id) {
      custBalance = (await query(
        `SELECT COALESCE(SUM(payment_amount - total_amount),0) AS bal FROM sales WHERE customer_id=$1`,
        [lines[0].customer_id]
      )).rows[0];
    }
    // Nomzod mahsulotlar — qo'shiladigan/o'chiriladigan
    const patterns = ['%апалак тувак%', '%ирамида 2 голд%', '%лобус 5%', '%ирамида 3 голд%', '%ирамида 3 gold%', '%апалак%'];
    const prodMap = {};
    for (const pat of patterns) {
      const rows = (await query(
        `SELECT id, name, price, stock_quantity, unit, branch_id FROM products WHERE name LIKE $1 ORDER BY name`, [pat]
      )).rows;
      for (const r of rows) prodMap[r.id] = r;
    }
    const products = Object.values(prodMap);
    // Har bir nomzod mahsulotning rang bucketlari
    for (const p of products) {
      p.color_stock = (await query(
        `SELECT rang, quantity FROM product_color_stock WHERE product_id=$1 ORDER BY rang`, [p.id]
      )).rows;
    }
    // Bugungi barcha fakturalar (order_ref bo'yicha)
    const todayOrders = (await query(
      `SELECT s.order_ref, MIN(s.customer_name) AS customer_name, COUNT(*) AS lines,
              SUM(s.total_amount) AS total, SUM(s.payment_amount) AS paid, MIN(s.created_at) AS created_at
       FROM sales s WHERE s.order_ref LIKE $1 GROUP BY s.order_ref ORDER BY s.order_ref`,
      ['02-08-2026-%']
    )).rows;
    // Bugun "Пирамида 3 голд" borมี fakturalar
    const pyramidLines = (await query(
      `SELECT s.order_ref, s.customer_name, p.name AS product_name, s.quantity, s.unit_price, s.total_amount
       FROM sales s JOIN products p ON s.product_id = p.id
       WHERE s.order_ref LIKE $1 AND p.name LIKE '%ирамида 3 голд%' ORDER BY s.order_ref`,
      ['02-08-2026-%']
    )).rows;
    res.json({ order: ORDER, lines, pays, custBalance, products, todayOrders, pyramidLines });
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
});

// ===== VAQTINCHALIK TUZATISH (kalit bilan) — Faktura 15 ga 3 tovar qo'shish (naqd to'landi).
//  + Kapalak тувак №3 2-сорт 50 dona (Оқ, 5720) = 286000
//  + Пирамида 2 голд сплашной 40 dona (Rangsiz, 12600) = 504000
//  ~ Глобус 5 паласа 3 -> 6 dona (Оқ, 50000) +150000
//  Jami +940000 naqd; mijoz balansi (haqdor 2806) o'zgarmaydi. Bir marta ishlaydi. Keyin O'CHIRILADI. =====
app.post('/api/_fix_f15/:key', async (req, res) => {
  if (req.params.key !== 'f15fix_Qk93xZ') return res.status(404).end();
  const db = require('./db');
  const { query } = db;
  const { addColorStock, getColorStock } = require('./utils/colorStock');
  const ORDER = '02-08-2026-015';
  const CUST  = 'cd2952dde6fa573aa07bbd75a699a59f';
  const CUR_TOTAL = 4170750, CUR_PAID = 4173556;
  const GLOBUS_LINE = '8f88d10ab39dbbf899e27f156f830f2b';
  const GLOBUS_PID  = '9e9f325030f2e9aafd6864b54c5409a8';
  const KAP3_PID    = '102cf3ea845975f10fa514aee17b3096';
  const PIR2_PID    = '5ff4ad4b7f11a610218176d57981c74b';
  const NOTE = "To'lov: Naqd: 5113556 · Haqdor: 2806";
  try {
    const rows = (await query(
      `SELECT id, product_id, quantity, unit_price, total_amount, payment_amount, customer_id, rang,
              customer_name, customer_phone, sale_date, created_by, branch_id, delivery_type
       FROM sales WHERE order_ref=$1 ORDER BY created_at, rowid`, [ORDER]
    )).rows;
    // ── XAVFSIZLIK GUARDLARI ──
    if (rows.length !== 22) return res.status(409).json({ error: 'lines != 22', lines: rows.length });
    if (rows.some(r => r.customer_id !== CUST)) return res.status(409).json({ error: 'customer mismatch' });
    const sumTotal = Math.round(rows.reduce((s,r)=>s+(parseFloat(r.total_amount)||0),0));
    const sumPaid  = Math.round(rows.reduce((s,r)=>s+(parseFloat(r.payment_amount)||0),0));
    if (sumTotal !== CUR_TOTAL) return res.status(409).json({ error: 'total mismatch', sumTotal });
    if (sumPaid !== CUR_PAID)  return res.status(409).json({ error: "paid mismatch (allaqachon o'zgargan?)", sumPaid });
    if (rows.some(r => r.product_id === KAP3_PID)) return res.status(409).json({ error: 'Kapalak N3 allaqachon bor' });
    if (rows.some(r => r.product_id === PIR2_PID)) return res.status(409).json({ error: 'Piramida2 splashnoy allaqachon bor' });
    const gl = rows.find(r => r.id === GLOBUS_LINE);
    if (!gl) return res.status(409).json({ error: 'Globus liniya topilmadi' });
    if (parseInt(gl.quantity) !== 3 || Math.round(parseFloat(gl.total_amount)) !== 150000) {
      return res.status(409).json({ error: 'Globus liniya kutilmagan', gl: { q: gl.quantity, t: gl.total_amount } });
    }
    const glPaid = Math.round(parseFloat(gl.payment_amount)); // 150101
    const kap3Stock = await getColorStock(query, KAP3_PID, 'Оқ');
    if (kap3Stock < 50) return res.status(409).json({ error: 'Kapalak N3 Oq kam', kap3Stock });
    const pir2Stock = await getColorStock(query, PIR2_PID, '');
    if (pir2Stock < 40) return res.status(409).json({ error: 'Piramida2 kam', pir2Stock });
    const globStock = await getColorStock(query, GLOBUS_PID, 'Оқ');
    if (globStock < 3) return res.status(409).json({ error: 'Globus Oq kam', globStock });

    const ref = rows[0];
    const cName = ref.customer_name, cPhone = ref.customer_phone, sDate = ref.sale_date;
    const cBy = ref.created_by, bId = ref.branch_id, dType = ref.delivery_type || 'PICKUP';

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      // 1) Kapalak тувак №3 2-сорт — 50 dona Оқ
      await client.query(
        `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount, customer_name, customer_phone,
           sale_date, status, payment_amount, notes, created_by, order_ref, rang, branch_id, delivery_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PAID',$9,$10,$11,$12,$13,$14,$15)`,
        [KAP3_PID, CUST, 50, 5720, 286000, cName, cPhone, sDate, 286000, NOTE, cBy, ORDER, 'Оқ', bId, dType]
      );
      await client.query('UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2', [50, KAP3_PID]);
      await addColorStock(client.query, KAP3_PID, 'Оқ', -50);
      // 2) Пирамида 2 голд сплашной — 40 dona Rangsiz
      await client.query(
        `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount, customer_name, customer_phone,
           sale_date, status, payment_amount, notes, created_by, order_ref, rang, branch_id, delivery_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PAID',$9,$10,$11,$12,$13,$14,$15)`,
        [PIR2_PID, CUST, 40, 12600, 504000, cName, cPhone, sDate, 504000, NOTE, cBy, ORDER, '', bId, dType]
      );
      await client.query('UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2', [40, PIR2_PID]);
      await addColorStock(client.query, PIR2_PID, '', -40);
      // 3) Глобус 5 паласа liniyasi 3 -> 6 dona
      const newGlobPaid = glPaid + 150000; // 300101
      await client.query(
        "UPDATE sales SET quantity = 6, total_amount = 300000, payment_amount = $1, status='PAID', updated_at = NOW() WHERE id = $2",
        [newGlobPaid, GLOBUS_LINE]
      );
      await client.query('UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2', [3, GLOBUS_PID]);
      await addColorStock(client.query, GLOBUS_PID, 'Оқ', -3);
      // 4) Barcha qatorlar uchun bir xil izoh
      await client.query('UPDATE sales SET notes = $1, updated_at = NOW() WHERE order_ref = $2', [NOTE, ORDER]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }

    const after = (await query(
      'SELECT COUNT(*) AS n, SUM(total_amount) AS total, SUM(payment_amount) AS paid FROM sales WHERE order_ref=$1', [ORDER]
    )).rows[0];
    const bal = (await query('SELECT COALESCE(SUM(payment_amount-total_amount),0) AS b FROM sales WHERE customer_id=$1', [CUST])).rows[0];
    res.json({ ok: true, after, customerBalance: bal });
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
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

// Xom ashyo qabul aktlari jadvalini tayyorlash
require('./services/xomAshyoSchema')
  .ensureXomAshyoSchema()
  .catch(e => console.error('Xom ashyo schema init xato:', e.message));

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
