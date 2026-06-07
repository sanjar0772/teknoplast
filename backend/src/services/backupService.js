/**
 * Avtomatik zaxira (backup) xizmati.
 * teknoplast.sqlite faylini backups/ papkasiga vaqt belgisi bilan nusxalaydi.
 * Oxirgi KEEP ta nusxani saqlaydi, qolganini o'chiradi.
 */
const fs = require('fs');
const path = require('path');

const KEEP = 14; // oxirgi 14 ta nusxa (2 hafta kunlik)
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'teknoplast.sqlite');
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups'); // baza bilan bir volumeda (/data)

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
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('teknoplast-') && f.endsWith('.sqlite'))
      .sort();
    while (files.length > KEEP) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {}
    }

    console.log(`💾 Backup yaratildi: ${path.basename(dest)} (jami ${files.length} ta nusxa)`);
    return dest;
  } catch (e) {
    console.error('❌ Backup xato:', e.message);
    return null;
  }
}

module.exports = { runBackup };

// To'g'ridan-to'g'ri ishga tushirilsa (node src/services/backupService.js)
if (require.main === module) {
  runBackup();
  process.exit(0);
}
