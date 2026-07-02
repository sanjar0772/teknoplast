const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const ledger = require('../services/rawMaterialLedger');

const router = express.Router();
router.use(authenticate);

// GET /api/expenses
router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, category, page = 1, limit = 20 } = req.query;
    let sql = `
      SELECT e.*, u.full_name as created_by_name
      FROM expenses e JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (start_date) { sql += ` AND e.expense_date >= $${idx++}`; params.push(start_date); }
    if (end_date)   { sql += ` AND e.expense_date <= $${idx++}`; params.push(end_date); }
    if (category)   { sql += ` AND e.category = $${idx++}`; params.push(category); }
    // FILIAL AJRATISH: filial faqat o'z xarajatlari; zavod faqat zavodnikini
    if (req.user.branch_id) { sql += ` AND e.branch_id = $${idx++}`; params.push(req.user.branch_id); }
    else { sql += ` AND e.branch_id IS NULL`; }

    const countResult = await query(`SELECT COUNT(*) as count FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0]?.count ?? countResult.rows[0]?.['COUNT(*)'] ?? 0);

    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);
    res.json({ expenses: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/expenses/summary
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);
    // FILIAL AJRATISH: filial faqat o'z xarajatlari; zavod faqat zavodnikini
    const bScope = req.user.branch_id ? ' AND branch_id = $2' : ' AND branch_id IS NULL';
    const bParams = req.user.branch_id ? [period, req.user.branch_id] : [period];

    const total = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1${bScope}
    `, bParams);

    const byCategory = await query(`
      SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1${bScope}
      GROUP BY category ORDER BY total DESC
    `, bParams);

    const byDay = await query(`
      SELECT TO_CHAR(expense_date, 'YYYY-MM-DD') as day, SUM(amount) as total
      FROM expenses
      WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1${bScope}
      GROUP BY expense_date ORDER BY expense_date
    `, bParams);

    res.json({
      total: total.rows[0].total,
      by_category: byCategory.rows,
      by_day: byDay.rows,
    });
  } catch (err) { next(err); }
});

// POST /api/expenses (TAMINOTCHI faqat RAW_MATERIAL, ACCOUNTANT/OWNER barcha)
router.post('/', requireRole('OWNER', 'ACCOUNTANT', 'TAMINOTCHI'), [
  body('category').isIn(['RAW_MATERIAL', 'ENERGY', 'MAINTENANCE', 'SALARY', 'TRANSPORT', 'OTHER']),
  body('amount').isFloat({ min: 0.01 }),
  body('description').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category, amount, description, expense_date, raw_material_id, quantity } = req.body;

    // TAMINOTCHI faqat RAW_MATERIAL expenses qo'shishi mumkin
    if (req.user.role === 'TAMINOTCHI' && category !== 'RAW_MATERIAL') {
      return res.status(403).json({ error: 'TAMINOTCHI faqat RAW_MATERIAL expenses qo\'shishi mumkin' });
    }

    const result = await query(
      'INSERT INTO expenses (category, amount, description, expense_date, created_by, raw_material_id, quantity, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [category, amount, description, expense_date || new Date(), req.user.id, raw_material_id || null, quantity || null, req.user.branch_id || null]
    );

    // Xom ashyo sarfi qayd etilgan bo'lsa — ombor balansidan kamaytiramiz (Qoldiq hisoboti uchun)
    if (raw_material_id && quantity) {
      await query(
        'UPDATE raw_materials SET stock_balance = GREATEST(0, stock_balance - $1), last_used_date=NOW(), updated_at=NOW() WHERE id=$2',
        [quantity, raw_material_id]
      );

      // Aylma daftariga SARF (chiqim) yozamiz — Sarf miqdor/summa va Yakuniy qoldiq uchun
      try {
        const rm = await query('SELECT name, unit, supplier_name FROM raw_materials WHERE id=$1', [raw_material_id]);
        const m = rm.rows[0] || {};
        await ledger.recordMovement(query, {
          raw_material_id, material_name: m.name, unit: m.unit,
          type: 'SARF', qty: quantity, total_cost: amount,
          unit_cost: quantity ? (amount / quantity) : 0,
          supplier_name: m.supplier_name || null, note: description || 'Xom ashyo sarfi',
          moved_at: (expense_date && String(expense_date).slice(0, 10)) || undefined,
          created_by: req.user.id,
        });
      } catch (e) { console.error('Ledger SARF xato:', e.message); }
    }

    res.status(201).json({ expense: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/expenses/:id
router.put('/:id', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { category, amount, description, expense_date } = req.body;
    const result = await query(
      'UPDATE expenses SET category=$1, amount=$2, description=$3, expense_date=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [category, amount, description, expense_date, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Xarajat topilmadi' });
    res.json({ expense: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireRole('OWNER', 'ACCOUNTANT', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const existing = await query('SELECT raw_material_id, quantity FROM expenses WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Xarajat topilmadi' });

    const result = await query('DELETE FROM expenses WHERE id=$1 RETURNING id', [req.params.id]);

    // O'chirilgan xarajat xom ashyo sarfi bo'lsa — ombor balansini qaytaramiz
    const { raw_material_id, quantity } = existing.rows[0];
    if (raw_material_id && quantity) {
      await query(
        'UPDATE raw_materials SET stock_balance = stock_balance + $1, updated_at=NOW() WHERE id=$2',
        [quantity, raw_material_id]
      );

      // Daftarda sarfni bekor qilamiz (KOREKSIYA +quantity) — qoldiq qaytadi
      try {
        const rm = await query('SELECT name, unit, supplier_name FROM raw_materials WHERE id=$1', [raw_material_id]);
        const m = rm.rows[0] || {};
        await ledger.recordMovement(query, {
          raw_material_id, material_name: m.name, unit: m.unit,
          type: 'KOREKSIYA', qty: parseFloat(quantity) || 0,
          supplier_name: m.supplier_name || null, note: "Sarf bekor qilindi (xarajat o'chirildi)",
          created_by: req.user.id,
        });
      } catch (e) { console.error('Ledger sarf bekor xato:', e.message); }
    }

    res.json({ message: 'Xarajat o\'chirildi' });
  } catch (err) { next(err); }
});

module.exports = router;
