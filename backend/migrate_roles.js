/**
 * users jadvalidagi role CHECK cheklovini olib tashlaydi
 * (yangi rollar — KIRIMCHI, OMBORCHI — qo'shilishi uchun).
 * SQLite standart usuli: foreign_keys OFF + jadvalni qayta qurish.
 * Ishga tushirish: node migrate_roles.js
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'teknoplast.sqlite');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const res = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
  const ddl = res[0]?.values[0]?.[0] || '';
  if (!/CHECK\s*\(\s*role/i.test(ddl)) {
    console.log("users jadvalida role CHECK yo'q — migratsiya kerakmas");
    process.exit(0);
  }

  db.run('PRAGMA foreign_keys=OFF');
  db.run('BEGIN');
  db.run(`CREATE TABLE users_new (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT INTO users_new (id,phone,password_hash,full_name,role,is_active,last_login,created_at,updated_at)
          SELECT id,phone,password_hash,full_name,role,is_active,last_login,created_at,updated_at FROM users`);
  db.run('DROP TABLE users');
  db.run('ALTER TABLE users_new RENAME TO users');
  db.run('COMMIT');
  db.run('PRAGMA foreign_keys=ON');

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  const cnt = db.exec('SELECT COUNT(*) FROM users')[0].values[0][0];
  console.log('✅ users jadvali CHECKsiz qayta qurildi. Foydalanuvchilar soni:', cnt);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
