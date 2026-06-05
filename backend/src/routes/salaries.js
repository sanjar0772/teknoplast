const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

// GET /api/salaries?month=2024-01
router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT s.*, e.name as employee_name, e.type as employee_type,
             u.full_name as approved_by_name,
             COALESCE(ep.total_produced, 0) as total_produced,
             COALESCE(ep.work_days, 0) as work_days
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN users u ON s.approved_by = u.id
      LEFT JOIN (
        SELECT employee_id,
               SUM(quantity_produced) as total_produced,
               COUNT(DISTINCT production_date) as work_days
        FROM employee_production WHERE month = $1
        GROUP BY employee_id
      ) ep ON ep.employee_id = s.employee_id
      WHERE s.month = $1
      ORDER BY e.name
    `, [period]);

    const summary = await query(`
      SELECT
        COUNT(*) as total_employees,
        COALESCE(SUM(net_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status='PAID' THEN net_amount ELSE 0 END), 0) as paid_amount,
        COUNT(CASE WHEN status='PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status='APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status='CALCULATED' THEN 1 END) as calculated_count
      FROM salaries WHERE month = $1
    `, [period]);

    res.json({ salaries: result.rows, summary: summary.rows[0], month: period });
  } catch (err) { next(err); }
});

// POST /api/salaries/calculate — Oylik hisoblash
router.post('/calculate', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'Oy kiritilmagan (YYYY-MM)' });

    const employees = await query(
      'SELECT id FROM employees WHERE is_active = true'
    );

    const results = [];
    for (const emp of employees.rows) {
      const prod = await query(`
        SELECT COALESCE(SUM(calculated_amount), 0) as total_earned
        FROM employee_production
        WHERE employee_id = $1 AND month = $2
      `, [emp.id, month]);

      const total_calculated = parseFloat(prod.rows[0].total_earned);
      const net_amount = total_calculated;

      const r = await query(
        `INSERT INTO salaries (employee_id, month, total_calculated, net_amount, status)
         VALUES ($1,$2,$3,$4,'CALCULATED')
         ON CONFLICT (employee_id, month)
         DO UPDATE SET total_calculated=$3, net_amount=$4, status='CALCULATED', updated_at=NOW()
         RETURNING *`,
        [emp.id, month, total_calculated, net_amount]
      );
      results.push(r.rows[0]);
    }

    res.json({ message: `${results.length} xodim oylik hisoblandi`, salaries: results });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/adjust — Bonus/jarima
router.put('/:id/adjust', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { bonuses = 0, penalties = 0, notes } = req.body;
    const salary = await query('SELECT * FROM salaries WHERE id=$1', [req.params.id]);
    if (!salary.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });

    const s = salary.rows[0];
    const net_amount = parseFloat(s.total_calculated) + parseFloat(bonuses) - parseFloat(penalties);

    const result = await query(
      'UPDATE salaries SET bonuses=$1, penalties=$2, net_amount=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [bonuses, penalties, net_amount, notes, req.params.id]
    );
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/approve — OWNER tasdiqlaydi
router.put('/:id/approve', requireRole('OWNER'), async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE salaries SET status=\'APPROVED\', approved_by=$1, updated_at=NOW() WHERE id=$2 AND status=\'CALCULATED\' RETURNING *',
      [req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Oylik topilmadi yoki allaqachon tasdiqlangan' });
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/pay — To'landi
router.put('/:id/pay', requireRole('OWNER'), async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE salaries SET status=\'PAID\', paid_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1 AND status=\'APPROVED\' RETURNING *',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Oylik topilmadi yoki tasdiqlangan emas' });
    logAudit(req, {
      action: 'SALARY_PAID', table: 'salaries', recordId: req.params.id,
      newValues: { net_amount: result.rows[0].net_amount, employee_id: result.rows[0].employee_id },
    });
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
