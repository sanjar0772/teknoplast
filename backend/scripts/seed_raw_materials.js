/**
 * Xom ashyo turlarini tizimga qo'shish
 * Usage: node scripts/seed_raw_materials.js
 * Server ishlab turishi kerak (npm start yoki Railway)
 */

const axios = require('axios');

const BASE = process.env.API_URL || 'http://localhost:5000/api';

const RAW_MATERIALS = [
  'B-Y 456/460/6200',
  'I-1561',
  'I-1625',
  'ПЕТ 881',
  'J-550,560',
  'J-150/160',
  'B-310',
  'B-320',
  'I-2560',
  'JM-380/375',
  'JM-350',
  'J-350',
  'TD-20 (ОК ўзимизники)',
  'TD-25 (ОҚ ўзимизники)',
  'PP-2263 ОК',
  'PP-IM-300 ОК Компаунд у-н',
  'Полиамид PP GF-30% PIPI',
  'Полиамид (РА-66) 30%',
  'Полиамид (РА-66) КЛИМИТ',
  'Полиамид (РА-66) 30% (ОК)',
  'Полиамид шишасиз',
  'Драбилка Полиамид',
  'Чунгак Драбилка Полиамид',
  'Грей 4232-11 (серий)',
  'Блек 2220 (кора)',
  'TD-20 (ҚОРА ўзимизники)',
  'Блек климитдан ортган',
  'Кора гранула (паддон)',
  'Буфер гранула',
  'Кора гранула (калцийсиз)',
  'Кора гранула (2-сорт)',
  'Кора гранула Компаунд учун',
  'Кизил гранула (1/5 сорт)',
  'Кук гранула (1/5 сорт)',
  'Яшил гранула (1/5 сорт)',
  'Кук Вдумной (1/5 сорт)',
  'Тувак ранг гранула (2-сорт)',
  'Калций Талк',
  'Калций',
  'Мел',
];

async function seed() {
  try {
    console.log('🔐 Login...');
    const loginRes = await axios.post(`${BASE}/auth/login`, {
      phone: '+998901234567',
      password: 'Admin123!'
    });
    const token = loginRes.data.token;
    const api = axios.create({
      baseURL: BASE,
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Login OK!\n');

    // Mavjudlarini olib, nom bo'yicha set yasaymiz
    const existingRes = await api.get('/products/raw-materials/list');
    const existing = existingRes.data.raw_materials || existingRes.data || [];
    const existingNames = new Set(existing.map(r => r.name.toLowerCase().trim()));
    console.log(`📊 Hozirgi: ${existingNames.size} ta xom ashyo\n`);

    let added = 0, skipped = 0;

    for (const name of RAW_MATERIALS) {
      if (existingNames.has(name.toLowerCase().trim())) {
        console.log(`   ⏭️  O'tkazildi: ${name}`);
        skipped++;
        continue;
      }
      try {
        await api.post('/products/raw-materials', {
          name,
          quantity: 0,
          unit: 'kg',
          price_per_unit: 0,
          min_stock_level: 0,
          create_expense: false,
        });
        console.log(`   ✅ Qo'shildi: ${name}`);
        added++;
      } catch (e) {
        console.log(`   ❌ Xato ${name}: ${e.response?.data?.error || e.message}`);
      }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`✅ Yangi qo'shildi: ${added} ta`);
    console.log(`⏭️  O'tkazildi:     ${skipped} ta`);
    console.log(`📦 Jami:           ${added + skipped} ta`);

  } catch (e) {
    console.error('❌ Xato:', e.response?.data || e.message);
  }
}

seed();
