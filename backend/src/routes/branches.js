/**
 * Filiallar — faqat sotuv nuqtasi (ishlab chiqarish yo'q).
 * Zavod → filial tovar ko'chirish, filial ombori, filial savdo hisobotlari.
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { getColorStock, addColorStock } = require('../utils/colorStock');
const { addBranchStock, getBranchStock } = require('../services/branchSchema');

const router = express.Router();
router.use(authenticate);

const rangLabel = (r) => (r && String(r).trim()) ? r : 'Rangsiz';

// GET /api/branches — filiallar ro'yxati (ombor qiymati va oy savdosi bilan)
router.get('/', async (req, res, next) => {
  try {
    const branches = (await query(`SELECT * FROM branches ORDER BY created_at`)).rows;
    const month = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 7);
    for (const b of branches) {
      const stock = await query(`
        SELECT COALESCE(SUM(bs.quantity), 0) AS total_qty,
               COALESCE(SUM(bs.quantity * p.price), 0) AS total_value
        FROM branch_stock bs JOIN products p ON bs.product_id = p.id
        WHERE bs.branch_id = $1`, [b.id]);
      const sales = await query(`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS revenue
        FROM sales WHERE branch_id = $1 AND TO_CHAR(sale_date, 'YYYY-MM') = $2`, [b.id, month]);
      b.stock_qty = parseFloat(stock.rows[0].total_qty) || 0;
      b.stock_value = parseFloat(stock.rows[0].total_value) || 0;
      b.month_sales_count = parseInt(sales.rows[0].cnt) || 0;
      b.month_revenue = parseFloat(sales.rows[0].revenue) || 0;
    }
    res.json({ branches });
  } catch (err) { next(err); }
});

// POST /api/branches — yangi filial (faqat OWNER)
router.post('/', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { name, address, phone } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Filial nomini kiriting' });
    const r = await query(
      `INSERT INTO branches (name, address, phone) VALUES ($1, $2, $3) RETURNING *`,
      [String(name).trim(), address || null, phone || null]
    );
    logAudit(req, { action: 'BRANCH_CREATE', table: 'branches', recordId: r.rows[0].id });
    res.status(201).json({ branch: r.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/branches/:id — filialni tahrirlash (faqat OWNER)
router.put('/:id', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { name, address, phone, is_active } = req.body;
    const b = await query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
    if (!b.rows.length) return res.status(404).json({ error: 'Filial topilmadi' });
    const cur = b.rows[0];
    const r = await query(
      `UPDATE branches SET name = $1, address = $2, phone = $3, is_active = $4 WHERE id = $5 RETURNING *`,
      [name ?? cur.name, address ?? cur.address, phone ?? cur.phone,
       is_active === undefined ? cur.is_active : (is_active ? 1 : 0), req.params.id]
    );
    res.json({ branch: r.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/branches/:id/stock — filial ombori (mahsulot + rang bo'yicha)
router.get('/:id/stock', async (req, res, next) => {
  try {
    const rows = (await query(`
      SELECT bs.product_id, bs.rang, bs.quantity, p.name AS product_name, p.unit, p.price
      FROM branch_stock bs JOIN products p ON bs.product_id = p.id
      WHERE bs.branch_id = $1 AND bs.quantity > 0
      ORDER BY p.name, bs.rang`, [req.params.id])).rows;
    const total_value = rows.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.price) || 0), 0);
    res.json({ stock: rows, total_value });
  } catch (err) { next(err); }
});

// POST /api/branches/:id/transfer — zavod ↔ filial tovar ko'chirish (OWNER, OMBORCHI)
// direction: 'IN' = zavoddan filialga (default), 'OUT' = filialdan zavodga qaytarish
router.post('/:id/transfer', requireRole('OWNER', 'OMBORCHI'), async (req, res, next) => {
  try {
    const { product_id, rang, quantity, direction = 'IN', note } = req.body;
    const qty = parseFloat(quantity) || 0;
    if (!product_id) return res.status(400).json({ error: 'Mahsulotni tanlang' });
    if (qty <= 0) return res.status(400).json({ error: 'Miqdor 0 dan katta bo\'lsin' });

    const b = await query('SELECT id, name FROM branches WHERE id = $1', [req.params.id]);
    if (!b.rows.length) return res.status(404).json({ error: 'Filial topilmadi' });
    const p = await query('SELECT id, name FROM products WHERE id = $1', [product_id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });

    if (direction === 'IN') {
      // Zavod omborida yetarlimi (rang bo'yicha)
      const avail = await getColorStock(query, product_id, rang);
      if (avail < qty) {
        return res.status(400).json({
          error: `Zavod omborida "${p.rows[0].name}" — ${rangLabel(rang)} rangidan faqat ${avail} dona bor (so'ralgan: ${qty})`
        });
      }
      await query(
        'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW() WHERE id = $2',
        [qty, product_id]
      );
      await addColorStock(query, product_id, rang, -qty);
      await addBranchStock(query, req.params.id, product_id, rang, qty);
    } else {
      // Filialdan zavodga qaytarish
      const avail = await getBranchStock(query, req.params.id, product_id, rang);
      if (avail < qty) {
        return res.status(400).json({
          error: `Filial omborida "${p.rows[0].name}" — ${rangLabel(rang)} rangidan faqat ${avail} dona bor (so'ralgan: ${qty})`
        });
      }
      await addBranchStock(query, req.params.id, product_id, rang, -qty);
      await query(
        'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
        [qty, product_id]
      );
      await addColorStock(query, product_id, rang, qty);
    }

    await query(
      `INSERT INTO branch_transfers (branch_id, product_id, rang, quantity, direction, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, product_id, (rang && String(rang).trim()) || null, qty, direction, note || null, req.user.id]
    );
    logAudit(req, {
      action: 'BRANCH_TRANSFER', table: 'branch_transfers', recordId: req.params.id,
      newValues: { product_id, rang: rang || null, quantity: qty, direction },
    });
    res.status(201).json({ success: true, message: direction === 'IN' ? 'Tovar filialga jo\'natildi' : 'Tovar zavodga qaytarildi' });
  } catch (err) { next(err); }
});

// GET /api/branches/:id/transfers — ko'chirish tarixi
router.get('/:id/transfers', async (req, res, next) => {
  try {
    const rows = (await query(`
      SELECT bt.*, p.name AS product_name, p.unit, u.full_name AS created_by_name
      FROM branch_transfers bt
      JOIN products p ON bt.product_id = p.id
      LEFT JOIN users u ON bt.created_by = u.id
      WHERE bt.branch_id = $1
      ORDER BY bt.created_at DESC
      LIMIT 200`, [req.params.id])).rows;
    res.json({ transfers: rows });
  } catch (err) { next(err); }
});

// GET /api/branches/:id/users — shu filialga biriktirilgan foydalanuvchilar (kirish) (faqat OWNER)
router.get('/:id/users', requireRole('OWNER'), async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT id, phone, full_name, role, is_active, last_login, created_at
       FROM users WHERE branch_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    )).rows;
    res.json({ users: rows });
  } catch (err) { next(err); }
});

// GET /api/branches/:id/summary — filial savdo hisobot (davr bo'yicha)
router.get('/:id/summary', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    let where = 's.branch_id = $1';
    const params = [req.params.id];
    let idx = 2;
    if (start_date) { where += ` AND s.sale_date >= $${idx++}`; params.push(start_date); }
    if (end_date)   { where += ` AND s.sale_date <= $${idx++}`; params.push(end_date); }
    const r = await query(`
      SELECT COUNT(*) AS total_count,
             COALESCE(SUM(s.total_amount), 0) AS total_revenue,
             COALESCE(SUM(s.payment_amount), 0) AS paid_amount,
             COALESCE(SUM(s.total_amount - s.payment_amount), 0) AS debt_amount
      FROM sales s WHERE ${where}`, params);
    res.json({ summary: r.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
