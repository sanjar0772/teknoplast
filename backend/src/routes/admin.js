/**
 * Admin tekshiruv/diagnostika endpointlari (faqat OWNER).
 * Asosiy maqsad: server almashganda yo'qolgan ma'lumotni (masalan komponent
 * belgilashlari) zaxira (backup) fayllaridan TOPISH — har bir nusxada nechta
 * KOMPONENT borligini sanab beradi. Hech narsa o'zgartirmaydi (faqat o'qiydi).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'teknoplast.sqlite');
const DB_DIR = path.dirname(DB_PATH);
const BACKUP_DIR = path.join(DB_DIR, 'backups');

// GET /api/admin/dbinfo — YENGIL diagnostika (sql.js YO'Q): baza qayerda saqlanyapti,
// fayl bormi, hajmi, zaxiralar bormi. Ma'lumot nega yo'qolayotganini aniqlash uchun.
router.get('/dbinfo', (req, res) => {
  try {
    if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Ruxsat yo\'q' });
    const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
    const fileInfo = (f) => {
      if (!safe(() => fs.existsSync(f), false)) return { exists: false };
      const st = safe(() => fs.statSync(f), null);
      return { exists: true, size_kb: st ? Math.round(st.size / 1024) : null, modified: st ? st.mtime.toISOString() : null };
    };
    res.json({
      DATABASE_PATH_env: process.env.DATABASE_PATH || null,   // null bo'lsa — DOIMIY disk sozlanmagan!
      USE_POSTGRES: process.env.USE_POSTGRES || null,
      resolved_db_path: DB_PATH,
      db_dir: DB_DIR,
      db_file: fileInfo(DB_PATH),
      db_backup_file: fileInfo(DB_PATH + '.backup'),
      db_dir_files: safe(() => fs.readdirSync(DB_DIR), []),
      backup_dir: BACKUP_DIR,
      backup_dir_exists: safe(() => fs.existsSync(BACKUP_DIR), false),
      backup_files: safe(() => fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [], []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/inspect?file=NAME — BITTA fayl(ni) ochib, undagi mahsulot/komponent/
// sotuv/mijoz sonini aytadi. file berilmasa joriy bazani tekshiradi.
// Bittadan tekshiriladi — 14 ta 27MB faylni birato yuklash xotirani to'ldiradi.
router.get('/inspect', async (req, res, next) => {
  try {
    if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Ruxsat yo\'q' });

    let file = DB_PATH;
    if (req.query.file) {
      const name = path.basename(String(req.query.file)); // path traversal himoyasi
      file = name === 'teknoplast.sqlite' ? DB_PATH
        : name === 'teknoplast.sqlite.backup' ? DB_PATH + '.backup'
        : path.join(BACKUP_DIR, name);
    }
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fayl topilmadi', file: path.basename(file) });

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const stat = fs.statSync(file);
    const buf = fs.readFileSync(file);
    const db = new SQL.Database(buf);
    const num = (sql) => { try { const r = db.exec(sql); return r[0]?.values?.[0]?.[0] ?? 0; } catch { return null; } };
    const list = (sql) => { try { const r = db.exec(sql); return (r[0]?.values || []).map(v => v[0]); } catch { return []; } };

    const out = {
      file: path.basename(file),
      size_kb: Math.round(stat.size / 1024),
      modified: stat.mtime.toISOString(),
      total_products: num('SELECT COUNT(*) FROM products'),
      komponent_count: num("SELECT COUNT(*) FROM products WHERE kind='KOMPONENT'"),
      komponent_sample: list("SELECT name FROM products WHERE kind='KOMPONENT' ORDER BY name LIMIT 20"),
      sales_count: num('SELECT COUNT(*) FROM sales'),
      customers_count: num('SELECT COUNT(*) FROM customers'),
      employees_count: num('SELECT COUNT(*) FROM employees'),
      production_count: num('SELECT COUNT(*) FROM employee_production'),
    };
    db.close();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
