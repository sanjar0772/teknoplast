const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { addColorStock } = require('../utils/colorStock');

const router = express.Router();
router.use(authenticate);

// PENDING sifatida saqlaydi — omborga qo'SHILMAYDI (tasdiqlashdan keyin qo'shiladi)
async function insertProductionRow(client, {
  employee_id, product_id, machine_id, production_date,
  quantity_produced, daily_tariff, calculated_amount, month, notes, production_type, rang,
}) {
  const r = await client.query(
    `INSERT INTO employee_production
      (employee_id, product_id, machine_id, production_date, quantity_produced, daily_tariff,
       calculated_amount, month, notes, production_type, rang, approval_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING') RETURNING *`,
    [employee_id, product_id || null, machine_id || null, production_date,
     quantity_produced, daily_tariff, calculated_amount, month, notes || null,
     production_type || 'FINISHED', rang || null]
  );
  // Stock PENDING da qo'SHILMAYDI — faqat tasdiqlangandan keyin qo'shiladi
  return r.rows[0];
}

// GET /api/production — kunlik ishlab chiqarish
router.get('/', async (req, res, next) => {
  try {
    const { date, month, employee_id } = req.query;
    let sql = `
      SELECT ep.*, e.name as employee_name, e.type as employee_type,
             p.name as product_name, p.kind as product_kind
      FROM employee_production ep
      JOIN employees e ON ep.employee_id = e.id
      LEFT JOIN products p ON ep.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (date)        { sql += ` AND ep.production_date = $${idx++}`; params.push(date); }
    if (month)       { sql += ` AND ep.month = $${idx++}`; params.push(month); }
    if (employee_id) { sql += ` AND ep.employee_id = $${idx++}`; params.push(employee_id); }
    sql += ' ORDER BY ep.production_date DESC, e.name';
    const result = await query(sql, params);
    res.json({ production: result.rows });
  } catch (err) { next(err); }
});

// GET /api/production/summary
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const byEmployee = await query(`
      SELECT e.name, e.type, ep.month,
             SUM(ep.quantity_produced) as total_produced,
             SUM(ep.calculated_amount) as total_earned,
             COUNT(DISTINCT ep.production_date) as work_days
      FROM employee_production ep JOIN employees e ON ep.employee_id = e.id
      WHERE ep.month = $1
      GROUP BY e.name, e.type, ep.month
      ORDER BY total_produced DESC
    `, [period]);

    const daily = await query(`
      SELECT production_date,
             COUNT(DISTINCT employee_id) as workers,
             SUM(quantity_produced) as total_qty,
             SUM(calculated_amount) as total_earned
      FROM employee_production WHERE month = $1
      GROUP BY production_date ORDER BY production_date
    `, [period]);

    res.json({ by_employee: byEmployee.rows, daily: daily.rows });
  } catch (err) { next(err); }
});

// Davr bo'yicha statistika SQL'ini quradi (Stanokchi/Detalchi)
function buildRangeSummaryQuery(employee_ids) {
  let sql = `
    SELECT e.id as employee_id, e.name, e.type, e.shift,
           COUNT(DISTINCT ep.production_date) as work_days,
           COALESCE(SUM(ep.quantity_produced), 0) as total_produced,
           COALESCE(SUM(ep.calculated_amount), 0) as total_earned
    FROM employees e
    LEFT JOIN employee_production ep
      ON ep.employee_id = e.id AND ep.production_date BETWEEN $1 AND $2
    WHERE e.type IN ('STANOKCHI', 'DETALCHI')
  `;
  const extraParams = [];
  let idx = 3;

  if (employee_ids) {
    const ids = String(employee_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => `$${idx++}`).join(',');
      sql += ` AND e.id IN (${placeholders})`;
      extraParams.push(...ids);
    }
  }

  sql += ' GROUP BY e.id, e.name, e.type, e.shift ORDER BY e.type, e.name';
  return { sql, extraParams };
}

// Davr bo'yicha MAHSULOT darajasida (Excel/PDF hisobot uchun) — har xodimning
// chiqargan har bir mahsuloti alohida qator: nom, smena, dona, hisoblangan haq.
function buildRangeDetailQuery(employee_ids) {
  let sql = `
    SELECT e.name, e.type, e.shift,
           p.name AS product_name,
           COUNT(DISTINCT ep.production_date) as work_days,
           COALESCE(SUM(ep.quantity_produced), 0) as total_produced,
           COALESCE(SUM(ep.calculated_amount), 0) as total_earned
    FROM employees e
    JOIN employee_production ep
      ON ep.employee_id = e.id AND ep.production_date BETWEEN $1 AND $2
    LEFT JOIN products p ON ep.product_id = p.id
    WHERE e.type IN ('STANOKCHI', 'DETALCHI')
  `;
  const extraParams = [];
  let idx = 3;

  if (employee_ids) {
    const ids = String(employee_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => `$${idx++}`).join(',');
      sql += ` AND e.id IN (${placeholders})`;
      extraParams.push(...ids);
    }
  }

  sql += ' GROUP BY e.id, e.name, e.type, e.shift, p.name ORDER BY e.name, p.name';
  return { sql, extraParams };
}

// GET /api/production/range-summary — tanlangan davr va xodimlar bo'yicha statistika (Stanokchi/Detalchi)
router.get('/range-summary', async (req, res, next) => {
  try {
    const { start_date, end_date, employee_ids } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date va end_date kerak' });
    }

    const { sql, extraParams } = buildRangeSummaryQuery(employee_ids);
    const result = await query(sql, [start_date, end_date, ...extraParams]);
    res.json({ summary: result.rows, start_date, end_date });
  } catch (err) { next(err); }
});

// GET /api/production/range-summary/excel — Excel hisobot (Stanokchi/Detalchi)
router.get('/range-summary/excel', async (req, res, next) => {
  try {
    const { start_date, end_date, employee_ids } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date va end_date kerak' });
    }

    const { sql, extraParams } = buildRangeDetailQuery(employee_ids);
    const result = await query(sql, [start_date, end_date, ...extraParams]);

    const reportService = require('../services/reportService');
    const buffer = await reportService.generateProductionRangeExcel(result.rows, start_date, end_date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ishlab-chiqarish-${start_date}_${end_date}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/production/range-summary/pdf — PDF hisobot (Stanokchi/Detalchi, vaqt oralig'i)
router.get('/range-summary/pdf', async (req, res, next) => {
  try {
    const { start_date, end_date, employee_ids } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date va end_date kerak' });
    }

    const { sql, extraParams } = buildRangeDetailQuery(employee_ids);
    const result = await query(sql, [start_date, end_date, ...extraParams]);

    const reportService = require('../services/reportService');
    const buffer = await reportService.generateProductionRangePDF(result.rows, start_date, end_date);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ishlab-chiqarish-${start_date}_${end_date}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// Ishchilar ishi (bir kun) — eksport uchun yozuvlarni olish
async function fetchWorksOfDay(date) {
  const result = await query(`
    SELECT ep.*, e.name AS employee_name, e.type AS employee_type, p.name AS product_name
    FROM employee_production ep
    JOIN employees e ON ep.employee_id = e.id
    LEFT JOIN products p ON ep.product_id = p.id
    WHERE ep.production_date = $1 AND e.type IN ('STANOKCHI', 'DETALCHI')
    ORDER BY e.name, p.name
  `, [date]);
  return result.rows;
}

// GET /api/production/works-day/excel?date=YYYY-MM-DD — Ishchilar ishi (XODIM/MAHSULOT/RANG/MIQDOR/HAQ/HOLAT)
router.get('/works-day/excel', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date kerak' });
    const rows = await fetchWorksOfDay(date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateWorkerWorksExcel(rows, date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ishchilar-ishi-${date}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// GET /api/production/works-day/pdf?date=YYYY-MM-DD — xuddi shu ro'yxat PDF formatda
router.get('/works-day/pdf', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date kerak' });
    const rows = await fetchWorksOfDay(date);
    const reportService = require('../services/reportService');
    const buffer = await reportService.generateWorkerWorksPDF(rows, date);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ishchilar-ishi-${date}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
});

// POST /api/production — kunlik ishlab chiqarish kiritish
router.post('/', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), [
  body('employee_id').notEmpty(),
  body('production_date').isDate(),
  body('quantity_produced').isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { employee_id, product_id, machine_id, production_date, quantity_produced, notes, production_type, daily_tariff: custom_tariff, rang } = req.body;

    const emp = await query('SELECT type, daily_tariff FROM employees WHERE id=$1 AND is_active=true', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Xodim topilmadi' });

    const employee_type = emp.rows[0].type;
    let calculated_amount = 0;
    let daily_tariff = emp.rows[0].daily_tariff;

    // Ishlab chiqarish turi: STANOKCHI tayyor/yarim tanlaydi; DETALCHI doim yarim tayyor.
    // Komponent (KOMPONENT) — turdan qat'i nazar saqlanadi.
    let ptype = production_type || 'FINISHED';
    if (employee_type === 'DETALCHI' && ptype !== 'KOMPONENT') ptype = 'SEMI_FINISHED';

    // Agar Kirimchi tomonidan maxsus tarif berilgan bo'lsa — uni ishlatamiz
    if (custom_tariff && parseFloat(custom_tariff) > 0) {
      daily_tariff = parseFloat(custom_tariff);
      calculated_amount = quantity_produced * daily_tariff;
    } else if (product_id) {
      const prod = await query('SELECT kind, price, stanokchi_rate, stanokchi_semi_rate, detalchi_rate FROM products WHERE id=$1', [product_id]);
      const product = prod.rows[0] || {};
      if (product.kind === 'KOMPONENT') {
        // Komponent ishlab chiqarish — bitta narx (tayyor/yarim farqi yo'q)
        ptype = 'KOMPONENT';
        daily_tariff = product.price || 0;
        calculated_amount = quantity_produced * daily_tariff;
      } else if (employee_type === 'STANOKCHI') {
        const rate = ptype === 'SEMI_FINISHED' ? product.stanokchi_semi_rate : product.stanokchi_rate;
        daily_tariff = rate || 0;
        calculated_amount = quantity_produced * daily_tariff;
      } else if (employee_type === 'DETALCHI') {
        daily_tariff = product.detalchi_rate || 0;
        calculated_amount = quantity_produced * daily_tariff;
      } else {
        calculated_amount = quantity_produced * daily_tariff;
      }
    } else {
      calculated_amount = quantity_produced * daily_tariff;
    }

    const month = production_date.slice(0, 7);

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Har bir kiritish QO'SHILADI (append) — eski yozuvlar o'chmaydi. Tuzatish uchun DELETE /api/production/:id.
      const production = await insertProductionRow(client, {
        employee_id, product_id, machine_id, production_date,
        quantity_produced, daily_tariff, calculated_amount, month, notes, production_type: ptype, rang,
      });

      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_RECORD', table: 'employee_production', recordId: production.id,
        newValues: { employee_id, product_id: product_id || null, quantity_produced, production_date, production_type: ptype },
      });
      res.status(201).json({ production });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/production/bulk — bir kunda ko'p xodim
router.post('/bulk', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const { production_date, entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'Entries bo\'sh' });
    }

    const month = production_date.slice(0, 7);
    const results = [];

    // Bir xodimga bir nechta mahsulot bo'lishi mumkin — xodim bo'yicha guruhlaymiz.
    // Har bir xodim uchun avval shu kungi eski yozuvlarni bir marta tozalaymiz,
    // keyin barcha mahsulotlarini alohida qator qilib qo'shamiz (4 tagacha).
    const byEmployee = new Map();
    for (const entry of entries) {
      if (!entry.employee_id) continue;
      if (!byEmployee.has(entry.employee_id)) byEmployee.set(entry.employee_id, []);
      byEmployee.get(entry.employee_id).push(entry);
    }

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      for (const [employee_id, items] of byEmployee) {
        const emp = await query('SELECT type, daily_tariff FROM employees WHERE id=$1 AND is_active=true', [employee_id]);
        if (!emp.rows.length) continue;

        const employee_type = emp.rows[0].type;
        const empDailyTariff = emp.rows[0].daily_tariff;

        // Yozuvlar QO'SHILADI (append) — shu xodimning eski kunlik yozuvlari o'chmaydi.
        // Shu kunga 2-marta prihod kiritilsa, ikkalasi ham saqlanadi.

        for (const entry of items) {
          let daily_tariff = empDailyTariff;
          let calculated_amount = 0;

          // Ishlab chiqarish turi: STANOKCHI tayyor/yarim; DETALCHI doim yarim tayyor.
          // Komponent (KOMPONENT) — turdan qat'i nazar saqlanadi.
          let ptype = entry.production_type || 'FINISHED';
          if (employee_type === 'DETALCHI' && ptype !== 'KOMPONENT') ptype = 'SEMI_FINISHED';

          // Agar Kirimchi maxsus tarif bergan bo'lsa — uni ishlatamiz
          if (entry.daily_tariff && parseFloat(entry.daily_tariff) > 0) {
            daily_tariff = parseFloat(entry.daily_tariff);
            calculated_amount = entry.quantity_produced * daily_tariff;
          } else if (entry.product_id) {
            const prod = await query('SELECT kind, price, stanokchi_rate, stanokchi_semi_rate, detalchi_rate FROM products WHERE id=$1', [entry.product_id]);
            const product = prod.rows[0] || {};
            if (product.kind === 'KOMPONENT') {
              // Komponent ishlab chiqarish — bitta narx (tayyor/yarim farqi yo'q)
              ptype = 'KOMPONENT';
              daily_tariff = product.price || 0;
              calculated_amount = entry.quantity_produced * daily_tariff;
            } else if (employee_type === 'STANOKCHI') {
              const rate = ptype === 'SEMI_FINISHED' ? product.stanokchi_semi_rate : product.stanokchi_rate;
              daily_tariff = rate || 0;
              calculated_amount = entry.quantity_produced * daily_tariff;
            } else if (employee_type === 'DETALCHI') {
              daily_tariff = product.detalchi_rate || 0;
              calculated_amount = entry.quantity_produced * daily_tariff;
            } else {
              calculated_amount = entry.quantity_produced * daily_tariff;
            }
          } else {
            calculated_amount = entry.quantity_produced * daily_tariff;
          }

          const production = await insertProductionRow(client, {
            employee_id, product_id: entry.product_id,
            machine_id: entry.machine_id, production_date,
            quantity_produced: entry.quantity_produced, daily_tariff,
            calculated_amount, month, notes: entry.notes, production_type: ptype, rang: entry.rang,
          });
          results.push(production);
        }
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_BULK', table: 'employee_production',
        recordId: results.map(r => r.id).join(','),
        newValues: { count: results.length, production_date },
      });
      res.status(201).json({ production: results, count: results.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/production/pending — tasdiqlash kutayotgan yozuvlar (SALES_HEAD/OWNER ko'radi)
router.get('/pending', requireRole('OWNER', 'SALES_HEAD', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ep.*, e.name as employee_name, e.type as employee_type,
             p.name as product_name, p.kind as product_kind
      FROM employee_production ep
      JOIN employees e ON ep.employee_id = e.id
      LEFT JOIN products p ON ep.product_id = p.id
      WHERE ep.approval_status = 'PENDING'
      ORDER BY ep.production_date DESC, e.name
    `, []);
    res.json({ production: result.rows });
  } catch (err) { next(err); }
});

