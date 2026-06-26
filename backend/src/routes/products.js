const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const ledger = require('../services/rawMaterialLedger');
const { addColorStock, getColorStock } = require('../utils/colorStock');

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
    const { is_active = 'true', search, type, start_date, end_date, date_from, date_to } = req.query;
    let sql = `
      SELECT p.*, rm.name as raw_material_name, rm.stock_balance as rm_stock
      FROM products p LEFT JOIN raw_materials rm ON p.raw_material_id = rm.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (is_active !== 'all') { sql += ` AND p.is_active = $${idx++}`; params.push(is_active === 'true'); }
    if (search)    { sql += ` AND p.name ILIKE $${idx++}`; params.push(`%${search}%`); }
    if (type)      { sql += ` AND p.type = $${idx++}`; params.push(type); }
    if (date_from) { sql += ` AND DATE(p.created_at) >= $${idx++}`; params.push(date_from); }
    if (date_to)   { sql += ` AND DATE(p.created_at) <= $${idx++}`; params.push(date_to); }
    sql += ' ORDER BY p.name';
    const result = await query(sql, params);
    // Rang bo'yicha ombor — har bir mahsulotga biriktiramiz
    const cs = await query('SELECT product_id, rang, quantity FROM product_color_stock WHERE quantity > 0', []);
    const byProduct = {};
    for (const row of cs.rows) {
      (byProduct[row.product_id] = byProduct[row.product_id] || []).push({ rang: row.rang || '', quantity: parseFloat(row.quantity) });
    }
    let periodStats = {};
    if (start_date || end_date) {
      let pSql = `SELECT product_id, COALESCE(SUM(quantity), 0) AS sold_qty, COALESCE(SUM(total_amount), 0) AS sold_amount, COUNT(*) AS sold_count FROM sales WHERE 1=1`;
      const pParams = [];
      let pIdx = 1;
      if (start_date) { pSql += ` AND sale_date >= $${pIdx++}`; pParams.push(start_date); }
      if (end_date) { pSql += ` AND sale_date <= $${pIdx++}`; pParams.push(end_date); }
      pSql += ' GROUP BY product_id';
      const pR = await query(pSql, pParams);
      for (const r of pR.rows) {
        periodStats[r.product_id] = { sold_qty: parseInt(r.sold_qty) || 0, sold_amount: parseFloat(r.sold_amount) || 0, sold_count: parseInt(r.sold_count) || 0 };
      }
    }
    const products = result.rows.map(p => ({
      ...p, color_stock: byProduct[p.id] || [],
      ...(start_date || end_date ? { period: periodStats[p.id] || { sold_qty: 0, sold_amount: 0, sold_count: 0 } } : {}),
    }));
    res.json({ products });
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

// GET /api/products/:id/history — mahsulot harakatlari tarixi (kirim + ishlab chiqarish + sotuv)
// ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD — ixtiyoriy sana filtri
router.get('/:id/history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const prod = await query('SELECT id, name, unit, stock_quantity FROM products WHERE id = $1', [id]);
    if (!prod.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });

    let dateFilter = '';
    const dateParams = [id];
    let pIdx = 2;
    if (start_date) { dateFilter += ` AND %DATE% >= $${pIdx++}`; dateParams.push(start_date); }
    if (end_date)   { dateFilter += ` AND %DATE% <= $${pIdx++}`; dateParams.push(end_date); }

    // 1) Sotuvlar — ombordan chiqim
    const salesDateFilter = dateFilter.replace(/%DATE%/g, 'sale_date');
    const sales = await query(`
      SELECT id, quantity, total_amount, customer_name, sale_date, created_at
      FROM sales WHERE product_id = $1${salesDateFilter}
    `, dateParams);

    // 2) Kirimlar — faqat tasdiqlangan (ombor haqiqatan ko'paygan)
    const intakeDateFilter = dateFilter.replace(/%DATE%/g, 'COALESCE(pi.approved_at, pi.created_at)');
    const intakeParams = [id, ...dateParams.slice(1)];
    const intakes = await query(`
      SELECT ii.id, ii.quantity, ii.rang, pi.approved_at, pi.created_at
      FROM intake_items ii
      JOIN product_intakes pi ON ii.intake_id = pi.id
      WHERE ii.product_id = $1 AND pi.status = 'APPROVED'${intakeDateFilter}
    `, intakeParams);

    // 3) Ishlab chiqarish — stanok/detalchidan kelgan tayyor mahsulot
    const prodDateFilter = dateFilter.replace(/%DATE%/g, 'COALESCE(ep.production_date, ep.created_at)');
    const prodParams = [id, ...dateParams.slice(1)];
    const production = await query(`
      SELECT ep.id, ep.quantity_produced, ep.production_date, ep.production_type,
             ep.created_at, e.name AS employee_name
      FROM employee_production ep
      LEFT JOIN employees e ON ep.employee_id = e.id
      WHERE ep.product_id = $1 AND ep.quantity_produced > 0${prodDateFilter}
    `, prodParams);

    const history = [];
    sales.rows.forEach(s => history.push({
      type: 'sotuv',
      date: s.sale_date || s.created_at,
      qty: -Math.abs(parseInt(s.quantity) || 0),
      amount: parseFloat(s.total_amount) || 0,
      detail: s.customer_name || '',
    }));
    intakes.rows.forEach(i => history.push({
      type: 'kirim',
      date: i.approved_at || i.created_at,
      qty: Math.abs(parseInt(i.quantity) || 0),
      detail: i.rang || '',
    }));
    production.rows.forEach(p => history.push({
      type: 'ishlab_chiqarish',
      date: p.production_date || p.created_at,
      qty: Math.abs(parseInt(p.quantity_produced) || 0),
      detail: p.employee_name || '',
    }));

    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ product: prod.rows[0], history });
  } catch (err) { next(err); }
});

// ── Tanlangan mahsulotlar tarixini PDF/Excel qilib chiqarish ──────────────
// Bitta mahsulot harakatlari tarixi (kirim + ishlab chiqarish + sotuv)
async function fetchProductHistory(id, start_date, end_date) {
  const prod = await query('SELECT id, name, unit, stock_quantity FROM products WHERE id = $1', [id]);
  if (!prod.rows.length) return null;

  let dateFilter = '';
  const dateParams = [id];
  let pIdx = 2;
  if (start_date) { dateFilter += ` AND %DATE% >= $${pIdx++}`; dateParams.push(start_date); }
  if (end_date)   { dateFilter += ` AND %DATE% <= $${pIdx++}`; dateParams.push(end_date); }

  const salesDateFilter = dateFilter.replace(/%DATE%/g, 'sale_date');
  const sales = await query(`
    SELECT id, quantity, total_amount, customer_name, sale_date, created_at
    FROM sales WHERE product_id = $1${salesDateFilter}
  `, dateParams);

  const intakeDateFilter = dateFilter.replace(/%DATE%/g, 'COALESCE(pi.approved_at, pi.created_at)');
  const intakeParams = [id, ...dateParams.slice(1)];
  const intakes = await query(`
    SELECT ii.id, ii.quantity, ii.rang, pi.approved_at, pi.created_at
    FROM intake_items ii
    JOIN product_intakes pi ON ii.intake_id = pi.id
    WHERE ii.product_id = $1 AND pi.status = 'APPROVED'${intakeDateFilter}
  `, intakeParams);

  const prodDateFilter = dateFilter.replace(/%DATE%/g, 'COALESCE(ep.production_date, ep.created_at)');
  const prodParams = [id, ...dateParams.slice(1)];
  const production = await query(`
    SELECT ep.id, ep.quantity_produced, ep.production_date, ep.created_at, e.name AS employee_name
    FROM employee_production ep
    LEFT JOIN employees e ON ep.employee_id = e.id
    WHERE ep.product_id = $1 AND ep.quantity_produced > 0${prodDateFilter}
  `, prodParams);

  const history = [];
  sales.rows.forEach(s => history.push({
    type: 'sotuv', date: s.sale_date || s.created_at,
    qty: -Math.abs(parseInt(s.quantity) || 0),
    amount: parseFloat(s.total_amount) || 0, detail: s.customer_name || '',
  }));
  intakes.rows.forEach(i => history.push({
    type: 'kirim', date: i.approved_at || i.created_at,
    qty: Math.abs(parseInt(i.quantity) || 0), amount: 0, detail: i.rang || '',
  }));
  production.rows.forEach(p => history.push({
    type: 'ishlab_chiqarish', date: p.production_date || p.created_at,
    qty: Math.abs(parseInt(p.quantity_produced) || 0), amount: 0, detail: p.employee_name || '',
  }));

  history.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { product: prod.rows[0], history };
}

const HIST_TYPE_LABEL = { kirim: 'Kirim', ishlab_chiqarish: 'Ishlab chiqarish', sotuv: 'Sotuv' };

// Tanlangan mahsulotlar tarixini bitta tekis jadval (rows) qilib yig'amiz
async function buildSelectedProductsHistoryRows(idsParam, start_date, end_date) {
  const ids = String(idsParam || '').split(',').map(s => s.trim()).filter(Boolean);
  const rows = [];
  for (const id of ids) {
    const res = await fetchProductHistory(id, start_date, end_date);
    if (!res) continue;
    res.history.forEach(h => {
      const d = new Date(h.date);
      rows.push({
        product: res.product.name,
        date: isNaN(d.getTime()) ? '' : d.toLocaleDateString('uz-UZ'),
        _ts: isNaN(d.getTime()) ? 0 : d.getTime(),
        type_label: HIST_TYPE_LABEL[h.type] || h.type,
        qty: h.qty,
        amount: h.amount || 0,
        detail: h.detail || '',
      });
    });
  }
  rows.sort((a, b) => String(a.product).localeCompare(String(b.product)) || b._ts - a._ts);
  rows.forEach(r => { delete r._ts; });
  return rows;
}

const PRODUCT_HISTORY_COLUMNS = [
  { header: 'Mahsulot', key: 'product',    w: 24 },
  { header: 'Sana',     key: 'date',       w: 13, align: 'center' },
  { header: 'Harakat',  key: 'type_label', w: 16 },
  { header: 'Miqdor',   key: 'qty',        w: 11, align: 'right', total: true },
  { header: 'Summa',    key: 'amount',     w: 16, align: 'right', money: true, total: true },
  { header: 'Izoh',     key: 'detail',     w: 22 },
];

function historyRangeSubtitle(start_date, end_date) {
  if (start_date && end_date) return `Davr: ${start_date} — ${end_date}`;
  if (start_date) return `Davr: ${start_date} dan`;
  if (end_date) return `Davr: ${end_date} gacha`;
  return 'Davr: Barchasi';
}

// GET /api/products/history/export/excel?ids=&start_date=&end_date=
router.get('/history/export/excel', async (req, res, next) => {
  try {
    const { ids, start_date, end_date } = req.query;
    if (!ids) return res.status(400).json({ error: 'Mahsulot tanlanmagan' });
    const rows = await buildSelectedProductsHistoryRows(ids, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateInventoryExcel({
      title: 'Mahsulot tarixi', columns: PRODUCT_HISTORY_COLUMNS, rows,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mahsulot-tarixi-${start_date || 'boshi'}_${end_date || 'oxiri'}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/products/history/export/pdf?ids=&start_date=&end_date=
router.get('/history/export/pdf', async (req, res, next) => {
  try {
    const { ids, start_date, end_date } = req.query;
    if (!ids) return res.status(400).json({ error: 'Mahsulot tanlanmagan' });
    const rows = await buildSelectedProductsHistoryRows(ids, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateInventoryPDF({
      title: 'Mahsulot tarixi', columns: PRODUCT_HISTORY_COLUMNS, rows,
      subtitle: historyRangeSubtitle(start_date, end_date),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="mahsulot-tarixi-${start_date || 'boshi'}_${end_date || 'oxiri'}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// ── Tovar aylanmasi (ombor) — tanlangan mahsulotlar bo'yicha davr hisoboti ──
// Davr boshidagi qoldiq + KIRIM (kirim + ishlab chiqarish) + CHIQIM (sotuv) + davr oxiridagi qoldiq.
// Qoldiq joriy ombordan (stock_quantity) tiklanadi: oxiri = joriy − davrdan keyingi harakatlar;
// boshi = oxiri − davrdagi harakatlar. Shunda boshi + kirim − chiqim = oxiri (balanslashadi).
const WAREHOUSE_NAME = 'Bosh ombor';
async function computeTurnoverRows(idsParam, start_date, end_date) {
  const ids = String(idsParam || '').split(',').map(s => s.trim()).filter(Boolean);
  const rows = [];
  for (const id of ids) {
    const p = await query('SELECT id, name, stock_quantity, price, cost_price FROM products WHERE id = $1', [id]);
    if (!p.rows.length) continue;
    const prod = p.rows[0];
    const sotuv = parseFloat(prod.price) || 0;
    const kirimNarx = parseFloat(prod.cost_price) || sotuv;
    const stock = parseFloat(prod.stock_quantity) || 0;

    const hist = await fetchProductHistory(id, null, null); // barcha harakatlar
    let kirimQty = 0, chiqimQty = 0, signedAfter = 0, signedPeriod = 0;
    for (const h of (hist ? hist.history : [])) {
      const d = h.date ? String(h.date).slice(0, 10) : '';
      if (!d) continue;
      if (end_date && d > end_date) signedAfter += h.qty;
      const inPeriod = (!start_date || d >= start_date) && (!end_date || d <= end_date);
      if (inPeriod) {
        signedPeriod += h.qty;
        if (h.qty > 0) kirimQty += h.qty; else chiqimQty += -h.qty;
      }
    }
    const closeQty = stock - signedAfter;
    const openQty = closeQty - signedPeriod;
    rows.push({
      product: prod.name,
      kirim_narxi: kirimNarx, sotuv_narxi: sotuv,
      open_qty: openQty, open_sum: openQty * sotuv,
      kirim_qty: kirimQty, kirim_sum: kirimQty * kirimNarx,
      chiqim_qty: chiqimQty, chiqim_sum: chiqimQty * sotuv,
      close_qty: closeQty, close_sum: closeQty * sotuv,
    });
  }
  return rows;
}

// GET /api/products/turnover/excel?ids=&start_date=&end_date=
router.get('/turnover/excel', async (req, res, next) => {
  try {
    const { ids, start_date, end_date } = req.query;
    if (!ids) return res.status(400).json({ error: 'Mahsulot tanlanmagan' });
    const rows = await computeTurnoverRows(ids, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateTurnoverExcel({ rows, start_date, end_date, warehouse: WAREHOUSE_NAME });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tovar-aylanmasi-${start_date || 'boshi'}_${end_date || 'oxiri'}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/products/turnover/pdf?ids=&start_date=&end_date=
router.get('/turnover/pdf', async (req, res, next) => {
  try {
    const { ids, start_date, end_date } = req.query;
    if (!ids) return res.status(400).json({ error: 'Mahsulot tanlanmagan' });
    const rows = await computeTurnoverRows(ids, start_date, end_date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateTurnoverPDF({ rows, start_date, end_date, warehouse: WAREHOUSE_NAME });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="tovar-aylanmasi-${start_date || 'boshi'}_${end_date || 'oxiri'}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), [
  body('name').notEmpty().trim(),
  body('price').isFloat({ min: 0 }),
  body('type').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, rang, kind, created_at } = req.body;
    // Qo'shilgan sana — qo'lda kiritilsa o'sha sana, aks holda bugun
    const createdAt = created_at ? String(created_at).slice(0, 10) : new Date().toISOString();
    const initStock = parseFloat(stock_quantity) || 0;
    const result = await query(
      'INSERT INTO products (name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, rang, kind, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [name, type, description, price, daily_production || 0, initStock, raw_material_id || null, unit || 'dona', rang || null, kind === 'KOMPONENT' ? 'KOMPONENT' : 'TAYYOR', createdAt]
    );
    // Boshlang'ich ombor bo'lsa — mahsulotning O'Z rangi buketiga ham yozamiz
    // (aks holda umumiy qoldiq bor, lekin rang bo'yicha sotib bo'lmaydigan "fantom ombor" hosil bo'ladi)
    if (initStock > 0) {
      try { await addColorStock(query, result.rows[0].id, rang || '', initStock); } catch (e) { /* buket alohida — asosiy yozuv saqlandi */ }
    }
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
    const allowed = ['name', 'base_name', 'razmer', 'rang', 'type', 'description', 'price', 'daily_production', 'stock_quantity', 'unit', 'is_active', 'kind'];
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

// POST /api/products/reset-stock — barcha mahsulotlarning ombor sonini 0 ga tushirish (OWNER only)
router.post('/reset-stock', requireRole('OWNER'), async (req, res, next) => {
  try {
    const c = await query('SELECT COUNT(*) as count FROM products', []);
    const count = parseInt(c.rows[0]?.count ?? c.rows[0]?.['COUNT(*)'] ?? 0);
    await query('UPDATE products SET stock_quantity = 0, updated_at = NOW()', []);
    await query('DELETE FROM product_color_stock', []);
    logAudit(req, { action: 'RESET_ALL_STOCK', table: 'products', recordId: 'ALL', newValues: { stock_quantity: 0 } });
    res.json({ count });
  } catch (err) { next(err); }
});

// POST /api/products/components/reset — barcha KOMPONENTlarni o'chirish (OWNER only)
// Faqat komponentlar o'chadi; ishlab chiqarish/maosh tarixiga tegmaydi.
// Tarixi yo'q komponent butunlay o'chadi, tarixi bori nofaol qilinadi (FK saqlanadi).
router.post('/components/reset', requireRole('OWNER'), async (req, res, next) => {
  try {
    const comps = await query("SELECT id FROM products WHERE kind = 'KOMPONENT'", []);
    const ids = comps.rows.map(r => r.id);
    let deleted = 0, deactivated = 0;
    for (const id of ids) {
      // BOM bog'lanishlari va rang ombori — FK yo'q, xavfsiz tozalanadi
      await query('DELETE FROM product_bom WHERE component_id = $1 OR product_id = $1', [id]);
      await query('DELETE FROM product_color_stock WHERE product_id = $1', [id]);

      // Ishlab chiqarish / kirim / sotuv tarixi bormi? (FK — bo'lsa butunlay o'chmaydi)
      const prod = await query('SELECT COUNT(*) c FROM employee_production WHERE product_id = $1', [id]);
      const intk = await query('SELECT COUNT(*) c FROM intake_items WHERE product_id = $1', [id]);
      const sale = await query('SELECT COUNT(*) c FROM sales WHERE product_id = $1', [id]);
      const hasHistory =
        (parseInt(prod.rows[0].c) || 0) + (parseInt(intk.rows[0].c) || 0) + (parseInt(sale.rows[0].c) || 0) > 0;

      if (hasHistory) {
        await query('UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = $1', [id]);
        deactivated++;
      } else {
        await query('DELETE FROM products WHERE id = $1', [id]);
        deleted++;
      }
    }
    logAudit(req, { action: 'RESET_ALL_COMPONENTS', table: 'products', recordId: 'KOMPONENT', newValues: { deleted, deactivated } });
    res.json({ total: ids.length, deleted, deactivated });
  } catch (err) { next(err); }
});

// POST /api/products/reset-all — barcha mahsulot VA sotuvlarni to'liq o'chirish (OWNER only)
router.post('/reset-all', requireRole('OWNER'), async (req, res, next) => {
  try {
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // 1. To'lovlarni o'chirish
      const pRes = await client.query('DELETE FROM payments');
      // 2. Barcha sotuvlarni o'chirish
      const sRes = await client.query('DELETE FROM sales');
      // 3. Rang bo'yicha ombor
      await client.query('DELETE FROM product_color_stock');
      // 4. Barcha mahsulotlarni o'chirish
      const prRes = await client.query('DELETE FROM products');
      await client.query('COMMIT');
      logAudit(req, { action: 'RESET_ALL_PRODUCTS_AND_SALES', table: 'products', recordId: 'ALL', newValues: {} });
      res.json({
        payments: pRes.rowCount ?? 0,
        sales: sRes.rowCount ?? 0,
        products: prRes.rowCount ?? 0,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/products/import-pricelist — 2026-yil prayslist (214 ta mahsulot) qo'lda yuklash
router.post('/import-pricelist', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { importPricelist2026 } = require('../services/pricelistSeed');
    const result = await importPricelist2026();
    logAudit(req, { action: 'IMPORT_PRICELIST_2026', table: 'products', recordId: 'BULK', newValues: result });
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /api/products/:id — yagona mahsulotni yangilash
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { name, type, description, price, daily_production, stock_quantity, raw_material_id, unit, is_active, rang, created_at } = req.body;
    // Qo'shilgan sana — berilsa yangilanadi, aks holda eskisi qoladi
    const createdAt = created_at ? String(created_at).slice(0, 10) : null;
    const newStock = parseFloat(stock_quantity) || 0;
    const newRang = rang || '';

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'UPDATE products SET name=$1,type=$2,description=$3,price=$4,daily_production=$5,stock_quantity=$6,raw_material_id=$7,unit=$8,is_active=$9,rang=$10,created_at=COALESCE($11, created_at),updated_at=NOW() WHERE id=$12 RETURNING *',
        [name, type, description, price, daily_production, newStock, raw_material_id, unit, is_active, rang || null, createdAt, req.params.id]
      );
      if (!result.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Mahsulot topilmadi' }); }

      // Rang buketini moslaymiz: mahsulotning O'Z rangi buketi = yangi qoldiq − (boshqa rang buketlari).
      // Nom/narx tahririda (qoldiq va boshqa buketlar o'zgarmasa) bu hech narsani buzmaydi.
      const otherR = await client.query(
        "SELECT COALESCE(SUM(quantity),0) AS s FROM product_color_stock WHERE product_id=$1 AND rang <> $2",
        [req.params.id, newRang]
      );
      const otherSum = parseFloat(otherR.rows[0]?.s || 0);
      const target = Math.max(0, newStock - otherSum);
      const curBucket = await getColorStock(client.query, req.params.id, newRang);
      if (target !== curBucket) await addColorStock(client.query, req.params.id, newRang, target - curBucket);

      await client.query('COMMIT');
      res.json({ product: result.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/products/:id/stock — Ombor yangilash
router.put('/:id/stock', requireRole('OWNER', 'PRODUCTION_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { quantity, operation } = req.body;
    if (!['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({ error: 'Operation: add, subtract, yoki set' });
    }
    const qty = parseFloat(quantity) || 0;

    const cur = await query("SELECT stock_quantity, COALESCE(rang,'') AS rang FROM products WHERE id=$1", [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    const oldStock = parseFloat(cur.rows[0].stock_quantity || 0);
    const rang = cur.rows[0].rang || '';

    let newStock;
    if (operation === 'add')      newStock = oldStock + qty;
    else if (operation === 'subtract') newStock = Math.max(0, oldStock - qty);
    else                          newStock = qty; // set
    const delta = newStock - oldStock; // shu o'zgarishni rang buketiga ham qo'llaymiz

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [newStock, req.params.id]
      );
      // Umumiy qoldiq o'zgarishini mahsulotning O'Z rangi buketiga ko'chiramiz —
      // shunda savdo oynasidagi rang qoldig'i umumiy qoldiq bilan mos bo'ladi.
      if (delta !== 0) await addColorStock(client.query, req.params.id, rang, delta);
      await client.query('COMMIT');
      res.json({ product: result.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

// Tanlangan davr uchun Boshlang'ich/Kirim/Sarf/Yakuniy qoldiqni
// xom ashyo aylma daftaridan (movement ledger) hisoblaydi.
// Daftar bo'sh/xato bo'lsa — joriy snapshot'ga (fallback) tushadi, hech qachon 500 bermaydi.
async function getRawMaterialRangeSummary(start_date, end_date) {
  try {
    await ledger.ensureLedger();
    const rows = await ledger.getLedgerRangeSummary(start_date, end_date);
    if (rows && rows.length) return rows;
  } catch (e) {
    console.error('Ledger summary xato, fallback ishlatiladi:', e.message);
  }

  // FALLBACK: daftar yo'q yoki bo'sh — joriy xom ashyo qoldig'idan oddiy ko'rinish.
  const snap = await query(`
    SELECT name, unit, COALESCE(SUM(stock_balance), 0) AS closing
    FROM raw_materials WHERE is_active = true
    GROUP BY name, unit ORDER BY name
  `, []);
  return snap.rows.map(r => ({
    name: r.name, unit: r.unit || 'kg',
    opening: 0, kirim_qty: 0, kirim_cost: 0, sarf_qty: 0, sarf_cost: 0,
    closing: parseFloat(r.closing) || 0,
  }));
}

// GET /api/products/raw-materials/range-summary?start_date=&end_date= — Kirim/Harajat/Qoldiq hisoboti
router.get('/raw-materials/range-summary', requireRole('OWNER', 'ACCOUNTANT', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date va end_date kerak' });
    const rows = await getRawMaterialRangeSummary(start_date, end_date);
    res.json({ rows, start_date, end_date });
  } catch (err) { next(err); }
});

// GET /api/products/raw-materials/range-summary/excel?start_date=&end_date= — Excel hisobot
router.get('/raw-materials/range-summary/excel', requireRole('OWNER', 'ACCOUNTANT', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date va end_date kerak' });
    const rows = await getRawMaterialRangeSummary(start_date, end_date);

    const reportService = require('../services/reportService');
    const buffer = await reportService.generateRawMaterialRangeExcel(rows, start_date, end_date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hom-ashyo-${start_date}_${end_date}.xlsx"`);
    res.send(Buffer.from(buffer));
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
      // MUHIM: $2 ni stock_balance uchun qayta ishlatmaymiz — SQLite'da $2,$2 → ?,? bo'lib
      // keyingi parametrni (supplier_name) oladi, natijada stock_balance←supplier_name va
      // supplier_name←0 bo'lib qoladi. Shu uchun quantity ni $6 sifatida alohida beramiz.
      const materialResult = await client.query(
        'INSERT INTO raw_materials (name, quantity, unit, price_per_unit, received_date, stock_balance, supplier_name, min_stock_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [name, quantity, unit || 'kg', price_per_unit || 0, received_date || new Date(), quantity, supplier_name || null, min_stock_level || 0]
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

      // Aylma daftariga KIRIM yozamiz (xato bo'lsa ham kirim buzilmaydi)
      try {
        await ledger.recordMovement(client, {
          raw_material_id: raw_material.id, material_name: name, unit: unit || 'kg',
          type: 'KIRIM', qty: quantity, unit_cost: price_per_unit || 0,
          supplier_name: supplier_name || null, note: 'Xom ashyo kirimi',
          moved_at: (received_date && String(received_date).slice(0, 10)) || undefined,
          created_by: req.user.id,
        });
      } catch (e) { console.error('Ledger KIRIM xato:', e.message); }

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

// PUT /api/products/raw-materials/:id — xom ashyo ma'lumotlarini tahrirlash
router.put('/raw-materials/:id', requireRole('OWNER', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const { name, unit, price_per_unit, supplier_name, min_stock_level, stock_balance } = req.body;
    const result = await query(
      `UPDATE raw_materials
       SET name=$1, unit=$2, price_per_unit=$3, supplier_name=$4, min_stock_level=$5,
           stock_balance=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, unit, price_per_unit || 0, supplier_name || null, min_stock_level || 0, stock_balance || 0, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Xom ashyo topilmadi' });
    logAudit(req, {
      action: 'RAW_MATERIAL_UPDATE', table: 'raw_materials', recordId: req.params.id,
      newValues: { name, unit, price_per_unit, supplier_name, min_stock_level, stock_balance },
    });
    res.json({ raw_material: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/products/raw-materials/:id — xom ashyoni o'chirish
router.delete('/raw-materials/:id', requireRole('OWNER', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM raw_materials WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Xom ashyo topilmadi' });

    // Daftar muvozanatini saqlash uchun qolgan qoldiqni nolga tushiramiz (KOREKSIYA -qoldiq)
    try {
      const rm = result.rows[0];
      const bal = parseFloat(rm.stock_balance) || 0;
      if (bal > 0.0000001) {
        await ledger.recordMovement(query, {
          raw_material_id: req.params.id, material_name: rm.name, unit: rm.unit,
          type: 'KOREKSIYA', qty: -bal, unit_cost: rm.price_per_unit || 0,
          supplier_name: rm.supplier_name || null, note: "O'chirildi (qoldiq nolga)",
          created_by: req.user.id,
        });
      }
    } catch (e) { console.error('Ledger delete harakat xato:', e.message); }

    logAudit(req, { action: 'RAW_MATERIAL_DELETE', table: 'raw_materials', recordId: req.params.id });
    res.json({ ok: true });
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

    // Daftar uchun avvalgi qoldiqni o'qiymiz (delta = yangi - eski)
    const before = await query('SELECT stock_balance FROM raw_materials WHERE id=$1', [req.params.id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Xom ashyo topilmadi' });

    const result = await query(sql, [quantity, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Xom ashyo topilmadi' });

    // Aylma daftariga harakat yozamiz (xato bo'lsa ham ombor yangilash buzilmaydi)
    try {
      const after = result.rows[0];
      const delta = (parseFloat(after.stock_balance) || 0) - (parseFloat(before.rows[0].stock_balance) || 0);
      if (Math.abs(delta) > 0.0000001) {
        const type = operation === 'add' ? 'KIRIM' : operation === 'subtract' ? 'SARF' : 'KOREKSIYA';
        await ledger.recordMovement(query, {
          raw_material_id: req.params.id, material_name: after.name, unit: after.unit,
          type, qty: type === 'KOREKSIYA' ? delta : Math.abs(delta),
          unit_cost: after.price_per_unit || 0, supplier_name: after.supplier_name || null,
          note: `Ombor yangilash (${operation})`, created_by: req.user.id,
        });
      }
    } catch (e) { console.error('Ledger stock harakat xato:', e.message); }

    res.json({ raw_material: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/products/colors/set-white — barcha mahsulot omborini 'Оқ' rangga o'tkazadi (OWNER)
// Har mahsulotning mavjud rang bucketlari o'chirilib, stock_quantity bitta 'Оқ' bucketiga joylanadi.
// Shundan keyin mahsulotlar Sotuvda 'Оқ' rangda sotiladi. Boshqa ranglar keyin Kirim orqali qo'shiladi.
router.post('/colors/set-white', requireRole('OWNER'), async (req, res, next) => {
  try {
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      const prods = await client.query('SELECT id, stock_quantity FROM products WHERE is_active = true');
      let updated = 0, totalQty = 0;
      for (const p of prods.rows) {
        await client.query('DELETE FROM product_color_stock WHERE product_id = $1', [p.id]);
        const q = parseFloat(p.stock_quantity) || 0;
        if (q > 0) {
          await client.query(
            'INSERT INTO product_color_stock (product_id, rang, quantity) VALUES ($1, $2, $3)',
            [p.id, 'Оқ', q]
          );
          updated++;
          totalQty += q;
        }
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTS_COLOR_SET_WHITE', table: 'product_color_stock', recordId: 'ALL',
        newValues: { products: prods.rows.length, updated, total_quantity: totalQty },
      });
      res.json({ products: prods.rows.length, updated, total_quantity: totalQty });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/products/:id/bom — tayyor mahsulot tarkibini olish (komponentlar ro'yxati)
router.get('/:id/bom', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT pb.component_id, pb.qty, p.name, p.unit, p.stock_quantity
      FROM product_bom pb
      JOIN products p ON p.id = pb.component_id
      WHERE pb.product_id = $1
      ORDER BY p.name
    `, [req.params.id]);
    res.json({ bom: result.rows });
  } catch (err) { next(err); }
});

