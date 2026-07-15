// Xom ashyo turlarini va boshlang'ich balanslarini bazaga yuklash (idempotent).

const db = require('../db');

// [ nom, 15.07.2026 qoldig'i (kg) ]
const RAW_MATERIALS = [
  ['B-Y 456/460/6200',              10625],
  ['I-1561',                         4000],
  ['I-1625',                            0],
  ['ПЕТ 881',                        2500],
  ['J-550,560',                     19450],
  ['J-150/160',                     24750],
  ['B-310',                              0],
  ['B-320',                          20625],
  ['I-2560',                             0],
  ['JM-380/375',                     9625],
  ['JM-350',                        47500],
  ['J-350',                         26225],
  ['TD-20 (ОК ўзимизники)',          2125],
  ['TD-25 (ОҚ ўзимизники)',          3150],
  ['PP-2263 ОК',                     5450],
  ['PP-IM-300 ОК Компаунд у-н',         0],
  ['Полиамид PP GF-30% PIPI',        1850],
  ['Полиамид (РА-66) 30%',            750],
  ['Полиамид (РА-66) КЛИМИТ',        2000],
  ['Полиамид (РА-66) 30% (ОК)',      8250],
  ['Полиамид шишасиз',               1350],
  ['Драбилка Полиамид',                  0],
  ['Чунгак Драбилка Полиамид',       1080],
  ['Грей 4232-11 (серий)',            3000],
  ['Блек 2220 (кора)',                6250],
  ['TD-20 (ҚОРА ўзимизники)',        11525],
  ['Блек климитдан ортган',            250],
  ['Кора гранула (паддон)',               0],
  ['Буфер гранула',                   1325],
  ['Кора гранула (калцийсиз)',         975],
  ['Кора гранула (2-сорт)',           9325],
  ['Кора гранула Компаунд учун',         0],
  ['Кизил гранула (1/5 сорт)',            0],
  ['Кук гранула (1/5 сорт)',              0],
  ['Яшил гранула (1/5 сорт)',             0],
  ['Кук Вдумной (1/5 сорт)',              0],
  ['Тувак ранг гранула (2-сорт)',         0],
  ['Калций Талк',                   36470],
  ['Калций',                          5000],
  ['Мел',                             9950],
];

// 1) Nomlarni qo'shish (jadval bo'sh bo'lsa)
async function ensureRawMaterialSeed() {
  try {
    const countRes = await db.query('SELECT COUNT(*) as cnt FROM raw_materials');
    const cnt = parseInt(countRes.rows[0]?.cnt || countRes.rows[0]?.count || 0);
    if (cnt > 0) {
      console.log(`🧪 Xom ashyo seed: ${cnt} ta allaqachon mavjud — nomlar o'tkazildi`);
    } else {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        for (const [name, balance] of RAW_MATERIALS) {
          await client.query(
            'INSERT INTO raw_materials (name, quantity, unit, price_per_unit, stock_balance, min_stock_level) VALUES ($1,$2,$3,$4,$5,$6)',
            [name, balance, 'kg', 0, balance, 0]
          );
        }
        await client.query('COMMIT');
        console.log(`🧪 Xom ashyo seed: ${RAW_MATERIALS.length} ta tur qo'shildi`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // 2) Balanslarni yangilash — faqat jami stock_balance=0 bo'lsa (birinchi ishga tushish)
    const sumRes = await db.query('SELECT COALESCE(SUM(stock_balance),0) as total FROM raw_materials');
    const total = parseFloat(sumRes.rows[0]?.total || 0);
    if (total > 0) {
      console.log(`🧪 Xom ashyo balanslari allaqachon mavjud (${total} kg) — o'tkazildi`);
      return;
    }

    const client2 = await db.getClient();
    let updated = 0;
    try {
      await client2.query('BEGIN');
      for (const [name, balance] of RAW_MATERIALS) {
        if (balance > 0) {
          await client2.query(
            'UPDATE raw_materials SET stock_balance=$1, quantity=$2 WHERE name=$3',
            [balance, balance, name]
          );
          updated++;
        }
      }
      await client2.query('COMMIT');
      console.log(`🧪 Xom ashyo balanslari o'rnatildi: ${updated} ta yangilandi`);
    } catch (e) {
      await client2.query('ROLLBACK');
      throw e;
    } finally {
      client2.release();
    }
  } catch (e) {
    console.error('Xom ashyo seed xato:', e.message);
  }
}

module.exports = { ensureRawMaterialSeed };
