const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// GET /api/molds — ro'yxatdagi qoliplar (mahsulot nomi bilan)
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT mo.*, p.name AS product_name, p.kind AS product_kind,
        mm.id AS current_machine_id, mm.name AS current_machine_name
      FROM molds mo
      LEFT JOIN products p ON mo.product_id = p.id
      LEFT JOIN machines mm ON mm.current_mold_id = mo.id
      WHERE mo.is_active = true${req.user.branch_id ? ' AND mo.branch_id = $1' : ' AND mo.branch_id IS NULL'}
      ORDER BY mo.name
    `, req.user.branch_id ? [req.user.branch_id] : []);
    res.json({ molds: result.rows });
  } catch (err) { next(err); }
});

// POST /api/molds — yangi qolip qo'shish
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME', 'KIRIMCHI'), [
  body('name').notEmpty().trim(),
  body('product_id').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, product_id, cavity_count, status, location, notes } = req.body;
    const result = await query(
      `INSERT INTO molds (name, product_id, cavity_count, status, location, notes, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, product_id, cavity_count || null, ['AKTIV', 'TAMIRDA', 'NOSOZ'].includes(status) ? status : 'AKTIV',
       location || null, notes || null, req.user.branch_id || null]
    );
    res.status(201).json({ mold: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/molds/:id — tahrirlash
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const { name, product_id, cavity_count, status, location, notes } = req.body;
    const result = await query(
      `UPDATE molds SET name=$1, product_id=$2, cavity_count=$3, status=$4, location=$5, notes=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, product_id, cavity_count || null, ['AKTIV', 'TAMIRDA', 'NOSOZ'].includes(status) ? status : 'AKTIV',
       location || null, notes || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Qolip topilmadi' });
    res.json({ mold: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/molds/:id — ro'yxatdan olib tashlash (nofaol qilinadi)
router.delete('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const result = await query('UPDATE molds SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Qolip topilmadi' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
