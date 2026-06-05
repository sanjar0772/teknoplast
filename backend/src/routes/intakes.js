const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

// GET /api/intakes — kirimlar ro'yxati (status bo'yicha filtr)
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT i.*, u.full_name as created_by_name, a.full_name as approved_by_name,
             (SELECT COUNT(*) FROM intake_items WHERE intake_id = i.id) as item_count,
             (SELECT COALESCE(SUM(quantity),0) FROM intake_items WHERE intake_id = i.id) as total_qty
      FROM product_intakes i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users a ON i.approved_by = a.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND i.status = $1`; params.push(status); }
    sql += ' ORDER BY i.created_at DESC';
    const result = await query(sql, params);
    res.json({ intakes: result.rows });
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
      SELECT it.*, p.name as product_name, p.razmer, p.rang, p.unit, p.stock_quantity
      FROM intake_items it JOIN products p ON it.product_id = p.id
      WHERE it.intake_id = $1`, [req.params.id]);

    res.json({ intake: intake.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// POST /api/intakes — yangi kirim (KIRIMCHI yoki OWNER)
router.post('/', requireRole('OWNER', 'KIRIMCHI', 'PRODUCTION_HEAD'), async (req, res, next) => {
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
      const intakeR = await client.query(
        `INSERT INTO product_intakes (status, notes, created_by) VALUES ('PENDING', $1, $2) RETURNING *`,
        [notes || null, req.user.id]
      );
      const intake = intakeR.rows[0];
      for (const it of items) {
        await client.query(
          `INSERT INTO intake_items (intake_id, product_id, quantity) VALUES ($1, $2, $3)`,
          [intake.id, it.product_id, parseInt(it.quantity)]
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
      // Har bir mahsulot omboriga qo'shamiz
      for (const it of items) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [it.quantity, it.product_id]
        );
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
    const result = await query(
      `UPDATE product_intakes SET status='REJECTED', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND status='PENDING' RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Kirim topilmadi yoki allaqachon ko\'rib chiqilgan' });
    logAudit(req, { action: 'INTAKE_REJECT', table: 'product_intakes', recordId: req.params.id });
    res.json({ message: 'Kirim rad etildi' });
  } catch (err) { next(err); }
});

module.exports = router;
