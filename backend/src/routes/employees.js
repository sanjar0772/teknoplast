const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// GET /api/employees
router.get('/', async (req, res, next) => {
  try {
    const { type, is_active = 'true', search } = req.query;
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    let idx = 1;
    if (is_active !== 'all') { sql += ` AND is_active = $${idx++}`; params.push(is_active === 'true'); }
    if (type)   { sql += ` AND type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND name ILIKE $${idx++}`; params.push(`%${search}%`); }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    res.json({ employees: result.rows });
  } catch (err) { next(err); }
});

// GET /api/employees/:id
router.get('/:id', async (req, res, next) => {
  try {
    const emp = await query('SELECT * FROM employees WHERE id=$1', [req.params.id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });

    const production = await query(`
      SELECT month, SUM(quantity_produced) as total_produced,
             SUM(calculated_amount) as total_earned, COUNT(*) as work_days
      FROM employee_production WHERE employee_id = $1
      GROUP BY month ORDER BY month DESC LIMIT 6
    `, [req.params.id]);

    const salary = await query(`
      SELECT * FROM salaries WHERE employee_id = $1
      ORDER BY month DESC LIMIT 6
    `, [req.params.id]);

    res.json({ employee: emp.rows[0], production: production.rows, salaries: salary.rows });
  } catch (err) { next(err); }
});

// POST /api/employees
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD'), [
  body('name').notEmpty().trim(),
  body('type').isIn(['STANOKCHI', 'DETALCHI', 'ISHCHI', 'OSHPAZ', 'SHOFIR', 'BOSHQA']),
  body('daily_tariff').isFloat({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, type, daily_tariff, hourly_tariff, hire_date, phone, address, shift } = req.body;
    const result = await query(
      'INSERT INTO employees (name, type, daily_tariff, hourly_tariff, hire_date, phone, address, shift) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, type, daily_tariff, hourly_tariff || null, hire_date || new Date(), phone, address, shift || 'ERTALAB']
    );
    res.status(201).json({ employee: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/employees/:id
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { name, type, daily_tariff, hourly_tariff, phone, address, is_active, shift } = req.body;
    const result = await query(
      'UPDATE employees SET name=$1,type=$2,daily_tariff=$3,hourly_tariff=$4,phone=$5,address=$6,is_active=$7,shift=$8,updated_at=NOW() WHERE id=$9 RETURNING *',
      [name, type, daily_tariff, hourly_tariff, phone, address, is_active, shift || 'ERTALAB', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });
    res.json({ employee: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/employees/bulk-update — Bir necha ishchining turini o'zgartirish
router.put('/bulk/update-types', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({ error: 'Updates array bo\'sh' });
    }

    const updated = [];
    for (const u of updates) {
      if (!u.id || !u.type) continue;
      const result = await query(
        'UPDATE employees SET type=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [u.type, u.id]
      );
      if (result.rows.length) updated.push(result.rows[0]);
    }

    res.json({ updated, count: updated.length });
  } catch (err) { next(err); }
});

module.exports = router;
