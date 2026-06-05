/**
 * Audit log xizmati — har bir muhim moliyaviy o'zgarishni yozib boradi.
 * Kim, qachon, qaysi jadval, qaysi yozuv, eski → yangi qiymat.
 */
const { query } = require('../db');

async function logAudit(req, { action, table, recordId, oldValues, newValues }) {
  try {
    const ip = (req && (req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress)) || null;
    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        req?.user?.id || null,
        action,
        table || null,
        recordId ? String(recordId) : null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ip,
      ]
    );
  } catch (e) {
    // Audit muvaffaqiyatsiz bo'lsa, asosiy amal to'xtamasligi kerak
    console.warn('⚠️ Audit log xato:', e.message);
  }
}

module.exports = { logAudit };
