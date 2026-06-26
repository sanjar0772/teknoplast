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
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), [
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
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
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

// PUT /api/machines/:id/status — holatni o'zgartirish (+ nosozlik jurnaliga yozish)
router.put('/:id/status', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!['WORKING', 'BROKEN', 'SERVICE'].includes(status)) {
      return res.status(400).json({ error: 'Noto\'g\'ri status' });
    }
    const result = await query(
      'UPDATE machines SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });

    // Nosozlik jurnali: WORKING — ochiq yozuvni yopadi; BROKEN/SERVICE — ochiq yozuv ochadi
    if (status === 'WORKING') {
      await query('UPDATE machine_downtime SET ended_at=NOW() WHERE machine_id=$1 AND ended_at IS NULL', [req.params.id]);
    } else {
      const open = await query('SELECT id FROM machine_downtime WHERE machine_id=$1 AND ended_at IS NULL LIMIT 1', [req.params.id]);
      if (!open.rows.length) {
        await query(
          `INSERT INTO machine_downtime (machine_id, status, reason, started_at, recorded_by)
           VALUES ($1,$2,$3,NOW(),$4)`,
          [req.params.id, status, reason || null, req.user.id]
        );
      } else if (reason) {
        await query('UPDATE machine_downtime SET reason=$1 WHERE id=$2', [reason, open.rows[0].id]);
      }
    }
    res.json({ machine: result.rows[0] });
  } catch (err) { next(err); }
});

// ── Cycle-time (stanok → mahsulot → sekund/dona) ──────────────────────────
// GET /api/machines/:id/cycle-times
router.get('/:id/cycle-times', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT mct.*, p.name AS product_name, p.unit
       FROM machine_cycle_times mct
       LEFT JOIN products p ON mct.product_id = p.id
       WHERE mct.machine_id = $1
       ORDER BY p.name`,
      [req.params.id]
    );
    res.json({ cycle_times: result.rows });
  } catch (err) { next(err); }
});

// POST /api/machines/:id/cycle-times — mahsulot cycle-time qo'shish/yangilash (upsert)
router.post('/:id/cycle-times', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { product_id, cycle_seconds } = req.body;
    const sec = parseFloat(cycle_seconds);
    if (!product_id) return res.status(400).json({ error: 'Mahsulot tanlanmagan' });
    if (!sec || sec <= 0) return res.status(400).json({ error: 'Cycle-time (sekund) noto\'g\'ri' });

    const upd = await query(
      `UPDATE machine_cycle_times SET cycle_seconds=$1, set_by=$2, updated_at=NOW()
       WHERE machine_id=$3 AND product_id=$4 RETURNING *`,
      [sec, req.user.id, req.params.id, product_id]
    );
    if (upd.rows.length) return res.json({ cycle_time: upd.rows[0] });

    const ins = await query(
      `INSERT INTO machine_cycle_times (machine_id, product_id, cycle_seconds, set_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, product_id, sec, req.user.id]
    );
    res.status(201).json({ cycle_time: ins.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/machines/:id/cycle-times/:productId
router.delete('/:id/cycle-times/:productId', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    await query('DELETE FROM machine_cycle_times WHERE machine_id=$1 AND product_id=$2', [req.params.id, req.params.productId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Nosozlik jurnali ──────────────────────────────────────────────────────
// GET /api/machines/:id/downtime
router.get('/:id/downtime', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.*, u.full_name AS recorded_by_name
       FROM machine_downtime d
       LEFT JOIN users u ON d.recorded_by = u.id
       WHERE d.machine_id = $1
       ORDER BY COALESCE(d.started_at, d.created_at) DESC`,
      [req.params.id]
    );
    res.json({ downtime: result.rows });
  } catch (err) { next(err); }
});

// POST /api/machines/:id/downtime — nosozlikni vaqt oralig'i + sabab bilan yozish
router.post('/:id/downtime', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { started_at, ended_at, reason, status } = req.body;
    if (!started_at) return res.status(400).json({ error: 'Boshlanish vaqti kiritilmagan' });
    const st = ['BROKEN', 'SERVICE'].includes(status) ? status : 'BROKEN';
    const ins = await query(
      `INSERT INTO machine_downtime (machine_id, status, reason, started_at, ended_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, st, reason || null, started_at, ended_at || null, req.user.id]
    );
    // Tugamagan nosozlik — stanok holatini ham shu statusga o'tkazamiz
    if (!ended_at) {
      await query('UPDATE machines SET status=$1, updated_at=NOW() WHERE id=$2', [st, req.params.id]);
    }
    res.status(201).json({ downtime: ins.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