// PUT /api/production/approve-day — bir xodimning bir kunini tasdiqlash → ombor yangilanadi
router.put('/approve-day', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { employee_id, production_date } = req.body;
    if (!employee_id || !production_date) {
      return res.status(400).json({ error: 'employee_id va production_date kerak' });
    }
    const pending = await query(
      `SELECT * FROM employee_production WHERE employee_id=$1 AND production_date=$2 AND approval_status='PENDING'`,
      [employee_id, production_date]
    );
    if (!pending.rows.length) {
      return res.status(400).json({ error: 'Tasdiqlash kerak yozuv topilmadi' });
    }
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      for (const row of pending.rows) {
        if (row.product_id) {
          // Komponent deb belgilangan bo'lsa — mahsulotni komponent (ishlab chiqarish ombori)
          // turiga biriktiramiz. Shunda u ham Komponentlar sahifasida, ham Ishlab chiqarish
          // omborida ko'rinadi (ikkalasi ham kind='KOMPONENT' bo'yicha filtrlaydi).
          if (row.production_type === 'KOMPONENT') {
            await client.query(
              "UPDATE products SET kind='KOMPONENT', updated_at=NOW() WHERE id=$1 AND COALESCE(kind,'') <> 'KOMPONENT'",
              [row.product_id]
            );
          }
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at=NOW() WHERE id=$2',
            [row.quantity_produced, row.product_id]
          );
          await addColorStock(client.query, row.product_id, row.rang, row.quantity_produced);
        }
        await client.query(
          `UPDATE employee_production SET approval_status='APPROVED', approved_by=$1, approved_at=NOW() WHERE id=$2`,
          [req.user.id, row.id]
        );
      }
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_APPROVE', table: 'employee_production',
        recordId: pending.rows.map(r => r.id).join(','),
        newValues: { employee_id, production_date, count: pending.rows.length },
      });
      res.json({ count: pending.rows.length, message: `${pending.rows.length} ta yozuv tasdiqlandi, mahsulot omborga qo'shildi` });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/production/reject-day — bir xodimning bir kunini KIRIMCHIGA QAYTARISH (to'g'irlash uchun).
