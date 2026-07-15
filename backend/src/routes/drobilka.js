const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

const WRITE_ROLES = ['OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME', 'KIRIMCHI'];

// GET /api/drobilka — jurnal ro'yxati + jamlanma
router.get('/', async (req, res, next) => {
  try {
    const branchClause = req.user.branch_id ? ' AND d.branch_id = $1' : ' AND d.branch_id IS NULL';
    const branchParams = req.user.branch_id ? [req.user.branch_id] : [];

    const list = await query(`
      SELECT d.*, p.name AS product_name, m.name AS machine_name, e.name AS employee_name
      FROM drobilka_entries d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN machines m ON d.machine_id = m.id
      LEFT JOIN employees e ON d.employee_id = e.id
      WHERE 1=1${branchClause}
      ORDER BY d.created_at DESC
      LIMIT 300
    `, branchParams);

    // Jamlanma — topshirilgan / maydalangan / kutayotgan brak
    const bClause = req.user.branch_id ? ' AND branch_id = $1' : ' AND branch_id IS NULL';
    const sum = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type='TOPSHIRISH' THEN kg ELSE 0 END), 0) AS topshirilgan,
        COALESCE(SUM(CASE WHEN entry_type='MAYDALASH'  THEN kg ELSE 0 END), 0) AS maydalangan
      FROM drobilka_entries WHERE 1=1${bClause}
    `, branchParams);

    // Ishlab chiqarishda qayd etilgan jami brak (ma'lumot uchun)
    const prodBrak = await query(`
      SELECT COALESCE(SUM(brak_kg), 0) AS total_brak FROM employee_production
    `, []);

    const topshirilgan = parseFloat(sum.rows[0].topshirilgan) || 0;
    const maydalangan = parseFloat(sum.rows[0].maydalangan) || 0;

    res.json({
      entries: list.rows,
      summary: {
        topshirilgan,
        maydalangan,
        kutayotgan: topshirilgan - maydalangan,
        production_brak: parseFloat(prodBrak.rows[0].total_brak) || 0,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/drobilka — yangi yozuv (brak topshirish yoki maydalash)
router.post('/', requireRole(...WRITE_ROLES), [
  body('kg').isFloat({ gt: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Kg musbat son bo\'lishi kerak' });

    const { entry_type, kg, product_id, machine_id, employee_id, note, entry_date } = req.body;
    const type = entry_type === 'MAYDALASH' ? 'MAYDALASH' : 'TOPSHIRISH';

    const result = await query(
      `INSERT INTO drobilka_entries
        (entry_type, kg, product_id, machine_id, employee_id, note, entry_date, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [type, parseFloat(kg), product_id || null, machine_id || null, employee_id || null,
       (note || '').trim() || null, entry_date || null, req.user.id, req.user.branch_id || null]
    );

    logAudit(req, {
      action: 'DROBILKA_ADD', table: 'drobilka_entries', recordId: result.rows[0].id,
      newValues: { entry_type: type, kg, product_id: product_id || null, machine_id: machine_id || null },
    });
    res.status(201).json({ entry: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/drobilka/:id — yozuvni o'chirish
router.delete('/:id', requireRole(...WRITE_ROLES), async (req, res, next) => {
  try {
    const branchClause = req.user.branch_id ? ' AND branch_id = $2' : ' AND branch_id IS NULL';
    const params = req.user.branch_id ? [req.params.id, req.user.branch_id] : [req.params.id];
    const r = await query(`DELETE FROM drobilka_entries WHERE id = $1${branchClause} RETURNING id`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Yozuv topilmadi' });
    logAudit(req, { action: 'DROBILKA_DELETE', table: 'drobilka_entries', recordId: req.params.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
