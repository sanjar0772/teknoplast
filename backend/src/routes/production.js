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

// GET /api/production/range-summary — tanlangan davr va xodimlar bo'yicha statistika (Stanokchi/Detalchi)
router.get('/range-summary', async (req, res, next) => {
  try {
    const { start_date, end_date, employee_ids } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date va end_date kerak' });
    }

    let sql = `
      SELECT e.id as employee_id, e.name, e.type, e.shift,
             COUNT(DISTINCT ep.production_date) as work_days,
             COALESCE(SUM(ep.quantity_produced), 0) as total_produced,
             COALESCE(SUM(ep.calculated_amount), 0) as total_earned
      FROM employees e
      LEFT JOIN employee_production ep
        ON ep.employee_id = e.id AND ep.production_date BETWEEN $1 AND $2
      WHERE e.type IN ('STANOKCHI', 'DETALCHI')
    `;
    const params = [start_date, end_date];
    let idx = 3;

    if (employee_ids) {
      const ids = String(employee_ids).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length) {
        const placeholders = ids.map(() => `$${idx++}`).join(',');
        sql += ` AND e.id IN (${placeholders})`;
        params.push(...ids);
      }
    }

    sql += ' GROUP BY e.id, e.name, e.type, e.shift ORDER BY e.type, e.name';
    const result = await query(sql, params);
    res.json({ summary: result.rows, start_date, end_date });
  } catch (err) { next(err); }
});

// POST /api/production — kunlik ishlab chiqarish kiritish
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), [
  body('employee_id').notEmpty(),
  body('production_date').isDate(),
  body('quantity_produced').isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { employee_id, product_id, machine_id, production_date, quantity_produced, notes, production_type, daily_tariff: custom_tariff } = req.body;

    const emp = await query('SELECT type, daily_tariff FROM employees WHERE id=$1 AND is_active=true', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });

    const employee_type = emp.rows[0].type;
    let calculated_amount = 0;
    let daily_tariff = emp.rows[0].daily_tariff;

    // Ishlab chiqarish turi: STANOKCHI tayyor/yarim tanlaydi; DETALCHI doim yarim tayyor
    let ptype = production_type || 'FINISHED';
    if (employee_type === 'DETALCHI') ptype = 'SEMI_FINISHED';

    // Agar Kirimchi tomonidan maxsus tarif berilgan bo'lsa — uni ishlatamiz
    if (custom_tariff && parseFloat(custom_tariff) > 0) {
      daily_tariff = parseFloat(custom_tariff);
      calculated_amount = quantity_produced * daily_tariff;
    } else if (product_id) {
      const prod = await query('SELECT stanokchi_rate, stanokchi_semi_rate, detalchi_rate FROM products WHERE id=$1', [product_id]);
      const product = prod.rows[0] || {};
      if (employee_type === 'STANOKCHI') {
        const rate = ptype === 'SEMI_FINISHED' ? product.stanokchi_semi_rate : product.stanokchi_rate;
        daily_tariff = rate || 0;
        calculated_amount = quantity_produced * daily_tariff;
      } else if (employee_type === 'DETALCHI') {
        daily_tariff = product.detalchi_rate || 0;
        calculated_amount = quantity_produced * daily_tariff;
      } else {
        calculated_amount = quantity_produced * daily_tariff;
      }
    } else {
      calculated_amount = quantity_produced * daily_tariff;
    }

    const month = production_date.slice(0, 7);

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const production = await saveProductionWithStock(client, {
        employee_id, product_id, machine_id, production_date,
        quantity_produced, daily_tariff, calculated_amount, month, notes,
      });

      // Ishlab chiqarish turini saqlaymiz va javobda ham yangilaymiz
      await client.query(
        'UPDATE employee_production SET production_type=$1 WHERE id=$2',
        [ptype, production.id]
      );
      production.production_type = ptype;

      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_RECORD', table: 'employee_production', recordId: production.id,
        newValues: { employee_id, product_id: product_id || null, quantity_produced, production_date, production_type: ptype },
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
router.post('/bulk', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), async (req, res, next) => {
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
        const emp = await query('SELECT type, daily_tariff FROM employees WHERE id=$1 AND is_active=true', [entry.employee_id]);
        if (!emp.rows.length) continue;

        const employee_type = emp.rows[0].type;
        let daily_tariff = emp.rows[0].daily_tariff;
        let calculated_amount = 0;

        // Ishlab chiqarish turi: STANOKCHI tayyor/yarim; DETALCHI doim yarim tayyor
        let ptype = entry.production_type || 'FINISHED';
        if (employee_type === 'DETALCHI') ptype = 'SEMI_FINISHED';

        // Agar Kirimchi maxsus tarif bergan bo'lsa — uni ishlatamiz
        if (entry.daily_tariff && parseFloat(entry.daily_tariff) > 0) {
          daily_tariff = parseFloat(entry.daily_tariff);
          calculated_amount = entry.quantity_produced * daily_tariff;
        } else if (entry.product_id) {
          const prod = await query('SELECT stanokchi_rate, stanokchi_semi_rate, detalchi_rate FROM products WHERE id=$1', [entry.product_id]);
          const product = prod.rows[0] || {};
          if (employee_type === 'STANOKCHI') {
            const rate = ptype === 'SEMI_FINISHED' ? product.stanokchi_semi_rate : product.stanokchi_rate;
            daily_tariff = rate || 0;
            calculated_amount = entry.quantity_produced * daily_tariff;
          } else if (employee_type === 'DETALCHI') {
            daily_tariff = product.detalchi_rate || 0;
            calculated_amount = entry.quantity_produced * daily_tariff;
          } else {
            calculated_amount = entry.quantity_produced * daily_tariff;
          }
        } else {
          calculated_amount = entry.quantity_produced * daily_tariff;
        }

        const production = await saveProductionWithStock(client, {
          employee_id: entry.employee_id, product_id: entry.product_id,
          machine_id: entry.machine_id, production_date,
          quantity_produced: entry.quantity_produced, daily_tariff,
          calculated_amount, month, notes: entry.notes,
        });

        await client.query(
          'UPDATE employee_production SET production_type=$1 WHERE id=$2',
          [ptype, production.id]
        );
        production.production_type = ptype;

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

// DELETE /api/production/:id — yagona yozuvni o'chirish (OWNER yoki PRODUCTION_HEAD)
router.delete('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), async (req, res, next) => {
  try {
    // Avval yozuvni olamiz — ombor delta uchun
    const existing = await query('SELECT * FROM employee_production WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Yozuv topilmadi' });

    const row = existing.rows[0];
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Mahsulot omborini orqaga qaytaramiz (agar bog'langan mahsulot bo'lsa)
      if (row.product_id && row.quantity_produced > 0) {
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2',
          [row.quantity_produced, row.product_id]
        );
      }
      await client.query('DELETE FROM employee_production WHERE id=$1', [req.params.id]);
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_DELETE', table: 'employee_production', recordId: req.params.id,
        newValues: { employee_id: row.employee_id, production_date: row.production_date, quantity: row.quantity_produced },
      });
      res.json({ message: 'Yozuv o\'chirildi' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
