/**
 * 44 ta ishchini database'ga qo'shish
 * Usage: node scripts/add-employees.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query } = require('../src/db');

// Shaxsi ma'lumotlar va vazifelari (JADVALDAN)
const employees = [
  // бухгалтер (Accountants)
  { name: 'Faziliddin', type: 'ISHCHI', department: 'бухгалтер', daily_tariff: 150000 },
  { name: 'Baxrom aka', type: 'ISHCHI', department: 'бухгалтер', daily_tariff: 150000 },
  { name: 'Islombek', type: 'ISHCHI', department: 'бухгалтер', daily_tariff: 150000 },
  { name: 'Shohruhbek', type: 'ISHCHI', department: 'бухгалтер', daily_tariff: 150000 },

  // сифат (Quality control)
  { name: 'Azamjon', type: 'ISHCHI', department: 'сифат 0%', daily_tariff: 130000 },

  // кол.центр (Call center)
  { name: 'Saidmuhtor', type: 'ISHCHI', department: 'кол.центр', daily_tariff: 100000 },

  // ердамчи (Helpers)
  { name: 'Nodiraxon', type: 'ISHCHI', department: 'ердамчи', daily_tariff: 80000 },

  // дробилка (Crusher machines)
  { name: 'Xotamjon', type: 'STANOKCHI', department: 'дробилка', daily_tariff: 120000 },
  { name: 'Xursandbek', type: 'STANOKCHI', department: 'дробилка', daily_tariff: 120000 },

  // электрик (Electricians)
  { name: 'Shurat aka', type: 'ISHCHI', department: 'электрик 10%', daily_tariff: 140000 },

  // шофер (Drivers)
  { name: 'Baxromjon', type: 'SHOFIR', department: 'шофер', daily_tariff: 110000 },
  { name: 'Zoxijon', type: 'SHOFIR', department: 'шофер', daily_tariff: 110000 },
  { name: 'Umijon', type: 'SHOFIR', department: 'шофер', daily_tariff: 110000 },
  { name: 'Hasanboi', type: 'SHOFIR', department: 'шофер', daily_tariff: 110000 },

  // уста (Master/Supervisors)
  { name: 'Dilshodbek', type: 'ISHCHI', department: 'уста', daily_tariff: 160000 },
  { name: 'Avazbek usta', type: 'ISHCHI', department: 'уста', daily_tariff: 160000 },
  { name: 'Boburzjon', type: 'ISHCHI', department: 'уста', daily_tariff: 160000 },
  { name: 'Rustamjon', type: 'ISHCHI', department: 'уста', daily_tariff: 160000 },
  { name: 'Fayzullo', type: 'ISHCHI', department: 'уста шогирд', daily_tariff: 120000 },

  // ердамчи (Assistants)
  { name: 'Bekzodbek', type: 'ISHCHI', department: 'склад бошлиги', daily_tariff: 130000 },
  { name: 'Donierbek', type: 'ISHCHI', department: 'склад ерд', daily_tariff: 90000 },
  { name: 'Ashurali', type: 'ISHCHI', department: 'склад ерд', daily_tariff: 90000 },
  { name: 'Utkirbek', type: 'ISHCHI', department: 'склад ерд', daily_tariff: 90000 },
  { name: 'Sarvarбek', type: 'ISHCHI', department: 'склад ерд', daily_tariff: 90000 },

  // технолог (Technologists)
  { name: 'Shoxboz', type: 'ISHCHI', department: 'технолог', daily_tariff: 140000 },
  { name: 'Muslima', type: 'ISHCHI', department: 'технолог', daily_tariff: 140000 },

  // ошпаз (Cooks)
  { name: 'Muhabbat diyusuf', type: 'OSHPAZ', department: 'уста ерд', daily_tariff: 100000 },
  { name: 'Muxabatchon', type: 'OSHPAZ', department: 'ошпаз', daily_tariff: 100000 },
  { name: 'Mohidilxon', type: 'OSHPAZ', department: 'ошпаз', daily_tariff: 100000 },

  // охрана (Security)
  { name: 'Barnohon', type: 'ISHCHI', department: 'ердамчи ошпаз', daily_tariff: 85000 },
  { name: 'Dilshodbek', type: 'ISHCHI', department: 'реклмачи', daily_tariff: 75000 },
  { name: 'Xayrullo', type: 'ISHCHI', department: 'охрана', daily_tariff: 95000 },
];

async function addEmployees() {
  try {
    console.log('🚀 44 ta ishchini qo\'shish boshlanmoqda...\n');

    let added = 0;
    for (const emp of employees) {
      try {
        const result = await query(
          `INSERT INTO employees (name, type, daily_tariff, hire_date, is_active, phone)
           VALUES ($1, $2, $3, date('now'), 1, '')
           RETURNING *`,
          [emp.name, emp.type, emp.daily_tariff]
        );

        if (result && result.rows && result.rows.length > 0) {
          console.log(`✅ ${emp.name} (${emp.type}) - ${emp.department}`);
          added++;
        }
      } catch (e) {
        console.log(`⚠️  ${emp.name} - Xato: ${e.message}`);
      }
    }

    console.log(`\n✅ Jami ${added} ta ishchi qo'shildi!\n`);

    // Summary
    const all = await query('SELECT COUNT(*) as count FROM employees');
    console.log(`📊 Bazada jami ishchilar: ${all.rows[0]?.count || 0}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Xato:', err.message);
    process.exit(1);
  }
}

addEmployees();
