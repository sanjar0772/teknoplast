/**
 * 35 ta ishchini to'liq qo'shish
 * Usage: node scripts/add-all-employees.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query, saveDB } = require('../src/db');

// Jadvaldan barcha ishchilar (35 ta)
const employees = [
  // бухгалтер (Accountants) - 4 ta
  { name: 'Faziliddin', type: 'ISHCHI', daily_tariff: 150000 },
  { name: 'Baxrom aka', type: 'ISHCHI', daily_tariff: 150000 },
  { name: 'Islombek', type: 'ISHCHI', daily_tariff: 150000 },
  { name: 'Shohruhbek', type: 'ISHCHI', daily_tariff: 150000 },

  // сифат (Quality control) - 1 ta
  { name: 'Azamjon', type: 'ISHCHI', daily_tariff: 130000 },

  // кол.центр (Call center) - 1 ta
  { name: 'Saidmuhtor', type: 'ISHCHI', daily_tariff: 100000 },

  // ердамчи (Helper) - 1 ta
  { name: 'Nodiraxon', type: 'ISHCHI', daily_tariff: 80000 },

  // дробилка (Crusher) - 2 ta
  { name: 'Xotamjon', type: 'STANOKCHI', daily_tariff: 120000 },
  { name: 'Xursandbek', type: 'STANOKCHI', daily_tariff: 120000 },

  // электрик (Electrician) - 1 ta
  { name: 'Shurat aka', type: 'ISHCHI', daily_tariff: 140000 },

  // шофер (Drivers) - 4 ta
  { name: 'Baxromjon', type: 'SHOFIR', daily_tariff: 110000 },
  { name: 'Zoxijon', type: 'SHOFIR', daily_tariff: 110000 },
  { name: 'Umijon', type: 'SHOFIR', daily_tariff: 110000 },
  { name: 'Hasanboi', type: 'SHOFIR', daily_tariff: 110000 },

  // уста (Masters) - 5 ta
  { name: 'Dilshodbek', type: 'ISHCHI', daily_tariff: 160000 },
  { name: 'Avazbek usta', type: 'ISHCHI', daily_tariff: 160000 },
  { name: 'Boburzjon', type: 'ISHCHI', daily_tariff: 160000 },
  { name: 'Rustamjon', type: 'ISHCHI', daily_tariff: 160000 },
  { name: 'Fayzullo', type: 'ISHCHI', daily_tariff: 120000 },

  // склад (Warehouse) - 5 ta
  { name: 'Bekzodbek', type: 'ISHCHI', daily_tariff: 130000 },
  { name: 'Donierbek', type: 'ISHCHI', daily_tariff: 90000 },
  { name: 'Ashurali', type: 'ISHCHI', daily_tariff: 90000 },
  { name: 'Utkirbek', type: 'ISHCHI', daily_tariff: 90000 },
  { name: 'Sarvarбek', type: 'ISHCHI', daily_tariff: 90000 },

  // технолог (Technologist) - 2 ta
  { name: 'Shoxboz', type: 'ISHCHI', daily_tariff: 140000 },
  { name: 'Muslima', type: 'ISHCHI', daily_tariff: 140000 },

  // ошпаз (Cooks) - 3 ta
  { name: 'Muhabbat diyusuf', type: 'OSHPAZ', daily_tariff: 100000 },
  { name: 'Muxabatchon', type: 'OSHPAZ', daily_tariff: 100000 },
  { name: 'Mohidilxon', type: 'OSHPAZ', daily_tariff: 100000 },

  // Boshqalar - 3 ta
  { name: 'Barnohon', type: 'ISHCHI', daily_tariff: 85000 },
  { name: 'Dilshodbek (reklamachi)', type: 'ISHCHI', daily_tariff: 75000 },
  { name: 'Xayrullo', type: 'ISHCHI', daily_tariff: 95000 },
];

async function addEmployees() {
  try {
    console.log('🚀 35 ta ishchini qo\'shish boshlanmoqda...\n');

    // Avval mavjud ishchilarni ko'ramiz
    const existing = await query('SELECT COUNT(*) as cnt FROM employees');
    console.log(`📊 Allaqachon database'da: ${existing.rows[0].cnt} ishchi\n`);

    let added = 0;
    let duplicate = 0;

    for (const emp of employees) {
      try {
        // Avval tekshiramiz - odam allaqachon bor-yo'q
        const check = await query(
          'SELECT id FROM employees WHERE LOWER(name) = LOWER($1)',
          [emp.name]
        );

        if (check.rows.length > 0) {
          console.log(`⏭️  ${emp.name} - Allaqachon bor`);
          duplicate++;
          continue;
        }

        const result = await query(
          `INSERT INTO employees (name, type, daily_tariff, hire_date, is_active, phone)
           VALUES ($1, $2, $3, date('now'), 1, '')
           RETURNING *`,
          [emp.name, emp.type, emp.daily_tariff]
        );

        if (result && result.rows && result.rows.length > 0) {
          console.log(`✅ ${emp.name} (${emp.type}) - ${emp.daily_tariff.toLocaleString('uz-UZ')} UZS`);
          added++;
        }
      } catch (e) {
        console.log(`⚠️  ${emp.name} - Xato: ${e.message}`);
      }
    }

    console.log(`\n📊 Natija:`);
    console.log(`   ✅ Yangi qo'shildi: ${added}`);
    console.log(`   ⏭️  Allaqachon bor: ${duplicate}`);
    console.log(`   📈 Jami: ${added + duplicate}`);

    // Final count
    const all = await query('SELECT COUNT(*) as count FROM employees');
    console.log(`\n🎯 Bazada jami ishchilar: ${all.rows[0]?.count || 0}`);

    // Turlar bo'yicha hisobot
    const byType = await query(`
      SELECT type, COUNT(*) as count, ROUND(AVG(daily_tariff), 0) as avg_tariff
      FROM employees
      GROUP BY type
      ORDER BY type
    `);

    console.log(`\n📋 Tur bo'yicha:`);
    byType.rows.forEach(t => {
      console.log(`   ${t.type}: ${t.count} ishchi (O'rtacha: ${t.avg_tariff.toLocaleString('uz-UZ')} UZS)`);
    });

    // Save database to disk
    saveDB();
    console.log('💾 Database saved!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Xato:', err.message);
    process.exit(1);
  }
}

addEmployees();
