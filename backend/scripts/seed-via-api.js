/**
 * Ishchilarni API orqali qo'shish (server running bo'lishi kerak!)
 * Usage: node scripts/seed-via-api.js
 */

const axios = require('axios');

const BASE = 'http://localhost:5000/api';

// 1-SMENA STANOKCHI (30 ta)
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

// 2-SMENA STANOKCHI (28 ta)
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
  { name: 'Хурматой', machine: 30 },
];

// DETALCHI (20 ta ayol)
const detalchi = [
  'Iroda opa', 'Zulfizar opa', 'Nargiza 1', 'Minura 1',
  'Xursanoy', 'Shohsanam', 'Mardona', 'Madina',
  'Iroda 2', 'Nargiza 2', 'Oynura', 'Zulayho',
  'Minura opa', 'Roza opa', 'Zarifa opa', 'Shukrona',
  'Muhlisa', 'Shodiya', 'Xulkaroy', 'Shaxnoza',
];

async function seed() {
  try {
    // Login
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

    // Check existing
    const existing = await api.get('/employees?is_active=all');
    const existingNames = existing.data.employees.map(e => e.name.toLowerCase());
    console.log(`📊 Hozirgi: ${existingNames.length} ta ishchi\n`);

    let added = 0, skipped = 0;

    // 1-SMENA STANOKCHI
    console.log('📌 1-SMENA STANOKCHI:');
    for (const emp of shift1) {
      if (existingNames.includes(emp.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await api.post('/employees', {
          name: emp.name,
          type: 'STANOKCHI',
          daily_tariff: 120000,
          shift: 'ERTALAB',
        });
        console.log(`   ✅ ${emp.name} (Stanok ${emp.machine})`);
        added++;
      } catch (e) {
        console.log(`   ⚠️ ${emp.name}: ${e.response?.data?.error || e.message}`);
      }
    }

    // 2-SMENA STANOKCHI
    console.log('\n📌 2-SMENA STANOKCHI:');
    for (const emp of shift2) {
      if (existingNames.includes(emp.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await api.post('/employees', {
          name: emp.name,
          type: 'STANOKCHI',
          daily_tariff: 120000,
          shift: 'ASR',
        });
        console.log(`   ✅ ${emp.name} (Stanok ${emp.machine})`);
        added++;
      } catch (e) {
        console.log(`   ⚠️ ${emp.name}: ${e.response?.data?.error || e.message}`);
      }
    }

    // DETALCHI
    console.log('\n📌 DETALCHI (Ayollar):');
    for (const name of detalchi) {
      if (existingNames.includes(name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await api.post('/employees', {
          name: name,
          type: 'DETALCHI',
          daily_tariff: 100000,
          shift: 'ERTALAB',
        });
        console.log(`   ✅ ${name}`);
        added++;
      } catch (e) {
        console.log(`   ⚠️ ${name}: ${e.response?.data?.error || e.message}`);
      }
    }

    // RESULT
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`📊 NATIJA:`);
    console.log(`   ✅ Yangi qo'shildi: ${added}`);
    console.log(`   ⏭️  O'tkazib yuborildi: ${skipped}`);

    // Final check
    const final = await api.get('/employees?is_active=all');
    const types = {};
    final.data.employees.forEach(e => {
      types[e.type] = (types[e.type] || 0) + 1;
    });

    console.log(`\n📋 FINAL:`);
    Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
      console.log(`   ${t}: ${c} ta`);
    });
    console.log(`   ─────────────`);
    console.log(`   JAMI: ${final.data.employees.length} ta`);

  } catch (e) {
    console.error('❌ Xato:', e.response?.data || e.message);
  }
}

seed();
