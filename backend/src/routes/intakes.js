const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { addColorStock } = require('../utils/colorStock');

const router = express.Router();
router.use(authenticate);

// GET /api/intakes — kirimlar ro'yxati (status bo'yicha filtr)
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT i.*, u.full_name as created_by_name, a.full_name as approved_by_name,
             (SELECT COUNT(*) FROM intake_items WHERE intake_id = i.id) as item_count,
             (SELECT COALESCE(SUM(quantity),0) FROM intake_items WHERE intake_id = i.id) as total_qty,
             (SELECT STRING_AGG(p.name || ' (' || ii.quantity || ' dona)', ', ')
              FROM intake_items ii JOIN products p ON ii.product_id = p.id
              WHERE ii.intake_id = i.id) as product_list
      FROM product_intakes i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users a ON i.approved_by = a.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND i.status = $${params.length + 1}`; params.push(status); }
    // FILIAL AJRATISH: filial faqat o'z kirimlarini; zavod faqat zavodnikini
    if (req.user.branch_id) { sql += ` AND i.branch_id = $${params.length + 1}`; params.push(req.user.branch_id); }
    else { sql += ` AND i.branch_id IS NULL`; }
    sql += ' ORDER BY i.created_at DESC';
    const result = await query(sql, params);
    res.json({ intakes: result.rows });
  } catch (err) { next(err); }
});

// Kirimlarni (intake_items yassilangan) olish — Excel/PDF eksport uchun
async function fetchIntakeRows({ status, start_date, end_date, branchId }) {
  let sql = `
    SELECT i.id, i.status, i.notes, i.created_at, i.approved_at,
           u.full_name AS created_by_name, a.full_name AS approved_by_name,
           it.quantity, COALESCE(it.rang, p.rang) AS rang,
           p.name AS product_name, COALESCE(p.unit, 'dona') AS unit
    FROM intake_items it
    JOIN product_intakes i ON it.intake_id = i.id
    LEFT JOIN products p ON it.product_id = p.id
    LEFT JOIN users u ON i.created_by = u.id
    LEFT JOIN users a ON i.approved_by = a.id
    WHERE 1=1`;
  const params = [];
  let idx = 1;
  if (status)     { sql += ` AND i.status = $${idx++}`; params.push(status); }
  if (start_date) { sql += ` AND DATE(i.created_at) >= $${idx++}`; params.push(start_date); }
  if (end_date)   { sql += ` AND DATE(i.created_at) <= $${idx++}`; params.push(end_date); }
  // FILIAL AJRATISH: filial faqat o'z kirimlari; zavod faqat zavodnikini
  if (branchId) { sql += ` AND i.branch_id = $${idx++}`; params.push(branchId); }
  else { sql += ` AND i.branch_id IS NULL`; }
  sql += ' ORDER BY i.created_at DESC, p.name';
  return (await query(sql, params)).rows;
}

// GET /api/intakes/excel — kirimlar Excel hisoboti
router.get('/excel', async (req, res, next) => {
  try {
    const { status, start_date, end_date } = req.query;
    const rows = await fetchIntakeRows({ status, start_date, end_date, branchId: req.user.branch_id || null });
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateIntakesExcel(rows, { status, start_date, end_date });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kirimlar-${start_date || 'hammasi'}_${end_date || ''}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/intakes/pdf — kirimlar PDF hisoboti
router.get('/pdf', async (req, res, next) => {
  try {
    const { status, start_date, end_date } = req.query;
    const rows = await fetchIntakeRows({ status, start_date, end_date, branchId: req.user.branch_id || null });
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateIntakesPDF(rows, { status, start_date, end_date });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kirimlar-${start_date || 'hammasi'}_${end_date || ''}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/intakes/:id — kirim tafsiloti + mahsulotlar
router.get('/:id', async (req, res, next) => {
  try {
    const intake = await query(`
      SELECT i.*, u.full_name as created_by_name, a.full_name as approved_by_name
      FROM product_intakes i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users a ON i.approved_by = a.id
      WHERE i.id = $1`, [req.params.id]);
    if (!intake.rows.length) return res.status(404).json({ error: 'Kirim topilmadi' });

    const items = await query(`
      SELECT it.*, p.name as product_name, p.razmer, p.unit, p.stock_quantity,
             COALESCE(it.rang, p.rang) as rang
      FROM intake_items it JOIN products p ON it.product_id = p.id
      WHERE it.intake_id = $1`, [req.params.id]);

    res.json({ intake: intake.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// POST /api/intakes — yangi kirim (KIRIMCHI, OWNER, PRODUCTION_HEAD, SALES_HEAD)
router.post('/', requireRole('OWNER', 'KIRIMCHI', 'PRODUCTION_HEAD', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { items, notes } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Kamida bitta mahsulot kerak' });
    }
    // Mahsulotlar mavjudligini tekshirish
    for (const it of items) {
      if (!it.product_id || !it.quantity || it.quantity <= 0) {
        return res.status(400).json({ error: 'Mahsulot va miqdor noto\'g\'ri' });
      }
    }

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Filial foydalanuvchisi kirim qilsa — o'sha filialniki (branch_id); zavod bo'lsa NULL.
      const intakeR = await client.query(
        `INSERT INTO product_intakes (status, notes, created_by, branch_id) VALUES ('PENDING', $1, $2, $3) RETURNING *`,
        [notes || null, req.user.id, req.user.branch_id || null]
      );
      const intake = intakeR.rows[0];
      for (const it of items) {
        await client.query(
          `INSERT INTO intake_items (intake_id, product_id, quantity, rang) VALUES ($1, $2, $3, $4)`,
          [intake.id, it.product_id, parseInt(it.quantity), it.rang || null]
        );
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'INTAKE_CREATE', table: 'product_intakes', recordId: intake.id,
        newValues: { item_count: items.length, status: 'PENDING' },
      });
      res.status(201).json({ intake, count: items.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/intakes/:id/approve — Sotuv bo'limi tasdiqlaydi → ombor to'ladi
router.put('/:id/approve', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const intakeR = await query('SELECT * FROM product_intakes WHERE id = $1', [req.params.id]);
    if (!intakeR.rows.length) return res.status(404).json({ error: 'Kirim topilmadi' });
    if (intakeR.rows[0].status !== 'PENDING') {
      return res.status(400).json({ error: 'Bu kirim allaqachon ko\'rib chiqilgan' });
    }

    const items = (await query('SELECT * FROM intake_items WHERE intake_id = $1', [req.params.id])).rows;

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Har bir mahsulot omboriga qo'shamiz (umumiy + rang bo'yicha)
      for (const it of items) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [it.quantity, it.product_id]
        );
        await addColorStock(client.query, it.product_id, it.rang, it.quantity);
      }
      await client.query(
        `UPDATE product_intakes SET status='APPROVED', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [req.user.id, req.params.id]
      );
      await client.query('COMMIT');
      logAudit(req, {
        action: 'INTAKE_APPROVE', table: 'product_intakes', recordId: req.params.id,
        newValues: { items_added: items.length, total_qty: items.reduce((s, i) => s + i.quantity, 0) },
      });
      res.json({ message: `Kirim tasdiqlandi — ${items.length} ta mahsulot omborga qo'shildi` });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/intakes/:id/reject — rad etish
