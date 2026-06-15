const express = require('express');
const { body, query: qval, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const reportService = require('../services/reportService');
const { getColorStock, addColorStock } = require('../utils/colorStock');

const router = express.Router();

const rangLabel = (r) => (r && r.trim()) ? r : 'Rangsiz';
router.use(authenticate);

// Buyurtma kodi (QR uchun): ORD-YYYYMMDD-XXXX
function genOrderRef() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${d}-${rnd}`;
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
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status='PAID' THEN total_amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status='PENDING' THEN total_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status='PARTIALLY_PAID' THEN total_amount ELSE 0 END), 0) as partial_amount,
        COALESCE(SUM(quantity), 0) as total_quantity
      FROM sales
      WHERE TO_CHAR(sale_date, 'YYYY-MM') = $1
    `, [period]);

    const byProduct = await query(`
      SELECT p.name, SUM(s.quantity) as qty, SUM(s.total_amount) as revenue
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE TO_CHAR(s.sale_date, 'YYYY-MM') = $1
      GROUP BY p.name ORDER BY revenue DESC LIMIT 10
    `, [period]);

    const byDay = await query(`
      SELECT TO_CHAR(sale_date, 'YYYY-MM-DD') as day,
             SUM(total_amount) as revenue, COUNT(*) as count
      FROM sales
      WHERE TO_CHAR(sale_date, 'YYYY-MM') = $1
      GROUP BY sale_date ORDER BY sale_date
    `, [period]);

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
         WHERE s.order_ref = $1 ORDER BY s.created_at`,
        [sale.order_ref]
      );
      if (itemsR.rows.length) items = itemsR.rows;
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
              c.name as customer_full_name, c.phone as customer_full_phone,
              c.company_name as customer_company, c.address as customer_address
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
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
         WHERE s.order_ref = $1 ORDER BY s.created_at`,
        [sale.order_ref]
      );
      if (itemsR.rows.length) items = itemsR.rows;
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

    const order_ref = genOrderRef();
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const saleResult = await client.query(
        `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount, customer_name, customer_phone,
          sale_date, status, payment_amount, discount_id, notes, created_by, order_ref, rang)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [product_id, customer_id || null, quantity, unit_price, total_amount, custName, custPhone,
         sale_date || new Date().toISOString().slice(0,10), status || 'PENDING', payment_amount || 0, discount_id || null, notes, req.user.id, order_ref, rang || null]
      );
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = NOW() WHERE id = $2',
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
    const { customer_id, customer_name, customer_phone, sale_date, status, items, notes } = req.body;
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

    const saleDate = sale_date || new Date().toISOString().slice(0, 10);
    const saleStatus = status || 'PENDING';
    const order_ref = genOrderRef();
    const client = await require('../db').getClient();
    const created = [];
    let grandTotal = 0;
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unit_price);
        const total = qty * price;
        grandTotal += total;
        const r = await client.query(
          `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
            customer_name, customer_phone, sale_date, status, payment_amount, notes, created_by, order_ref, rang)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [it.product_id, customer_id || null, qty, price, total, custName, custPhone,
           saleDate, saleStatus, saleStatus === 'PAID' ? total : 0, notes || null, req.user.id, order_ref, it.rang || null]
        );
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = NOW() WHERE id = $2',
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
      res.status(201).json({ sales: created, count: created.length, grand_total: grandTotal, order_ref, customer_name: custName });
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
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
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
          'UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = NOW() WHERE id = $2',
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
    const { amount, method, payment_date, notes } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'To\'lov summasi noto\'g\'ri' });

    const saleR = await query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (!saleR.rows.length) return res.status(404).json({ error: 'Sotuv topilmadi' });
    const sale = saleR.rows[0];

    const alreadyR = await query('SELECT COALESCE(SUM(amount),0) as paid FROM payments WHERE sale_id=$1', [sale.id]);
    const already = parseFloat(alreadyR.rows[0].paid);
    const remaining = parseFloat(sale.total_amount) - already;
    if (amt > remaining + 0.01) {
      return res.status(400).json({ error: `To'lov qoldiqdan ko'p. Qolgan qarz: ${Math.round(remaining)} so'm` });
    }

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO payments (sale_id, amount, method, payment_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sale.id, amt, method || 'CASH', payment_date || new Date().toISOString().slice(0, 10), notes || null, req.user.id]
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

module.exports = router;
