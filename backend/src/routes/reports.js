const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const reportService = require('../services/reportService');

const router = express.Router();
router.use(authenticate);

// GET /api/reports/dashboard — Bosh sahifa statistika
router.get('/dashboard', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);
    // FILIAL AJRATISH: filial — faqat o'z filiali; zavod (asosiy) — faqat zavodniki (branch_id IS NULL)
    const bFilter = req.user.branch_id
      ? ` AND branch_id='${String(req.user.branch_id).replace(/'/g, "''")}'`
      : ` AND branch_id IS NULL`;

    const [todaySales, monthSales, monthExpenses, employees, lowStock, machines] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count FROM sales WHERE strftime('%Y-%m-%d',sale_date)=$1${bFilter}`, [today]),
      query(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN status='PAID' THEN total_amount ELSE 0 END),0) as paid FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM')=$1${bFilter}`, [thisMonth]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM')=$1${bFilter}`, [thisMonth]),
      query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_active=1 THEN 1 END) as active FROM employees WHERE 1=1${bFilter}`),
      query(`SELECT COUNT(*) as count FROM products WHERE stock_quantity < 10 AND is_active=1${bFilter}`),
      query(`SELECT status, COUNT(*) as count FROM machines WHERE is_active=1${bFilter} GROUP BY status`),
    ]);

    const profit = parseFloat(monthSales.rows[0].total) - parseFloat(monthExpenses.rows[0].total);

    // 6 oylik sotuv trendi
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);
    const salesTrend = await query(`
      SELECT strftime('%Y-%m', sale_date) as month, SUM(total_amount) as revenue, COUNT(*) as count
      FROM sales WHERE sale_date >= $1${bFilter}
      GROUP BY strftime('%Y-%m', sale_date) ORDER BY month
    `, [sixMonthsAgoStr]);

    // Top 5 mahsulot (join'da branch_id ambiguity bo'lmasligi uchun s. bilan aniqlaymiz)
    const bFilterS = bFilter.replace('branch_id', 's.branch_id');
    const topProducts = await query(`
      SELECT p.name, SUM(s.quantity) as qty, SUM(s.total_amount) as revenue
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE TO_CHAR(s.sale_date,'YYYY-MM') = $1${bFilterS}
      GROUP BY p.name ORDER BY revenue DESC LIMIT 5
    `, [thisMonth]);

    const machineStatus = {};
    machines.rows.forEach(r => { machineStatus[r.status] = parseInt(r.count); });

    res.json({
      today: { sales: todaySales.rows[0] },
      month: {
        sales: monthSales.rows[0],
        expenses: monthExpenses.rows[0].total,
        profit,
      },
      employees: employees.rows[0],
      low_stock: parseInt(lowStock.rows[0].count),
      machines: machineStatus,
      sales_trend: salesTrend.rows,
      top_products: topProducts.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/reports/debts — Qarzdorlik (aging) hisoboti
router.get('/debts', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    let where = `s.status != 'PAID' AND (s.total_amount - s.payment_amount) > 0.01`;
    const params = [];
    let idx = 1;
    if (date_from) { where += ` AND DATE(s.sale_date) >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND DATE(s.sale_date) <= $${idx++}`; params.push(date_to); }
    // FILIAL AJRATISH: filial faqat o'z qarzlarini; zavod (asosiy) faqat zavodnikini
    if (req.user.branch_id) { where += ` AND s.branch_id = $${idx++}`; params.push(req.user.branch_id); }
    else { where += ` AND s.branch_id IS NULL`; }

    const rows = (await query(`
      SELECT s.id, s.sale_date, s.total_amount, s.payment_amount,
             (s.total_amount - s.payment_amount) as debt,
             s.customer_name, s.customer_phone,
             c.name as customer_db_name, c.phone as customer_db_phone, c.id as customer_id,
             CAST(julianday('now') - julianday(s.sale_date) AS INTEGER) as days_old
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE ${where}
      ORDER BY days_old DESC
    `, params)).rows;

    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let total = 0;
    const items = rows.map(r => {
      const debt = parseFloat(r.debt);
      const days = parseInt(r.days_old) || 0;
      total += debt;
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      buckets[bucket] += debt;
      return {
        sale_id: r.id,
        customer: r.customer_db_name || r.customer_name || 'Noma\'lum',
        phone: r.customer_db_phone || r.customer_phone || null,
        customer_id: r.customer_id || null,
        sale_date: r.sale_date,
        total_amount: parseFloat(r.total_amount),
        paid: parseFloat(r.payment_amount),
        debt,
        days_old: days,
        bucket,
      };
    });

    res.json({ total_debt: total, count: items.length, buckets, items });
  } catch (err) { next(err); }
});

// GET /api/reports/creditors — HAQDORLAR (zavod qarzdor bo'lgan mijozlar).
// Mijoz darajasida net balans manfiy bo'lsa = haqdor. credit = -balans.
router.get('/creditors', async (req, res, next) => {
  try {
    // FILIAL AJRATISH: filial faqat o'z haqdorlarini; zavod faqat zavodnikini
    const scope = req.user.branch_id || null;
    const cond = scope ? 's.branch_id = $1' : 's.branch_id IS NULL';
    const cParams = scope ? [scope] : [];
    const rows = (await query(`
      SELECT c.id as customer_id, c.name as customer_name, c.phone,
             SUM(s.total_amount - s.payment_amount) as balance,
             COUNT(*) as sales_count,
             MAX(s.sale_date) as last_date
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE ${cond}
      GROUP BY c.id, c.name, c.phone
      HAVING SUM(s.total_amount - s.payment_amount) < -0.01
      ORDER BY balance ASC
    `, cParams)).rows;

    let total = 0;
    const items = rows.map(r => {
      const credit = -parseFloat(r.balance);
      total += credit;
      return {
        customer_id: r.customer_id,
        customer: r.customer_name || 'Noma\'lum',
        phone: r.phone || null,
        credit,
        sales_count: parseInt(r.sales_count) || 0,
        last_date: r.last_date,
      };
    });

    res.json({ total_credit: total, count: items.length, items });
  } catch (err) { next(err); }
});

// POST /api/reports/debts — qo'lda yangi qarz qo'shish (mahsulotsiz, ombor kamaymaydi)
const MANUAL_DEBT_PRODUCT = 'Qo\'lda qarz';
router.post('/debts', requireRole('OWNER', 'ACCOUNTANT', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { customer_id, amount, sale_date, notes } = req.body;
    const debt = Math.round(parseFloat(amount) || 0);
    if (!customer_id) return res.status(400).json({ error: 'Mijozni tanlang' });
    if (debt <= 0) return res.status(400).json({ error: 'Qarz summasi 0 dan katta bo\'lsin' });

    const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });

    // Qo'lda qarz uchun maxsus placeholder mahsulot (omborga ta'sir qilmaydi)
    let p = await query('SELECT id FROM products WHERE name = $1 LIMIT 1', [MANUAL_DEBT_PRODUCT]);
    let productId;
    if (p.rows.length) {
      productId = p.rows[0].id;
    } else {
      const ins = await query(
        `INSERT INTO products (name, type, description, price, daily_production, stock_quantity, unit, rang, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [MANUAL_DEBT_PRODUCT, 'Хизмат', 'MANUAL_DEBT', 0, 0, 0, 'dona', null, 'KOMPONENT']
      );
      productId = ins.rows[0].id;
    }

    // Filial foydalanuvchisi qo'shsa — qarz o'sha filialniki (branch_id); zavod bo'lsa NULL.
    await query(
      `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
        customer_name, customer_phone, sale_date, status, payment_amount, notes, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [productId, customer_id, 1, debt, debt, c.rows[0].name, c.rows[0].phone || null,
       sale_date || new Date().toISOString().slice(0, 10), 'PENDING', 0, notes || 'Qo\'lda qo\'shilgan qarz', req.user.id, req.user.branch_id || null]
    );

    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/reports/credit — mijozni qo'lda HAQDOR qilish (oldindan to'lov tashlab ketgan).
// total_amount=0, payment_amount=summa → total_debt manfiy bo'ladi = haqdor.
// Keyingi savdoda bu haqdor avtomatik ishlatiladi.
router.post('/credit', requireRole('OWNER', 'ACCOUNTANT', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { customer_id, amount, sale_date, method, notes } = req.body;
    const credit = Math.round(parseFloat(amount) || 0);
    if (!customer_id) return res.status(400).json({ error: 'Mijozni tanlang' });
    if (credit <= 0) return res.status(400).json({ error: 'Summa 0 dan katta bo\'lsin' });

    const c = await query('SELECT name, phone FROM customers WHERE id = $1', [customer_id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Mijoz topilmadi' });

    // Qo'lda operatsiya uchun placeholder mahsulot (omborga ta'sir qilmaydi)
    let p = await query('SELECT id FROM products WHERE name = $1 LIMIT 1', [MANUAL_DEBT_PRODUCT]);
    let productId;
    if (p.rows.length) {
      productId = p.rows[0].id;
    } else {
      const ins = await query(
        `INSERT INTO products (name, type, description, price, daily_production, stock_quantity, unit, rang, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [MANUAL_DEBT_PRODUCT, 'Хизмат', 'MANUAL_DEBT', 0, 0, 0, 'dona', null, 'KOMPONENT']
      );
      productId = ins.rows[0].id;
    }

    const methodLabel = { CASH: 'Naqd', CARD: 'Karta', TRANSFER: 'Bank', PAYME: 'Pay Me', CLICK: 'Click' }[method] || 'Naqd';
    const note = notes || `Oldindan to'lov (haqdor) · ${methodLabel}`;

    // total_amount=0, payment_amount=credit → qarz = -credit (haqdor)
    await query(
      `INSERT INTO sales (product_id, customer_id, quantity, unit_price, total_amount,
        customer_name, customer_phone, sale_date, status, payment_amount, notes, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [productId, customer_id, 1, 0, 0, c.rows[0].name, c.rows[0].phone || null,
       sale_date || new Date().toISOString().slice(0, 10), 'PAID', credit, note, req.user.id, req.user.branch_id || null]
    );

    res.status(201).json({ success: true, credit });
  } catch (err) { next(err); }
});

// GET /api/reports/debt-payments — to'langan qarzlar tarixi (qarz to'lovlari ro'yxati)
// payments jadvali faqat qarz to'lovlari oqimi orqali to'ladi, shu bois bu = qarz to'lovlari tarixi.
router.get('/debt-payments', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    let idx = 1;
    if (date_from) { where += ` AND DATE(p.payment_date) >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND DATE(p.payment_date) <= $${idx++}`; params.push(date_to); }
    // FILIAL AJRATISH: filial faqat o'z to'lovlarini; zavod faqat zavodnikini
    if (req.user.branch_id) { where += ` AND s.branch_id = $${idx++}`; params.push(req.user.branch_id); }
    else { where += ` AND s.branch_id IS NULL`; }

    const rows = (await query(`
      SELECT p.id, p.amount, p.method, p.payment_date, p.notes, p.created_at,
             pr.name AS product_name, s.id AS sale_id, s.order_ref, s.sale_date,
             s.total_amount AS sale_total, s.payment_amount AS sale_paid,
             (s.total_amount - s.payment_amount) AS sale_remaining, s.status AS sale_status,
             COALESCE(c.name, s.customer_name) AS customer_name, c.id AS customer_id, c.phone,
             u.full_name AS created_by_name
      FROM payments p
      LEFT JOIN sales s ON p.sale_id = s.id
      LEFT JOIN products pr ON s.product_id = pr.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE ${where}
      ORDER BY p.payment_date DESC, p.created_at DESC
    `, params)).rows;

    const total = rows.reduce((sm, r) => sm + parseFloat(r.amount || 0), 0);
    res.json({ payments: rows, total, count: rows.length });
  } catch (err) { next(err); }
});

// GET /api/reports/monthly?month=2024-01
router.get('/monthly', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);
    // FILIAL AJRATISH (savdo qismi): filial faqat o'z savdosi; zavod faqat zavodniki
    const bScope = req.user.branch_id
      ? ` AND branch_id='${String(req.user.branch_id).replace(/'/g, "''")}'`
      : ` AND branch_id IS NULL`;

    const [sales, expenses, production, salaries] = await Promise.all([
      query(`
        SELECT COALESCE(SUM(total_amount),0) as total,
               COALESCE(SUM(CASE WHEN status='PAID' THEN total_amount ELSE 0 END),0) as paid,
               COUNT(*) as count
        FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM')=$1${bScope}
      `, [period]),
      query(`
        SELECT category, COALESCE(SUM(amount),0) as total
        FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM')=$1
        GROUP BY category
      `, [period]),
      query(`
        SELECT SUM(quantity_produced) as total_qty, COUNT(DISTINCT employee_id) as workers
        FROM employee_production WHERE month=$1
      `, [period]),
      query(`
        SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as count,
               COUNT(CASE WHEN status='PAID' THEN 1 END) as paid_count
        FROM salaries WHERE month=$1
      `, [period]),
    ]);

    const totalExpenses = expenses.rows.reduce((acc, r) => acc + parseFloat(r.total), 0);
    const revenue = parseFloat(sales.rows[0].total);
    const profit = revenue - totalExpenses;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

    res.json({
      period,
      sales: sales.rows[0],
      expenses: { by_category: expenses.rows, total: totalExpenses },
      production: production.rows[0],
      salaries: salaries.rows[0],
      profit_loss: { revenue, expenses: totalExpenses, profit, margin: parseFloat(margin) },
    });
  } catch (err) { next(err); }
});