// Ombor o'zgarmaydi (yozuv hali tasdiqlanmagan edi). Kirimchi tahrirlab qayta yuboradi.
router.put('/reject-day', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { employee_id, production_date, reason } = req.body;
    if (!employee_id || !production_date) {
      return res.status(400).json({ error: 'employee_id va production_date kerak' });
    }
    const pending = await query(
      `SELECT id FROM employee_production WHERE employee_id=$1 AND production_date=$2 AND approval_status='PENDING'`,
      [employee_id, production_date]
    );
    if (!pending.rows.length) {
      return res.status(400).json({ error: 'Qaytarish uchun yozuv topilmadi' });
    }
    const note = reason ? String(reason).slice(0, 300) : "Qaytarildi — to'g'irlab qayta yuboring";
    await query(
      `UPDATE employee_production SET approval_status='REJECTED', notes=$1, updated_at=NOW()
       WHERE employee_id=$2 AND production_date=$3 AND approval_status='PENDING'`,
      [note, employee_id, production_date]
    );
    logAudit(req, {
      action: 'PRODUCTION_REJECT', table: 'employee_production',
      recordId: pending.rows.map(r => r.id).join(','),
      newValues: { employee_id, production_date, reason: note, count: pending.rows.length },
    });
    res.json({ count: pending.rows.length, message: `${pending.rows.length} ta yozuv kirimchiga qaytarildi` });
  } catch (err) { next(err); }
});

