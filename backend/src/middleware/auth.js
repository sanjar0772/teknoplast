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
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token muddati tugagan' });
    }
    return res.status(401).json({ error: 'Noto\'g\'ri token' });
  }
};

module.exports = { authenticate };
