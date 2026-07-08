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
      SELECT m.*, e.name as operator_name, e.shift as operator_shift, p.name as current_product_name,
        cm.name AS current_mold_name, cm.status AS current_mold_status, cm.location AS current_mold_location, cm.cavity_count AS current_mold_cavity_count,
        (SELECT d.status FROM machine_downtime d WHERE d.machine_id = m.id AND d.ended_at IS NULL ORDER BY d.started_at DESC LIMIT 1) AS pause_status,
        (SELECT d.reason FROM machine_downtime d WHERE d.machine_id = m.id AND d.ended_at IS NULL ORDER BY d.started_at DESC LIMIT 1) AS pause_reason,
        (SELECT d.mold_minutes FROM machine_downtime d WHERE d.machine_id = m.id AND d.ended_at IS NULL ORDER BY d.started_at DESC LIMIT 1) AS pause_mold_minutes
      FROM machines m
      LEFT JOIN employees e ON m.operator_id = e.id
      LEFT JOIN products p ON m.current_product_id = p.id
      LEFT JOIN molds cm ON m.current_mold_id = cm.id
      WHERE m.is_active = true${req.user.branch_id ? ' AND m.branch_id = $1' : ' AND m.branch_id IS NULL'} ORDER BY m.name
    `, req.user.branch_id ? [req.user.branch_id] : []);
    res.json({ machines: result.rows });
  } catch (err) { next(err); }
});

// ── Stanok ishlab chiqarish statistikasi (davr bo'yicha) ──────────────────
// Har stanok o'z operatori (stanokchi) orqali bog'lanadi: "stanok chiqargan mahsulot"
// = shu stanok operatorining chiqargan mahsuloti (employee_production.machine_id
// hozircha kiritilmaydi, shuning uchun operator bog'lanishi ishlatiladi).
async function fetchMachineStats(user, startDate, endDate) {
  const branchClause = user.branch_id ? ' AND m.branch_id = $3' : ' AND m.branch_id IS NULL';
  const branchParams = user.branch_id ? [user.branch_id] : [];

  // Jamlanma — barcha aktiv stanoklar (ishlab chiqarmaganlar ham 0 bilan ko'rinadi)
  const summary = (await query(`
    SELECT m.id AS machine_id, m.name AS machine_name, m.type AS machine_type,
           m.location, m.status, e.name AS operator_name,
           COUNT(DISTINCT ep.production_date) AS work_days,
           COUNT(DISTINCT ep.product_id) AS product_count,
           COALESCE(SUM(ep.quantity_produced), 0) AS total_produced,
           COALESCE(SUM(ep.calculated_amount), 0) AS total_earned
    FROM machines m
    LEFT JOIN employees e ON m.operator_id = e.id
    LEFT JOIN employee_production ep
      ON ep.employee_id = m.operator_id AND ep.production_date BETWEEN $1 AND $2
    WHERE m.is_active = true${branchClause}
    GROUP BY m.id, m.name, m.type, m.location, m.status, e.name
    ORDER BY total_produced DESC, m.name
  `, [startDate, endDate, ...branchParams])).rows;

  // Tafsilot — faqat operatori bor va ishlab chiqarish bo'lgan stanoklar, mahsulot darajasida
  const detail = (await query(`
    SELECT m.id AS machine_id, m.name AS machine_name, p.name AS product_name,
           COUNT(DISTINCT ep.production_date) AS work_days,
           COALESCE(SUM(ep.quantity_produced), 0) AS total_produced,
           COALESCE(SUM(ep.calculated_amount), 0) AS total_earned
    FROM machines m
    JOIN employee_production ep
      ON ep.employee_id = m.operator_id AND ep.production_date BETWEEN $1 AND $2
    LEFT JOIN products p ON ep.product_id = p.id
    WHERE m.is_active = true AND m.operator_id IS NOT NULL${branchClause}
    GROUP BY m.id, m.name, p.name
    ORDER BY m.name, total_produced DESC
  `, [startDate, endDate, ...branchParams])).rows;

  return { summary, detail };
}

// GET /api/machines/stats?start_date&end_date — JSON (ekranda ko'rsatish uchun)
router.get('/stats', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date va end_date kerak' });
    const { summary, detail } = await fetchMachineStats(req.user, start_date, end_date);
    res.json({ summary, detail, start_date, end_date });
  } catch (err) { next(err); }
});

// GET /api/machines/stats/excel — Excel hisobot
router.get('/stats/excel', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date va end_date kerak' });
    const { summary, detail } = await fetchMachineStats(req.user, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateMachineStatsExcel(summary, detail, start_date, end_date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="stanoklar-statistika-${start_date}_${end_date}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/machines/stats/pdf — PDF hisobot
router.get('/stats/pdf', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date va end_date kerak' });
    const { summary, detail } = await fetchMachineStats(req.user, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateMachineStatsPDF(summary, detail, start_date, end_date);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="stanoklar-statistika-${start_date}_${end_date}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// POST /api/machines
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), [
  body('name').notEmpty().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, code, type, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location } = req.body;
    const result = await query(
      'INSERT INTO machines (name, code, type, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [name, code || null, type || 'STANOK', status || 'WORKING', operator_id || null, last_service_date, next_service_date, daily_production_capacity || 0, location, req.user.branch_id || null]
    );
    res.status(201).json({ machine: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/machines/:id
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { name, code, type, status, operator_id, last_service_date, next_service_date, daily_production_capacity, location } = req.body;
    const result = await query(
      'UPDATE machines SET name=$1,code=$2,type=$3,status=$4,operator_id=$5,last_service_date=$6,next_service_date=$7,daily_production_capacity=$8,location=$9,updated_at=NOW() WHERE id=$10 RETURNING *',
      [name, code || null, type || 'STANOK', status, operator_id, last_service_date, next_service_date, daily_production_capacity, location, req.params.id]
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

// PUT /api/machines/:id/running — play/pause. Play = ishga tushadi (WORKING).
// Pause = to'xtaydi + sabab: NOSOZ / BUZILGAN / QOLIP (qalip almashish, o'rtacha vaqt bilan).
router.put('/:id/running', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const is_running = req.body.is_running ? 1 : 0;

    if (is_running) {
      // Play — ochiq to'xtash yozuvini yopib, holatni WORKING qilamiz
      await query('UPDATE machine_downtime SET ended_at=NOW() WHERE machine_id=$1 AND ended_at IS NULL', [id]);
      const r = await query(
        "UPDATE machines SET is_running=1, status='WORKING', updated_at=NOW() WHERE id=$1 RETURNING *", [id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });
      return res.json({ machine: r.rows[0] });
    }

    // Pause — sababga qarab
    const pauseKind = req.body.pause_kind || 'NOSOZ'; // NOSOZ | BUZILGAN | QOLIP
    const reason = (req.body.reason || '').trim() || null;
    const moldMinutes = (req.body.mold_minutes != null && req.body.mold_minutes !== '')
      ? parseFloat(req.body.mold_minutes) : null;
    // QOLIP bo'lsa — almashtirilayotgan qolip (mahsulot) majburiy tanlanadi
    const moldProductId = pauseKind === 'QOLIP' ? (req.body.product_id || null) : null;
    if (pauseKind === 'QOLIP' && !moldProductId) {
      return res.status(400).json({ error: "Almashtirilayotgan qolipni (mahsulotni) tanlang" });
    }

    // Downtime statusi + stanok sog'lik holati (QOLIP — sog'lik holatiga tegmaydi)
    let dtStatus = 'SERVICE', machineStatus = null;
    if (pauseKind === 'BUZILGAN') { dtStatus = 'BROKEN'; machineStatus = 'BROKEN'; }
    else if (pauseKind === 'NOSOZ') { dtStatus = 'SERVICE'; machineStatus = 'SERVICE'; }
    else if (pauseKind === 'QOLIP') { dtStatus = 'MOLD'; machineStatus = null; }

    let upd;
    if (machineStatus) {
      upd = await query('UPDATE machines SET is_running=0, status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [machineStatus, id]);
    } else if (pauseKind === 'QOLIP') {
      upd = await query('UPDATE machines SET is_running=0, current_product_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [moldProductId, id]);
    } else {
      upd = await query('UPDATE machines SET is_running=0, updated_at=NOW() WHERE id=$1 RETURNING *', [id]);
    }
    if (!upd.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });

    // Bitta aktiv to'xtash yozuvi: avvalgisini yopib, yangisini ochamiz
    await query('UPDATE machine_downtime SET ended_at=NOW() WHERE machine_id=$1 AND ended_at IS NULL', [id]);
    await query(
      `INSERT INTO machine_downtime (machine_id, status, reason, started_at, mold_minutes, mold_product_id, recorded_by)
       VALUES ($1,$2,$3,NOW(),$4,$5,$6)`,
      [id, dtStatus, reason, moldMinutes, moldProductId, req.user.id]
    );
    res.json({ machine: upd.rows[0] });
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
      `SELECT d.*, u.full_name AS recorded_by_name, p.name AS mold_product_name
       FROM machine_downtime d
       LEFT JOIN users u ON d.recorded_by = u.id
       LEFT JOIN products p ON d.mold_product_id = p.id
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

