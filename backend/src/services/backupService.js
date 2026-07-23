/**
 * Avtomatik zaxira (backup) xizmati.
 * teknoplast.sqlite faylini backups/ papkasiga vaqt belgisi bilan nusxalaydi.
 * Oxirgi KEEP ta nusxani saqlaydi, qolganini o'chiradi.
 */
const fs = require('fs');
const path = require('path');

// Railway diski to'lib qolmasligi uchun 14 → 5 ga tushirildi (egasi talabi 2026-07-23).
// 5 ta kunlik nusxa + har deploydagi .backup fayli — tiklash uchun bemalol yetadi.
const KEEP = 5;
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'teknoplast.sqlite');
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups'); // baza bilan bir volumeda (/data)

// Eski backup nusxalarini tozalash — startupda ham, har backupdan keyin ham chaqiriladi
function pruneBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return 0;
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('teknoplast-') && f.endsWith('.sqlite'))
      .sort();
    let removed = 0;
    while (files.length > KEEP) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); removed++; } catch {}
    }
    if (removed) console.log(`🧹 Eski backuplar tozalandi: ${removed} ta o'chirildi (oxirgi ${KEEP} ta qoldi)`);
    return removed;
  } catch (e) {
    console.error('Backup tozalash xato:', e.message);
    return 0;
  }
}

// Disk holati (diagnostika uchun) — fayl o'lchamlari MB'da
function backupStats() {
  const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
  const out = { db_mb: 0, deploy_backup_mb: 0, backups_count: 0, backups_mb: 0 };
  try { if (fs.existsSync(DB_PATH)) out.db_mb = mb(fs.statSync(DB_PATH).size); } catch {}
  try { const p = DB_PATH + '.backup'; if (fs.existsSync(p)) out.deploy_backup_mb = mb(fs.statSync(p).size); } catch {}
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sqlite'));
      out.backups_count = files.length;
      out.backups_mb = mb(files.reduce((s, f) => {
        try { return s + fs.statSync(path.join(BACKUP_DIR, f)).size; } catch { return s; }
      }, 0));
    }
  } catch {}
  return out;
}

function runBackup() {
  try {
    // Avval xotiradagi bazani diskka tushiramiz (eng yangi holat)
    try {
      const db = require('../db');
      if (db.saveDBSync) db.saveDBSync();
      else if (db.saveDB) db.saveDB();
    } catch {}

    if (!fs.existsSync(DB_PATH)) {
      console.warn('⚠️ Backup: teknoplast.sqlite topilmadi');
      return null;
    }
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/:/g, '-').replace('T', '_').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `teknoplast-${ts}.sqlite`);
    fs.copyFileSync(DB_PATH, dest);

    // Eski nusxalarni tozalash
    pruneBackups();

    console.log(`💾 Backup yaratildi: ${path.basename(dest)}`);
    return dest;
  } catch (e) {
    console.error('❌ Backup xato:', e.message);
    return null;
  }
}

module.exports = { runBackup, pruneBackups, backupStats };

// To'g'ridan-to'g'ri ishga tushirilsa (node src/services/backupService.js)
if (require.main === module) {
  runBackup();
  process.exit(0);
}
