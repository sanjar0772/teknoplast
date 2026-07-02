const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const reportService = require('../services/reportService');

const router = express.Router();
router.use(authenticate);

// GET /api/fulfillment — yetkazilishi kutilayotgan buyurtmalar (order_ref bo'yicha guruh)
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query; // PENDING (default) yoki DELIVERED yoki all
    const params = [];
    let cond = "s.order_ref IS NOT NULL";
    if (status === 'DELIVERED') cond += " AND s.fulfillment_status='DELIVERED'";
    else if (status !== 'all') cond += " AND s.fulfillment_status='PENDING'";
    // FILIAL AJRATISH: filial faqat o'z buyurtmalarini; zavod faqat zavodnikini
    if (req.user.branch_id) { cond += ` AND s.branch_id = $${params.length + 1}`; params.push(req.user.branch_id); }
    else { cond += ` AND s.branch_id IS NULL`; }

    const result = await query(`
      SELECT s.order_ref,
             MAX(s.sale_date) as sale_date,
             MAX(s.customer_name) as customer_name,
             MAX(s.customer_phone) as customer_phone,
             MAX(s.fulfillment_status) as fulfillment_status,
             COUNT(*) as item_count,
             SUM(s.quantity) as total_qty,
             SUM(s.total_amount) as total,
             MAX(s.created_at) as created_at
      FROM sales s
      WHERE ${cond}
      GROUP BY s.order_ref
      ORDER BY created_at DESC
    `, params);
    res.json({ orders: result.rows });
  } catch (err) { next(err); }
});

// GET /api/fulfillment/:ref — buyurtma tafsiloti (omborchi nimani berishini ko'radi)
router.get('/:ref', async (req, res, next) => {
  try {
    const items = await query(`
      SELECT s.id, s.quantity, s.unit_price, s.total_amount, s.fulfillment_status,
             s.customer_name, s.customer_phone, s.sale_date, s.order_ref,
             p.name as product_name, p.razmer, p.rang, p.unit
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE s.order_ref = $1
      ORDER BY s.created_at, s.rowid`, [req.params.ref]);
    if (!items.rows.length) return res.status(404).json({ error: 'Buyurtma topilmadi' });

    const first = items.rows[0];
    res.json({
      order_ref: req.params.ref,
      customer_name: first.customer_name,
      customer_phone: first.customer_phone,
      sale_date: first.sale_date,
      fulfillment_status: first.fulfillment_status,
      items: items.rows,
      total: items.rows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0),
    });
  } catch (err) { next(err); }
});

// PUT /api/fulfillment/:ref/deliver — omborchi mahsulotlarni berdi
router.put('/:ref/deliver', requireRole('OWNER', 'OMBORCHI'), async (req, res, next) => {
  try {
    const check = await query("SELECT COUNT(*) as c FROM sales WHERE order_ref=$1 AND fulfillment_status='PENDING'", [req.params.ref]);
    if (parseInt(check.rows[0].c) === 0) {
      return res.status(400).json({ error: 'Buyurtma topilmadi yoki allaqachon berilgan' });
    }
    await query(
      `UPDATE sales SET fulfillment_status='DELIVERED', fulfilled_by=$1, fulfilled_at=NOW()
       WHERE order_ref=$2 AND fulfillment_status='PENDING'`,
      [req.user.id, req.params.ref]
    );
    logAudit(req, { action: 'ORDER_DELIVERED', table: 'sales', recordId: req.params.ref });
    res.json({ message: 'Buyurtma berildi (yetkazildi)' });
  } catch (err) { next(err); }
});

// GET /api/fulfillment/:ref/nakladnoy — nakladnoy PDF (QR bilan)
router.get('/:ref/nakladnoy', async (req, res, next) => {
  try {
    const items = (await query(`
      SELECT s.quantity, s.total_amount, s.customer_name, s.customer_phone, s.sale_date, s.order_ref,
             p.name as product_name, p.razmer, p.rang, p.unit
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE s.order_ref = $1 ORDER BY s.created_at, s.rowid`, [req.params.ref])).rows;
    if (!items.length) return res.status(404).json({ error: 'Buyurtma topilmadi' });

    const order = {
      order_ref: req.params.ref,
      customer_name: items[0].customer_name,
      customer_phone: items[0].customer_phone,
      sale_date: items[0].sale_date,
      items,
    };
    const pdf = await reportService.generateWaybillPDF(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nakladnoy-${req.params.ref}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// Berilgan buyurtmalarni davr bo'yicha olish (Excel/PDF eksport uchun umumiy)
async function fetchDeliveredRange(start_date, end_date, branchId) {
  const params = [];
  let where = "s.order_ref IS NOT NULL AND s.fulfillment_status='DELIVERED'";
  let idx = 1;
  if (start_date) { where += ` AND DATE(COALESCE(s.fulfilled_at, s.sale_date)) >= $${idx++}`; params.push(start_date); }
  if (end_date)   { where += ` AND DATE(COALESCE(s.fulfilled_at, s.sale_date)) <= $${idx++}`; params.push(end_date); }
  // FILIAL AJRATISH: filial faqat o'z berilgan buyurtmalari; zavod faqat zavodnikini
  if (branchId) { where += ` AND s.branch_id = $${idx++}`; params.push(branchId); }
  else { where += ` AND s.branch_id IS NULL`; }

  const result = await query(`
    SELECT s.order_ref,
           MAX(s.sale_date) as sale_date,
           MAX(s.customer_name) as customer_name,
           MAX(s.customer_phone) as customer_phone,
           MAX(s.fulfilled_at) as fulfilled_at,
           COUNT(*) as item_count,
           SUM(s.quantity) as total_qty,
           SUM(s.total_amount) as total
    FROM sales s
    WHERE ${where}
    GROUP BY s.order_ref
    ORDER BY fulfilled_at DESC, sale_date DESC
  `, params);
  return result.rows;
}

// GET /api/fulfillment/export/excel?start_date=&end_date= — berilgan buyurtmalar Excel
router.get('/export/excel', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const rows = await fetchDeliveredRange(start_date, end_date, req.user.branch_id || null);
    const buf = await reportService.generateFulfillmentExcel({ rows, start_date, end_date });
    const label = start_date && end_date ? `${start_date}_${end_date}` : (start_date || end_date || 'barcha');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ombor-berish-${label}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (err) { next(err); }
});

// GET /api/fulfillment/export/pdf?start_date=&end_date= — berilgan buyurtmalar PDF
router.get('/export/pdf', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const rows = await fetchDeliveredRange(start_date, end_date, req.user.branch_id || null);
    const pdf = await reportService.generateFulfillmentPDF({ rows, start_date, end_date });
    const label = start_date && end_date ? `${start_date}_${end_date}` : (start_date || end_date || 'barcha');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ombor-berish-${label}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

module.exports = router;
