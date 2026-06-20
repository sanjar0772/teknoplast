const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// GET /api/customers — mijozlar ro'yxati + statistika
router.get('/', async (req, res, next) => {
  try {
    const { search, type, is_active = 'true' } = req.query;
    let sql = `
      SELECT c.*,
             COUNT(s.id) as purchase_count,
             COALESCE(SUM(s.total_amount), 0) as total_purchases,
             COALESCE(SUM(s.total_amount - s.payment_amount), 0) as total_debt,
             MAX(s.sale_date) as last_purchase
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (is_active !== 'all') { sql += ` AND c.is_active = $${idx++}`; params.push(is_active === 'true'); }
    if (type)   { sql += ` AND c.customer_type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.company_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ' GROUP BY c.id ORDER BY total_purchases DESC, c.name';

    const result = await query(sql, params);
    res.json({ customers: result.rows });
  } catch (err) { next(err); }
});

// GET /api/customers/summary — umumiy statistika
router.get('/summary', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN customer_type='VIP' THEN 1 END) as vip_count,
        COUNT(CASE WHEN customer_type='WHOLESALE' THEN 1 END) as wholesale_count,
        COUNT(CASE WHEN customer_type='RETAIL' THEN 1 END) as retail_count
      FROM customers WHERE is_active = 1
    `);
    const debt = await query(`
      SELECT COALESCE(SUM(total_amount - payment_amount), 0) as total_debt
      FROM sales WHERE customer_id IS NOT NULL AND status != 'PAID'
    `);
    res.json({ summary: { ...result.rows[0], total_debt: debt.rows[0].total_debt } });
  } catch (err) { next(err); }
});

// GET /api/customers/:id — mijoz tafsiloti + xaridlar tarixi
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });

    const sales = await query(`
      SELECT s.*, p.name as product_name, p.unit
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = $1
      ORDER BY s.sale_date DESC, s.created_at DESC LIMIT 50
    `, [req.params.id]);

    const stats = await query(`
      SELECT COUNT(*) as purchase_count,
             COALESCE(SUM(total_amount), 0) as total_purchases,
             COALESCE(SUM(total_amount - payment_amount), 0) as total_debt,
             COALESCE(AVG(total_amount), 0) as avg_purchase
      FROM sales WHERE customer_id = $1
    `, [req.params.id]);

    res.json({
      customer: customer.rows[0],
      sales: sales.rows,
      stats: stats.rows[0],
    });
  } catch (err) { next(err); }
});

// POST /api/customers/import-debts — bito qarzdorlar ro'yxatini import qilish (faqat OWNER)
router.post('/import-debts', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { importDebtors2026 } = require('../services/debtorsSeed');
    const result = await importDebtors2026();
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/customers — yangi mijoz
router.post('/', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), [
  body('name').notEmpty().trim().withMessage('Mijoz ismi kerak'),
  body('phone').optional().trim(),
  body('customer_type').optional().isIn(['RETAIL', 'WHOLESALE', 'VIP']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, company_name, address, customer_type, credit_limit, notes } = req.body;
    const result = await query(
      `INSERT INTO customers (name, phone, company_name, address, customer_type, credit_limit, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, phone || null, company_name || null, address || null,
       customer_type || 'RETAIL', credit_limit || 0, notes || null, req.user.id]
    );
    res.status(201).json({ customer: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/customers/:id — tahrirlash
router.put('/:id', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { name, phone, company_name, address, customer_type, credit_limit, notes, is_active } = req.body;
    const result = await query(
      `UPDATE customers SET name=$1, phone=$2, company_name=$3, address=$4,
         customer_type=$5, credit_limit=$6, notes=$7, is_active=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, phone, company_name, address, customer_type, credit_limit, notes,
       is_active === undefined ? 1 : is_active, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });
    res.json({ customer: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/customers/:id — o'chirish (faqat OWNER)
router.delete('/:id', requireRole('OWNER'), async (req, res, next) => {
  try {
    const linked = await query('SELECT COUNT(*) as count FROM sales WHERE customer_id = $1', [req.params.id]);
    const count = parseInt(linked.rows[0].count);
    if (count > 0) {
      // Sotuvlari bor — faqat nofaol qilamiz
      await query('UPDATE customers SET is_active = 0, updated_at = NOW() WHERE id = $1', [req.params.id]);
      return res.json({ message: `Mijozda ${count} ta sotuv bor — nofaol qilindi (o'chirilmadi)` });
    }
    const result = await query('DELETE FROM customers WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });
    res.json({ message: 'Mijoz o\'chirildi' });
  } catch (err) { next(err); }
});

module.exports = router;
