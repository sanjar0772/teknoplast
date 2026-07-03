/**
 * Agent — shaxsiy ma'lumotlar (profil) va GPS joylashuv.
 * - Agent o'z profilini kiritadi/tahrirlaydi (F.I.Sh., passport, manzil, tug'ilgan sana)
 * - Agent telefoni joylashuvni yuboradi (avtomatik, har necha daqiqada)
 * - EGA barcha agentlarning oxirgi joylashuvini ko'radi (xarita havolasi bilan)
 */
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureAgentSchema } = require('../services/agentSchema');

const router = express.Router();
router.use(authenticate);

// GET /api/agent/profile — o'z profili (shaxsiy ma'lumotlar)
router.get('/profile', async (req, res, next) => {
  try {
    await ensureAgentSchema();
    const r = await query(
      `SELECT u.id, u.phone, u.full_name, u.role, u.passport, u.address, u.birth_date,
              u.last_lat, u.last_lng, u.last_location_at, u.branch_id, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ profile: r.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/agent/profile — o'z shaxsiy ma'lumotlarini yangilash
router.put('/profile', async (req, res, next) => {
  try {
    await ensureAgentSchema();
    const { full_name, passport, address, birth_date } = req.body;
    const cur = (await query('SELECT full_name, passport, address, birth_date FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    await query(
      `UPDATE users SET full_name = $1, passport = $2, address = $3, birth_date = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        (full_name && String(full_name).trim()) || cur.full_name,
        passport !== undefined ? (passport || null) : cur.passport,
        address !== undefined ? (address || null) : cur.address,
        birth_date !== undefined ? (birth_date ? String(birth_date).slice(0, 10) : null) : cur.birth_date,
        req.user.id,
      ]
    );
    // MUHIM: RETURNING ishlatmaymiz — SQLite adapter RETURNING'да butun qatorni
    // (password_hash bilan) qaytarib yuboradi. Alohida SELECT xavfsiz.
    const r = await query(
      `SELECT id, phone, full_name, passport, address, birth_date FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ profile: r.rows[0], message: "Shaxsiy ma'lumotlar saqlandi" });
  } catch (err) { next(err); }
});

// POST /api/agent/location — telefon GPS joylashuvini yuborish (agent ilovasi avtomatik yuboradi)
router.post('/location', async (req, res, next) => {
  try {
    await ensureAgentSchema();
    const lat = parseFloat(req.body.lat);
    const lng = parseFloat(req.body.lng);
    const accuracy = parseFloat(req.body.accuracy) || null;
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "Joylashuv noto'g'ri" });
    }
    await query(
      `UPDATE users SET last_lat = $1, last_lng = $2, last_location_at = NOW() WHERE id = $3`,
      [lat, lng, req.user.id]
    );
    await query(
      `INSERT INTO agent_locations (user_id, lat, lng, accuracy) VALUES ($1, $2, $3, $4)`,
      [req.user.id, lat, lng, accuracy]
    );
    // Tarixni tozalab turish — 30 kundan eski yozuvlar o'chadi
    try {
      await query(`DELETE FROM agent_locations WHERE created_at < NOW() - INTERVAL '30 days'`, []);
    } catch { /* SQLite'da NOW()-INTERVAL ishlamasa e'tiborsiz */ }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/agent/locations — agentlarning oxirgi joylashuvi.
// EGA (admin) — barcha agentlar (yoki filialga kirgan bo'lsa o'sha filial);
// SAVDO BOSHLIG'I — faqat o'z filiali agentlari.
router.get('/locations', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    await ensureAgentSchema();
    const branchId = req.user.branch_id || null; // SALES_HEAD'da doim bor; OWNER acting bo'lsa ham
    let where = "u.role = 'AGENT'";
    const params = [];
    if (branchId) { where += ` AND u.branch_id = $1`; params.push(branchId); }
    const r = await query(
      `SELECT u.id, u.full_name, u.phone, u.last_lat, u.last_lng, u.last_location_at,
              u.is_active, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE ${where}
       ORDER BY u.last_location_at DESC`,
      params
    );
    res.json({ agents: r.rows });
  } catch (err) { next(err); }
});

// GET /api/agent/:id/track — bitta agentning yo'nalishi (EGA + o'z filiali uchun SAVDO BOSHLIG'I)
router.get('/:id/track', requireRole('OWNER', 'SALES_HEAD'), async (req, res, next) => {
  try {
    await ensureAgentSchema();
    // Filial guard — savdo boshlig'i / filialga kirgan ega faqat o'z filiali agentini ko'radi
    const branchId = req.user.branch_id || null;
    if (branchId) {
      const a = await query(`SELECT branch_id FROM users WHERE id = $1 AND role = 'AGENT'`, [req.params.id]);
      if (!a.rows.length || String(a.rows[0].branch_id || '') !== String(branchId)) {
        return res.status(403).json({ error: "Bu agent sizning filialingizniki emas" });
      }
    }
    const date = req.query.date || null;
    let where = 'user_id = $1';
    const params = [req.params.id];
    if (date) { where += ` AND DATE(created_at) = $2`; params.push(date); }
    const r = await query(
      `SELECT lat, lng, accuracy, created_at FROM agent_locations
       WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json({ track: r.rows });
  } catch (err) { next(err); }
});

module.exports = router;
