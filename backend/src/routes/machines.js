const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// GET /api/machines
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT m.*, e.name as operator_name
      FROM machines m LEFT JOIN employees e ON m.operator_id = e.id
      WHERE m.is_active = true ORDER BY m.name
    `);
    res.json({ machines: result.rows });
  } catch (err) { next(err); }
});

// POST /api/machines
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD'), [
  body('name').notEmpty().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, code, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location } = req.body;
    const result = await query(
      'INSERT INTO machines (name, code, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, code || null, status || 'WORKING', operator_id || null, last_service_date, next_service_date, daily_production_capacity || 0, location]
    );
    res.status(201).json({ machine: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/machines/:id
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { name, code, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location } = req.body;
    const result = await query(
      'UPDATE machines SET name=$1,code=$2,status=$3,operator_id=$4,last_service_date=$5,next_service_date=$6,daily_production_capacity=$7,location=$8,updated_at=NOW() WHERE id=$9 RETURNING *',
      [name, code, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });
    res.json({ machine: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/machines/:id/status
router.put('/:id/status', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['WORKING', 'BROKEN', 'SERVICE'].includes(status)) {
      return res.status(400).json({ error: 'Noto\'g\'ri status' });
    }
    const updates = { status };
    if (status === 'WORKING') updates.last_service_date = new Date();

    const result = await query(
      'UPDATE machines SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });
    res.json({ machine: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
