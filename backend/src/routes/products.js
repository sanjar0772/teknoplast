const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

// base_name + razmer + rang dan to'liq nomni qayta tiklash
// Masalan: base="Flakon (Premium)", razmer="100ml", rang="oq" => "Flakon 100ml oq (Premium)"
function rebuildName(base_name, razmer, rang) {
  const m = (base_name || '').match(/^(.*?)\s*(\([^)]*\))?\s*$/);
  const type = m ? m[1].trim() : (base_name || '');
  const brand = m && m[2] ? ' ' + m[2] : '';
  return `${type}${razmer ? ' ' + razmer : ''}${rang ? ' ' + rang : ''}${brand}`.trim();
}

// GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const { is_active = 'true', search, type } = req.query;
    let sql = `
      SELECT p.*, rm.name as raw_material_name, rm.stock_balance as rm_stock
      FROM products p LEFT JOIN raw_materials rm ON p.raw_material_id = rm.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (is_active !== 'all') { sql += ` AND p.is_active = $${idx++}`; params.push(is_active === 'true'); }
    if (search) { sql += ` AND p.name ILIKE $${idx++}`; params.push(`%${search}%`); }
    if (type)   { sql += ` AND p.type = $${idx++}`; params.push(type); }
    sql += ' ORDER BY p.name';
    const result = await query(sql, params);
    res.json({ products: result.rows });
  } catch (err) { next(err); }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, rm.name as raw_material_name, rm.stock_balance, rm.unit as rm_unit
      FROM products p LEFT JOIN raw_materials rm ON p.raw_material_id = rm.id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });

    const sales = await query(`
      SELECT TO_CHAR(sale_date, 'YYYY-MM') as month, SUM(quantity) as qty, SUM(total_amount) as revenue
      FROM sales WHERE product_id = $1
      GROUP BY TO_CHAR(sale_date, 'YYYY-MM') ORDER BY month DESC LIMIT 6
    `, [req.params.id]);

    res.json({ product: result.rows[0], sales_history: sales.rows });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD'), [
  body('name').notEmpty().trim(),
  body('price').isFloat({ min: 0 }),
  body('type').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, type, description, price, daily_production, stock_quantity, raw_material_id, unit } = req.body;
    const result = await query(
      'INSERT INTO products (name, type, description, price, daily_production, stock_quantity, raw_material_id, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, type, description, price, daily_production || 0, stock_quantity || 0, raw_material_id || null, unit || 'dona']
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/products/bulk — MUHIM: /:id dan oldin bo'lishi kerak (Express route tartibi)
router.put('/bulk', requireRole('OWNER', 'PRODUCTION_HEAD', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({ error: 'Yangilanishlar bo\'sh' });
    }
    // Ruxsat etilgan maydonlar (XSS / SQL injectiondan himoya)
    const allowed = ['name', 'base_name', 'razmer', 'rang', 'type', 'description', 'price', 'daily_production', 'stock_quantity', 'unit', 'is_active'];
    const client = await require('../db').getClient();
    const updated = [];
    try {
      await client.query('BEGIN');
      for (const u of updates) {
        if (!u.id) continue;
        const fields = [];
        const values = [];
        let idx = 1;
        for (const k of Object.keys(u)) {
          if (k === 'id' || !allowed.includes(k)) continue;
          fields.push(`${k}=$${idx++}`);
          values.push(u[k]);
        }
        if (!fields.length) continue;
        fields.push(`updated_at=NOW()`);
        values.push(u.id);
        await client.query(
          `UPDATE products SET ${fields.join(', ')} WHERE id=$${idx}`,
          values
        );
        // UPDATE muvaffaqiyatli — yangilangan qatorni qayta o'qiymiz
        const r = await client.query('SELECT * FROM products WHERE id = $1', [u.id]);
        if (r.rows.length) {
          const row = r.rows[0];
          // Agar nom tarkibi (base_name/razmer/rang) o'zgargan bo'lsa — to'liq `name`ni qayta tiklaymiz
          if ('base_name' in u || 'razmer' in u || 'rang' in u) {
            const rebuilt = rebuildName(row.base_name, row.razmer, row.rang);
            if (rebuilt && rebuilt !== row.name) {
              await client.query('UPDATE products SET name=$1 WHERE id=$2', [rebuilt, row.id]);
              row.name = rebuilt;
            }
          }
          updated.push(row);
        }
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCT_BULK_UPDATE', table: 'products',
        recordId: updated.map(p => p.id).join(','),
        newValues: { count: updated.length, changes: updates },
      });
      res.json({ updated, count: updated.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// DELETE /api/products/bulk — bir nechta mahsulotni o'chirish/nofaol qilish
router.post('/bulk-delete', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'IDlar bo\'sh' });
    let deactivated = 0;
    for (const id of ids) {
      // Sotuvi bormi tekshirish — bo'lsa faqat nofaol qilamiz
      const sales = await query('SELECT COUNT(*) as count FROM sales WHERE product_id=$1', [id]);
      if (parseInt(sales.rows[0].count) > 0) {
        await query('UPDATE products SET is_active=0, updated_at=NOW() WHERE id=$1', [id]);
      } else {
        await query('DELETE FROM products WHERE id=$1', [id]);
      }
      deactivated++;
    }
    res.json({ count: deactivated });
  } catch (err) { next(err); }
});

// PUT /api/products/:id — yagona mahsulotni yangilash
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, is_active } = req.body;
    const result = await query(
      'UPDATE products SET name=$1,type=$2,description=$3,price=$4,daily_production=$5,stock_quantity=$6,raw_material_id=$7,unit=$8,is_active=$9,updated_at=NOW() WHERE id=$10 RETURNING *',
      [name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, is_active, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    res.json({ product: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/products/:id/stock — Ombor yangilash
router.put('/:id/stock', requireRole('OWNER', 'PRODUCTION_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { quantity, operation } = req.body;
    if (!['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({ error: 'Operation: add, subtract, yoki set' });
    }
    let sql;
    if (operation === 'add')      sql = 'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at=NOW() WHERE id=$2 RETURNING *';
    if (operation === 'subtract') sql = 'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2 RETURNING *';
    if (operation === 'set')      sql = 'UPDATE products SET stock_quantity = $1, updated_at=NOW() WHERE id=$2 RETURNING *';

    const result = await query(sql, [quantity, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    res.json({ product: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/products/:id/pricing — Stanok, Detalchi narhi belgilash (bugalter/OWNER)
router.put('/:id/pricing', requireRole('OWNER', 'ACCOUNTANT', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { stanokchi_rate, stanokchi_semi_rate, detalchi_rate, cost_price } = req.body;
    const result = await query(
      'UPDATE products SET stanokchi_rate=$1, stanokchi_semi_rate=$2, detalchi_rate=$3, cost_price=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [stanokchi_rate || 0, stanokchi_semi_rate || 0, detalchi_rate || 0, cost_price || 0, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    logAudit(req, {
      action: 'PRODUCT_PRICING_UPDATE', table: 'products', recordId: req.params.id,
      newValues: { stanokchi_rate, stanokchi_semi_rate, detalchi_rate, cost_price },
    });
    res.json({ product: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/products/raw-materials/list (TAMINOTCHI xom ashyo ro'yxatini ko'radi)
router.get('/raw-materials/list', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM raw_materials WHERE is_active = true ORDER BY name'
    );
    res.json({ raw_materials: result.rows });
  } catch (err) { next(err); }
});

// GET /api/products/raw-materials/intake-history (TAMINOTCHI kiritgan xom ashyo va harajatlar)
router.get('/raw-materials/intake-history', async (req, res, next) => {
  try {
    const { month, supplier_name } = req.query;
    let sql = `
      SELECT rm.*, COUNT(e.id) as expense_count, COALESCE(SUM(e.amount), 0) as total_cost,
             MAX(e.created_at) as last_expense_date
      FROM raw_materials rm
      LEFT JOIN expenses e ON e.category='RAW_MATERIAL' AND e.description LIKE CONCAT('%', rm.name, '%')
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (month) {
      sql += ` AND TO_CHAR(e.expense_date, 'YYYY-MM') = $${idx++}`;
      params.push(month);
    }
    if (supplier_name) {
      sql += ` AND rm.supplier_name ILIKE $${idx++}`;
      params.push(`%${supplier_name}%`);
    }

    sql += ' GROUP BY rm.id ORDER BY rm.received_date DESC';
    const result = await query(sql, params);
    res.json({ intake_history: result.rows });
  } catch (err) { next(err); }
});

