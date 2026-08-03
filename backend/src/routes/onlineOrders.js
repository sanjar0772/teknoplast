const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { getColorStock, addColorStock } = require('../utils/colorStock');
const { todayUZB } = require('../utils/date');

const router = express.Router();
const rangLabel = (r) => (r && r.trim()) ? r : 'Rangsiz';

router.use(authenticate);

// Onlayn zakazlar FAQAT asosiy tizim (zavod) uchun. Filialga biriktirilgan
// foydalanuvchi bu bo'limga kira olmaydi.
router.use((req, res, next) => {
  if (req.user.branch_id) {
    return res.status(403).json({ error: 'Onlayn zakazlar faqat asosiy tizimda' });
  }
  next();
});

// Onlayn zakaz cheki: OZ-DD-MM-YYYY-NNN
async function genRef(prefix, table, col) {
  const t = new Date(Date.now() + 5 * 3600 * 1000); // Toshkent (UTC+5)
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = t.getUTCFullYear();
  const pref = `${prefix}${dd}-${mm}-${yyyy}-`;
  const r = await query(`SELECT ${col} AS ref FROM ${table} WHERE ${col} LIKE $1`, [`${pref}%`]);
  let max = 0;
  for (const row of r.rows) {
    const m = String(row.ref || '').match(/-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${pref}${String(max + 1).padStart(3, '0')}`;
}

// Zakaz + tarkibini o'qish (zavod doirasida)
async function loadOrder(id) {
  const o = await query('SELECT * FROM online_orders WHERE id = $1', [id]);
  if (!o.rows.length) return null;
  const order = o.rows[0];
  const items = await query(
    `SELECT i.*, COALESCE(p.name, '[O''chirilgan]') AS product_name, COALESCE(p.unit, 'dona') AS unit
     FROM online_order_items i LEFT JOIN products p ON i.product_id = p.id
     WHERE i.order_id = $1 ORDER BY i.created_at`, [id]);
  order.items = items.rows;
  return order;
}

// GET /api/online-orders?status=RESERVED
router.get('/', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `SELECT o.*, u.full_name AS created_by_name
               FROM online_orders o LEFT JOIN users u ON o.created_by = u.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND o.status = $1`; params.push(status); }
    sql += ` ORDER BY o.created_at DESC LIMIT 300`;
    const orders = (await query(sql, params)).rows;
    // Tarkiblarni bitta so'rovda olamiz
    for (const o of orders) {
      const items = await query(
        `SELECT i.*, COALESCE(p.name, '[O''chirilgan]') AS product_name, COALESCE(p.unit, 'dona') AS unit
         FROM online_order_items i LEFT JOIN products p ON i.product_id = p.id
         WHERE i.order_id = $1 ORDER BY i.created_at`, [o.id]);
      o.items = items.rows;
    }
    res.json({ orders });
  } catch (err) { next(err); }
});

// POST /api/online-orders — yangi zakaz (ombor BAND qilinadi)
router.post('/', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { customer_id, items, advance_amount, expected_date, source, notes } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Kamida bitta mahsulot kerak' });
    }
    if (!customer_id) {
      return res.status(400).json({ error: 'Mijozni tanlang' });
    }

    const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });
    const custName = c.rows[0].name;
    const custPhone = c.rows[0].phone;

    // Bir xil mahsulot+rang+narx qatorlarini birlashtirish
    const mergedMap = new Map();
    for (const it of items) {
      const k = `${it.product_id}|${(it.rang || '').trim()}|${parseFloat(it.unit_price) || 0}`;
      if (mergedMap.has(k)) {
        mergedMap.get(k).quantity = (parseInt(mergedMap.get(k).quantity) || 0) + (parseInt(it.quantity) || 0);
      } else {
        mergedMap.set(k, { ...it });
      }
    }
    const orderItems = Array.from(mergedMap.values());

    // Ombor yetarliligini tekshirish — RANG bo'yicha (zavod ombori)
    for (const it of orderItems) {
      const p = await query('SELECT name FROM products WHERE id = $1', [it.product_id]);
      if (!p.rows.length) return res.status(404).json({ error: `Mahsulot topilmadi` });
      const qty = parseInt(it.quantity);
      if (!(qty > 0)) return res.status(400).json({ error: `"${p.rows[0].name}" — miqdor noto'g'ri` });
      const avail = await getColorStock(query, it.product_id, it.rang);
      if (avail < qty) {
        return res.status(400).json({
          error: `"${p.rows[0].name}" — ${rangLabel(it.rang)} rangidan faqat ${avail} dona bor (so'ralgan: ${qty})`
        });
      }
    }

    const total = orderItems.reduce((s, it) => s + (parseInt(it.quantity) * (parseFloat(it.unit_price) || 0)), 0);
    const advance = Math.max(0, parseFloat(advance_amount) || 0);
    const order_ref = await genRef('OZ-', 'online_orders', 'order_ref');

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const or = await client.query(
        `INSERT INTO online_orders (order_ref, customer_id, customer_name, customer_phone, status,
           total_amount, advance_amount, expected_date, source, notes, created_by)
         VALUES ($1,$2,$3,$4,'RESERVED',$5,$6,$7,$8,$9,$10) RETURNING *`,
        [order_ref, customer_id, custName, custPhone, total, advance,
         expected_date || null, (source || '').trim() || null, (notes || '').trim() || null, req.user.id]
      );
      const orderId = or.rows[0].id;
      for (const it of orderItems) {
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unit_price) || 0;
        await client.query(
          `INSERT INTO online_order_items (order_id, product_id, quantity, unit_price, rang)
           VALUES ($1,$2,$3,$4,$5)`,
          [orderId, it.product_id, qty, price, it.rang || null]
        );
        // Ombor BAND qilinadi (savdodagi kabi ayiriladi)
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2',
          [qty, it.product_id]
        );
        await addColorStock(client.query, it.product_id, it.rang, -qty);
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'ONLINE_ORDER_CREATE', table: 'online_orders', recordId: order_ref,
        newValues: { order_ref, total, customer_id, count: orderItems.length },
      });
      res.status(201).json(await loadOrder(orderId));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/online-orders/:id/complete — mijoz kelib oldi -> oddiy SAVDOga aylanadi.
