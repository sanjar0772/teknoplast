/**
 * STANOKCHI qo'shish - 1st va 2nd shift
 * 30 ta stanok × 2 kishida = ~60 ta stanokchi
 * Usage: node scripts/add-stanokchi.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query } = require('../src/db');

// SHEET 1 - 1ST SHIFT (ERTALAB)
const shift1 = [
  { name: 'Умидахон 1', machine: 1 },
  { name: 'Умидахон 2', machine: 1 },
  { name: 'Зулфийахон 1', machine: 2 },
  { name: 'Зулфийахон 2', machine: 3 },
  { name: 'Замирахон', machine: 4 },
  { name: 'Бобурджон', machine: 5 },
  { name: 'Саиора', machine: 6 },
  { name: 'Дилоромхон', machine: 7 },
  { name: 'Чурабек', machine: 8 },
  { name: 'Мархабохон 1', machine: 9 },
  { name: 'Мархабохон 2', machine: 9 },
  { name: 'Акбаржон 1', machine: 10 },
  { name: 'Акбаржон 2', machine: 10 },
  { name: 'Сугдиана', machine: 11 },
  { name: 'Шахзод хон', machine: 12 },
  { name: 'Шахзодбек', machine: 13 },
  { name: 'Фаррухбек', machine: 15 },
  { name: 'Наргиза', machine: 16 },
  { name: 'Зулфийахон 3', machine: 17 },
  { name: 'Машхура 1', machine: 18 },
  { name: 'Анзират хон', machine: 19 },
  { name: 'Шохидахон', machine: 20 },
  { name: 'Мавлуда 1', machine: 21 },
  { name: 'Елиёрбек 1', machine: 22 },
  { name: 'Умиджон', machine: 23 },
  { name: 'Шохрубек', machine: 24 },
  { name: 'Бекзод бек 1', machine: 26 },
  { name: 'Жавлонбек', machine: 27 },
  { name: 'Абдрор', machine: 28 },
  { name: 'Елиёрбек 2', machine: 29 },
];

// SHEET 2 - 2ND SHIFT (ASR)
const shift2 = [
  { name: 'Гулзора 1', machine: 1 },
  { name: 'Гулзора 2', machine: 1 },
  { name: 'Мархабохон 3', machine: 3 },
  { name: 'Гулсора', machine: 4 },
  { name: 'Жалолдин', machine: 5 },
  { name: 'Вазирахон', machine: 6 },
  { name: 'Иноботхон', machine: 7 },
  { name: 'Машхурбек', machine: 8 },
  { name: 'Манорахон', machine: 9 },
  { name: 'Абдувохид', machine: 10 },
  { name: 'Мунниаварой', machine: 11 },
  { name: 'Ранахон', machine: 12 },
  { name: 'Дилмура', machine: 13 },
  { name: 'Мухаммад али', machine: 14 },
  { name: 'Исломбек 1', machine: 15 },
  { name: 'Наимахон', machine: 16 },
  { name: 'Гунози', machine: 17 },
  { name: 'Асалой', machine: 18 },
  { name: 'Нодирахон 2', machine: 19 },
  { name: 'Фотимахон', machine: 20 },
  { name: 'Жамилахон', machine: 21 },
  { name: 'Мавлуда 2', machine: 22 },
  { name: 'Зубаир', machine: 24 },
  { name: 'Бекзод бек 2', machine: 26 },
  { name: 'Исломбек 2', machine: 27 },
  { name: 'Илхомбек', machine: 28 },
  { name: 'Дурдонахон', machine: 29 },
  { name: 'хурматой', machine: 30 },
];

async function addStanokchi() {
  try {
    console.log('🚀 STANOKCHI qo\'shish boshlanmoqda...\n');
    console.log('📊 1st Shift (ERTALAB): ' + shift1.length + ' ta');
    console.log('📊 2nd Shift (ASR): ' + shift2.length + ' ta\n');

    let added = 0;
    let duplicate = 0;

    // Birinchi smena
    console.log('📌 1st SHIFT (ERTALAB) qo\'shilmoqda:\n');
    for (const emp of shift1) {
      try {
        // Tekshiramiz - odam allaqachon bor-yo'q
        const check = await query(
          'SELECT id FROM employees WHERE LOWER(name) = LOWER($1)',
          [emp.name]
        );

        if (check.rows.length > 0) {
          console.log(`⏭️  ${emp.name.padEnd(25)} (Stanok ${emp.machine})`);
          duplicate++;
          continue;
        }

        const result = await query(
          `INSERT INTO employees (name, type, daily_tariff, hire_date, is_active, phone, shift)
           VALUES ($1, 'STANOKCHI', 120000, date('now'), 1, '', 'ERTALAB')
           RETURNING *`,
          [emp.name]
        );

        if (result && result.rows && result.rows.length > 0) {
          console.log(`✅ ${emp.name.padEnd(25)} (Stanok ${emp.machine})`);
          added++;
        }
      } catch (e) {
        console.log(`⚠️  ${emp.name} - Xato: ${e.message}`);
      }
    }

    // Ikkinchi smena
    console.log('\n📌 2nd SHIFT (ASR) qo\'shilmoqda:\n');
    for (const emp of shift2) {
      try {
        const check = await query(
          'SELECT id FROM employees WHERE LOWER(name) = LOWER($1)',
          [emp.name]
        );

        if (check.rows.length > 0) {
          console.log(`⏭️  ${emp.name.padEnd(25)} (Stanok ${emp.machine})`);
          duplicate++;
          continue;
        }

        const result = await query(
          `INSERT INTO employees (name, type, daily_tariff, hire_date, is_active, phone, shift)
           VALUES ($1, 'STANOKCHI', 120000, date('now'), 1, '', 'ASR')
           RETURNING *`,
          [emp.name]
        );

        if (result && result.rows && result.rows.length > 0) {
          console.log(`✅ ${emp.name.padEnd(25)} (Stanok ${emp.machine})`);
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

    // STANOKCHI bo'yicha
    const stanokchi = await query(`
      SELECT type, COUNT(*) as count, shift, ROUND(AVG(daily_tariff), 0) as avg_tariff
      FROM employees
      WHERE type = 'STANOKCHI'
      GROUP BY type, shift
      ORDER BY shift
    `);

    console.log(`\n📋 STANOKCHI bo'yicha:`);
    stanokchi.rows.forEach(t => {
      console.log(`   ${t.shift.padEnd(10)} - ${t.count} ta (O'rtacha: ${t.avg_tariff?.toLocaleString('uz-UZ')} UZS)`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Xato:', err.message);
    process.exit(1);
  }
}

addStanokchi();