// POST /api/products/raw-materials — xom ashyo qo'shish faqat Ta'minotchi vazifasi
// (PRODUCTION_HEAD bu yerdan olib tashlandi — xom ashyo bilan faqat TAMINOTCHI shug'ullanadi)
router.post('/raw-materials', requireRole('OWNER', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const { name, quantity, unit, price_per_unit, received_date, supplier_name, min_stock_level, create_expense } = req.body;

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');

      // Xom ashyo qo'shish
      const materialResult = await client.query(
        'INSERT INTO raw_materials (name, quantity, unit, price_per_unit, received_date, stock_balance, supplier_name, min_stock_level) VALUES ($1,$2,$3,$4,$5,$2,$6,$7) RETURNING *',
        [name, quantity, unit || 'kg', price_per_unit || 0, received_date || new Date(), supplier_name, min_stock_level || 0]
      );
      const raw_material = materialResult.rows[0];

      let expense = null;

      // Agar price_per_unit va create_expense=true bo'lsa, expense yaratamiz
      if (create_expense && price_per_unit && quantity) {
        const total_cost = quantity * price_per_unit;
        const description = `${name} - ${quantity} ${unit || 'kg'} (Supplier: ${supplier_name || 'N/A'})`;

        const expenseResult = await client.query(
          'INSERT INTO expenses (category, amount, description, expense_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          ['RAW_MATERIAL', total_cost, description, received_date || new Date(), req.user.id]
        );
        expense = expenseResult.rows[0];
      }

      await client.query('COMMIT');
      logAudit(req, {
        action: 'RAW_MATERIAL_ADDED', table: 'raw_materials', recordId: raw_material.id,
        newValues: { name, quantity, unit, price_per_unit, supplier_name, expense_created: !!expense },
      });

      res.status(201).json({ raw_material, expense });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/products/raw-materials/:id/stock — ombor balansini yangilash, faqat Ta'minotchi vazifasi
router.put('/raw-materials/:id/stock', requireRole('OWNER', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const { quantity, operation } = req.body;
    let sql;
    if (operation === 'add')      sql = 'UPDATE raw_materials SET stock_balance = stock_balance + $1, updated_at=NOW() WHERE id=$2 RETURNING *';
    if (operation === 'subtract') sql = 'UPDATE raw_materials SET stock_balance = GREATEST(0, stock_balance - $1), last_used_date=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *';
    if (operation === 'set')      sql = 'UPDATE raw_materials SET stock_balance = $1, updated_at=NOW() WHERE id=$2 RETURNING *';

    if (!sql) return res.status(400).json({ error: 'Noto\'g\'ri operation' });
    const result = await query(sql, [quantity, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Xom ashyo topilmadi' });
    res.json({ raw_material: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
