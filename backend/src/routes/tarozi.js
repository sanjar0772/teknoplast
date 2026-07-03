/**
 * Tarozi (weighbridge) cheklari.
 * - TAMINOTCHI (va boshqa tarozi rollari) chek chiqaradi → POST (serverga saqlanadi)
 * - ADMIN (EGA) tarozidan tushayotgan cheklarni ko'radi → GET (kun bo'yicha + jami)
 * Asosiy tizim (zavod) uchun — branch_id NULL.
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureTaroziSchema } = require('../services/taroziSchema');
const { todayUZB } = require('../utils/date');

const router = express.Router();
router.use(authenticate);

// Tarozini ishlata oladigan rollar (chek chiqarish)
const TAROZI_ROLES = ['OWNER', 'TAMINOTCHI', 'KIRIMCHI', 'OMBORCHI', 'PRODUCTION_HEAD'];

// POST /api/tarozi — chekni saqlash (tortishdan keyin)
router.post('/', requireRole(...TAROZI_ROLES), async (req, res, next) => {
  try {
    await ensureTaroziSchema();
    const { mashina, mahsulot, haydovchi, brutto, tara, netto, sana } = req.body;
    const b = parseFloat(brutto) || 0;
    const t = parseFloat(tara) || 0;
    const n = netto !== undefined ? (parseFloat(netto) || 0) : Math.max(0, b - t);
    if (!mashina || !String(mashina).trim()) return res.status(400).json({ error: 'Mashina raqami kerak' });
    if (b <= 0 || t <= 0 || b <= t) return res.status(400).json({ error: "Brutto tara'dan katta bo'lishi kerak" });

    // Chek raqami: klient bergan raqamdan yoki serverdagi eng katta + 1 (bittasi ham bo'lmasa 1)
    const branchId = req.user.branch_id || null;
    let no = parseInt(req.body.no, 10);
    if (!Number.isFinite(no) || no <= 0) {
      const mx = (await query(`SELECT COALESCE(MAX(receipt_no), 0) AS mx FROM tarozi_receipts`, [])).rows[0];
      no = (parseInt(mx.mx, 10) || 0) + 1;
    }
    await query(
      `INSERT INTO tarozi_receipts (receipt_no, mashina, mahsulot, haydovchi, brutto, tara, netto, sana, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [no, String(mashina).trim(), (mahsulot || '').trim() || null, (haydovchi || '').trim() || null,
       b, t, n, sana || todayUZB(), req.user.id, branchId]
    );
    res.status(201).json({ success: true, receipt_no: no });
  } catch (err) { next(err); }
});

// GET /api/tarozi?date=YYYY-MM-DD — kun bo'yicha cheklar + jami (admin ko'radi)
router.get('/', requireRole('OWNER', 'TAMINOTCHI'), async (req, res, next) => {
  try {
    await ensureTaroziSchema();
    const date = req.query.date || todayUZB();
    const branchId = req.user.branch_id || null;
    // Filial scope: zavod → branch_id IS NULL; filialga kirgan bo'lsa o'sha filial
    const scope = branchId ? ` AND branch_id = $2` : ` AND branch_id IS NULL`;
    const params = branchId ? [date, branchId] : [date];
    const rows = (await query(
      `SELECT id, receipt_no, mashina, mahsulot, haydovchi, brutto, tara, netto, sana, created_at
       FROM tarozi_receipts
       WHERE sana = $1${scope}
       ORDER BY receipt_no DESC, created_at DESC`,
      params
    )).rows;
    const totals = rows.reduce((a, r) => {
      a.count += 1;
      a.netto += parseFloat(r.netto) || 0;
      a.brutto += parseFloat(r.brutto) || 0;
      return a;
    }, { count: 0, netto: 0, brutto: 0 });
    // Umumiy eng katta chek raqami (klient raqamlashni davom ettirishi uchun)
    const mxRow = (await query(
      `SELECT COALESCE(MAX(receipt_no), 0) AS mx FROM tarozi_receipts${branchId ? ' WHERE branch_id = $1' : ' WHERE branch_id IS NULL'}`,
      branchId ? [branchId] : []
    )).rows[0];
    res.json({ date, receipts: rows, totals, max_no: parseInt(mxRow.mx, 10) || 0 });
  } catch (err) { next(err); }
});

module.exports = router;
