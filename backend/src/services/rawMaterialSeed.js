// Xom ashyo turlarini bazaga yuklash (idempotent, server boot uchun).
// raw_materials jadvali bo'sh bo'lsa avtomatik qo'shiladi.

const db = require('../db');

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

async function ensureRawMaterialSeed() {
  try {
    const countRes = await db.query('SELECT COUNT(*) as cnt FROM raw_materials');
    const cnt = parseInt(countRes.rows[0]?.cnt || countRes.rows[0]?.count || 0);
    if (cnt > 0) {
      console.log(`🧪 Xom ashyo seed: ${cnt} ta allaqachon mavjud — o'tkazildi`);
      return;
    }

    const client = await db.getClient();
    let added = 0;
    try {
      await client.query('BEGIN');
      for (const name of RAW_MATERIALS) {
        await client.query(
          'INSERT INTO raw_materials (name, quantity, unit, price_per_unit, stock_balance, min_stock_level) VALUES ($1,$2,$3,$4,$5,$6)',
          [name, 0, 'kg', 0, 0, 0]
        );
        added++;
      }
      await client.query('COMMIT');
      console.log(`🧪 Xom ashyo seed: ${added} ta xom ashyo turi qo'shildi`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Xom ashyo seed xato:', e.message);
  }
}

module.exports = { ensureRawMaterialSeed };
