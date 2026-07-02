const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// Xodim turlari. STANOKCHI/DETALCHI — dona haqi (mahsulotga bog'liq).
// Qolganlari — oylik: FIXED (belgilangan) yoki PERCENT (foiz).
const EMPLOYEE_TYPES = [
  'STANOKCHI', 'DETALCHI', 'ISHCHI', 'OSHPAZ', 'SHOFIR',
  'BUGALTER', 'SIFAT', 'CALL_CENTER', 'YORDAMCHI', 'DROBILKA',
  'ELEKTRIK', 'USTA', 'OHRANA', 'SKLAD', 'TEHNOLOG', 'MARKETING', 'BOSHQA',
];

// GET /api/employees
router.get('/', async (req, res, next) => {
  try {
    const { type, is_active = 'true', search, shift } = req.query;
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    let idx = 1;
    if (is_active !== 'all') { sql += ` AND is_active = $${idx++}`; params.push(is_active === 'true'); }
    // KIRIMCHI faqat Stanokchi va Detalchi xodimlarni ko'ra oladi
    if (req.user.role === 'KIRIMCHI') {
      sql += ` AND type IN ($${idx++}, $${idx++})`;
      params.push('STANOKCHI', 'DETALCHI');
    } else if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
    if (shift)  { sql += ` AND shift = $${idx++}`; params.push(shift); }
    if (search) { sql += ` AND name ILIKE $${idx++}`; params.push(`%${search}%`); }
    // FILIAL AJRATISH: filial faqat o'z xodimlari; zavod faqat zavodnikini
    if (req.user.branch_id) { sql += ` AND branch_id = $${idx++}`; params.push(req.user.branch_id); }
    else { sql += ` AND branch_id IS NULL`; }
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
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), [
  body('name').notEmpty().trim(),
  body('type').isIn(EMPLOYEE_TYPES),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // KIRIMCHI faqat Stanokchi yoki Detalchi xodim qo'sha oladi
    if (req.user.role === 'KIRIMCHI' && !['STANOKCHI', 'DETALCHI'].includes(req.body.type)) {
      return res.status(403).json({ error: 'Kirimchi faqat Stanokchi yoki Detalchi xodim qo\'sha oladi' });
    }

    const { name, type, hourly_tariff, hire_date, phone, address, shift } = req.body;
    const daily_tariff = Number(req.body.daily_tariff) || 0; // kunlik tarif olib tashlandi — har doim 0
    // Oylik: FIXED=belgilangan summa, PERCENT=foiz
    const salary_type = req.body.salary_type === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const monthly_salary = Number(req.body.monthly_salary) || 0;
    const salary_percent = Number(req.body.salary_percent) || 0;
    const bonus_percent = Number(req.body.bonus_percent) || 0; // qo'shimcha foiz (oyligchilarga)
    const result = await query(
      'INSERT INTO employees (name, type, daily_tariff, hourly_tariff, hire_date, phone, address, shift, salary_type, monthly_salary, salary_percent, bonus_percent, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [name, type, daily_tariff, hourly_tariff || null, hire_date || new Date(), phone, address, shift || '1-SMENA', salary_type, monthly_salary, salary_percent, bonus_percent, req.user.branch_id || null]
    );
    res.status(201).json({ employee: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/employees/:id
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { name, type, hourly_tariff, phone, address, is_active, shift } = req.body;
    const daily_tariff = Number(req.body.daily_tariff) || 0; // kunlik tarif olib tashlandi
    const salary_type = req.body.salary_type === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const monthly_salary = Number(req.body.monthly_salary) || 0;
    const salary_percent = Number(req.body.salary_percent) || 0;
    const bonus_percent = Number(req.body.bonus_percent) || 0;
    const result = await query(
      'UPDATE employees SET name=$1,type=$2,daily_tariff=$3,hourly_tariff=$4,phone=$5,address=$6,is_active=$7,shift=$8,salary_type=$9,monthly_salary=$10,salary_percent=$11,bonus_percent=$12,updated_at=NOW() WHERE id=$13 RETURNING *',
      [name, type, daily_tariff, hourly_tariff, phone, address, is_active, shift || '1-SMENA', salary_type, monthly_salary, salary_percent, bonus_percent, req.params.id]
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

// DELETE /api/employees/all — HAMMA xodimni butunlay o'chirish (faqat OWNER)
// Bog'liq yozuvlar ham o'chadi: salaries, employee_production. Mashinalar saqlanadi (operator NULL).
router.delete('/all', requireRole('OWNER'), async (req, res, next) => {
  try {
    const before = await query('SELECT COUNT(*) c FROM employees');
    const count = Number(before.rows[0].c || 0);

    // FK tartibida: avval bog'liqlar, keyin xodimlar
    await query('UPDATE machines SET operator_id = NULL WHERE operator_id IS NOT NULL');
    await query('DELETE FROM salaries');
    await query('DELETE FROM employee_production');
    await query('DELETE FROM employees');

    res.json({ success: true, deleted: count, message: `${count} ta xodim va ularning yozuvlari o'chirildi` });
  } catch (err) { next(err); }
});

// DELETE /api/employees/:id — bitta xodimni butunlay o'chirish (OWNER, PRODUCTION_HEAD)
// Bog'liq yozuvlar ham o'chadi: salaries, employee_production. Mashina operatori NULL bo'ladi.
router.delete('/:id', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const emp = await query('SELECT name FROM employees WHERE id=$1', [id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });

    await query('UPDATE machines SET operator_id = NULL WHERE operator_id = $1', [id]);
    await query('DELETE FROM salaries WHERE employee_id = $1', [id]);
    await query('DELETE FROM employee_production WHERE employee_id = $1', [id]);
    await query('DELETE FROM employees WHERE id = $1', [id]);

    res.json({ success: true, message: `${emp.rows[0].name} butunlay o'chirildi` });
  } catch (err) { next(err); }
});

module.exports = router;
