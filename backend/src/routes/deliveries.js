/**
 * Dostavka (yetkazib berish) — SHOPIR (haydovchi) uchun.
 * Savdo agenti/sotuvchi "dostavka" belgisi bilan qilgan savdolar (delivery_type='DELIVERY')
 * shu yerga tushadi. Haydovchi mijoz manzili/telefoni/lokatsiyasini ko'rib borib yetkazadi,
 * so'ng "Yetkazildi" deb belgilaydi. Hammasi FILIAL bo'yicha ajratilgan (branch_id).
 *
 * Zakaz = order_ref (bir chek, bir nechta mahsulot). Belgilash order_ref bo'yicha.
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureBranchSchema } = require('../services/branchSchema');

const router = express.Router();
router.use(authenticate);

// Filial scope sharti: filial xodimi → o'z filiali; zavod (branch_id yo'q) → branch_id IS NULL.
// alias — SELECT'da 's.' (JOIN'lar bor), UPDATE'da '' (SQLite UPDATE'да jadval aliasi yo'q).
function scopeClause(req, startIdx, alias = 's.') {
  const branchId = req.user.branch_id || null;
  if (branchId) return { cond: ` AND ${alias}branch_id = $${startIdx}`, params: [branchId], branchId };
  return { cond: ` AND ${alias}branch_id IS NULL`, params: [], branchId: null };
}

// GET /api/deliveries?status=pending|delivered|all — dostavka zakazlari (order_ref bo'yicha jamlangan)
router.get('/', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT', 'SHOPIR', 'AGENT'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    const status = (req.query.status || 'all').toLowerCase();
    const { cond, params } = scopeClause(req, 1);
    const rows = (await query(
      `SELECT s.id, s.order_ref, s.quantity, s.unit_price, s.total_amount, s.rang,
              s.customer_id, s.customer_name, s.customer_phone, s.sale_date, s.created_at,
              COALESCE(s.delivery_status, 'PENDING') AS delivery_status, s.delivered_at,
              p.name AS product_name, p.unit,
              c.address AS customer_address, c.latitude, c.longitude
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.delivery_type = 'DELIVERY'${cond}
       ORDER BY s.created_at DESC
       LIMIT 500`,
      params
    )).rows;

    // order_ref bo'yicha jamlash (bir zakaz = bir karta)
    const map = new Map();
    for (const r of rows) {
      const key = r.order_ref || r.id;
      if (!map.has(key)) {
        map.set(key, {
          order_ref: r.order_ref,
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          customer_address: r.customer_address,
          latitude: r.latitude,
          longitude: r.longitude,
          sale_date: r.sale_date,
          created_at: r.created_at,
          delivery_status: r.delivery_status,
          delivered_at: r.delivered_at,
          total: 0,
          items: [],
        });
      }
      const g = map.get(key);
      g.total += parseFloat(r.total_amount) || 0;
      g.items.push({
        product_name: r.product_name, quantity: r.quantity, unit: r.unit,
        rang: r.rang, unit_price: r.unit_price,
      });
      // Zakaz to'liq yetkazilgan hisoblanadi faqat BARCHA qatorlar DELIVERED bo'lsa
      if (r.delivery_status !== 'DELIVERED') g.delivery_status = 'PENDING';
    }

    let orders = Array.from(map.values());
    if (status === 'pending') orders = orders.filter(o => o.delivery_status !== 'DELIVERED');
    else if (status === 'delivered') orders = orders.filter(o => o.delivery_status === 'DELIVERED');

    res.json({
      orders,
      counts: {
        pending: Array.from(map.values()).filter(o => o.delivery_status !== 'DELIVERED').length,
        delivered: Array.from(map.values()).filter(o => o.delivery_status === 'DELIVERED').length,
      },
    });
  } catch (err) { next(err); }
});

// Zakaz shu filial scope'ida DELIVERY sifatida mavjudmi? (RETURNING'ga tayanmaymiz —
// SQLite adapter UPDATE...RETURNING'да qatorlarni ishonchli qaytarmaydi, shuning uchun
// avval SELECT bilan tekshiramiz, keyin UPDATE.)
async function orderExistsInScope(req, orderRef) {
  const { cond, params } = scopeClause(req, 2, '');
  const r = await query(
    `SELECT id FROM sales WHERE order_ref = $1 AND delivery_type = 'DELIVERY'${cond}`,
    [orderRef, ...params]
  );
  return r.rows.length > 0;
}

// PATCH /api/deliveries/:orderRef/deliver — zakazni "yetkazildi" deb belgilash
router.patch('/:orderRef/deliver', requireRole('OWNER', 'SALES_HEAD', 'SHOPIR'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    // Filial sharti — shopir boshqa filial zakazini belgilay olmaydi
    if (!(await orderExistsInScope(req, req.params.orderRef))) {
      return res.status(404).json({ error: 'Zakaz topilmadi yoki sizning filialingizniki emas' });
    }
    // $1 = delivered_by, $2 = order_ref, $3 = branch_id (agar filial bo'lsa)
    const { cond, params } = scopeClause(req, 3, '');
    await query(
      `UPDATE sales SET delivery_status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1
       WHERE order_ref = $2 AND delivery_type = 'DELIVERY'${cond}`,
      [req.user.id, req.params.orderRef, ...params]
    );
    res.json({ success: true, message: 'Yetkazildi deb belgilandi' });
  } catch (err) { next(err); }
});

// PATCH /api/deliveries/:orderRef/undeliver — belgilashni bekor qilish (xato bo'lsa)
router.patch('/:orderRef/undeliver', requireRole('OWNER', 'SALES_HEAD', 'SHOPIR'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    if (!(await orderExistsInScope(req, req.params.orderRef))) {
      return res.status(404).json({ error: 'Zakaz topilmadi' });
    }
    // $1 = order_ref, $2 = branch_id (agar filial bo'lsa)
    const { cond, params } = scopeClause(req, 2, '');
    await query(
      `UPDATE sales SET delivery_status = 'PENDING', delivered_at = NULL, delivered_by = NULL
       WHERE order_ref = $1 AND delivery_type = 'DELIVERY'${cond}`,
      [req.params.orderRef, ...params]
    );
    res.json({ success: true, message: 'Yetkazilmagan holatga qaytarildi' });
  } catch (err) { next(err); }
});

module.exports = router;
