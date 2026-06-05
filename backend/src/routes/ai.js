const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();
router.use(authenticate);

// GET /api/ai/alerts — Smart alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const alerts = await query(
      'SELECT * FROM smart_alerts WHERE is_resolved=false ORDER BY severity DESC, triggered_date DESC LIMIT 20'
    );
    res.json({ alerts: alerts.rows });
  } catch (err) { next(err); }
});

// PUT /api/ai/alerts/:id/dismiss
router.put('/alerts/:id/dismiss', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE smart_alerts SET dismissed_by=$1, dismissed_at=NOW(), is_resolved=true WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Alert topilmadi' });
    res.json({ alert: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/ai/salary-analysis?month=2024-01
router.get('/salary-analysis', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const cached = await query(
      'SELECT * FROM ai_analyses WHERE type=$1 AND period=$2 AND expire_at > NOW() ORDER BY created_at DESC LIMIT 1',
      ['SALARY_ANALYSIS', period]
    );
    if (cached.rows.length) return res.json({ analysis: cached.rows[0], cached: true });

    const salaryData = await query(`
      SELECT e.name, e.type, s.total_calculated, s.bonuses, s.penalties, s.net_amount,
             ep.total_produced, ep.work_days
      FROM salaries s JOIN employees e ON s.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(quantity_produced) as total_produced, COUNT(*) as work_days
        FROM employee_production WHERE month=$1 GROUP BY employee_id
      ) ep ON ep.employee_id = s.employee_id
      WHERE s.month = $1
    `, [period]);

    const analysis = await aiService.analyzeSalaries(salaryData.rows, period);

    const saved = await query(
      'INSERT INTO ai_analyses (type, period, analysis_data, recommendations) VALUES ($1,$2,$3,$4) RETURNING *',
      ['SALARY_ANALYSIS', period, JSON.stringify(analysis), analysis.recommendations || []]
    );

    res.json({ analysis: saved.rows[0], cached: false });
  } catch (err) { next(err); }
});

// GET /api/ai/sales-forecast
router.get('/sales-forecast', async (req, res, next) => {
  try {
    const cached = await query(
      'SELECT * FROM ai_analyses WHERE type=$1 AND expire_at > NOW() ORDER BY created_at DESC LIMIT 1',
      ['SALES_FORECAST']
    );
    if (cached.rows.length) return res.json({ analysis: cached.rows[0], cached: true });

    const salesData = await query(`
      SELECT TO_CHAR(sale_date,'YYYY-MM') as month, p.name as product,
             SUM(s.quantity) as qty, SUM(s.total_amount) as revenue
      FROM sales s JOIN products p ON s.product_id = p.id
      WHERE sale_date >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(sale_date,'YYYY-MM'), p.name ORDER BY month, product
    `);

    const analysis = await aiService.forecastSales(salesData.rows);

    const saved = await query(
      'INSERT INTO ai_analyses (type, period, analysis_data, recommendations) VALUES ($1,$2,$3,$4) RETURNING *',
      ['SALES_FORECAST', new Date().toISOString().slice(0, 7), JSON.stringify(analysis), analysis.recommendations || []]
    );

    res.json({ analysis: saved.rows[0], cached: false });
  } catch (err) { next(err); }
});

// GET /api/ai/expense-optimization?month=2024-01
router.get('/expense-optimization', async (req, res, next) => {
  try {
    const { month } = req.query;
    const period = month || new Date().toISOString().slice(0, 7);

    const cached = await query(
      'SELECT * FROM ai_analyses WHERE type=$1 AND period=$2 AND expire_at > NOW() ORDER BY created_at DESC LIMIT 1',
      ['EXPENSE_OPTIMIZATION', period]
    );
    if (cached.rows.length) return res.json({ analysis: cached.rows[0], cached: true });

    const expenseData = await query(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1
      GROUP BY category ORDER BY total DESC
    `, [period]);

    const prevData = await query(`
      SELECT category, SUM(amount) as total
      FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = TO_CHAR((TO_DATE($1,'YYYY-MM') - INTERVAL '1 month'),'YYYY-MM')
      GROUP BY category
    `, [period]);

    const analysis = await aiService.optimizeExpenses(expenseData.rows, prevData.rows, period);

    const saved = await query(
      'INSERT INTO ai_analyses (type, period, analysis_data, recommendations) VALUES ($1,$2,$3,$4) RETURNING *',
      ['EXPENSE_OPTIMIZATION', period, JSON.stringify(analysis), analysis.recommendations || []]
    );

    res.json({ analysis: saved.rows[0], cached: false });
  } catch (err) { next(err); }
});

// POST /api/ai/chat
router.post('/chat', async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Savol kiritilmagan' });

    const start = Date.now();
    const context = await buildChatContext();
    const answer = await aiService.chat(question, context, req.user);
    const processingTime = Date.now() - start;

    await query(
      'INSERT INTO ai_chat_history (user_id, question, answer, processing_time) VALUES ($1,$2,$3,$4)',
      [req.user.id, question, answer, processingTime]
    );

    res.json({ answer, processing_time: processingTime });
  } catch (err) { next(err); }
});

// GET /api/ai/chat-history
router.get('/chat-history', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM ai_chat_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ history: result.rows });
  } catch (err) { next(err); }
});

async function buildChatContext() {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const [sales, expenses, employees, products] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0) as monthly FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM')=$1`, [month]),
    query(`SELECT COALESCE(SUM(amount),0) as monthly FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM')=$1`, [month]),
    query(`SELECT COUNT(*) as active FROM employees WHERE is_active=true`),
    query(`SELECT COUNT(*) as low_stock FROM products WHERE stock_quantity < 10 AND is_active=true`),
  ]);

  return {
    current_month: month,
    today,
    monthly_sales: sales.rows[0].monthly,
    monthly_expenses: expenses.rows[0].monthly,
    active_employees: employees.rows[0].active,
    low_stock_products: products.rows[0].low_stock,
  };
}

module.exports = router;