// DELETE /api/production/all — BARCHA kunlik ishlab chiqarish yozuvlarini o'chirish (faqat OWNER)
router.delete('/all', requireRole('OWNER'), async (req, res, next) => {
  try {
    const existing = await query('SELECT id, product_id, quantity_produced, approval_status, rang FROM employee_production', []);
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      for (const row of existing.rows) {
        if (row.product_id && row.quantity_produced > 0 && row.approval_status === 'APPROVED') {
          await client.query(
            'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2',
            [row.quantity_produced, row.product_id]
          );
          await addColorStock(client.query, row.product_id, row.rang, -row.quantity_produced);
        }
      }
      await client.query('DELETE FROM employee_production');
      await client.query('COMMIT');
      logAudit(req, { action: 'PRODUCTION_DELETE_ALL', table: 'employee_production', newValues: { count: existing.rows.length } });
      res.json({ count: existing.rows.length, message: `${existing.rows.length} ta yozuv o'chirildi` });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// DELETE /api/production/:id — yagona yozuvni o'chirish (OWNER yoki PRODUCTION_HEAD)
router.delete('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), async (req, res, next) => {
  try {
    // Avval yozuvni olamiz — ombor delta uchun
    const existing = await query('SELECT * FROM employee_production WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Yozuv topilmadi' });

    const row = existing.rows[0];
    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');
      // Faqat APPROVED yozuvlar uchun ombor qaytariladi
      if (row.product_id && row.quantity_produced > 0 && row.approval_status === 'APPROVED') {
        await client.query(
          'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2',
          [row.quantity_produced, row.product_id]
        );
        await addColorStock(client.query, row.product_id, row.rang, -row.quantity_produced);
      }
      await client.query('DELETE FROM employee_production WHERE id=$1', [req.params.id]);
      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_DELETE', table: 'employee_production', recordId: req.params.id,
        newValues: { employee_id: row.employee_id, production_date: row.production_date, quantity: row.quantity_produced },
      });
      res.json({ message: 'Yozuv o\'chirildi' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /api/production/:id — yagona yozuvni tahrirlash (miqdor/tarif/rang/mahsulot/tur).
// APPROVED yozuv uchun ombor mos ravishda to'g'rilanadi: eski effekt qaytarilib, yangisi qo'llanadi.
router.put('/:id', requireRole('OWNER', 'PRODUCTION_HEAD', 'KIRIMCHI'), async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM employee_production WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Yozuv topilmadi' });
    const old = existing.rows[0];

    // Yangi qiymatlar — berilmaganlari eski yozuvdan olinadi
    const newProductId = req.body.product_id !== undefined ? (req.body.product_id || null) : old.product_id;
    const newQty = req.body.quantity_produced !== undefined ? parseFloat(req.body.quantity_produced) : parseFloat(old.quantity_produced);
    if (!(newQty >= 0)) return res.status(400).json({ error: 'Miqdor noto\'g\'ri' });
    const newRang = req.body.rang !== undefined ? (req.body.rang || null) : old.rang;
    const newType = req.body.production_type !== undefined ? (req.body.production_type || 'FINISHED') : old.production_type;
    const newTariff = (req.body.daily_tariff !== undefined && req.body.daily_tariff !== '' && req.body.daily_tariff !== null)
      ? parseFloat(req.body.daily_tariff) : parseFloat(old.daily_tariff || 0);
    const newAmount = newQty * (newTariff || 0);
    const wasApproved = old.approval_status === 'APPROVED';
    // Qaytarilgan (REJECTED) yozuv tahrirlansa — qayta yuborilgan hisoblanadi (PENDING).
    const wasRejected = old.approval_status === 'REJECTED';
    const newStatus = wasRejected ? 'PENDING' : old.approval_status;
    const newNotes = wasRejected ? null : (old.notes ?? null);

    const client = await require('../db').getClient();
    try {
      await client.query('BEGIN');

      // Faqat tasdiqlangan (APPROVED) yozuv omborga ta'sir qilgan — uni to'g'rilaymiz
      if (wasApproved) {
        // 1) Eski effektni qaytaramiz
        if (old.product_id && old.quantity_produced > 0) {
          await client.query(
            'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at=NOW() WHERE id=$2',
            [old.quantity_produced, old.product_id]
          );
          await addColorStock(client.query, old.product_id, old.rang, -old.quantity_produced);
        }
        // 2) Yangi effektni qo'llaymiz
        if (newProductId && newQty > 0) {
          if (newType === 'KOMPONENT') {
            await client.query(
              "UPDATE products SET kind='KOMPONENT', updated_at=NOW() WHERE id=$1 AND COALESCE(kind,'') <> 'KOMPONENT'",
              [newProductId]
            );
          }
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at=NOW() WHERE id=$2',
            [newQty, newProductId]
          );
          await addColorStock(client.query, newProductId, newRang, newQty);
        }
      }

      const upd = await client.query(
        `UPDATE employee_production
         SET product_id=$1, quantity_produced=$2, daily_tariff=$3, calculated_amount=$4,
             production_type=$5, rang=$6, approval_status=$7, notes=$8, updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [newProductId, newQty, newTariff, newAmount, newType || 'FINISHED', newRang, newStatus, newNotes, req.params.id]
      );

      await client.query('COMMIT');
      logAudit(req, {
        action: 'PRODUCTION_UPDATE', table: 'employee_production', recordId: req.params.id,
        oldValues: { quantity: old.quantity_produced, tariff: old.daily_tariff, product_id: old.product_id, rang: old.rang },
        newValues: { quantity: newQty, tariff: newTariff, product_id: newProductId, rang: newRang, production_type: newType },
      });
      res.json({ production: upd.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
