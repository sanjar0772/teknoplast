/**
 * Database adapter — Local: SQLite (sql.js), Production: PostgreSQL
 * USE_POSTGRES=true bo'lsa pg ishlatadi, aks holda SQLite
 */

// PostgreSQL faqat USE_POSTGRES=true bo'lsa. Production'da ham SQLite ishlatsa bo'ladi (zavod hajmi uchun yetarli).
const USE_PG = process.env.USE_POSTGRES === 'true';

if (USE_PG) {
  // ---- POSTGRESQL (Production / VPS) ----
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'teknoplast',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
  });
  pool.on('connect', () => console.log('✅ PostgreSQL ulandi'));
  pool.on('error', (err) => console.error('❌ PG xato:', err.message));

  const query = (text, params) => pool.query(text, params);
  const getClient = () => pool.connect();
  module.exports = { query, getClient, pool };
} else {
  // ---- SQLITE (Local Development) ----
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const path = require('path');
  const { v4: uuidv4 } = require('uuid');
  const { parseProductName } = require('../utils/parseProductName');

  const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'teknoplast.sqlite');
  let _db = null;
  let _ready = false;
  let _inTransaction = false;

  // PostgreSQL → SQLite syntax converter
  function convertSQL(sql) {
    // DO UPDATE SET col=$N → col=excluded.col (BEFORE $N→? substitution)
    sql = sql.replace(
      /\bDO\s+UPDATE\s+SET\s+([\s\S]+?)(?=\s+RETURNING\b|\s+WHERE\b|;|\s*$)/gi,
      (match, setClauses) => {
        const converted = setClauses.replace(/(\w+)\s*=\s*\$\d+/g, (m, col) => `${col}=excluded.${col}`);
        return `DO UPDATE SET ${converted}`;
      }
    );
    return sql
      .replace(/\$(\d+)/g, '?')                                              // $1 → ?
      .replace(/gen_random_uuid\(\)/gi, "'UUID_PLACEHOLDER'")               // UUID
      .replace(/TO_CHAR\(([^,]+),\s*'YYYY-MM-DD'\)/gi, "strftime('%Y-%m-%d', $1)")
      .replace(/TO_CHAR\(([^,]+),\s*'YYYY-MM'\)/gi, "strftime('%Y-%m', $1)")
      .replace(/DATE_TRUNC\('month',\s*([^)]+)\)/gi, "strftime('%Y-%m-01', $1)")
      .replace(/NOW\(\)/gi, "datetime('now')")
      .replace(/CURRENT_TIMESTAMP/gi, "datetime('now')")
      .replace(/CURRENT_DATE/gi, "date('now')")
      .replace(/DEFAULT\s+CURRENT_DATE/gi, "DEFAULT (date('now'))")
      .replace(/INTERVAL\s+'(\d+)\s+hour[s]?'/gi, "'+$1 hours'")
      .replace(/\(CURRENT_TIMESTAMP\s+\+\s+INTERVAL\s+'(\d+)\s+hour[s]?'\)/gi,
               "(datetime('now', '+$1 hours'))")
      .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+months?'/gi, "datetime('now', '-$1 months')")
      .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')")
      .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+hours?'/gi, "datetime('now', '-$1 hours')")
      .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+years?'/gi, "datetime('now', '-$1 years')")
      .replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'(\d+)\s+hours?'/gi, "datetime('now', '-$1 hours')")
      .replace(/JSONB/gi, 'TEXT')
      .replace(/UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/gi,
               "TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))")
      .replace(/::DATE/gi, '')
      .replace(/::VARCHAR/gi, '')
      .replace(/::TEXT/gi, '')
      .replace(/::TIMESTAMP/gi, '')
      .replace(/::INTEGER/gi, '')
      .replace(/TEXT\[\]/gi, 'TEXT')
      .replace(/ILIKE/gi, 'LIKE')
      .replace(/is_active\s*=\s*true/gi, 'is_active=1')
      .replace(/is_active\s*=\s*false/gi, 'is_active=0')
      .replace(/is_resolved\s*=\s*false/gi, 'is_resolved=0')
      .replace(/is_resolved\s*=\s*true/gi, 'is_resolved=1')
      .replace(/ON\s+CONFLICT\s+DO\s+NOTHING/gi, 'OR IGNORE')
      .replace(/(?<!INSERT\s)INTO(?!\s+(?:ai_|users|sales|expense|employ|product|machine|salari|raw_mat|discount|audit|system|smart))/gi, 'INTO') // keep as is
      .replace(/GREATEST\(0,\s*([^)]+)\)/gi, 'MAX(0, $1)')
      // RETURNING klauzasini olib tashlash (alohida boshqariladi).
      // RETURNING har doim oxirgi klauza — undan keyingi hammasini o'chiramiz
      // (RETURNING *, RETURNING id, RETURNING id, phone, ... — barchasi).
      .replace(/\s+RETURNING\b[\s\S]*$/gi, '');
  }

  // Parametrlarni array ga aylantirish
  function normalizeParams(params) {
    if (!params) return [];
    return params.map(p => {
      if (p === null || p === undefined) return null;
      if (typeof p === 'object' && !(p instanceof Date)) return JSON.stringify(p);
      if (p instanceof Date) return p.toISOString();
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }

  // sql.js uchun parameterli SELECT funksiyasi
  function sqliteQuery(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      const obj = stmt.getAsObject();
      // Maydon turlarini to'g'rilash
      for (const k of Object.keys(obj)) {
        let v = obj[k];
        if (typeof v === 'string') {
          if ((v.startsWith('{') || v.startsWith('[')) && v.length > 1) {
            try { obj[k] = JSON.parse(v); } catch {}
          }
        }
        if (typeof obj[k] === 'number' &&
            (k.startsWith('is_') || k === 'is_resolved' || k === 'is_helpful')) {
          obj[k] = obj[k] === 1;
        }
      }
      rows.push(obj);
    }
    stmt.free();
    return rows;
  }

  // Natijalarni pg format ga aylantirish
  function formatRows(stmtResult) {
    if (!stmtResult || !stmtResult.length) return [];
    const { columns, values } = stmtResult[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        let val = row[i];
        // JSON maydonlarini parse qilish
        if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
          try { val = JSON.parse(val); } catch {}
        }
        // Boolean
        if (col.includes('is_') || col.includes('_active') || col.includes('is_helpful')) {
          if (val === 1 || val === '1') val = true;
          if (val === 0 || val === '0') val = false;
        }
        obj[col] = val;
      });
      return obj;
    });
  }

  // Oxirgi jadval nomini olish (INSERT INTO tableName ...)
  function getTableName(sql) {
    const m = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i) ||
              sql.match(/UPDATE\s+(\w+)/i) ||
              sql.match(/DELETE\s+FROM\s+(\w+)/i);
    return m ? m[1] : null;
  }

  // Database ishga tushirish
  async function initDB() {
    if (_ready) return _db;

    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      // Deploy oldidan zaxira nusxa — ma'lumotlarga zarar yetmasligi uchun
      try {
        const backupPath = DB_PATH + '.backup';
        fs.copyFileSync(DB_PATH, backupPath);
        console.log('💾 Zaxira nusxa saqlandi:', backupPath);
      } catch (e) {
        console.warn('Zaxira nusxa xato (davom etilmoqda):', e.message);
      }

      const buf = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(buf);
      console.log('✅ SQLite bazasi yuklandi:', DB_PATH);
      createSchema();          // Yangi jadvallarni qo'shadi (IF NOT EXISTS)
      runMigrations();         // Mavjud jadvallarga yangi ustun qo'shadi
      fixEmployeesConstraint(); // DETALCHI constraint ni tuzatadi
      relaxEmployeesTypeConstraint(); // type CHECK ni olib tashlaydi (yangi turlar uchun)
      backfillProductMeta();   // nomdan rang/razmer/base_name to'ldiradi (kirill mahsulotlar uchun)
      saveDBSync();
    } else {
      _db = new SQL.Database();
      console.log('🆕 Yangi SQLite bazasi yaratilmoqda...');
      createSchema();
      createSampleData();
      saveDBSync();
      console.log('✅ SQLite bazasi yaratildi');
    }

    _db.run('PRAGMA foreign_keys = ON');
    _db.run('PRAGMA journal_mode = WAL');
    _ready = true;

    // Har 30 sekundda — agar o'zgarish bo'lsa — disk ga saqlash (zaxira sifatida)
    setInterval(() => { if (_dirty) saveDB(); }, 30000);
    return _db;
  }

  let _saveTimer = null;
  let _dirty = false;

  // Diskka yozishni kechiktiramiz (debounce). Tez-tez yozuvlar bitta saqlashga
  // birlashadi va asinxron yoziladi -> event-loop bloklanmaydi, server "to'xtab qolmaydi".
  function scheduleSave() {
    if (_inTransaction) return;
    _dirty = true;
    if (_saveTimer) return;
    _saveTimer = setTimeout(() => { _saveTimer = null; saveDB(); }, 1200);
  }

  // Asinxron saqlash — disk yozish event-loop'ni bloklamaydi
  async function saveDB() {
    if (!_db || _inTransaction) return;
    _dirty = false;
    try {
      const data = _db.export();                            // WASM serializatsiya (tez)
      const tmp = DB_PATH + '.tmp';
      await fs.promises.writeFile(tmp, Buffer.from(data));  // ATOMIK: avval .tmp
      await fs.promises.rename(tmp, DB_PATH);               // keyin rename
    } catch (e) {
      console.warn('SQLite saqlashda xato:', e.message);
    }
  }

  // Sinxron saqlash — faqat init va shutdown uchun (ma'lumot yo'qolmasligi kafolati)
  function saveDBSync() {
    if (!_db) return;
    _dirty = false;
    try {
      const data = _db.export();
      const tmp = DB_PATH + '.tmp';
      fs.writeFileSync(tmp, Buffer.from(data));
      fs.renameSync(tmp, DB_PATH);
    } catch (e) {
      console.warn('SQLite sync saqlashda xato:', e.message);
    }
  }

  // Deploy/restart'da (SIGTERM) oxirgi o'zgarishlarni sinxron saqlaymiz
  let _shuttingDown = false;
  function flushAndExit() {
    if (_shuttingDown) return;
    _shuttingDown = true;
    if (_dirty) saveDBSync();
    process.exit(0);
  }
  process.on('SIGTERM', flushAndExit);
  process.on('SIGINT', flushAndExit);

  function fixEmployeesConstraint() {
    try {
      const result = _db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'");
      if (!result || !result[0]) return;
      const tableSql = result[0].values[0][0];
      // MUHIM: faqat ESKI (DETALCHI'siz) type CHECK bo'lsa qayta quramiz.
      // CHECK butunlay olib tashlangan bo'lsa (relaxEmployeesTypeConstraint), bu yerga
      // kirmaymiz — aks holda salaries/employee_production har restartda o'chib ketardi.
      const hasTypeCheck = /CHECK\s*\(\s*type\s+IN/i.test(tableSql);
      if (!hasTypeCheck || tableSql.includes("'DETALCHI'")) return; // cheklov yo'q yoki allaqachon tuzatilgan

      console.log('🔧 Employees jadvalini DETALCHI bilan yangilash...');

      // Backup all employees
      const empResult = _db.exec(`
        SELECT id, name, type, daily_tariff, hourly_tariff, hire_date,
               is_active, phone, address, shift, created_at, updated_at
        FROM employees
      `);
      const rows = (empResult && empResult[0]) ? empResult[0].values : [];

      // Drop dependent tables first
      _db.run('DROP TABLE IF EXISTS salaries');
      _db.run('DROP TABLE IF EXISTS employee_production');
      _db.run('DROP TABLE IF EXISTS employees');

      // Recreate employees with DETALCHI
      _db.run(`CREATE TABLE employees (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('STANOKCHI','DETALCHI','ISHCHI','OSHPAZ','SHOFIR','BOSHQA')),
        daily_tariff REAL NOT NULL DEFAULT 0,
        hourly_tariff REAL,
        hire_date TEXT DEFAULT (date('now')),
        is_active INTEGER DEFAULT 1,
        phone TEXT,
        address TEXT,
        shift TEXT DEFAULT 'ERTALAB',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      // Restore employees
      for (const r of rows) {
        const [id, name, type, daily_tariff, hourly_tariff, hire_date, is_active, phone, address, shift, created_at, updated_at] = r;
        _db.run(
          `INSERT INTO employees (id,name,type,daily_tariff,hourly_tariff,hire_date,is_active,phone,address,shift,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, name, type, daily_tariff || 0, hourly_tariff, hire_date, is_active ?? 1, phone || '', address || '', shift || 'ERTALAB', created_at, updated_at]
        );
      }

      // Recreate employee_production
      _db.run(`CREATE TABLE IF NOT EXISTS employee_production (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        employee_id TEXT NOT NULL REFERENCES employees(id),
        product_id TEXT REFERENCES products(id),
        machine_id TEXT REFERENCES machines(id),
        production_date TEXT NOT NULL,
        quantity_produced INTEGER NOT NULL DEFAULT 0,
        daily_tariff REAL NOT NULL,
        calculated_amount REAL NOT NULL,
        month TEXT NOT NULL,
        notes TEXT,
        production_type TEXT DEFAULT 'FINISHED',
        recorded_by TEXT REFERENCES users(id),
        recorded_at TEXT,
        kirimchi_notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, production_date)
      )`);

      // Recreate salaries
      _db.run(`CREATE TABLE IF NOT EXISTS salaries (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        employee_id TEXT NOT NULL REFERENCES employees(id),
        month TEXT NOT NULL,
        total_calculated REAL NOT NULL DEFAULT 0,
        bonuses REAL DEFAULT 0,
        penalties REAL DEFAULT 0,
        net_amount REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED','APPROVED','PAID')),
        approved_by TEXT REFERENCES users(id),
        paid_date TEXT,
        notes TEXT,
        tax_amount REAL DEFAULT 0,
        social_security REAL DEFAULT 0,
        work_days INTEGER DEFAULT 0,
        total_produced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, month)
      )`);

      console.log(`✅ Employees jadval constraint tuzatildi. ${rows.length} ishchi saqlab qolindi.`);
    } catch (e) {
      console.error('❌ fixEmployeesConstraint xato:', e.message);
    }
  }

  // Eski bazada employees.type ustunida CHECK (type IN (...)) cheklovi bor edi —
  // yangi xodim turlari (BUGALTER, SIFAT, MARKETING, ...) qo'shilishi uchun uni olib tashlaymiz.
  // Ma'lumotni yo'qotmaymiz: jadvalni qayta qurib, mavjud ustunlarni ko'chiramiz.
  function relaxEmployeesTypeConstraint() {
    try {
      const result = _db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'");
      if (!result || !result[0]) return;
      const tableSql = result[0].values[0][0];
      if (!/CHECK\s*\(\s*type\s+IN/i.test(tableSql)) return; // cheklov yo'q — qilish shart emas

      console.log('🔧 Employees.type CHECK cheklovi olib tashlanmoqda (yangi turlar uchun)...');

      // Mavjud ustunlar ro'yxati (dinamik)
      const info = _db.exec('PRAGMA table_info(employees)');
      const existingCols = (info && info[0]) ? info[0].values.map(r => r[1]) : [];

      _db.run('PRAGMA foreign_keys = OFF');
      _db.run('BEGIN');

      _db.run(`CREATE TABLE employees_new (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        daily_tariff REAL NOT NULL DEFAULT 0,
        hourly_tariff REAL,
        hire_date TEXT DEFAULT (date('now')),
        is_active INTEGER DEFAULT 1,
        phone TEXT,
        address TEXT,
        shift TEXT DEFAULT '1-SMENA',
        salary_type TEXT DEFAULT 'FIXED',
        monthly_salary REAL DEFAULT 0,
        salary_percent REAL DEFAULT 0,
        bonus_percent REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      const targetCols = ['id','name','type','daily_tariff','hourly_tariff','hire_date','is_active','phone','address','shift','salary_type','monthly_salary','salary_percent','bonus_percent','created_at','updated_at'];
      const common = targetCols.filter(c => existingCols.includes(c));
      const colList = common.join(',');
      _db.run(`INSERT INTO employees_new (${colList}) SELECT ${colList} FROM employees`);
      _db.run('DROP TABLE employees');
      _db.run('ALTER TABLE employees_new RENAME TO employees');

      _db.run('COMMIT');
      _db.run('PRAGMA foreign_keys = ON');
      console.log('✅ Employees.type cheklovi olib tashlandi — yangi turlar qo\'shsa bo\'ladi');
    } catch (e) {
      try { _db.run('ROLLBACK'); } catch {}
      try { _db.run('PRAGMA foreign_keys = ON'); } catch {}
      console.error('❌ relaxEmployeesTypeConstraint xato:', e.message);
    }
  }

  // Kirill nomli mahsulotlarda base_name/rang/razmer bo'sh -> nomdan ajratib to'ldiramiz.
  // `name` o'zgarmaydi. Faqat base_name IS NULL bo'lganlarni qayta ishlaymiz (idempotent +
  // kelajakdagi kirill importlarni ham avtomatik tuzatadi).
  function backfillProductMeta() {
    try {
      const res = _db.exec("SELECT id, name FROM products WHERE (base_name IS NULL OR base_name='') AND name IS NOT NULL AND name<>''");
      if (!res || !res[0]) return;
      const rows = res[0].values; // [[id, name], ...]
      if (!rows.length) return;
      let withColor = 0, total = 0;
      for (const [id, name] of rows) {
        const parsed = parseProductName(name);
        if (!parsed) continue;
        // base_name doimo (guruhlash uchun); rang/razmer faqat allaqachon bo'sh bo'lsa
        _db.run(
          "UPDATE products SET base_name=?, " +
          "rang=COALESCE(NULLIF(rang,''), ?), " +
          "razmer=COALESCE(NULLIF(razmer,''), ?), " +
          "updated_at=datetime('now') WHERE id=?",
          [parsed.base_name, parsed.rang || null, parsed.razmer || null, id]
        );
        total++;
        if (parsed.rang) withColor++;
      }
      if (total) console.log(`🎨 Mahsulot meta to'ldirildi: ${total} ta (rang topilgan: ${withColor})`);
    } catch (e) {
      console.error('❌ backfillProductMeta xato:', e.message);
    }
  }

  function createSchema() {
    _db.run(`PRAGMA foreign_keys = ON`);

    _db.run(`CREATE TABLE IF NOT EXISTS users (
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

    _db.run(`CREATE TABLE IF NOT EXISTS raw_materials (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'kg',
      price_per_unit REAL NOT NULL DEFAULT 0,
      received_date TEXT,
      last_used_date TEXT,
      stock_balance REAL NOT NULL DEFAULT 0,
      supplier_name TEXT,
      min_stock_level REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      daily_production INTEGER DEFAULT 0,
      stock_quantity INTEGER DEFAULT 0,
      raw_material_id TEXT REFERENCES raw_materials(id),
      unit TEXT DEFAULT 'dona',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS discounts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE','FIXED')),
      discount_value REAL NOT NULL,
      reason TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      phone TEXT,
      company_name TEXT,
      address TEXT,
      customer_type TEXT DEFAULT 'RETAIL' CHECK (customer_type IN ('RETAIL','WHOLESALE','VIP')),
      credit_limit REAL DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      product_id TEXT NOT NULL REFERENCES products(id),
      customer_id TEXT REFERENCES customers(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      sale_date TEXT DEFAULT (date('now')),
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','PARTIALLY_PAID')),
      payment_amount REAL DEFAULT 0,
      discount_id TEXT REFERENCES discounts(id),
      notes TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS product_intakes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      status TEXT DEFAULT 'PENDING',
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS intake_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      intake_id TEXT NOT NULL REFERENCES product_intakes(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      sale_id TEXT NOT NULL REFERENCES sales(id),
      amount REAL NOT NULL,
      payment_date TEXT DEFAULT (date('now')),
      method TEXT DEFAULT 'CASH' CHECK (method IN ('CASH','CARD','TRANSFER','OTHER')),
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      category TEXT NOT NULL CHECK (category IN ('RAW_MATERIAL','ENERGY','MAINTENANCE','SALARY','TRANSPORT','OTHER')),
      amount REAL NOT NULL,
      description TEXT,
      expense_date TEXT DEFAULT (date('now')),
      receipt_file TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // type — CHECK qo'yilmaydi (kelajakda yangi turlar erkin qo'shilsin).
    // salary_type: FIXED=belgilangan oylik, PERCENT=foiz. monthly_salary=oylik summa, salary_percent=foiz.
    _db.run(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      daily_tariff REAL NOT NULL DEFAULT 0,
      hourly_tariff REAL,
      hire_date TEXT DEFAULT (date('now')),
      is_active INTEGER DEFAULT 1,
      phone TEXT,
      address TEXT,
      shift TEXT DEFAULT '1-SMENA',
      salary_type TEXT DEFAULT 'FIXED',
      monthly_salary REAL DEFAULT 0,
      salary_percent REAL DEFAULT 0,
      bonus_percent REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'WORKING' CHECK (status IN ('WORKING','BROKEN','SERVICE')),
      operator_id TEXT REFERENCES employees(id),
      last_service_date TEXT,
      next_service_date TEXT,
      daily_production_capacity INTEGER DEFAULT 0,
      location TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS employee_production (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      product_id TEXT REFERENCES products(id),
      machine_id TEXT REFERENCES machines(id),
      production_date TEXT NOT NULL,
      quantity_produced INTEGER NOT NULL DEFAULT 0,
      daily_tariff REAL NOT NULL,
      calculated_amount REAL NOT NULL,
      month TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, production_date)
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS salaries (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      month TEXT NOT NULL,
      total_calculated REAL NOT NULL DEFAULT 0,
      bonuses REAL DEFAULT 0,
      penalties REAL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED','APPROVED','PAID')),
      approved_by TEXT REFERENCES users(id),
      paid_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, month)
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      type TEXT NOT NULL,
      period TEXT,
      analysis_data TEXT NOT NULL DEFAULT '{}',
      recommendations TEXT,
      status TEXT DEFAULT 'COMPLETED',
      processing_time INTEGER,
      expire_at TEXT DEFAULT (datetime('now', '+1 hours')),
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS smart_alerts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      message TEXT NOT NULL,
      triggered_date TEXT DEFAULT (datetime('now')),
      dismissed_by TEXT REFERENCES users(id),
      dismissed_at TEXT,
      is_resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS ai_chat_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id),
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      context_data TEXT,
      processing_time INTEGER,
      is_helpful INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      table_name TEXT,
      record_id TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    _db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  // Mavjud bazaga yangi ustunlar qo'shish (xavfsiz — xato bo'lsa o'tkazib yuboradi)
  function runMigrations() {
    const migrations = [
      `ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id)`,
      `ALTER TABLE products ADD COLUMN razmer TEXT`,
      `ALTER TABLE products ADD COLUMN rang TEXT`,
      `ALTER TABLE products ADD COLUMN base_name TEXT`,
      `ALTER TABLE sales ADD COLUMN order_ref TEXT`,
      `ALTER TABLE sales ADD COLUMN fulfillment_status TEXT DEFAULT 'PENDING'`,
      `ALTER TABLE sales ADD COLUMN fulfilled_by TEXT`,
      `ALTER TABLE sales ADD COLUMN fulfilled_at TEXT`,
      `ALTER TABLE products ADD COLUMN stanokchi_rate REAL DEFAULT 0`,
      `ALTER TABLE products ADD COLUMN stanokchi_semi_rate REAL DEFAULT 0`,
      `ALTER TABLE products ADD COLUMN detalchi_rate REAL DEFAULT 0`,
      `ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0`,
      `ALTER TABLE employee_production ADD COLUMN production_type TEXT DEFAULT 'FINISHED'`,
      `ALTER TABLE employee_production ADD COLUMN recorded_by TEXT REFERENCES users(id)`,
      `ALTER TABLE employee_production ADD COLUMN recorded_at TEXT`,
      `ALTER TABLE employee_production ADD COLUMN kirimchi_notes TEXT`,
      `ALTER TABLE employees ADD COLUMN shift TEXT DEFAULT 'ERTALAB'`,
      `ALTER TABLE employees ADD COLUMN salary_type TEXT DEFAULT 'FIXED'`,
      `ALTER TABLE employees ADD COLUMN monthly_salary REAL DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN salary_percent REAL DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN bonus_percent REAL DEFAULT 0`,
      `ALTER TABLE machines ADD COLUMN code TEXT UNIQUE`,
      `ALTER TABLE expenses ADD COLUMN raw_material_id TEXT REFERENCES raw_materials(id)`,
      `ALTER TABLE expenses ADD COLUMN reference_type TEXT`,
      `ALTER TABLE salaries ADD COLUMN tax_amount REAL DEFAULT 0`,
      `ALTER TABLE salaries ADD COLUMN social_security REAL DEFAULT 0`,
      `ALTER TABLE salaries ADD COLUMN work_days INTEGER DEFAULT 0`,
      `ALTER TABLE salaries ADD COLUMN total_produced INTEGER DEFAULT 0`,
    ];
    for (const m of migrations) {
      try {
        _db.run(m);
        console.log('🔧 Migratsiya:', m.slice(0, 50));
      } catch (e) {
        // Ustun allaqachon mavjud — normal holat
      }
    }
    // Data migratsiya: ERTALAB → 1-SMENA (STANOKCHI xodimlar uchun)
    try {
      _db.run("UPDATE employees SET shift='1-SMENA' WHERE type='STANOKCHI' AND (shift='ERTALAB' OR shift IS NULL)");
      _db.run("UPDATE employees SET shift='1-SMENA' WHERE type='DETALCHI' AND (shift='ERTALAB' OR shift IS NULL)");
    } catch (e) {}
  }

  function createSampleData() {
    const bcrypt = require('bcryptjs');

    _db.run(`INSERT OR IGNORE INTO system_settings (key,value,description) VALUES
      ('company_name','TEKNOPLAST','Kompaniya nomi'),
      ('currency','UZS','Valyuta'),
      ('timezone','Asia/Tashkent','Vaqt mintaqasi'),
      ('language','uz','Til')`);

    const users = [
      { phone: '+998901234567', password: 'Admin123!',      name: 'Admin (Owner)',      role: 'OWNER' },
      { phone: '+998901111111', password: 'Owner123!',      name: 'Egasi',              role: 'OWNER' },
      { phone: '+998902222222', password: 'Accountant123!', name: 'Hisobchi',           role: 'ACCOUNTANT' },
      { phone: '+998903333333', password: 'Sales123!',      name: 'Savdo',              role: 'SALES_HEAD' },
      { phone: '+998904444444', password: 'Production123!', name: 'Ishlab chiqarish',   role: 'PRODUCTION_HEAD' },
      { phone: '+998905555555', password: 'Kirim123!',      name: 'Kirimchi',           role: 'KIRIMCHI' },
      { phone: '+998906666666', password: 'Ombor123!',      name: 'Omborchi',           role: 'OMBORCHI' },
      { phone: '+998907777777', password: 'Taminot123!',    name: 'Taminotchi',         role: 'TAMINOTCHI' },
    ];

    for (const u of users) {
      const hash = bcrypt.hashSync(u.password, 10);
      const id = uuidv4();
      _db.run(`INSERT OR IGNORE INTO users (id,phone,password_hash,full_name,role) VALUES (?,?,?,?,?)`,
        [id, u.phone, hash, u.name, u.role]);
    }

    console.log('👤 8 ta foydalanuvchi yaratildi');
    console.log('   OWNER:            +998901234567 / Admin123!');
    console.log('   SALES_HEAD:       +998903333333 / Sales123!');
    console.log('   ACCOUNTANT:       +998902222222 / Accountant123!');
    console.log('   PRODUCTION_HEAD:  +998904444444 / Production123!');
    console.log('   KIRIMCHI:         +998905555555 / Kirim123!');
    console.log('   OMBORCHI:         +998906666666 / Ombor123!');
    console.log('   TAMINOTCHI:       +998907777777 / Taminot123!');
  }

  // Ana query funksiyasi
  async function query(text, params) {
    const db = await initDB();
    const hasReturning = /\bRETURNING\b/i.test(text);
    const tableName = getTableName(text);
    let converted = convertSQL(text);
    const normalizedParams = normalizeParams(params || []);

    const isInsert = /^\s*INSERT/i.test(text);
    const isUpdate = /^\s*UPDATE/i.test(text);
    const isDelete = /^\s*DELETE/i.test(text);
    const isSelect = /^\s*SELECT/i.test(text);

    try {
      if (isSelect) {
        const rows = sqliteQuery(db, converted, normalizedParams);
        return { rows };
      }

      // DELETE ... RETURNING — qatorlarni O'CHIRISHDAN OLDIN o'qib olamiz
      // (aks holda DELETE'dan keyin topib bo'lmaydi -> rows bo'sh qaytib, 404 berardi)
      let deletedRows = null;
      if (isDelete && hasReturning && tableName) {
        const m = text.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
        if (m) {
          const idVal = normalizedParams[parseInt(m[1]) - 1];
          deletedRows = sqliteQuery(db, `SELECT * FROM ${tableName} WHERE id = ?`, [idVal]);
        }
      }

      // Write operation
      db.run(converted, normalizedParams);

      // RETURNING * handling
      if (hasReturning && tableName) {
        let rows = [];

        if (isInsert) {
          // INSERT — last_insert_rowid() to'g'ri ishlaydi
          const rowidResult = db.exec('SELECT last_insert_rowid()');
          const rowid = rowidResult[0]?.values[0]?.[0];
          if (rowid) rows = sqliteQuery(db, `SELECT * FROM ${tableName} WHERE rowid = ?`, [rowid]);
        } else if (isUpdate) {
          // UPDATE — last_insert_rowid() NOTO'G'RI. WHERE id=$N orqali qaytaramiz.
          const m = text.match(/WHERE\s+id\s*=\s*\$(\d+)/i);
          if (m) {
            const idVal = normalizedParams[parseInt(m[1]) - 1];
            rows = sqliteQuery(db, `SELECT * FROM ${tableName} WHERE id = ?`, [idVal]);
          }
        } else if (isDelete) {
          // DELETE — o'chirishdan oldin o'qilgan qatorlarni qaytaramiz
          rows = deletedRows || [];
        }

        scheduleSave();
        return { rows };
      }

      scheduleSave();
      return { rows: [], rowCount: 1 };
    } catch (err) {
      console.error('SQLite xato:', err.message);
      console.error('SQL:', converted);
      throw err;
    }
  }

  // Fake client for transactions (SQLite compatible)
  const getClient = async () => {
    await initDB();
    return {
      query: async (text, params) => {
        if (text === 'BEGIN') {
          if (!_inTransaction) {
            _db.run('BEGIN');
            _inTransaction = true;
          }
          return { rows: [] };
        }
        if (text === 'COMMIT') {
          if (_inTransaction) {
            _db.run('COMMIT');
            _inTransaction = false;
            scheduleSave();
            console.log('💾 Transaction COMMIT + diskka saqlanadi');
          }
          return { rows: [] };
        }
        if (text === 'ROLLBACK') {
          if (_inTransaction) {
            try { _db.run('ROLLBACK'); } catch {}
            _inTransaction = false;
          }
          return { rows: [] };
        }
        return query(text, params);
      },
      release: () => {},
    };
  };

  // Init at module load
  initDB().catch(console.error);

  module.exports = { query, getClient, saveDB, saveDBSync };
}