// GET /api/reports/pdf/monthly?month=2024-01
router.get('/pdf/monthly', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const monthData = await fetch(`http://localhost:${process.env.PORT || 5000}/api/reports/monthly?month=${period}`, {
      headers: { authorization: req.headers.authorization }
    }).then(r => r.json());

    const pdfBuffer = await reportService.generateMonthlyPDF(monthData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="teknoplast-${period}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/reports/inventory?type=products|production|raw&format=excel|pdf — Ombor ro'yxatini yuklab olish
router.get('/inventory', requireRole('OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD', 'KIRIMCHI', 'OMBORCHI', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    const type = ['products', 'production', 'raw'].includes(req.query.type) ? req.query.type : 'products';
    const format = req.query.format === 'pdf' ? 'pdf' : 'excel';

    let title, columns, rows, headerColor, fname;

    if (type === 'raw') {
      const r = await query(
        `SELECT name, unit, stock_balance, price_per_unit, supplier_name, min_stock_level
         FROM raw_materials WHERE is_active = true ORDER BY name`
      );
      title = 'Ombor — Xom ashyo';
      fname = 'ombor-xom-ashyo';
      headerColor = 'FF7C3AED';
      columns = [
        { header: '№',            key: 'num',      w: 5  },
        { header: 'Nomi',         key: 'name',     w: 28 },
        { header: 'Birlik',       key: 'unit',     w: 10 },
        { header: 'Omborda',      key: 'stock',    w: 14 },
        { header: "Narxi (so'm)", key: 'price',    w: 16, money: true, align: 'right' },
        { header: "Ta'minotchi",  key: 'supplier', w: 20 },
        { header: 'Holat',        key: 'status',   w: 12 },
        { header: "Qiymati (so'm)", key: 'value',  w: 18, money: true, total: true, align: 'right' },
      ];
      rows = r.rows.map((m, i) => {
        const stock = parseFloat(m.stock_balance || 0);
        const price = parseFloat(m.price_per_unit || 0);
        const min = parseFloat(m.min_stock_level || 0);
        return {
          num: i + 1, name: m.name, unit: m.unit || 'dona',
          stock: `${stock} ${m.unit || 'dona'}`, price,
          supplier: m.supplier_name || '—',
          status: stock <= 0 ? 'Tugagan' : stock <= min ? 'Kam' : 'Yetarli',
          value: stock * price,
        };
      });
    } else {
      const isProd = type === 'production';
      // FILIAL AJRATISH: filial faqat o'z mahsulotlari ombori; zavod faqat zavodnikini
      const bScope = req.user.branch_id
        ? ` AND branch_id='${String(req.user.branch_id).replace(/'/g, "''")}'`
        : ` AND branch_id IS NULL`;
      const r = await query(
        `SELECT name, type, unit, stock_quantity, price FROM products
         WHERE is_active = true AND ${isProd ? "kind = 'KOMPONENT'" : "(kind IS NULL OR kind != 'KOMPONENT')"}${bScope}
         ORDER BY name`
      );
      title = isProd ? 'Ombor — Ishlab chiqarish ombori' : 'Ombor — Tayyor mahsulotlar';
      fname = isProd ? 'ombor-ishlab-chiqarish' : 'ombor-tayyor-mahsulotlar';
      headerColor = isProd ? 'FF065F46' : 'FF1E40AF';
      columns = [
        { header: '№',             key: 'num',    w: 5  },
        { header: 'Mahsulot',      key: 'name',   w: 30 },
        { header: 'Turi',          key: 'type',   w: 18 },
        { header: 'Omborda',       key: 'stock',  w: 14 },
        { header: "Narxi (so'm)",  key: 'price',  w: 16, money: true, align: 'right' },
        { header: "Qiymati (so'm)",key: 'value',  w: 18, money: true, total: true, align: 'right' },
        { header: 'Holat',         key: 'status', w: 12 },
      ];
      rows = r.rows.map((p, i) => {
        const stock = parseFloat(p.stock_quantity || 0);
        const price = parseFloat(p.price || 0);
        return {
          num: i + 1, name: p.name, type: p.type || '—',
          stock: `${stock} ${p.unit || 'dona'}`, price,
          value: stock * price,
          status: stock === 0 ? 'Tugagan' : stock < 10 ? 'Kam' : 'Yetarli',
        };
      });
    }

    const subtitle = `Jami: ${rows.length} ta`;
    if (format === 'pdf') {
      const buf = await reportService.generateInventoryPDF({ title, columns, rows, subtitle });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.pdf"`);
      res.send(buf);
    } else {
      const buf = await reportService.generateInventoryExcel({ title, columns, rows, headerColor });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
      res.send(buf);
    }
  } catch (err) { next(err); }
});

// GET /api/reports/excel/sales?start_date=2026-06-01&end_date=2026-06-30  (yoki ?month=2026-06)
router.get('/excel/sales', requireRole('OWNER', 'ACCOUNTANT', 'SALES_HEAD'), async (req, res, next) => {
  try {
    const { month, start_date, end_date } = req.query;

    let where, params, periodLabel;
    if (start_date || end_date) {
      const conds = []; params = []; let i = 1;
      if (start_date) { conds.push(`s.sale_date >= $${i++}`); params.push(start_date); }
      if (end_date)   { conds.push(`s.sale_date <= $${i++}`); params.push(end_date); }
      where = conds.join(' AND ');
      periodLabel = [start_date, end_date].filter(Boolean).join('_');
    } else {
      const period = month || new Date().toISOString().slice(0, 7);
      where = `TO_CHAR(s.sale_date,'YYYY-MM') = $1`;
      params = [period];
      periodLabel = period;
    }
    // FILIAL AJRATISH: filial faqat o'z savdolari Excel'i; zavod faqat zavodnikini
    if (req.user.branch_id) { where += ` AND s.branch_id = $${params.length + 1}`; params.push(req.user.branch_id); }
    else { where += ` AND s.branch_id IS NULL`; }

    const salesData = await query(`
      SELECT s.*, p.name as product_name, p.unit, u.full_name as created_by_name
      FROM sales s JOIN products p ON s.product_id = p.id JOIN users u ON s.created_by = u.id
      WHERE ${where} ORDER BY s.sale_date, s.created_at
    `, params);

    const excelBuffer = await reportService.generateSalesExcel(salesData.rows, periodLabel);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sotuv-${periodLabel}.xlsx"`);
    res.send(excelBuffer);
  } catch (err) { next(err); }
});

// GET /api/reports/excel/salaries?month=2024-01
router.get('/excel/salaries', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const salaryData = await query(`
      SELECT s.*, e.name as employee_name, e.type as employee_type,
             ep.total_produced, ep.work_days
      FROM salaries s JOIN employees e ON s.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(quantity_produced) as total_produced, COUNT(*) as work_days
        FROM employee_production WHERE month=$1 GROUP BY employee_id
      ) ep ON ep.employee_id = s.employee_id
      WHERE s.month = $1 ORDER BY e.name
    `, [period]);

    const excelBuffer = await reportService.generateSalaryExcel(salaryData.rows, period);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="maoshlar-${period}.xlsx"`);
    res.send(excelBuffer);
  } catch (err) { next(err); }
});

module.exports = router;