router.put('/:id/reject', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    // Holatni avval tekshiramiz (RETURNING faqat id bo'yicha qaytadi — WHERE status shartiga tayanmaymiz)
    const cur = await query('SELECT status FROM product_intakes WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Kirim topilmadi' });
    if (cur.rows[0].status !== 'PENDING') return res.status(400).json({ error: 'Kirim allaqachon ko\'rib chiqilgan' });
    await query(
      `UPDATE product_intakes SET status='REJECTED', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    logAudit(req, { action: 'INTAKE_REJECT', table: 'product_intakes', recordId: req.params.id });
    res.json({ message: 'Kirim rad etildi' });
  } catch (err) { next(err); }
});

// ===== PRODUCTION INTAKE (STANOKCHI/DETALCHI OUTPUT) =====

// GET /api/intakes/production/pending — KIRIMCHI uchun pending production
router.get('/production/pending', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ep.*, e.name as employee_name, e.type as employee_type,
             p.name as product_name, p.stanokchi_rate, p.detalchi_rate,
             CASE
               WHEN e.type = 'STANOKCHI' THEN ep.quantity_produced * p.stanokchi_rate
               WHEN e.type = 'DETALCHI' THEN ep.quantity_produced * p.detalchi_rate
               ELSE 0
             END as calculated_salary
      FROM employee_production ep
      JOIN employees e ON ep.employee_id = e.id
      LEFT JOIN products p ON ep.product_id = p.id
      WHERE ep.recorded_by IS NULL
      ORDER BY ep.production_date DESC
    `);
    res.json({ pending_production: result.rows });
  } catch (err) { next(err); }
});