// Ombor allaqachon band qilingan, shuning uchun QAYTA ayirilmaydi.
router.post('/:id/complete', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Zakaz topilmadi' });
    if (order.status !== 'RESERVED') {
      return res.status(400).json({ error: 'Bu zakaz allaqachon yakunlangan yoki bekor qilingan' });
    }
    if (!order.items.length) return res.status(400).json({ error: 'Zakaz tarkibi bo\'sh' });

    const notes = (req.body.notes || '').trim() || null;
    // Jami to'langan = oldingi avans + bugungi to'lov
    const advance = Math.max(0, parseFloat(order.advance_amount) || 0);
    const finalPay = Math.max(0, parseFloat(req.body.final_payment) || 0);
    const paid = advance + finalPay;

    const grand = order.items.reduce((s, it) => s + (parseInt(it.quantity) * (parseFloat(it.unit_price) || 0)), 0);
    const saleDate = todayUZB();
    const saleRef = await genRef('', 'sales', 'order_ref'); // oddiy savdo cheki (DD-MM-YYYY-NNN)

    const client = await require('../db').getClient();
    const created = [];
    let distributed = 0;
    try {
      await client.query('BEGIN');
      for (let i = 0; i < order.items.length; i++) {
        const it = order.items[i];
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unit_price) || 0;
        const lineTotal = qty * price;
        // To'lovni qatorlarga proporsional taqsimlaymiz; oxirgi qator qoldiqni oladi
        let linePaid;
        if (i === order.items.length - 1) {
          linePaid = Math.max(0, Math.round((paid - distributed) * 100) / 100);
        } else {
          linePaid = grand > 0 ? Math.round((lineTotal / grand) * paid) : 0;
          distributed += linePaid;
        }
        const status = linePaid >= lineTotal - 0.01 ? 'PAID' : (linePaid > 0 ? 'PARTIALLY_PAID' : 'PENDING');
        const r = await client.query(
          `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
             customer_name, customer_phone, sale_date, status, payment_amount, notes, created_by,
             order_ref, rang, branch_id, delivery_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL,'PICKUP') RETURNING *`,
          [it.product_id, order.customer_id || null, qty, price, lineTotal,
           order.customer_name, order.customer_phone, saleDate, status, linePaid, notes, req.user.id,
           saleRef, it.rang || null]
        );
        created.push(r.rows[0]);
        // OMBOR AYIRILMAYDI — zakaz tuzilganda allaqachon band qilingan.
      }
      await client.query(
        `UPDATE online_orders SET status='COMPLETED', sale_order_ref=$1, updated_at=NOW() WHERE id=$2`,
        [saleRef, order.id]
      );
      await client.query('COMMIT');
      logAudit(req, {
        action: 'ONLINE_ORDER_COMPLETE', table: 'online_orders', recordId: order.order_ref,
        newValues: { sale_order_ref: saleRef, paid, grand },
      });
      res.json({ ok: true, order_ref: saleRef, sales: created, grand_total: grand, paid_amount: paid });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/online-orders/:id/cancel — bekor qilish, ombor QAYTARILADI
router.post('/:id/cancel', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Zakaz topilmadi' });
    if (order.status !== 'RESERVED') {
      return res.status(400).json({ error: 'Faqat kutilayotgan zakazni bekor qilish mumkin' });
    }
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      for (const it of order.items) {
        const qty = parseInt(it.quantity);
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [qty, it.product_id]
        );
        await addColorStock(client.query, it.product_id, it.rang, qty);
      }
      await client.query(
        `UPDATE online_orders SET status='CANCELLED', updated_at=NOW() WHERE id=$1`,
        [order.id]
      );
      await client.query('COMMIT');
      logAudit(req, {
        action: 'ONLINE_ORDER_CANCEL', table: 'online_orders', recordId: order.order_ref,
        newValues: { reason: (req.body.reason || '').trim() || null },
      });
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
