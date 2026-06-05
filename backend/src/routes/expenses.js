const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// GET /api/expenses
router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, category, page = 1, limit = 20 } = req.query;
    let sql = `
      SELECT e.*, u.full_name as created_by_name
      FROM expenses e JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (start_date) { sql += ` AND e.expense_date >= $${idx++}`; params.push(start_date); }
    if (end_date)   { sql += ` AND e.expense_date <= $${idx++}`; params.push(end_date); }
    if (category)   { sql += ` AND e.category = $${idx++}`; params.push(category); }

    const countResult = await query(`SELECT COUNT(*) as count FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0]?.count ?? countResult.rows[0]?.['COUNT(*)'] ?? 0);

    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);
    res.json({ expenses: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/expenses/summary
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const total = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
    `, [period]);

    const byCategory = await query(`
      SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
      GROUP BY category ORDER BY total DESC
    `, [period]);

    const byDay = await query(`
      SELECT TO_CHAR(expense_date, 'YYYY-MM-DD') as day, SUM(amount) as total
      FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
      GROUP BY expense_date ORDER BY expense_date
    `, [period]);

    res.json({
      total: total.rows[0].total,
      by_category: byCategory.rows,
      by_day: byDay.rows,
    });
  } catch (err) { next(err); }
});

// POST /api/expenses
router.post('/', requireRole('OWNER', 'ACCOUNTANT'), [
  body('category').isIn(['RAW_MATERIAL', 'ENERGY', 'MAINTENANCE', 'SALARY', 'TRANSPORT', 'OTHER']),
  body('amount').isFloat({ min: 0.01 }),
  body('description').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category, amount, description, expense_date } = req.body;
    const result = await query(
      'INSERT INTO expenses (category, amount, description, expense_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [category, amount, description, expense_date || new Date(), req.user.id]
    );
    res.status(201).json({ expense: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/expenses/:id
router.put('/:id', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { category, amount, description, expense_date } = req.body;
    const result = await query(
      'UPDATE expenses SET category=$1, amount=$2, description=$3, expense_date=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [category, amount, description, expense_date, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Xarajat topilmadi' });
    res.json({ expense: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireRole('OWNER'), async (req, res, next) => {
  try {
    const result = await query('DELETE FROM expenses WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Xarajat topilmadi' });
    res.json({ message: 'Xarajat o\'chirildi' });
  } catch (err) { next(err); }
});

module.exports = router;
