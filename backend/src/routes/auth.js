const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Kuchli vaqtinchalik parol (chalkash belgilarsiz: 0/O, 1/l/I yo'q)
function genTempPassword() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lc = 'abcdefghijkmnpqrstuvwxyz', nn = '23456789';
  const pick = s => s[crypto.randomInt(s.length)];
  return pick(A) + pick(A) + pick(lc) + pick(lc) + pick(nn) + pick(nn) + pick(nn) + pick(nn);
}

// POST /api/auth/login
router.post('/login', [
  body('phone').notEmpty().withMessage('Telefon raqam kiritilmagan'),
  body('password').isLength({ min: 6 }).withMessage('Parol kamida 6 belgi'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone, password } = req.body;
    const result = await query(
      'SELECT * FROM users WHERE phone = $1 AND is_active = true',
      [phone]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Telefon raqam yoki parol noto\'g\'ri' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Telefon raqam yoki parol noto\'g\'ri' });
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await query(
      'INSERT INTO audit_logs (user_id, action, table_name) VALUES ($1, $2, $3)',
      [user.id, 'LOGIN', 'users']
    );

    const remember = req.body.remember !== false;
    const expiresIn = remember ? (process.env.JWT_EXPIRES_IN || '30d') : '8h';
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Filialga biriktirilgan bo'lsa — filial nomini ham qaytaramiz
    let branchName = null;
    if (user.branch_id) {
      try {
        const b = await query('SELECT name FROM branches WHERE id = $1', [user.branch_id]);
        branchName = b.rows[0]?.name || null;
      } catch { /* branches jadvali hali yo'q bo'lsa — e'tiborsiz */ }
    }

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        branch_id: user.branch_id || null,
        branch_name: branchName,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register (faqat OWNER)
router.post('/register', authenticate, [
  body('phone').notEmpty().withMessage('Telefon kiritilmagan'),
  body('password').isLength({ min: 6 }).withMessage('Parol kamida 6 belgi'),
  body('full_name').notEmpty().withMessage('Ism kiritilmagan'),
  body('role').isIn(['OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD', 'KIRIMCHI', 'OMBORCHI', 'TAMINOTCHI', 'CYCLE_TIME', 'AGENT', 'SHOPIR']).withMessage('Noto\'g\'ri rol'),
], async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Faqat ega yangi foydalanuvchi qo\'sha oladi' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone, password, full_name, role, branch_id } = req.body;
    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (phone, password_hash, full_name, role, branch_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, phone, full_name, role, branch_id',
      [phone, password_hash, full_name, role, branch_id || null]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, [
  body('old_password').notEmpty(),
  body('new_password').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { old_password, new_password } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const isValid = await bcrypt.compare(old_password, result.rows[0].password_hash);

    if (!isValid) {
      return res.status(400).json({ error: 'Eski parol noto\'g\'ri' });
    }

    const new_hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [new_hash, req.user.id]);

    res.json({ message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/users (faqat OWNER)
router.get('/users', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Ruxsat yo\'q' });
    }
    // FILIAL AJRATISH: EGA filial ichida bo'lsa (acting) — faqat o'sha filial xodimlari;
    // zavodda bo'lsa — faqat zavod (branch_id NULL) foydalanuvchilari.
    const scope = req.user.branch_id || null;
    const result = await query(
      `SELECT u.id, u.phone, u.full_name, u.role, u.is_active, u.last_login, u.created_at,
              u.branch_id, b.name AS branch_name,
              u.last_lat, u.last_lng, u.last_location_at
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE ${scope ? 'u.branch_id = $1' : 'u.branch_id IS NULL'}
       ORDER BY u.created_at DESC`,
      scope ? [scope] : []
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/users/:id/toggle (OWNER)
router.put('/users/:id/toggle', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Ruxsat yo\'q' });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'O\'zingizni bloklashingiz mumkin emas' });
    }
    const result = await query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/users/:id/reset-password (faqat OWNER) — yangi vaqtinchalik parol beradi
router.put('/users/:id/reset-password', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Faqat ega parolni tiklay oladi' });
    }
    const u = await query('SELECT id, full_name, phone FROM users WHERE id = $1', [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    const tempPass = genTempPassword();
    const hash = await bcrypt.hash(tempPass, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.params.id]);

    res.json({ success: true, full_name: u.rows[0].full_name, phone: u.rows[0].phone, temp_password: tempPass });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/users/:id (faqat OWNER) — foydalanuvchini butunlay o'chirish
router.delete('/users/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Faqat ega foydalanuvchini o\'chira oladi' });
    }
    if (req.params.id === String(req.user.id)) {
      return res.status(400).json({ error: 'O\'zingizni o\'chira olmaysiz' });
    }
    const u = await query('SELECT id, full_name FROM users WHERE id = $1', [req.params.id]);
    if (!u.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: `${u.rows[0].full_name} o'chirildi` });
  } catch (err) {
    if (err.message?.includes('foreign key') || err.message?.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Bu foydalanuvchining ma\'lumotlari bor — avval bloklash (Bloklash tugmasi) ishlatilsin' });
    }
    next(err);
  }
});

module.exports = router;
