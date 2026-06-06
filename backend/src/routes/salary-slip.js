const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate);

// HTML Salary Slip Template
function generateSalarySlipHTML(salary, employee) {
  const uzDate = new Date().toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const [year, month] = salary.month.split('-');
  const monthNames = {
    '01': 'Yanvar', '02': 'Fevral', '03': 'Mart', '04': 'Aprel',
    '05': 'May', '06': 'Iyun', '07': 'Iyul', '08': 'Avgust',
    '09': 'Sentabr', '10': 'Oktabr', '11': 'Noyabr', '12': 'Dekabr'
  };

  return `
<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oylik Hisobot - ${employee.name}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0;
            color: #0066cc;
            font-size: 28px;
        }
        .header p {
            margin: 5px 0;
            color: #666;
        }
        .period {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            margin-top: 10px;
        }
        .employee-info {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #0066cc;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 14px;
        }
        .info-label {
            font-weight: bold;
            color: #333;
        }
        .info-value {
            color: #666;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th {
            background: #0066cc;
            color: white;
            padding: 12px;
            text-align: left;
            font-size: 14px;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
            font-size: 14px;
        }
        .amount {
            text-align: right;
            font-weight: bold;
        }
        .total-row {
            background: #f0f0f0;
            font-weight: bold;
        }
        .summary {
            margin: 30px 0;
            padding: 20px;
            background: #f0f0f0;
            border-radius: 5px;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            font-size: 16px;
        }
        .summary-label {
            font-weight: bold;
        }
        .summary-amount {
            font-weight: bold;
            color: #0066cc;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #999;
            font-size: 12px;
        }
        .status {
            padding: 5px 10px;
            border-radius: 3px;
            font-weight: bold;
            display: inline-block;
        }
        .status.paid {
            background: #00aa00;
            color: white;
        }
        .status.approved {
            background: #0066cc;
            color: white;
        }
        .status.calculated {
            background: #ff9900;
            color: white;
        }
        @media print {
            body { margin: 0; padding: 0; background: white; }
            .container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏭 TEKNOPLAST ZAVODI</h1>
            <p>Oylik Hisob-Kitob (Salary Slip)</p>
            <div class="period">${monthNames[month]} - ${year}</div>
        </div>

        <div class="employee-info">
            <div class="info-row">
                <span class="info-label">FIO:</span>
                <span class="info-value">${employee.name}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Lavozimi:</span>
                <span class="info-value">${employee.type}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Telefon:</span>
                <span class="info-value">${employee.phone || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Holat:</span>
                <span class="status ${salary.status.toLowerCase()}">${salary.status}</span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>ISHLAB CHIQARISH</th>
                    <th class="amount">Miqdor</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Jami hisoblangan</td>
                    <td class="amount">${parseInt(salary.total_calculated).toLocaleString('uz-UZ')} UZS</td>
                </tr>
                <tr>
                    <td>Ishlab chiqarilgan birliklar</td>
                    <td class="amount">${salary.total_produced || 0} dona</td>
                </tr>
                <tr>
                    <td>Ish kunlari</td>
                    <td class="amount">${salary.work_days || 0} kun</td>
                </tr>
            </tbody>
        </table>

        <table>
            <thead>
                <tr>
                    <th>CHEGIRMALAR VA QO'SHIMCHALAR</th>
                    <th class="amount">Miqdor</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Soliq (5%)</td>
                    <td class="amount">- ${parseInt(salary.tax_amount || 0).toLocaleString('uz-UZ')} UZS</td>
                </tr>
                <tr>
                    <td>Ijtimoiy sug'urta (3%)</td>
                    <td class="amount">- ${parseInt(salary.social_security || 0).toLocaleString('uz-UZ')} UZS</td>
                </tr>
                ${salary.bonuses ? `
                <tr>
                    <td>Bonus</td>
                    <td class="amount">+ ${parseInt(salary.bonuses).toLocaleString('uz-UZ')} UZS</td>
                </tr>
                ` : ''}
                ${salary.penalties ? `
                <tr>
                    <td>Jarima</td>
                    <td class="amount">- ${parseInt(salary.penalties).toLocaleString('uz-UZ')} UZS</td>
                </tr>
                ` : ''}
            </tbody>
        </table>

        <div class="summary">
            <div class="summary-row">
                <span class="summary-label">Brutto summa (Gross):</span>
                <span class="summary-amount">${parseInt(salary.total_calculated).toLocaleString('uz-UZ')} UZS</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Jami chegirmalar:</span>
                <span class="summary-amount">- ${parseInt((salary.tax_amount || 0) + (salary.social_security || 0)).toLocaleString('uz-UZ')} UZS</span>
            </div>
            <div class="summary-row">
                <span class="summary-label" style="color: #0066cc; font-size: 18px;">Netto (To'lanadigan):</span>
                <span class="summary-amount" style="color: #0066cc; font-size: 18px;">${parseInt(salary.net_amount).toLocaleString('uz-UZ')} UZS</span>
            </div>
        </div>

        ${salary.notes ? `
        <div style="margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 5px;">
            <strong>Eslatmalar:</strong><br/>
            ${salary.notes}
        </div>
        ` : ''}

        <div class="footer">
            <p>Tayorlangan: ${uzDate}</p>
            <p>Bu hujjat TEKNOPLAST ZAVODI'ning rasmiy oylik hisob-kitobidir</p>
            <p>Savollar bo'lsa: hisobchi@teknoplast.uz</p>
        </div>
    </div>
</body>
</html>
  `;
}

// GET /api/salary-slip/:id — Salary slip HTML
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, e.name, e.type, e.phone
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Oylik topilmadi' });
    }

    const salary = result.rows[0];
    const employee = {
      name: salary.name,
      type: salary.type,
      phone: salary.phone,
    };

    const html = generateSalarySlipHTML(salary, employee);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// GET /api/salary-slip/:id/print — Print-ready HTML
router.get('/:id/print', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, e.name, e.type, e.phone
      FROM salaries s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Oylik topilmadi' });
    }

    const salary = result.rows[0];
    const employee = {
      name: salary.name,
      type: salary.type,
      phone: salary.phone,
    };

    const html = generateSalarySlipHTML(salary, employee);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="Oylik-${salary.name}-${salary.month}.html"`);
    res.send(html);
  } catch (err) { next(err); }
});

module.exports = router;
