/**
 * Xom ashyo qabul aktlari.
 * - Xom ashyo qabul qiladigan rollar (KIRIMCHI, TAMINOTCHI, ...) akt chiqaradi → POST
 *   Har qabul avtomatik Xarajatlar (RAW_MATERIAL) sifatida yoziladi (expense_id bog'lanadi).
 * - EGA aktlarni ko'radi → GET (kun bo'yicha + jami).
 * Asosiy tizim (zavod) uchun — branch_id NULL.
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureXomAshyoSchema } = require('../services/xomAshyoSchema');
const { todayUZB } = require('../utils/date');

const router = express.Router();
router.use(authenticate);

// Xom ashyo qabul qila oladigan rollar
const XOM_ROLES = ['OWNER', 'TAMINOTCHI', 'KIRIMCHI', 'OMBORCHI', 'PRODUCTION_HEAD'];

// POST /api/xom-ashyo — qabul aktini saqlash + xarajatga yozish
router.post('/', requireRole(...XOM_ROLES), async (req, res, next) => {
  try {
    await ensureXomAshyoSchema();
    const { sotuvchi, oluvchi, mahsulot, brutto, tara, netto, summa, izoh, sana } = req.body;
    const b = parseFloat(brutto) || 0;
    const t = parseFloat(tara) || 0;
    const n = netto !== undefined ? (parseFloat(netto) || 0) : Math.max(0, b - t);
    const s = parseFloat(summa) || 0;
    if (!sotuvchi || !String(sotuvchi).trim()) return res.status(400).json({ error: 'Sotuvchi ismini kiriting' });
    if (b <= 0 || t <= 0 || b <= t) return res.status(400).json({ error: "Brutto tara'dan katta bo'lishi kerak" });
    if (s <= 0) return res.status(400).json({ error: 'Summani kiriting' });

    const branchId = req.user.branch_id || null;
    const theDate = sana || todayUZB();

    // Akt raqami: klient bergan raqamdan yoki serverdagi eng katta + 1
    let no = parseInt(req.body.no, 10);
    if (!Number.isFinite(no) || no <= 0) {
      const mx = (await query(`SELECT COALESCE(MAX(receipt_no), 0) AS mx FROM xom_ashyo_receipts`, [])).rows[0];
      no = (parseInt(mx.mx, 10) || 0) + 1;
    }

    // 1) Xarajat (RAW_MATERIAL) — pul chiqimini hisobga olish
    const izohText = `Xom ashyo qabul №${no}: ${String(sotuvchi).trim()}${mahsulot ? ` — ${String(mahsulot).trim()}` : ''} (${n} kg)`;
    const exp = await query(
      `INSERT INTO expenses (category, amount, description, expense_date, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ['RAW_MATERIAL', s, izohText, theDate, req.user.id, branchId]
    );
    const expenseId = exp.rows[0]?.id || null;

    // 2) Qabul akti — to'liq yozuv (imzo aktida qayta chop etish uchun)
    await query(
      `INSERT INTO xom_ashyo_receipts
        (receipt_no, sotuvchi, oluvchi, mahsulot, brutto, tara, netto, summa, izoh, sana, expense_id, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [no, String(sotuvchi).trim(), (oluvchi || '').trim() || null, (mahsulot || '').trim() || null,
       b, t, n, s, (izoh || '').trim() || null, theDate, expenseId, req.user.id, branchId]
    );

    res.status(201).json({ success: true, receipt_no: no, expense_id: expenseId });
  } catch (err) { next(err); }
});

// GET /api/xom-ashyo?date=YYYY-MM-DD — kun bo'yicha aktlar + jami (ega ko'radi)
router.get('/', requireRole('OWNER', 'TAMINOTCHI', 'KIRIMCHI'), async (req, res, next) => {
  try {
    await ensureXomAshyoSchema();
    const date = req.query.date || todayUZB();
    const branchId = req.user.branch_id || null;
    const scope = branchId ? ` AND branch_id = $2` : ` AND branch_id IS NULL`;
    const params = branchId ? [date, branchId] : [date];
    const rows = (await query(
      `SELECT id, receipt_no, sotuvchi, oluvchi, mahsulot, brutto, tara, netto, summa, izoh, sana, created_at
       FROM xom_ashyo_receipts
       WHERE sana = $1${scope}
       ORDER BY receipt_no DESC, created_at DESC`,
      params
    )).rows;
    const totals = rows.reduce((a, r) => {
      a.count += 1;
      a.netto += parseFloat(r.netto) || 0;
      a.summa += parseFloat(r.summa) || 0;
      return a;
    }, { count: 0, netto: 0, summa: 0 });
    const mxRow = (await query(
      `SELECT COALESCE(MAX(receipt_no), 0) AS mx FROM xom_ashyo_receipts${branchId ? ' WHERE branch_id = $1' : ' WHERE branch_id IS NULL'}`,
      branchId ? [branchId] : []
    )).rows[0];
    res.json({ date, receipts: rows, totals, max_no: parseInt(mxRow.mx, 10) || 0 });
  } catch (err) { next(err); }
});

module.exports = router;
