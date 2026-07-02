const jwt = require('jsonwebtoken');
const { query } = require('../db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token taqdim etilmagan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `SELECT u.id, u.phone, u.full_name, u.role, u.is_active, u.branch_id, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Foydalanuvchi topilmadi yoki bloklangan' });
    }

    req.user = result.rows[0];

    // EGA (OWNER) filialga "admin sifatida kirishi" — X-Branch-Id header bo'lsa, o'sha filial
    // konteksti (branch_id) o'rnatiladi va butun tizim shu filial bo'yicha scope bo'ladi.
    // Faqat OWNER uchun; filial sotuvchisining branch_id'si bazadan olinadi, header e'tiborsiz.
    if (req.user.role === 'OWNER') {
      const actingBranch = req.headers['x-branch-id'];
      if (actingBranch) {
        try {
          const b = await query('SELECT id, name FROM branches WHERE id = $1', [actingBranch]);
          if (b.rows.length) {
            req.user.branch_id = b.rows[0].id;
            req.user.branch_name = b.rows[0].name;
            req.user.acting_as_branch = true;
          }
        } catch { /* branches jadvali yo'q — e'tiborsiz */ }
      }
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token muddati tugagan' });
    }
    return res.status(401).json({ error: 'Noto\'g\'ri token' });
  }
};

module.exports = { authenticate };