// ── Smena almashish (1-smena/2-smena operatori almashinuvi) ───────────────
// GET /api/machines/:id/shift-changes — almashinuv tarixi
router.get('/:id/shift-changes', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT sc.*, e1.name AS from_operator_name, e2.name AS to_operator_name, u.full_name AS changed_by_name
       FROM machine_shift_changes sc
       LEFT JOIN employees e1 ON sc.from_operator_id = e1.id
       LEFT JOIN employees e2 ON sc.to_operator_id = e2.id
       LEFT JOIN users u ON sc.changed_by = u.id
       WHERE sc.machine_id = $1
       ORDER BY sc.changed_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ shift_changes: result.rows });
  } catch (err) { next(err); }
});

// POST /api/machines/:id/shift-changes — operatorni almashtirish (stanok operatorini yangilaydi + jurnalga yozadi)
router.post('/:id/shift-changes', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { to_operator_id, note } = req.body;
    if (!to_operator_id) return res.status(400).json({ error: 'Yangi operatorni tanlang' });

    const m = await query('SELECT operator_id FROM machines WHERE id = $1', [req.params.id]);
    if (!m.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });
    const fromOperatorId = m.rows[0].operator_id || null;

    await query('UPDATE machines SET operator_id = $1, updated_at = NOW() WHERE id = $2', [to_operator_id, req.params.id]);

    const ins = await query(
      `INSERT INTO machine_shift_changes (machine_id, from_operator_id, to_operator_id, note, changed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, fromOperatorId, to_operator_id, (note || '').trim() || null, req.user.id]
    );
    res.status(201).json({ shift_change: ins.rows[0] });
  } catch (err) { next(err); }
});

// ── Kalip belgilash (stanokka jismoniy qolip biriktirish) ─────────────────
// GET /api/machines/:id/mold-changes — biriktirish tarixi
router.get('/:id/mold-changes', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT mc.*, mo1.name AS from_mold_name, mo2.name AS to_mold_name, u.full_name AS changed_by_name
       FROM machine_mold_changes mc
       LEFT JOIN molds mo1 ON mc.from_mold_id = mo1.id
       LEFT JOIN molds mo2 ON mc.to_mold_id = mo2.id
       LEFT JOIN users u ON mc.changed_by = u.id
       WHERE mc.machine_id = $1
       ORDER BY mc.changed_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ mold_changes: result.rows });
  } catch (err) { next(err); }
});

// POST /api/machines/:id/mold-changes — kalipni biriktirish (mold_id yoki product_id) yoki yechish (ikkalasi ham bo'sh)
router.post('/:id/mold-changes', requireRole('OWNER', 'PRODUCTION_HEAD', 'CYCLE_TIME'), async (req, res, next) => {
  try {
    const { mold_id, product_id, note } = req.body;
    const m = await query('SELECT current_mold_id, branch_id FROM machines WHERE id = $1', [req.params.id]);
    if (!m.rows.length) return res.status(404).json({ error: 'Mashina topilmadi' });
    const fromMoldId = m.rows[0].current_mold_id || null;
    let toMoldId = mold_id || null;

    // Mahsulot/komponent to'g'ridan-to'g'ri tanlangan bo'lsa — o'sha mahsulot uchun
    // mavjud qolipni topamiz, bo'lmasa mahsulot nomi bilan yangi qolip yozib qo'yamiz.
    if (!toMoldId && product_id) {
      const existing = await query(
        'SELECT id FROM molds WHERE product_id = $1 AND is_active = true ORDER BY created_at LIMIT 1',
        [product_id]
      );
      if (existing.rows.length) {
        toMoldId = existing.rows[0].id;
      } else {
        const prod = await query('SELECT name FROM products WHERE id = $1', [product_id]);
        if (!prod.rows.length) return res.status(400).json({ error: 'Mahsulot/komponent topilmadi' });
        const created = await query(
          'INSERT INTO molds (name, product_id, status, branch_id) VALUES ($1,$2,$3,$4) RETURNING *',
          [prod.rows[0].name, product_id, 'AKTIV', m.rows[0].branch_id || null]
        );
        toMoldId = created.rows[0].id;
      }
    }

    if (toMoldId) {
      const mo = await query('SELECT id FROM molds WHERE id = $1 AND is_active = true', [toMoldId]);
      if (!mo.rows.length) return res.status(400).json({ error: 'Qolip topilmadi' });
      // Boshqa stanokda o'rnatilgan bo'lsa — u yerdan avtomatik yechiladi
      await query('UPDATE machines SET current_mold_id = NULL, updated_at = NOW() WHERE current_mold_id = $1 AND id <> $2', [toMoldId, req.params.id]);
    }
    if (!toMoldId && !fromMoldId) return res.status(400).json({ error: 'Stanokda hech qanday kalip biriktirilmagan' });

    await query('UPDATE machines SET current_mold_id = $1, updated_at = NOW() WHERE id = $2', [toMoldId, req.params.id]);

    const ins = await query(
      `INSERT INTO machine_mold_changes (machine_id, from_mold_id, to_mold_id, note, changed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, fromMoldId, toMoldId, (note || '').trim() || null, req.user.id]
    );
    res.status(201).json({ mold_change: ins.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
