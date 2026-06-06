/**
 * DETALCHI qo'shish - 20 ta ayol
 * Usage: node scripts/add-detalchi.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query } = require('../src/db');

// 20 ta DETALCHI (ayollar)
const detalchi = [
  { name: 'Iroda opa', daily_tariff: 100000 },
  { name: 'Zulfizar opa', daily_tariff: 100000 },
  { name: 'Nargiza 1', daily_tariff: 100000 },
  { name: 'Minura 1', daily_tariff: 100000 },
  { name: 'Xursanoy', daily_tariff: 100000 },
  { name: 'Shohsanam', daily_tariff: 100000 },
  { name: 'Mardona', daily_tariff: 100000 },
  { name: 'Madina', daily_tariff: 100000 },
  { name: 'Iroda 2', daily_tariff: 100000 },
  { name: 'Nargiza 2', daily_tariff: 100000 },
  { name: 'Oynura', daily_tariff: 100000 },
  { name: 'Zulayho', daily_tariff: 100000 },
  { name: 'Minura opa', daily_tariff: 100000 },
  { name: 'Roza opa', daily_tariff: 100000 },
  { name: 'Zarifa opa', daily_tariff: 100000 },
  { name: 'Shukrona', daily_tariff: 100000 },
  { name: 'Muhlisa', daily_tariff: 100000 },
  { name: 'Shodiya', daily_tariff: 100000 },
  { name: 'Xulkaroy', daily_tariff: 100000 },
  { name: 'Shaxnoza', daily_tariff: 100000 },
];

async function addDetalchi() {
  try {
    console.log('🚀 DETALCHI (Ayol ekipasi) qo\'shish boshlanmoqda...\n');
    console.log('👩‍🏭 Jami DETALCHI: ' + detalchi.length + ' ta\n');

    let added = 0;
    let duplicate = 0;

    console.log('📌 DETALCHI ekipasi:\n');
    for (let i = 0; i < detalchi.length; i++) {
      const emp = detalchi[i];
      try {
        // Tekshiramiz - odam allaqachon bor-yo'q
        const check = await query(
          'SELECT id FROM employees WHERE LOWER(name) = LOWER($1)',
          [emp.name]
        );

        if (check.rows.length > 0) {
          console.log(`⏭️  ${(i + 1).toString().padStart(2, '0')}. ${emp.name.padEnd(25)}`);
          duplicate++;
          continue;
        }

        const result = await query(
          `INSERT INTO employees (name, type, daily_tariff, hire_date, is_active, phone, shift)
           VALUES ($1, 'DETALCHI', $2, date('now'), 1, '', 'ERTALAB')
           RETURNING *`,
          [emp.name, emp.daily_tariff]
        );

        if (result && result.rows && result.rows.length > 0) {
          console.log(`✅ ${(i + 1).toString().padStart(2, '0')}. ${emp.name.padEnd(25)} - ${emp.daily_tariff.toLocaleString('uz-UZ')} UZS`);
          added++;
        }
      } catch (e) {
        console.log(`⚠️  ${emp.name} - Xato: ${e.message}`);
      }
    }

    console.log(`\n📊 NATIJA:`);
    console.log(`   ✅ Yangi qo'shildi: ${added}`);
    console.log(`   ⏭️  Allaqachon bor: ${duplicate}`);
    console.log(`   📈 Jami: ${added + duplicate}`);

    // Final count
    const all = await query('SELECT COUNT(*) as count FROM employees');
    console.log(`\n🎯 Bazada jami ISHCHI: ${all.rows[0]?.count || 0}`);

    // Tur bo'yicha hisobot
    const byType = await query(`
      SELECT type, COUNT(*) as count, ROUND(AVG(daily_tariff), 0) as avg_tariff
      FROM employees
      GROUP BY type
      ORDER BY count DESC
    `);

    console.log(`\n📋 Tur bo'yicha:`);
    byType.rows.forEach(t => {
      const icons = {
        'ISHCHI': '👔',
        'DETALCHI': '👩‍🏭',
        'STANOKCHI': '⚙️',
        'SHOFIR': '🚗',
        'OSHPAZ': '👨‍🍳',
      };
      const icon = icons[t.type] || '👤';
      console.log(`   ${icon} ${t.type.padEnd(15)} - ${t.count.toString().padStart(3)} ta (O'rtacha: ${t.avg_tariff?.toLocaleString('uz-UZ')} UZS)`);
    });

    // Gender statistics
    console.log(`\n👥 GENDER STATISTICS:`);
    const gender = await query(`
      SELECT
        COUNT(CASE WHEN name LIKE '%opa' OR name LIKE '%ona' OR name IN ('Nargiza', 'Minura', 'Xursanoy', 'Shohsanam', 'Mardona', 'Madina', 'Oynura', 'Zulayho', 'Shukrona', 'Muhlisa', 'Shodiya', 'Xulkaroy', 'Shaxnoza', 'Zulfizar', 'Iroda', 'Roza', 'Zarifa') THEN 1 END) as women,
        COUNT(*) as total
      FROM employees
    `);
    console.log(`   Women: ${gender.rows[0]?.women || 0}`);
    console.log(`   Total: ${gender.rows[0]?.total || 0}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Xato:', err.message);
    process.exit(1);
  }
}

addDetalchi();
