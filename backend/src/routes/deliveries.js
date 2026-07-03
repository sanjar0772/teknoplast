/**
 * Dostavka (yetkazib berish) — SHOPIR (haydovchi) uchun.
 * Savdo agenti/sotuvchi "dostavka" belgisi bilan qilgan savdolar (delivery_type='DELIVERY')
 * shu yerga tushadi. Ikki bosqichli oqim:
 *   PENDING (yangi) → shopir tovarni oladi → TAKEN (yo'lda) → yetkazadi → DELIVERED.
 * Hammasi FILIAL bo'yicha ajratilgan (branch_id). Zakaz = order_ref (bir chek, bir nechta mahsulot).
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureBranchSchema } = require('../services/branchSchema');

const router = express.Router();
router.use(authenticate);

const RANK = { PENDING: 0, TAKEN: 1, DELIVERED: 2 };
const norm = (s) => (RANK[s] !== undefined ? s : 'PENDING');

// Filial scope sharti: filial xodimi → o'z filiali; zavod (branch_id yo'q) → branch_id IS NULL.
// alias — SELECT'da 's.' (JOIN'lar bor), UPDATE'da '' (SQLite UPDATE'да jadval aliasi yo'q).
function scopeClause(req, startIdx, alias = 's.') {
  const branchId = req.user.branch_id || null;
  if (branchId) return { cond: ` AND ${alias}branch_id = $${startIdx}`, params: [branchId], branchId };
  return { cond: ` AND ${alias}branch_id IS NULL`, params: [], branchId: null };
}

// GET /api/deliveries?status=pending|taken|delivered|all — dostavka zakazlari (order_ref bo'yicha jamlangan)
router.get('/', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT', 'SHOPIR', 'AGENT'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    const status = (req.query.status || 'all').toLowerCase();
    const { cond, params } = scopeClause(req, 1);
    const rows = (await query(
      `SELECT s.id, s.order_ref, s.quantity, s.unit_price, s.total_amount, s.rang,
              s.customer_id, s.customer_name, s.customer_phone, s.sale_date, s.created_at,
              COALESCE(s.delivery_status, 'PENDING') AS delivery_status, s.delivered_at, s.taken_at, s.taken_by,
              p.name AS product_name, p.unit,
              COALESCE(s.delivery_address, c.address) AS customer_address,
              COALESCE(s.delivery_lat, c.latitude) AS latitude,
              COALESCE(s.delivery_lng, c.longitude) AS longitude,
              du.full_name AS shopir_name, du.last_lat AS shopir_lat, du.last_lng AS shopir_lng,
              du.last_location_at AS shopir_location_at
       FROM sales s
       LEFT JOIN products p ON s.product_id = p.id
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users du ON s.taken_by = du.id
       WHERE s.delivery_type = 'DELIVERY'${cond}
       ORDER BY s.created_at DESC
       LIMIT 500`,
      params
    )).rows;

    // order_ref bo'yicha jamlash (bir zakaz = bir karta). Zakaz holati = eng kam ilgarilagan
    // qatorники (bir qator hali PENDING bo'lsa — butun zakaz PENDING).
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
          delivery_status: norm(r.delivery_status),
          taken_at: r.taken_at,
          delivered_at: r.delivered_at,
          // Zakazni olgan shopir + uning oxirgi joylashuvi (yo'lda kuzatish uchun)
          shopir_name: r.shopir_name,
          shopir_lat: r.shopir_lat,
          shopir_lng: r.shopir_lng,
          shopir_location_at: r.shopir_location_at,
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
      if (RANK[norm(r.delivery_status)] < RANK[g.delivery_status]) g.delivery_status = norm(r.delivery_status);
    }

    const all = Array.from(map.values());
    let orders = all;
    if (status === 'pending') orders = all.filter(o => o.delivery_status === 'PENDING');
    else if (status === 'taken') orders = all.filter(o => o.delivery_status === 'TAKEN');
    else if (status === 'delivered') orders = all.filter(o => o.delivery_status === 'DELIVERED');

    res.json({
      orders,
      counts: {
        pending: all.filter(o => o.delivery_status === 'PENDING').length,
        taken: all.filter(o => o.delivery_status === 'TAKEN').length,
        delivered: all.filter(o => o.delivery_status === 'DELIVERED').length,
      },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOZVRAT KARTASI (shopir) — vozvrat qilingan tovar lokatsiyasi belgilangan bo'lsa,
// shopir kartada ko'radi va borib "yig'ib oldim" deb belgilaydi (kartadan yo'qoladi).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/deliveries/return-pickups — lokatsiyasi bor va hali yig'ilmagan vozvratlar
router.get('/return-pickups', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT', 'SHOPIR', 'AGENT'), async (req, res, next) => {
  try {
    const { cond, params } = scopeClause(req, 1, 'sr.');
    const rows = (await query(
      `SELECT sr.id, sr.quantity, sr.rang, sr.reason, sr.condition, sr.created_at,
              sr.return_lat AS latitude, sr.return_lng AS longitude,
              COALESCE(sr.return_address, c.address) AS address,
              p.name AS product_name, p.unit,
              COALESCE(c.name, s.customer_name) AS customer_name,
              s.customer_phone
       FROM sale_returns sr
       LEFT JOIN products p ON sr.product_id = p.id
       LEFT JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN sales s ON sr.sale_id = s.id
       WHERE sr.return_lat IS NOT NULL AND sr.return_lng IS NOT NULL
         AND sr.collected_at IS NULL${cond}
       ORDER BY sr.created_at DESC
       LIMIT 500`,
      params
    )).rows;
    res.json({ pickups: rows });
  } catch (err) { next(err); }
});

// Vozvrat shu filial scope'ida, lokatsiyali va yig'ilmaganmi? (RETURNING'ga tayanmaymiz)
async function returnPickupInScope(req, id) {
  const { cond, params } = scopeClause(req, 2, '');
  const r = await query(
    `SELECT id FROM sale_returns WHERE id = $1 AND return_lat IS NOT NULL${cond}`,
    [id, ...params]
  );
  return r.rows.length > 0;
}

// PATCH /api/deliveries/return-pickups/:id/collected — shopir tovarni yig'ib oldi
router.patch('/return-pickups/:id/collected', requireRole('OWNER', 'SALES_HEAD', 'SHOPIR'), async (req, res, next) => {
  try {
    if (!(await returnPickupInScope(req, req.params.id))) {
      return res.status(404).json({ error: 'Vozvrat topilmadi yoki sizning filialingizniki emas' });
    }
    const { cond, params } = scopeClause(req, 3, '');
    await query(
      `UPDATE sale_returns SET collected_at = NOW(), collected_by = $1 WHERE id = $2${cond}`,
      [req.user.id, req.params.id, ...params]
    );
    res.json({ success: true, message: "Yig'ib olindi ✅" });
  } catch (err) { next(err); }
});

// Zakaz shu filial scope'ида DELIVERY sifatida mavjudmi? (RETURNING'ga tayanmaymiz —
// SQLite adapter UPDATE...RETURNING'да qatorlarni ishonchli qaytarmaydi.)
async function orderExistsInScope(req, orderRef) {
  const { cond, params } = scopeClause(req, 2, '');
  const r = await query(
    `SELECT id FROM sales WHERE order_ref = $1 AND delivery_type = 'DELIVERY'${cond}`,
    [orderRef, ...params]
  );
  return r.rows.length > 0;
}

// PATCH /api/deliveries/:orderRef/status — zakaz holatini o'zgartirish
// body: { status: 'PENDING' | 'TAKEN' | 'DELIVERED' }
//   PENDING   — yangi (bekor qilish / boshiga qaytarish)
//   TAKEN     — shopir tovarni oldi (yo'lda)
//   DELIVERED — mijozga yetkazildi
router.patch('/:orderRef/status', requireRole('OWNER', 'SALES_HEAD', 'SHOPIR'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    const status = String(req.body.status || '').toUpperCase();
    if (!['PENDING', 'TAKEN', 'DELIVERED'].includes(status)) {
      return res.status(400).json({ error: "Noto'g'ri holat" });
    }
    // Filial sharti — shopir boshqa filial zakazini belgilay olmaydi
    if (!(await orderExistsInScope(req, req.params.orderRef))) {
      return res.status(404).json({ error: 'Zakaz topilmadi yoki sizning filialingizniki emas' });
    }
    const ref = req.params.orderRef;
    let sql, args, message;
    if (status === 'TAKEN') {
      // $1 = taken_by, $2 = order_ref, [$3 = branch]
      const { cond, params } = scopeClause(req, 3, '');
      sql = `UPDATE sales SET delivery_status = 'TAKEN', taken_at = NOW(), taken_by = $1,
               delivered_at = NULL, delivered_by = NULL
             WHERE order_ref = $2 AND delivery_type = 'DELIVERY'${cond}`;
      args = [req.user.id, ref, ...params];
      message = 'Tovar olindi — yo\'lda';
    } else if (status === 'DELIVERED') {
      // $1 = delivered_by, $2 = order_ref, [$3 = branch]
      const { cond, params } = scopeClause(req, 3, '');
      sql = `UPDATE sales SET delivery_status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1
             WHERE order_ref = $2 AND delivery_type = 'DELIVERY'${cond}`;
      args = [req.user.id, ref, ...params];
      message = 'Yetkazib berildi';
    } else {
      // PENDING — hammasini tozalab boshiga qaytaramiz. $1 = order_ref, [$2 = branch]
      const { cond, params } = scopeClause(req, 2, '');
      sql = `UPDATE sales SET delivery_status = 'PENDING', taken_at = NULL, taken_by = NULL,
               delivered_at = NULL, delivered_by = NULL
             WHERE order_ref = $1 AND delivery_type = 'DELIVERY'${cond}`;
      args = [ref, ...params];
      message = 'Boshiga qaytarildi';
    }
    await query(sql, args);
    res.json({ success: true, status, message });
  } catch (err) { next(err); }
});

// PATCH /api/deliveries/:orderRef/to-pickup — adashib "dostavka" belgilangan savdoni
// oddiy savdoga (PICKUP) qaytaradi → Yetkazib berish ro'yxatidan chiqadi, savdo tarixida qoladi.
// Faqat EGA / SAVDO BOSHLIG'I (tuzatish amali).
router.patch('/:orderRef/to-pickup', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    await ensureBranchSchema();
    if (!(await orderExistsInScope(req, req.params.orderRef))) {
      return res.status(404).json({ error: 'Zakaz topilmadi yoki sizning filialingizniki emas' });
    }
    // $1 = order_ref, [$2 = branch]
    const { cond, params } = scopeClause(req, 2, '');
    await query(
      `UPDATE sales SET delivery_type = 'PICKUP', delivery_status = 'PENDING',
         taken_at = NULL, taken_by = NULL, delivered_at = NULL, delivered_by = NULL
       WHERE order_ref = $1 AND delivery_type = 'DELIVERY'${cond}`,
      [req.params.orderRef, ...params]
    );
    res.json({ success: true, message: "Oddiy savdoga o'tkazildi (dostavka bekor qilindi)" });
  } catch (err) { next(err); }
});

module.exports = router;