// POST /api/products/:id/bom — komponent qo'shish yoki yangilash (upsert)
router.post('/:id/bom', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    const { component_id, qty } = req.body;
    if (!component_id || !qty || parseFloat(qty) <= 0) {
      return res.status(400).json({ error: 'component_id va qty (>0) kerak' });
    }
    const usePostgres = process.env.USE_POSTGRES === 'true';
    if (usePostgres) {
      await query(
        'INSERT INTO product_bom (product_id, component_id, qty) VALUES ($1,$2,$3) ON CONFLICT (product_id, component_id) DO UPDATE SET qty=$3',
        [req.params.id, component_id, parseFloat(qty)]
      );
    } else {
      await query(
        'INSERT OR REPLACE INTO product_bom (product_id, component_id, qty) VALUES ($1,$2,$3)',
        [req.params.id, component_id, parseFloat(qty)]
      );
    }
    const result = await query(`
      SELECT pb.component_id, pb.qty, p.name, p.unit, p.stock_quantity
      FROM product_bom pb JOIN products p ON p.id = pb.component_id
      WHERE pb.product_id = $1 ORDER BY p.name
    `, [req.params.id]);
    res.json({ bom: result.rows });
  } catch (err) { next(err); }
});

// DELETE /api/products/:id/bom/:componentId — komponentni tarkibdan olib tashlash
router.delete('/:id/bom/:componentId', requireRole('OWNER', 'PRODUCTION_HEAD'), async (req, res, next) => {
  try {
    await query(
      'DELETE FROM product_bom WHERE product_id=$1 AND component_id=$2',
      [req.params.id, req.params.componentId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