// POST /api/intakes/production/record — KIRIMCHI qayd qiladi (single)
router.post('/production/record', requireRole('OWNER', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const { production_id, notes } = req.body;
    if (!production_id) return res.status(400).json({ error: 'Production ID kerak' });

    const result = await query(
      `UPDATE employee_production
       SET recorded_by=$1, recorded_at=NOW(), kirimchi_notes=$2, updated_at=NOW()
       WHERE id=$3 AND recorded_by IS NULL
       RETURNING *`,
      [req.user.id, notes || null, production_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Production topilmadi yoki allaqachon qayd qilingan' });
    }

    logAudit(req, {
      action: 'PRODUCTION_RECORDED', table: 'employee_production', recordId: production_id,
      newValues: { recorded_by: req.user.id, kirimchi_notes: notes },
    });

    res.json({ message: 'Production qayd qilindi', production: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/intakes/production/record-bulk — KIRIMCHI ko'p production qayd qiladi
router.post('/production/record-bulk', requireRole('OWNER', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const { production_ids, notes } = req.body;
    if (!Array.isArray(production_ids) || !production_ids.length) {
      return res.status(400).json({ error: 'Production IDs kerak' });
    }

    const client = await require('../db').getClient();
    const recorded = [];

    try {
      await client.query('BEGIN');

      for (const prod_id of production_ids) {
        const result = await client.query(
          `UPDATE employee_production
           SET recorded_by=$1, recorded_at=NOW(), kirimchi_notes=$2, updated_at=NOW()
           WHERE id=$3 AND recorded_by IS NULL
           RETURNING *`,
          [req.user.id, notes || null, prod_id]
        );
        if (result.rows.length) {
          recorded.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');

      logAudit(req, {
        action: 'PRODUCTION_RECORDED_BULK', table: 'employee_production',
        recordId: recorded.map(r => r.id).join(','),
        newValues: { count: recorded.length },
      });

      res.json({ message: `${recorded.length} ta production qayd qilindi`, count: recorded.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/intakes/production/recorded — KIRIMCHI qayd qilgan production
router.get('/production/recorded', async (req, res, next) => {
  try {
    const { date, employee_id } = req.query;
    let sql = `
      SELECT ep.*, e.name as employee_name, e.type as employee_type,
             p.name as product_name, u.full_name as recorded_by_name
      FROM employee_production ep
      JOIN employees e ON ep.employee_id = e.id
      LEFT JOIN products p ON ep.product_id = p.id
      LEFT JOIN users u ON ep.recorded_by = u.id
      WHERE ep.recorded_by IS NOT NULL
    `;
    const params = [];
    let idx = 1;

    if (date) { sql += ` AND ep.production_date = $${idx++}`; params.push(date); }
    if (employee_id) { sql += ` AND ep.employee_id = $${idx++}`; params.push(employee_id); }

    sql += ' ORDER BY ep.production_date DESC';
    const result = await query(sql, params);
    res.json({ recorded_production: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
