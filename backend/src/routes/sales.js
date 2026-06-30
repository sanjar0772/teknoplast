const express = require('express');
const { body, query: qval, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const reportService = require('../services/reportService');
const { getColorStock, addColorStock } = require('../utils/colorStock');
const { todayUZB, monthUZB } = require('../utils/date');
const saleReturns = require('../services/saleReturns');

const router = express.Router();

const rangLabel = (r) => (r && r.trim()) ? r : 'Rangsiz';
router.use(authenticate);

// Schyot-faktura raqami: KK-OO-YYYY-NNN  (masalan 25-06-2026-001)
// KK-OO-YYYY — sana (kun-oy-yil, Toshkent vaqti); NNN — shu kungi tartib
// raqami (001 dan boshlanadi, har kuni yangidan).
async function genOrderRef() {
  const t = new Date(Date.now() + 5 * 3600 * 1000); // Toshkent (UTC+5)
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = t.getUTCFullYear();
  const prefix = `${dd}-${mm}-${yyyy}-`;
  // Shu kungi mavjud raqamlardan eng kattasini topib, +1 qilamiz
  const r = await query(`SELECT order_ref FROM sales WHERE order_ref LIKE $1`, [`${prefix}%`]);
  let max = 0;
  for (const row of r.rows) {
    const m = String(row.order_ref || '').match(/-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// GET /api/sales
router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, status, customer, page = 1, limit = 20 } = req.query;
    let sql = `
      SELECT s.*, COALESCE(p.name, '[O''chirilgan]') as product_name, COALESCE(p.unit, 'dona') as unit,
             u.full_name as created_by_name,
             d.name as discount_name, d.discount_value, d.discount_type
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN discounts d ON s.discount_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (start_date) { sql += ` AND s.sale_date >= $${idx++}`; params.push(start_date); }
    if (end_date)   { sql += ` AND s.sale_date <= $${idx++}`; params.push(end_date); }
    if (status)     { sql += ` AND s.status = $${idx++}`; params.push(status); }
    if (customer)   { sql += ` AND s.customer_name ILIKE $${idx++}`; params.push(`%${customer}%`); }

    const countResult = await query(`SELECT COUNT(*) as count FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0]?.count ?? countResult.rows[0]?.['COUNT(*)'] ?? 0);

    sql += ` ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);
    res.json({ sales: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/sales/summary
// Davr: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD (oraliq) YOKI ?month=YYYY-MM (eski usul).
router.get('/summary', async (req, res, next) => {
  try {
    const { month, start_date, end_date } = req.query;
    // Sana sharti — oraliq berilsa o'sha, aks holda oy bo'yicha (orqaga moslik)
    let where, params;
    if (start_date || end_date) {
      const conds = []; params = []; let i = 1;
      if (start_date) { conds.push(`sale_date >= $${i++}`); params.push(start_date); }
      if (end_date)   { conds.push(`sale_date <= $${i++}`); params.push(end_date); }
      where = conds.join(' AND ');
    } else {
      where = `TO_CHAR(sale_date, 'YYYY-MM') = $1`;
      params = [month || monthUZB()];
    }

    const result = await query(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status='PAID' THEN total_amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status='PENDING' THEN total_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status='PARTIALLY_PAID' THEN total_amount ELSE 0 END), 0) as partial_amount,
        COALESCE(SUM(quantity), 0) as total_quantity
      FROM sales
      WHERE ${where}
    `, params);

    const byProduct = await query(`
      SELECT p.name, SUM(s.quantity) as qty, SUM(s.total_amount) as revenue
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE ${where}
      GROUP BY p.name ORDER BY revenue DESC LIMIT 10
    `, params);

    const byDay = await query(`
      SELECT TO_CHAR(sale_date, 'YYYY-MM-DD') as day,
             SUM(total_amount) as revenue, COUNT(*) as count
      FROM sales
      WHERE ${where}
      GROUP BY sale_date ORDER BY sale_date DESC
    `, params);

    res.json({
      summary: result.rows[0],
      by_product: byProduct.rows,
      by_day: byDay.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/sales/:id — bitta sotuv haqida to'liq ma'lumot (schyot-faktura/chek uchun)
// :id — sale id YOKI order_ref (masalan "ORD-20260606-1259") bo'lishi mumkin.
// SQLite id'lari chiziqchasiz hex bo'lgani uchun ikkala ustundan ham qidiramiz.
router.get('/:id', async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const result = await query(
      `SELECT s.*, COALESCE(p.name, '[O''chirilgan mahsulot]') as product_name, COALESCE(p.unit, 'dona') as unit,
              u.full_name as created_by_name,
              c.name as customer_full_name, c.phone as customer_full_phone,
              c.company_name as customer_company, c.address as customer_address,
              d.name as discount_name, d.discount_value, d.discount_type
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN discounts d ON s.discount_id = d.id
       WHERE s.id = $1 OR s.order_ref = $2
       ORDER BY s.created_at LIMIT 1`,
      [idParam, idParam]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });

    const sale = result.rows[0];

    let items = [sale];
    if (sale.order_ref) {
      const itemsR = await query(
        `SELECT s.*, COALESCE(p.name, '[O''chirilgan mahsulot]') as product_name, COALESCE(p.unit, 'dona') as unit
         FROM sales s LEFT JOIN products p ON s.product_id = p.id
         WHERE s.order_ref = $1 ORDER BY s.created_at, s.rowid`,
        [sale.order_ref]
      );
      if (itemsR.rows.length) items = itemsR.rows;
    }

    // Mijoz balansi (eski qarzlar bilan): shu savdo vaqtigacha bo'lgan SUM(to'lov - summa).
    // Manfiy = qarzdor, musbat = haqdor.
    if (sale.customer_id) {
      const key = sale.order_ref || sale.id;
      const col = sale.order_ref ? 'order_ref' : 'id';
      const contribR = await query(
        `SELECT COALESCE(SUM(payment_amount - total_amount), 0) AS c, MAX(created_at) AS t FROM sales WHERE ${col} = $1`,
        [key]
      );
      const contribution = parseFloat(contribR.rows[0].c) || 0;
      const lastT = contribR.rows[0].t;
      const afterR = await query(
        'SELECT COALESCE(SUM(payment_amount - total_amount), 0) AS b FROM sales WHERE customer_id = $1 AND created_at <= $2',
        [sale.customer_id, lastT]
      );
      sale.balance_after = parseFloat(afterR.rows[0].b) || 0;
      sale.balance_before = sale.balance_after - contribution;
    }

    res.json({ sale, items });
  } catch (err) { next(err); }
});

