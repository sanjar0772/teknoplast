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

// POST /api/salaries/calculate — Oylik hisoblash (TAX va SOCIAL SECURITY bilan)
router.post('/calculate', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { month, tax_rate = 0.05, social_rate = 0.03 } = req.body;
    if (!month) return res.status(400).json({ error: 'Oy kiritilmagan (YYYY-MM)' });

    const employees = await query(
      'SELECT id, salary_type, monthly_salary FROM employees WHERE is_active = true'
    );

    const results = [];
    for (const emp of employees.rows) {
      // Ishlab chiqarilgan miqdor va kun-sanab (STANOKCHI/DETALCHI — dona haqi)
      const prod = await query(`
        SELECT
          COALESCE(SUM(calculated_amount), 0) as total_earned,
          COUNT(DISTINCT production_date) as work_days,
          COALESCE(SUM(quantity_produced), 0) as total_produced
        FROM employee_production
        WHERE employee_id = $1 AND month = $2
      `, [emp.id, month]);

      let total_calculated = parseFloat(prod.rows[0]?.total_earned || 0);
      // Belgilangan oylik (FIXED) — ishlab chiqarish haqidan tashqari qo'shiladi.
      // PERCENT (foiz) — asosi noaniq (savdo/foyda) bo'lgani uchun bu yerda
      // qo'shilmaydi; buxgalter bonus/qo'lda kiritadi.
      if (emp.salary_type === 'FIXED' && emp.monthly_salary) {
        total_calculated += parseFloat(emp.monthly_salary) || 0;
      }
      const work_days = parseInt(prod.rows[0]?.work_days || 0);
      const total_produced = parseInt(prod.rows[0]?.total_produced || 0);

      // Soliq va ijtimoiy sug'urta hisoblash
      const tax_amount = Math.round(total_calculated * tax_rate);
      const social_security = Math.round(total_calculated * social_rate);
      const net_amount = total_calculated - tax_amount - social_security;

      const r = await query(
        `INSERT INTO salaries (employee_id, month, total_calculated, tax_amount, social_security, work_days, total_produced, net_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CALCULATED')
         ON CONFLICT (employee_id, month)
         DO UPDATE SET total_calculated=$3, tax_amount=$4, social_security=$5, work_days=$6, total_produced=$7, net_amount=$8, status='CALCULATED', updated_at=NOW()
         RETURNING *`,
        [emp.id, month, total_calculated, tax_amount, social_security, work_days, total_produced, net_amount]
      );
      results.push(r.rows[0]);
    }

    res.json({
      message: `${results.length} xodim oylik hisoblandi`,
      salaries: results,
      summary: {
        total_employees: results.length,
        total_gross: results.reduce((s, r) => s + (r.total_calculated || 0), 0),
        total_tax: results.reduce((s, r) => s + (r.tax_amount || 0), 0),
        total_net: results.reduce((s, r) => s + (r.net_amount || 0), 0)
      }
    });
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

// GET /api/salaries/:id/slip — Oylik chop (Salary slip)
router.get('/:id/slip', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, e.name as employee_name, e.type as employee_type, e.phone
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });

    const salary = result.rows[0];
    const slip = {
      header: {
        company: 'TEKNOPLAST ZAVODI',
        period: salary.month,
        date: new Date().toLocaleDateString('uz-UZ'),
      },
      employee: {
        name: salary.employee_name,
        type: salary.employee_type,
        phone: salary.phone,
      },
      earnings: {
        gross: salary.total_calculated,
        work_days: salary.work_days,
        units_produced: salary.total_produced,
      },
      deductions: {
        tax: salary.tax_amount,
        social_security: salary.social_security,
        bonuses_penalties: (salary.bonuses || 0) - (salary.penalties || 0),
      },
      summary: {
        gross_amount: salary.total_calculated,
        total_deductions: (salary.tax_amount || 0) + (salary.social_security || 0),
        bonuses: salary.bonuses || 0,
        penalties: salary.penalties || 0,
        net_amount: salary.net_amount,
      },
      status: salary.status,
      notes: salary.notes,
    };

    res.json({ slip });
  } catch (err) { next(err); }
});

// GET /api/salaries/monthly-summary?month=2024-01 — Oylik jamlanma
router.get('/monthly/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const details = await query(`
      SELECT
        COUNT(*) as total_employees,
        COALESCE(SUM(total_calculated), 0) as gross_total,
        COALESCE(SUM(tax_amount), 0) as total_tax,
        COALESCE(SUM(social_security), 0) as total_social,
        COALESCE(SUM(bonuses), 0) as total_bonuses,
        COALESCE(SUM(penalties), 0) as total_penalties,
        COALESCE(SUM(net_amount), 0) as net_total,
        COUNT(CASE WHEN status='PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status='APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status='CALCULATED' THEN 1 END) as calculated_count
      FROM salaries
      WHERE month = $1
    `, [period]);

    const summary = details.rows[0];
    const breakdown = await query(`
      SELECT e.type, COUNT(*) as count, COALESCE(SUM(s.net_amount), 0) as total_net
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.month = $1
      GROUP BY e.type
      ORDER BY total_net DESC
    `, [period]);

    res.json({
      month: period,
      summary,
      breakdown_by_type: breakdown.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/salaries/employee/:employee_id?month=2024-01 — Bir ishchining oylik
router.get('/employee/:employee_id', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT s.*, e.name, e.type, e.phone,
             (SELECT COUNT(DISTINCT production_date) FROM employee_production
              WHERE employee_id = e.id AND month = s.month) as work_days,
             (SELECT SUM(quantity_produced) FROM employee_production
              WHERE employee_id = e.id AND month = s.month) as total_produced
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.employee_id = $1 AND s.month = $2
    `, [req.params.employee_id, period]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ishchi yoki oylik topilmadi' });
    }

    const salary = result.rows[0];
    res.json({ salary });
  } catch (err) { next(err); }
});

module.exports = router;
