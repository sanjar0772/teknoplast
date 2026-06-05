const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

/**
 * Ishlab chiqarish yozuvini saqlash + tayyor mahsulot omborini DELTA bilan yangilash.
 * Eski yozuv bo'lsa: eski mahsulot omborini qaytaramiz, yangi mahsulotga qo'shamiz.
 * Shunday qilib qayta tahrirlanganda ikki marta sanalmaydi.
 */
async function saveProductionWithStock(client, {
  employee_id, product_id, machine_id, production_date,
  quantity_produced, daily_tariff, calculated_amount, month, notes,
}) {
  // Eski yozuvni topamiz (delta uchun)
  const existing = await client.query(
    'SELECT product_id, quantity_produced FROM employee_production WHERE employee_id=$1 AND production_date=$2',
    [employee_id, production_date]
  );
  const old = existing.rows[0];

  // Upsert
  await client.query(
    `INSERT INTO employee_production
      (employee_id, product_id, machine_id, production_date, quantity_produced, daily_tariff, calculated_amount, month, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (employee_id, production_date)
     DO UPDATE SET product_id=$2, machine_id=$3, quantity_produced=$5, daily_tariff=$6, calculated_amount=$7, notes=$9, updated_at=NOW()`,
    [employee_id, product_id || null, machine_id || null, production_date,
     quantity_produced, daily_tariff, calculated_amount, month, notes || null]
  );

  // Eski mahsulot omborini qaytaramiz (agar bor bo'lsa)
  if (old && old.product_id) {
    await client.query(
      'UPDATE products SET stock_quantity = stock_quantity - $1, updated_at=NOW() WHERE id=$2',
      [old.quantity_produced, old.product_id]
    );
  }
  // Yangi ishlab chiqarilgan mahsulotni omborga qo'shamiz
  if (product_id) {
    await client.query(
      'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at=NOW() WHERE id=$2',
      [quantity_produced, product_id]
    );
  }

  // Ishonchli qaytarish — yozuvni qayta o'qiymiz
  const r = await client.query(
    'SELECT * FROM employee_production WHERE employee_id=$1 AND production_date=$2',
    [employee_id, production_date]
  );
  return r.rows[0];
}

// GET /api/production — kunlik ishlab chiqarish
router.get('/', async (req, res, next) => {
  try {
    const { date, month, employee_id } = req.query;
    let sql = `
      SELECT ep.*, e.name as employee_name, e.type as employee_type,
             p.name as product_name
      FROM employee_production ep
      JOIN employees e ON ep.employee_id = e.id
      LEFT JOIN products p ON ep.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (date)        { sql += ` AND ep.production_date = $${idx++}`; params.push(date); }
    if (month)       { sql += ` AND ep.month = $${idx++}`; params.push(month); }
    if (employee_id) { sql += ` AND ep.employee_id = $${idx++}`; params.push(employee_id); }
    sql += ' ORDER BY ep.production_date DESC, e.name';
    const result = await query(sql, params);
    res.json({ production: result.rows });
  } catch (err) { next(err); }
});

// GET /api/production/summary
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const byEmployee = await query(`
      SELECT e.name, e.type, ep.month,
             SUM(ep.quantity_produced) as total_produced,
             SUM(ep.calculated_amount) as total_earned,
             COUNT(ep.production_date) as work_days
      FROM employee_production ep JOIN employees e ON ep.employee_id = e.id
      WHERE ep.month = $1
      GROUP BY e.name, e.type, ep.month
      ORDER BY total_produced DESC
    `, [period]);

    const daily = await query(`
      SELECT production_date,
             COUNT(DISTINCT employee_id) as workers,
             SUM(quantity_produced) as total_qty,
             SUM(calculated_amount) as total_earned
      FROM employee_production WHERE month = $1
      GROUP BY production_date ORDER BY production_date
    `, [period]);

    res.json({ by_employee: byEmployee.rows, daily: daily.rows });
  } catch (err) { next(err); }
});

// POST /api/production — kunlik ishlab chiqarish kiritish
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD'), [
  body('employee_id').notEmpty(),
  body('production_date').isDate(),
  body('quantity_produced').isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { employee_id, product_id, machine_id, production_date, quantity_produced, notes } = req.body;

    const emp = await query('SELECT daily_tariff FROM employees WHERE id=$1 AND is_active=true', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });

    const daily_tariff = emp.rows[0].daily_tariff;
    const calculated_amount = (quantity_produced / 100) * daily_tariff;
    const month = production_date.slice(0, 7);

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const production = await saveProductionWithStock(client, {
        employee_id, product_id, machine_id, production_date,
        quantity_produced, daily_tariff, calculated_amount, month, notes,
      });
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_RECORD', table: 'employee_production', recordId: production.id,
        newValues: { employee_id, product_id: product_id || null, quantity_produced, production_date },
      });
      res.status(201).json({ production });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/production/bulk — bir kunda ko'p xodim
router.post('/bulk', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { production_date, entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'Entries bo\'sh' });
    }

    const month = production_date.slice(0, 7);
    const results = [];

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        const emp = await query('SELECT daily_tariff FROM employees WHERE id=$1 AND is_active=true', [entry.employee_id]);
        if (!emp.rows.length) continue;

        const daily_tariff = emp.rows[0].daily_tariff;
        const calculated_amount = (entry.quantity_produced / 100) * daily_tariff;

        const production = await saveProductionWithStock(client, {
          employee_id: entry.employee_id, product_id: entry.product_id,
          machine_id: entry.machine_id, production_date,
          quantity_produced: entry.quantity_produced, daily_tariff,
          calculated_amount, month, notes: entry.notes,
        });
        results.push(production);
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_BULK', table: 'employee_production',
        recordId: results.map(r => r.id).join(','),
        newValues: { count: results.length, production_date },
      });
      res.status(201).json({ production: results, count: results.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