// GET /api/sales/:id/invoice-pdf — schyot-faktura PDF (QR kod bilan, tizimdagi
// "/invoice/:id" sahifasiga yo'naltiradi — shu orqali hujjat haqiqiyligini tekshirish mumkin)
router.get('/:id/invoice-pdf', async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const result = await query(
      `SELECT s.*, COALESCE(p.name, '[O''chirilgan mahsulot]') as product_name, COALESCE(p.unit, 'dona') as unit,
              u.full_name as created_by_name,
              c.name as customer_full_name, c.phone as customer_full_phone,
              c.company_name as customer_company, c.address as customer_address
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1 OR s.order_ref = $2
       ORDER BY s.created_at LIMIT 1`,
      [idParam, idParam]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    const sale = result.rows[0];

    let items = [sale];
    if (sale.order_ref) {
      const itemsR = await query(
        `SELECT s.*, COALESCE(p.name, '[O''chirilgan mahsulot]') as product_name, COALESCE(p.unit, 'dona') as unit
         FROM sales s LEFT JOIN products p ON s.product_id = p.id
         WHERE s.order_ref = $1 ORDER BY s.created_at, s.rowid`,
        [sale.order_ref]
      );
      if (itemsR.rows.length) items = itemsR.rows;
    }

    // Mijoz balansi (eski qarzlar bilan)
    if (sale.customer_id) {
      const key = sale.order_ref || sale.id;
      const col = sale.order_ref ? 'order_ref' : 'id';
      const contribR = await query(
        `SELECT COALESCE(SUM(payment_amount - total_amount), 0) AS c, MAX(created_at) AS t FROM sales WHERE ${col} = $1`,
        [key]
      );
      const contribution = parseFloat(contribR.rows[0].c) || 0;
      const afterR = await query(
        'SELECT COALESCE(SUM(payment_amount - total_amount), 0) AS b FROM sales WHERE customer_id = $1 AND created_at <= $2',
        [sale.customer_id, contribR.rows[0].t]
      );
      sale.balance_after = parseFloat(afterR.rows[0].b) || 0;
      sale.balance_before = sale.balance_after - contribution;
    }

    const viewUrl = `${req.protocol}://${req.get('host')}/invoice/${sale.id}`;
    const pdf = await reportService.generateInvoicePDF(sale, items, viewUrl);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="schyot-faktura-${sale.order_ref || sale.id}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// POST /api/sales
router.post('/', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), [
  body('product_id').notEmpty().withMessage('product_id kerak'),
  body('quantity').isInt({ min: 1 }),
  body('unit_price').isFloat({ min: 0 }),
  body('customer_name').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product_id, customer_id, quantity, unit_price, customer_name, customer_phone, sale_date, status, payment_amount, discount_id, notes, rang } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'Mijozni tanlang — savdo faqat mijozga qilinadi' });
    const total_amount = quantity * unit_price;

    // Mijoz tanlangan bo'lsa, ism/telefonni avtomatik to'ldirish
    let custName = customer_name, custPhone = customer_phone;
    if (customer_id) {
      const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
      if (c.rows.length) {
        custName = customer_name || c.rows[0].name;
        custPhone = customer_phone || c.rows[0].phone;
      }
    }

    const product = await query('SELECT name FROM products WHERE id = $1', [product_id]);
    if (!product.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    const availColor = await getColorStock(query, product_id, rang);
    if (availColor < quantity) {
      return res.status(400).json({ error: `"${product.rows[0].name}" — ${rangLabel(rang)} rangidan faqat ${availColor} dona bor (so'ralgan: ${quantity})` });
    }

    const order_ref = await genOrderRef();
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const saleResult = await client.query(
        `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount, customer_name, customer_phone,
          sale_date, status, payment_amount, discount_id, notes, created_by, order_ref, rang)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [product_id, customer_id || null, quantity, unit_price, total_amount, custName, custPhone,
         sale_date || todayUZB(), status || 'PENDING', payment_amount || 0, discount_id || null, notes, req.user.id, order_ref, rang || null]
      );
      await client.query(
        'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2',
        [quantity, product_id]
      );
      await addColorStock(client.query, product_id, rang, -quantity);
      await client.query('COMMIT');
      const sale = saleResult.rows[0];
      logAudit(req, {
        action: 'SALE_CREATE', table: 'sales', recordId: sale.id,
        newValues: { product_id, quantity, unit_price, total_amount, customer_name: custName, status: sale.status },
      });
      res.status(201).json({ sale });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/sales/bulk — bir nechta mahsulotni bitta chekda sotish
router.post('/bulk', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { customer_id, customer_name, customer_phone, sale_date, status, items, notes, payment_amount: reqPayment } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Kamida bitta mahsulot kerak' });
    }
    if (!customer_id) {
      return res.status(400).json({ error: 'Mijozni tanlang — savdo faqat mijozga qilinadi' });
    }

    // Mijoz ma'lumotini olish
    let custName = customer_name, custPhone = customer_phone;
    if (customer_id) {
      const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
      if (c.rows.length) {
        custName = customer_name || c.rows[0].name;
        custPhone = customer_phone || c.rows[0].phone;
      }
    }

    // Ombor yetarliligini tekshirish — RANG bo'yicha
    for (const it of items) {
      const p = await query('SELECT name FROM products WHERE id = $1', [it.product_id]);
      if (!p.rows.length) return res.status(404).json({ error: `Mahsulot topilmadi: ${it.product_id}` });
      const avail = await getColorStock(query, it.product_id, it.rang);
      if (avail < it.quantity) {
        return res.status(400).json({
          error: `"${p.rows[0].name}" — ${rangLabel(it.rang)} rangidan faqat ${avail} dona bor (so'ralgan: ${it.quantity})`
        });
      }
    }

    const saleDate = sale_date || todayUZB();
    // To'lov summasi: agar reqPayment kelsa — undan foydalaniladi (jami summadan
    // OSHIB ketishi mumkin — oshiqcha pul mijozning haqdorligi sifatida saqlanadi).
    const preGrand = items.reduce((s, it) => s + (parseInt(it.quantity) * parseFloat(it.unit_price)), 0);
    const paidAmount = reqPayment !== undefined
      ? Math.max(0, parseFloat(reqPayment) || 0)
      : null;
    const saleStatus = paidAmount !== null
      ? (paidAmount >= preGrand ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING')
      : (status || 'PENDING');
    const order_ref = await genOrderRef();
    const client = await require('../db').getClient();
    const created = [];
    let grandTotal = 0;
    let distributedPaid = 0; // taqsimlangan to'lovni kuzatish (oxirgi qatorga qoldiqni berish uchun)
    try {
      await client.query('BEGIN');
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unit_price);
        const total = qty * price;
        grandTotal += total;
        // Har bir mahsulot uchun to'lov proporsional taqsimlanadi; oxirgi qator
        // qoldiqni (shu jumladan oshiqcha to'lov/haqdorlikni) o'ziga oladi — jami aniq bo'lsin.
        let itemPaid;
        if (paidAmount !== null) {
          if (i === items.length - 1) {
            itemPaid = Math.max(0, Math.round((paidAmount - distributedPaid) * 100) / 100);
          } else {
            itemPaid = preGrand > 0 ? Math.round((total / preGrand) * paidAmount) : 0;
            distributedPaid += itemPaid;
          }
        } else {
          itemPaid = saleStatus === 'PAID' ? total : 0;
        }
        const r = await client.query(
          `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
            customer_name, customer_phone, sale_date, status, payment_amount, notes, created_by, order_ref, rang)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [it.product_id, customer_id || null, qty, price, total, custName, custPhone,
           saleDate, saleStatus, itemPaid, notes || null, req.user.id, order_ref, it.rang || null]
        );
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2',
          [qty, it.product_id]
        );
        await addColorStock(client.query, it.product_id, it.rang, -qty);
        created.push(r.rows[0]);
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'SALE_BULK_CREATE', table: 'sales', recordId: order_ref,
        newValues: { count: created.length, grand_total: grandTotal, customer_id: customer_id || null, order_ref },
      });
      const finalPaid = paidAmount !== null ? paidAmount : (saleStatus === 'PAID' ? grandTotal : 0);

      // Mijozning umumiy balansi (eski qarzlar bilan): SUM(to'lov - summa).
      // Manfiy = qarzdor, musbat = haqdor. Savdodan oldingi/keyingi balansni qaytaramiz.
      let balanceAfter = null, balanceBefore = null;
      if (customer_id) {
        const balR = await query(
          'SELECT COALESCE(SUM(payment_amount - total_amount), 0) AS b FROM sales WHERE customer_id = $1',
          [customer_id]
        );
        balanceAfter = parseFloat(balR.rows[0].b) || 0;
        balanceBefore = balanceAfter - (finalPaid - grandTotal); // shu savdo hissasini ayiramiz
      }

      res.status(201).json({
        sales: created, count: created.length, grand_total: grandTotal, paid_amount: finalPaid,
        order_ref, customer_name: custName, balance_before: balanceBefore, balance_after: balanceAfter,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/sales/:id/status
router.put('/:id/status', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { status, payment_amount } = req.body;
    if (!['PENDING', 'PAID', 'PARTIALLY_PAID'].includes(status)) {
      return res.status(400).json({ error: 'Noto\'g\'ri status' });
    }
    const result = await query(
      'UPDATE sales SET status=$1, payment_amount=COALESCE($2,payment_amount), updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, payment_amount, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    logAudit(req, {
      action: 'SALE_STATUS_CHANGE', table: 'sales', recordId: req.params.id,
      newValues: { status, payment_amount: payment_amount ?? null },
    });
    res.json({ sale: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/sales/:id — savdoni to'liq tahrirlash (mahsulot, miqdor, narx, mijoz, sana, status)
// Ombor miqdori avtomatik to'g'rilanadi (eski miqdor qaytariladi, yangi miqdor ayriladi)
router.put('/:id', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const old = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    const prev = old.rows[0];

    // Yangi qiymatlar (berilmasa — eski qiymat qoladi)
    const product_id = req.body.product_id || prev.product_id;
    const quantity = req.body.quantity != null ? parseInt(req.body.quantity) : prev.quantity;
    const unit_price = req.body.unit_price != null ? parseFloat(req.body.unit_price) : parseFloat(prev.unit_price);
    const sale_date = req.body.sale_date || prev.sale_date;
    const status = req.body.status || prev.status;
    const customer_id = req.body.customer_id !== undefined ? req.body.customer_id : prev.customer_id;
    const rang = req.body.rang !== undefined ? req.body.rang : prev.rang;

    if (!customer_id) return res.status(400).json({ error: 'Mijozni tanlang — savdo faqat mijozga qilinadi' });
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Miqdor noto\'g\'ri' });
    if (unit_price < 0) return res.status(400).json({ error: 'Narx noto\'g\'ri' });
    if (!['PENDING', 'PAID', 'PARTIALLY_PAID'].includes(status)) {
      return res.status(400).json({ error: 'Noto\'g\'ri status' });
    }

    // Mijoz ism/telefonni avtomatik to'ldirish
    let custName = req.body.customer_name ?? prev.customer_name;
    let custPhone = req.body.customer_phone ?? prev.customer_phone;
    if (customer_id) {
      const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
      if (c.rows.length) {
        custName = c.rows[0].name;
        custPhone = c.rows[0].phone;
      }
    }

    const sameProduct = String(product_id) === String(prev.product_id);
    const sameColor = sameProduct && (rang || '') === (prev.rang || '');
    // Yangi mahsulot + rang omborini tekshirish (RANG bo'yicha)
    const p = await query('SELECT name FROM products WHERE id = $1', [product_id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    // Bir xil mahsulot+rang bo'lsa eski miqdor qaytariladi -> mavjud sig'imga qo'shamiz
    const availColor = await getColorStock(query, product_id, rang) + (sameColor ? parseFloat(prev.quantity) : 0);
    if (quantity > availColor) {
      return res.status(400).json({ error: `"${p.rows[0].name}" — ${rangLabel(rang)} rangidan faqat ${availColor} dona bor (so'ralgan: ${quantity})` });
    }

    const total_amount = quantity * unit_price;
    // To'lov: PAID bo'lsa to'liq, PENDING bo'lsa 0, aks holda eski qiymat (qisman to'langan saqlanadi)
    let payment_amount = parseFloat(prev.payment_amount) || 0;
    if (status === 'PAID') payment_amount = total_amount;
    else if (status === 'PENDING') payment_amount = 0;

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Ombor to'g'rilash
      if (sameProduct) {
        // eski miqdorni qaytarib, yangisini ayiramiz: net = old - new
        const diff = parseFloat(prev.quantity) - quantity; // musbat bo'lsa omborga qaytadi
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + $1), updated_at = NOW() WHERE id = $2',
          [diff, product_id]
        );
      } else {
        // eski mahsulotga miqdorni qaytaramiz
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [prev.quantity, prev.product_id]
        );
        // yangi mahsulotdan ayiramiz
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2',
          [quantity, product_id]
        );
      }
      // Rang bo'yicha ombor: eski rangni qaytaramiz, yangisidan ayiramiz
      await addColorStock(client.query, prev.product_id, prev.rang, parseFloat(prev.quantity));
      await addColorStock(client.query, product_id, rang, -quantity);
      const upd = await client.query(
        `UPDATE sales SET product_id=$1, customer_id=$2, quantity=$3, unit_price=$4, total_amount=$5,
           customer_name=$6, customer_phone=$7, sale_date=$8, status=$9, payment_amount=$10, rang=$11, updated_at=NOW()
         WHERE id=$12 RETURNING *`,
        [product_id, customer_id || null, quantity, unit_price, total_amount,
         custName, custPhone, sale_date, status, payment_amount, rang || null, req.params.id]
      );
      await client.query('COMMIT');
      logAudit(req, {
        action: 'SALE_UPDATE', table: 'sales', recordId: req.params.id,
        oldValues: { product_id: prev.product_id, quantity: prev.quantity, unit_price: prev.unit_price, total_amount: prev.total_amount, status: prev.status },
        newValues: { product_id, quantity, unit_price, total_amount, status },
      });
      res.json({ sale: upd.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/sales/:id/payments — sotuv to'lovlari tarixi
router.get('/:id/payments', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, u.full_name as created_by_name
       FROM payments p LEFT JOIN users u ON p.created_by = u.id
       WHERE p.sale_id = $1 ORDER BY p.payment_date, p.created_at`,
      [req.params.id]
    );
    res.json({ payments: result.rows });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/payments — to'lov kiritish (bo'lib-bo'lib to'lash)
router.post('/:id/payments', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { amount, method, payment_date, notes, allow_overpay, payment_ref } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'To\'lov summasi noto\'g\'ri' });

    const saleR = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!saleR.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    const sale = saleR.rows[0];

    const alreadyR = await query('SELECT COALESCE(SUM(amount),0) as paid FROM payments WHERE sale_id=$1', [sale.id]);
    const already = parseFloat(alreadyR.rows[0].paid);
    const remaining = parseFloat(sale.total_amount) - already;
    // Ortiqcha to'lov (haqdor) — faqat allow_overpay bo'lganda ruxsat; aks holda qoldiqdan oshmaydi
    if (!allow_overpay && amt > remaining + 0.01) {
      return res.status(400).json({ error: `To'lov qoldiqdan ko'p. Qolgan qarz: ${Math.round(remaining)} so'm` });
    }

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO payments (sale_id, amount, method, payment_date, notes, created_by, payment_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sale.id, amt, method || 'CASH', payment_date || todayUZB(), notes || null, req.user.id, payment_ref || null]
      );
      const paid = already + amt;
      let status = 'PENDING';
      if (paid >= parseFloat(sale.total_amount) - 0.01) status = 'PAID';
      else if (paid > 0) status = 'PARTIALLY_PAID';
      await client.query(
        'UPDATE sales SET payment_amount=$1, status=$2, updated_at=NOW() WHERE id=$3',
        [paid, status, sale.id]
      );
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PAYMENT_RECORD', table: 'payments', recordId: sale.id,
        newValues: { amount: amt, method: method || 'CASH', total_paid: paid, status },
      });
      res.status(201).json({
        sale_id: sale.id, paid, status,
        remaining: Math.max(0, parseFloat(sale.total_amount) - paid),
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// DELETE /api/sales/:id
router.delete('/:id', requireRole('OWNER'), async (req, res, next) => {
  try {
    const sale = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!sale.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [sale.rows[0].quantity, sale.rows[0].product_id]
      );
      await addColorStock(client.query, sale.rows[0].product_id, sale.rows[0].rang, parseFloat(sale.rows[0].quantity));
      await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');
      logAudit(req, {
        action: 'SALE_DELETE', table: 'sales', recordId: req.params.id,
        oldValues: { total_amount: sale.rows[0].total_amount, quantity: sale.rows[0].quantity, product_id: sale.rows[0].product_id },
      });
      res.json({ message: 'Sotuv o\'chirildi' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/sales/:id/returns — sotuv bo'yicha qaytarishlar tarixi
// GET /api/sales/returns/all — barcha vozvratlar ro'yxati + summary (omborga / ziyon)
router.get('/returns/all', async (req, res, next) => {
  try {
    await saleReturns.ensureReturnsSchema();
    const { date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    let idx = 1;
    if (date_from) { where += ` AND DATE(COALESCE(sr.return_date, sr.created_at)) >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND DATE(COALESCE(sr.return_date, sr.created_at)) <= $${idx++}`; params.push(date_to); }

    const r = await query(
      `SELECT sr.*, p.name AS product_name, p.unit AS unit,
              COALESCE(c.name, s.customer_name) AS customer_name,
              u.full_name AS created_by_name, s.order_ref
       FROM sale_returns sr
       LEFT JOIN products p ON sr.product_id = p.id
       LEFT JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN sales s ON sr.sale_id = s.id
       LEFT JOIN users u ON sr.created_by = u.id
       WHERE ${where}
       ORDER BY sr.created_at DESC`,
      params
    );

    const returns = r.rows;
    let goodQty = 0, defectiveQty = 0, totalRefund = 0, totalLoss = 0;
    for (const x of returns) {
      const q = parseFloat(x.quantity) || 0;
      if (x.condition === 'DEFECTIVE') { defectiveQty += q; totalLoss += parseFloat(x.loss_amount) || 0; }
      else { goodQty += q; }
      totalRefund += parseFloat(x.refund_amount) || 0;
    }
    res.json({
      returns,
      summary: {
        count: returns.length,
        good_qty: goodQty,           // omborga qaytgan
        defective_qty: defectiveQty, // brak (ziyon)
        total_refund: totalRefund,   // mijozlarga qaytarilgan pul
        total_loss: totalLoss,       // ziyon summasi
      },
    });
  } catch (err) { next(err); }
});

router.get('/:id/returns', async (req, res, next) => {
  try {
    await saleReturns.ensureReturnsSchema();
    const r = await query(
      `SELECT sr.*, u.full_name AS created_by_name
       FROM sale_returns sr LEFT JOIN users u ON sr.created_by = u.id
       WHERE sr.sale_id = $1 ORDER BY sr.created_at DESC`,
      [req.params.id]
    );
    res.json({ returns: r.rows });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/return — vozvrat (qisman ham). Sabab majburiy.
// Ombor qaytariladi, sotuv summasi/miqdori kamayadi, qarz/refund avtomatik hisoblanadi.
router.post('/:id/return', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    await saleReturns.ensureReturnsSchema();
    const qty = parseInt(req.body.quantity, 10);
    const reason = (req.body.reason || '').trim();
    // Holati: GOOD = yaxshi (omborga qaytadi), DEFECTIVE = brak (ziyon, omborga qaytmaydi)
    const condition = req.body.condition === 'DEFECTIVE' ? 'DEFECTIVE' : 'GOOD';
    // Summani qanday yopish:
    //   'REFUND'  = naqd pul qaytariladi (to'langan summadan oshmaydi)
    //   'BALANCE' = naqd qaytarilmaydi — qarzdan ayiriladi yoki mijoz haqdor bo'lib qoladi
    //   (berilmasa — eski xatti-harakat: ortiqcha to'lov bo'lsa avtomatik refund)
    const settlement = req.body.settlement === 'REFUND' ? 'REFUND'
      : req.body.settlement === 'BALANCE' ? 'BALANCE' : null;
    if (!qty || qty < 1) return res.status(400).json({ error: 'Qaytariladigan miqdor noto\'g\'ri' });
    if (!reason) return res.status(400).json({ error: 'Vozvrat sababini kiriting (majburiy)' });

    const saleR = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!saleR.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    const sale = saleR.rows[0];

    const soldQty = parseInt(sale.quantity, 10) || 0;
    if (qty > soldQty) {
      return res.status(400).json({ error: `Faqat ${soldQty} dona qaytarish mumkin (so'ralgan: ${qty})` });
    }

    const unitPrice = parseFloat(sale.unit_price) || 0;
    const amount = qty * unitPrice;

    // Brak bo'lsa ziyon summasi: tannarx (cost_price) bo'lsa undan, aks holda sotuv narxidan
    const prodR = await query('SELECT name, cost_price FROM products WHERE id = $1', [sale.product_id]);
    const prodName = prodR.rows[0]?.name || 'Mahsulot';
    const costUnit = parseFloat(prodR.rows[0]?.cost_price) > 0 ? parseFloat(prodR.rows[0].cost_price) : unitPrice;
    const lossAmount = condition === 'DEFECTIVE' ? Math.round(costUnit * qty) : 0;
    const newQty = soldQty - qty;
    const newTotal = Math.max(0, (parseFloat(sale.total_amount) || 0) - amount);

    // Mijozning UMUMIY qarzini hisoblash (barcha savdolar bo'yicha, shu savdo ham)
    let totalDebtBefore = 0;
    if (sale.customer_id) {
      const debtR = await query('SELECT COALESCE(SUM(total_amount - payment_amount), 0) as total_debt FROM sales WHERE customer_id = $1', [sale.customer_id]);
      totalDebtBefore = parseFloat(debtR.rows[0]?.total_debt || 0);
    }

    // Moliyani to'g'rilash — egasi tanlagan usul bo'yicha
    let newPayment = parseFloat(sale.payment_amount) || 0;
    let refund = 0;
    if (settlement === 'REFUND') {
      refund = Math.min(amount, newPayment);
      newPayment = newPayment - refund;
    } else if (settlement === 'BALANCE') {
      refund = 0;
    } else {
      if (newPayment > newTotal) { refund = newPayment - newTotal; newPayment = newTotal; }
    }

    // Umumiy qarzdan qancha ayirildi (savdoga qaramasdan, umumiy qarziga qaraydi)
    const debtReduction = amount - refund;
    const debtDeducted = Math.max(0, Math.min(debtReduction, Math.max(0, totalDebtBefore)));

    // Status
    let newStatus;
    if (newTotal <= 0) newStatus = 'PAID';
    else if (newPayment >= newTotal) newStatus = 'PAID';
    else if (newPayment > 0) newStatus = 'PARTIALLY_PAID';
    else newStatus = 'PENDING';

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');

      if (condition === 'GOOD') {
        // Yaxshi tovar — omborga qaytadi (mahsulot + rang bo'yicha)
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [qty, sale.product_id]
        );
        await addColorStock(client.query, sale.product_id, sale.rang, qty);
      } else {
        // Brak tovar — omborga QAYTMAYDI, ziyon sifatida xarajatga yoziladi
        await client.query(
          `INSERT INTO expenses (category, amount, description, expense_date, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          ['OTHER', lossAmount, `Brak tovar (vozvrat): ${prodName} x${qty}${reason ? ' — ' + reason : ''}`,
           todayUZB(), req.user.id]
        );
      }

      // Sotuvni yangilash
      const upd = await client.query(
        'UPDATE sales SET quantity = $1, total_amount = $2, payment_amount = $3, status = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
        [newQty, newTotal, newPayment, newStatus, sale.id]
      );

      // Vozvrat yozuvi (holati + ziyon + qarzdan ayirilgani bilan)
      const retR = await client.query(
        `INSERT INTO sale_returns (sale_id, product_id, customer_id, quantity, unit_price, amount, refund_amount, rang, reason, return_date, created_by, condition, loss_amount, settlement, debt_deducted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [sale.id, sale.product_id, sale.customer_id || null, qty, unitPrice, amount, refund, sale.rang || null, reason, todayUZB(), req.user.id, condition, lossAmount, settlement || 'BALANCE', debtDeducted]
      );

      await client.query('COMMIT');
      logAudit(req, {
        action: 'SALE_RETURN', table: 'sales', recordId: sale.id,
        newValues: { quantity: qty, amount, refund_amount: refund, reason, condition, settlement: settlement || 'BALANCE', loss_amount: lossAmount, debt_deducted: debtDeducted, new_quantity: newQty, new_total: newTotal },
      });
      res.status(201).json({ sale: upd.rows[0], return: retR.rows[0], refund_amount: refund, settlement: settlement || 'BALANCE', amount, condition, loss_amount: lossAmount, debt_deducted: debtDeducted });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/sales/reset — barcha savdo + to'lov + vozvratlarni o'chirish (0 qilish) — faqat OWNER.
// Ombor/mahsulot/mijozlarga tegmaydi. Qarzlar ham 0 bo'ladi (savdolar o'chgani uchun).
router.post('/reset', requireRole('OWNER'), async (req, res, next) => {
  try {
    await saleReturns.ensureReturnsSchema();
    const sc = await query('SELECT COUNT(*) as count FROM sales', []);
    const salesCount = parseInt(sc.rows[0]?.count ?? sc.rows[0]?.['COUNT(*)'] ?? 0);
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      try { await client.query('DELETE FROM payments'); } catch (e) { /* jadval bo'lmasligi mumkin */ }
      try { await client.query('DELETE FROM sale_returns'); } catch (e) { /* jadval bo'lmasligi mumkin */ }
      await client.query('DELETE FROM sales');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
    logAudit(req, { action: 'RESET_SALES', table: 'sales', recordId: 'ALL', newValues: { deleted_sales: salesCount } });
    res.json({ count: salesCount });
  } catch (err) { next(err); }
});

// POST /api/sales/returns/reset — barcha vozvratlar tarixini o'chirish (0 qilish) — faqat OWNER.
// Faqat sale_returns yozuvlari o'chadi; sotuv/ombor/moliyaga tegmaydi (ular allaqachon qo'llanilgan).
router.post('/returns/reset', requireRole('OWNER'), async (req, res, next) => {
  try {
    await saleReturns.ensureReturnsSchema();
    const c = await query('SELECT COUNT(*) as count FROM sale_returns', []);
    const count = parseInt(c.rows[0]?.count ?? c.rows[0]?.['COUNT(*)'] ?? 0);
    await query('DELETE FROM sale_returns', []);
    logAudit(req, { action: 'RESET_RETURNS', table: 'sale_returns', recordId: 'ALL', newValues: { deleted: count } });
    res.json({ count });
  } catch (err) { next(err); }
});

module.exports = router;
