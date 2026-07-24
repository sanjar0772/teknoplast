const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { ensureEmployeeTransactionsSchema, getMonthTotals } = require('../services/employeeTransactions');

const router = express.Router();
router.use(authenticate);

// GET /api/salaries?month=2024-01
router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT s.*, e.name as employee_name, e.type as employee_type,
             u.full_name as approved_by_name,
             COALESCE(ep.total_produced, 0) as total_produced,
             COALESCE(ep.work_days, 0) as work_days
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN users u ON s.approved_by = u.id
      LEFT JOIN (
        SELECT employee_id,
               SUM(quantity_produced) as total_produced,
               COUNT(DISTINCT production_date) as work_days
        FROM employee_production WHERE month = $1
        GROUP BY employee_id
      ) ep ON ep.employee_id = s.employee_id
      WHERE s.month = $2
      ORDER BY e.name
    `, [period, period]);

    const summary = await query(`
      SELECT
        COUNT(*) as total_employees,
        COALESCE(SUM(net_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status='PAID' THEN net_amount ELSE 0 END), 0) as paid_amount,
        COUNT(CASE WHEN status='PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status='APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status='CALCULATED' THEN 1 END) as calculated_count
      FROM salaries WHERE month = $1
    `, [period]);

    res.json({ salaries: result.rows, summary: summary.rows[0], month: period });
  } catch (err) { next(err); }
});

// Oylik savdo rejasini (bonus uchun) o'qish
async function getPlanAmount() {
  const r = await query("SELECT value FROM system_settings WHERE key='monthly_sales_plan'");
  return r.rows.length ? (parseFloat(r.rows[0].value) || 0) : 0;
}
// Berilgan oy savdosi jami summasi
async function getMonthSales(month) {
  const r = await query(
    "SELECT COALESCE(SUM(total_amount),0) total FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM') = $1",
    [month]
  );
  return parseFloat(r.rows[0]?.total || 0);
}
// Reja oshig'i (overage) ulushini hisoblash: savdo rejadan necha barobar oshgan
function calcOverage(actual, plan) {
  return (plan > 0 && actual > plan) ? (actual - plan) / plan : 0;
}

// GET /api/salaries/plan?month=YYYY-MM — joriy reja + savdo holati
router.get('/plan', async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const plan = await getPlanAmount();
    const actual_sales = await getMonthSales(month);
    const overage = calcOverage(actual_sales, plan);
    res.json({
      month, plan, actual_sales,
      plan_met: plan > 0 && actual_sales >= plan,
      overage_pct: Math.round(overage * 10000) / 100, // foizda, masalan 10.5
    });
  } catch (err) { next(err); }
});

// PUT /api/salaries/plan — oylik savdo rejasini belgilash (faqat EGA)
router.put('/plan', requireRole('OWNER'), async (req, res, next) => {
  try {
    const plan = Number(req.body.plan) || 0;
    if (plan < 0) return res.status(400).json({ error: 'Reja manfiy bo\'lishi mumkin emas' });
    await query(
      "INSERT INTO system_settings (key, value, description) VALUES ('monthly_sales_plan', $1, 'Oylik savdo reja (bonus uchun)') " +
      "ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()",
      [String(plan)]
    );
    res.json({ success: true, plan });
  } catch (err) { next(err); }
});

// GET /api/salaries/preview?month=YYYY-MM — Oylik hisob-kitobini KO'RISH (bazaga YOZMAYDI).
// Xodimlar sahifasidagi "Oylik xodimlar" bo'limi uchun: har bir xodimning shu oydagi
// hisoblangan sof oyligini ko'rsatadi. /calculate bilan AYNAN bir xil formula, lekin
// FAQAT o'qiydi — hech nima saqlamaydi, shuning uchun to'langan/tasdiqlangan oyliklarga
// ta'sir qilmaydi. Filial ajratish "Xodimlar" ro'yxati bilan bir xil (o'z filiali yoki zavod).
router.get('/preview', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const tax_rate = 0.05, social_rate = 0.03; // /calculate bilan bir xil standart stavkalar
    await ensureEmployeeTransactionsSchema();

    const plan = await getPlanAmount();
    const actualSales = await getMonthSales(month);
    const overage = calcOverage(actualSales, plan);

    // Filial scope — employees.js GET bilan bir xil qoida
    let empSql = 'SELECT id, name, type, salary_type, monthly_salary, salary_percent, bonus_percent FROM employees WHERE is_active = true';
    const empParams = [];
    if (req.user.branch_id) { empSql += ' AND branch_id = $1'; empParams.push(req.user.branch_id); }
    else { empSql += ' AND branch_id IS NULL'; }
    empSql += ' ORDER BY name';
    const employees = await query(empSql, empParams);

    const salaries = [];
    for (const emp of employees.rows) {
      const prod = await query(`
        SELECT
          COALESCE(SUM(calculated_amount), 0) as total_earned,
          COUNT(DISTINCT production_date) as work_days,
          COALESCE(SUM(quantity_produced), 0) as total_produced
        FROM employee_production
        WHERE employee_id = $1 AND month = $2
      `, [emp.id, month]);

      let total_calculated = parseFloat(prod.rows[0]?.total_earned || 0);
      let salaryBase = 0;
      if (emp.salary_type === 'FIXED' && emp.monthly_salary) {
        salaryBase = parseFloat(emp.monthly_salary) || 0;
        total_calculated += salaryBase;
      } else if (emp.salary_type === 'PERCENT' && emp.salary_percent) {
        salaryBase = Math.round(actualSales * (parseFloat(emp.salary_percent) || 0) / 100);
        total_calculated += salaryBase;
      }
      const work_days = parseInt(prod.rows[0]?.work_days || 0);
      const total_produced = parseInt(prod.rows[0]?.total_produced || 0);

      let bonuses = 0;
      if (salaryBase > 0) {
        bonuses += Math.round(salaryBase * overage);           // reja bonusi
        const bp = parseFloat(emp.bonus_percent) || 0;
        if (bp) bonuses += Math.round(salaryBase * bp / 100);  // doimiy qo'shimcha foiz
      }
      const txnTotals = await getMonthTotals(emp.id, month);   // premiya/avans/jarima...
      bonuses += txnTotals.add;
      const penalties = txnTotals.sub;

      const tax_amount = Math.round(total_calculated * tax_rate);
      const social_security = Math.round(total_calculated * social_rate);
      const net_amount = total_calculated - tax_amount - social_security + bonuses - penalties;

      // Shu oyning saqlangan holati (bo'lsa): CALCULATED/APPROVED/PAID
      const st = await query('SELECT status FROM salaries WHERE employee_id=$1 AND month=$2', [emp.id, month]);

      salaries.push({
        employee_id: emp.id,
        employee_name: emp.name,
        employee_type: emp.type,
        salary_type: emp.salary_type,
        salary_base: salaryBase,
        total_calculated,
        bonuses,
        penalties,
        tax_amount,
        social_security,
        work_days,
        total_produced,
        net_amount,
        saved_status: st.rows.length ? st.rows[0].status : null,
      });
    }

    res.json({
      month,
      plan,
      actual_sales: actualSales,
      overage_pct: Math.round(overage * 10000) / 100,
      salaries,
    });
  } catch (err) { next(err); }
});

// POST /api/salaries/calculate — Oylik hisoblash (TAX, SOCIAL + REJA BONUSI bilan)
router.post('/calculate', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { month, tax_rate = 0.05, social_rate = 0.03 } = req.body;
    if (!month) return res.status(400).json({ error: 'Oy kiritilmagan (YYYY-MM)' });
    await ensureEmployeeTransactionsSchema();

    // REJA BONUSI: oy savdosi rejadan oshsa — oshgan foiz (overage) hisoblanadi.
    // Bonus oylik/foizli xodimlarga beriladi (stanokchi/detalchi — dona haqi, kirmaydi).
    const plan = await getPlanAmount();
    const actualSales = await getMonthSales(month);
    const overage = calcOverage(actualSales, plan); // 0.10 = savdo rejadan 10% oshgan

    const employees = await query(
      'SELECT id, salary_type, monthly_salary, salary_percent, bonus_percent FROM employees WHERE is_active = true'
    );

    const results = [];
    for (const emp of employees.rows) {
      // Ishlab chiqarilgan miqdor va kun-sanab (STANOKCHI/DETALCHI — dona haqi)
      const prod = await query(`
        SELECT
          COALESCE(SUM(calculated_amount), 0) as total_earned,
          COUNT(DISTINCT production_date) as work_days,
          COALESCE(SUM(quantity_produced), 0) as total_produced
        FROM employee_production
        WHERE employee_id = $1 AND month = $2
      `, [emp.id, month]);

      let total_calculated = parseFloat(prod.rows[0]?.total_earned || 0);
      let salaryBase = 0; // reja bonusi shu asosga hisoblanadi
      if (emp.salary_type === 'FIXED' && emp.monthly_salary) {
        // Belgilangan oylik
        salaryBase = parseFloat(emp.monthly_salary) || 0;
        total_calculated += salaryBase;
      } else if (emp.salary_type === 'PERCENT' && emp.salary_percent) {
        // Foizli xodim: oy savdosining shu foizi (savdo oshsa puli ham oshadi)
        salaryBase = Math.round(actualSales * (parseFloat(emp.salary_percent) || 0) / 100);
        total_calculated += salaryBase;
      }
      const work_days = parseInt(prod.rows[0]?.work_days || 0);
      const total_produced = parseInt(prod.rows[0]?.total_produced || 0);

      // Bonuslar: (1) reja bonusi (savdo rejadan oshsa) + (2) xodimning doimiy qo'shimcha foizi
      let bonuses = 0;
      if (salaryBase > 0) {
        bonuses += Math.round(salaryBase * overage); // reja bonusi
        const bp = parseFloat(emp.bonus_percent) || 0; // qo'shimcha foiz (har oy)
        if (bp) bonuses += Math.round(salaryBase * bp / 100);
      }

      // Xodimlar sahifasida qo'shilgan amallar: Premiya/Qo'shimcha oylik → bonusga,
      // Avans/Jarima/Boshqa rashodlar → jarimaga. BARCHA turdagi xodimga (stanokchi/detalchi ham) tegishli.
      const txnTotals = await getMonthTotals(emp.id, month);
      bonuses += txnTotals.add;
      const penalties = txnTotals.sub;

      // Soliq va ijtimoiy sug'urta (bonusgacha bo'lgan summadan)
      const tax_amount = Math.round(total_calculated * tax_rate);
      const social_security = Math.round(total_calculated * social_rate);
      const net_amount = total_calculated - tax_amount - social_security + bonuses - penalties;

      const r = await query(
        `INSERT INTO salaries (employee_id, month, total_calculated, tax_amount, social_security, work_days, total_produced, bonuses, penalties, net_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CALCULATED')
         ON CONFLICT (employee_id, month)
         DO UPDATE SET total_calculated=$3, tax_amount=$4, social_security=$5, work_days=$6, total_produced=$7, bonuses=$8, penalties=$9, net_amount=$10, status='CALCULATED', updated_at=NOW()
         RETURNING *`,
        [emp.id, month, total_calculated, tax_amount, social_security, work_days, total_produced, bonuses, penalties, net_amount]
      );
      results.push(r.rows[0]);
    }

    const overagePct = Math.round(overage * 10000) / 100;
    const planMsg = overage > 0
      ? ` · Reja ${overagePct}% ga oshdi — bonus qo'shildi`
      : (plan > 0 ? ' · Reja bajarilmadi (bonus yo\'q)' : '');

    res.json({
      message: `${results.length} xodim oylik hisoblandi${planMsg}`,
      salaries: results,
      plan: { plan, actual_sales: actualSales, overage_pct: overagePct },
      summary: {
        total_employees: results.length,
        total_gross: results.reduce((s, r) => s + (r.total_calculated || 0), 0),
        total_tax: results.reduce((s, r) => s + (r.tax_amount || 0), 0),
        total_bonus: results.reduce((s, r) => s + (r.bonuses || 0), 0),
        total_net: results.reduce((s, r) => s + (r.net_amount || 0), 0)
      }
    });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/adjust — Bonus/jarima
router.put('/:id/adjust', requireRole('OWNER', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { bonuses = 0, penalties = 0, notes } = req.body;
    const salary = await query('SELECT * FROM salaries WHERE id=$1', [req.params.id]);
    if (!salary.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });

    const s = salary.rows[0];
    const net_amount = parseFloat(s.total_calculated) + parseFloat(bonuses) - parseFloat(penalties);

    const result = await query(
      'UPDATE salaries SET bonuses=$1, penalties=$2, net_amount=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [bonuses, penalties, net_amount, notes, req.params.id]
    );
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/approve — OWNER tasdiqlaydi
router.put('/:id/approve', requireRole('OWNER'), async (req, res, next) => {
  try {
    // Holatni avval tekshiramiz (SQLite adapteri RETURNING'da faqat id bo'yicha qaytaradi,
    // shuning uchun WHERE'dagi status shartiga tayanib bo'lmaydi)
    const cur = await query('SELECT status FROM salaries WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });
    if (cur.rows[0].status !== 'CALCULATED') return res.status(400).json({ error: 'Oylik allaqachon tasdiqlangan' });
    const result = await query(
      'UPDATE salaries SET status=\'APPROVED\', approved_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/salaries/:id/pay — To'landi
router.put('/:id/pay', requireRole('OWNER'), async (req, res, next) => {
  try {
    // Holatni avval tekshiramiz (RETURNING faqat id bo'yicha qaytadi — WHERE status shartiga tayanmaymiz)
    const cur = await query('SELECT status FROM salaries WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });
    if (cur.rows[0].status !== 'APPROVED') return res.status(400).json({ error: 'Oylik tasdiqlangan emas yoki allaqachon to\'langan' });
    const result = await query(
      'UPDATE salaries SET status=\'PAID\', paid_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    logAudit(req, {
      action: 'SALARY_PAID', table: 'salaries', recordId: req.params.id,
      newValues: { net_amount: result.rows[0].net_amount, employee_id: result.rows[0].employee_id },
    });
    res.json({ salary: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/salaries/:id/slip — Oylik chop (Salary slip)
router.get('/:id/slip', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, e.name as employee_name, e.type as employee_type, e.phone
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Oylik topilmadi' });

    const salary = result.rows[0];
    const slip = {
      header: {
        company: 'TEKNOPLAST ZAVODI',
        period: salary.month,
        date: new Date().toLocaleDateString('uz-UZ'),
      },
      employee: {
        name: salary.employee_name,
        type: salary.employee_type,
        phone: salary.phone,
      },
      earnings: {
        gross: salary.total_calculated,
        work_days: salary.work_days,
        units_produced: salary.total_produced,
      },
      deductions: {
        tax: salary.tax_amount,
        social_security: salary.social_security,
        bonuses_penalties: (salary.bonuses || 0) - (salary.penalties || 0),
      },
      summary: {
        gross_amount: salary.total_calculated,
        total_deductions: (salary.tax_amount || 0) + (salary.social_security || 0),
        bonuses: salary.bonuses || 0,
        penalties: salary.penalties || 0,
        net_amount: salary.net_amount,
      },
      status: salary.status,
      notes: salary.notes,
    };

    res.json({ slip });
  } catch (err) { next(err); }
});

// GET /api/salaries/monthly-summary?month=2024-01 — Oylik jamlanma
router.get('/monthly/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const details = await query(`
      SELECT
        COUNT(*) as total_employees,
        COALESCE(SUM(total_calculated), 0) as gross_total,
        COALESCE(SUM(tax_amount), 0) as total_tax,
        COALESCE(SUM(social_security), 0) as total_social,
        COALESCE(SUM(bonuses), 0) as total_bonuses,
        COALESCE(SUM(penalties), 0) as total_penalties,
        COALESCE(SUM(net_amount), 0) as net_total,
        COUNT(CASE WHEN status='PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status='APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status='CALCULATED' THEN 1 END) as calculated_count
      FROM salaries
      WHERE month = $1
    `, [period]);

    const summary = details.rows[0];
    const breakdown = await query(`
      SELECT e.type, COUNT(*) as count, COALESCE(SUM(s.net_amount), 0) as total_net
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.month = $1
      GROUP BY e.type
      ORDER BY total_net DESC
    `, [period]);

    res.json({
      month: period,
      summary,
      breakdown_by_type: breakdown.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/salaries/employee/:employee_id?month=2024-01 — Bir ishchining oylik
router.get('/employee/:employee_id', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const result = await query(`
      SELECT s.*, e.name, e.type, e.phone,
             (SELECT COUNT(DISTINCT production_date) FROM employee_production
              WHERE employee_id = e.id AND month = s.month) as work_days,
             (SELECT SUM(quantity_produced) FROM employee_production
              WHERE employee_id = e.id AND month = s.month) as total_produced
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.employee_id = $1 AND s.month = $2
    `, [req.params.employee_id, period]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Ishchi yoki oylik topilmadi' });
    }

    const salary = result.rows[0];
    res.json({ salary });
  } catch (err) { next(err); }
});

module.exports = router;
