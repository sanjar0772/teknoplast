/**
 * ~1000 ta realistik plastik mahsulot generatsiya qiluvchi skript.
 * Ishga tushirish: node seed_products.js
 */
const { query, getClient } = require('./src/db');

const TYPES = [
  { name: 'Idish',    unit: 'dona', sizes: ['0.25L','0.5L','0.75L','1L','1.5L','2L','3L','5L','10L','20L'] },
  { name: 'Qopqoq',   unit: 'dona', sizes: ['28mm','30mm','38mm','42mm','48mm','55mm','63mm','82mm','100mm'] },
  { name: 'Stakan',   unit: 'dona', sizes: ['100ml','150ml','200ml','250ml','300ml','500ml'] },
  { name: 'Tarelka',  unit: 'dona', sizes: ['kichik','o\'rta','katta'] },
  { name: 'Paket',    unit: 'dona', sizes: ['25x40','30x50','40x60','50x70','60x90'] },
  { name: 'Kanistr',  unit: 'dona', sizes: ['5L','10L','20L','30L'] },
  { name: 'Vedro',    unit: 'dona', sizes: ['5L','10L','12L','15L','20L'] },
  { name: 'Quvur',    unit: 'metr', sizes: ['20mm','25mm','32mm','40mm','50mm','63mm','75mm','110mm'] },
  { name: 'Plyonka',  unit: 'rulon', sizes: ['80sm','100sm','120sm','150sm'] },
  { name: 'Lotok',    unit: 'dona', sizes: ['S','M','L','XL'] },
  { name: 'Flakon',   unit: 'dona', sizes: ['30ml','50ml','100ml','200ml','500ml'] },
  { name: 'Truba',    unit: 'metr', sizes: ['16mm','20mm','25mm','32mm'] },
];

const COLORS = ['oq', 'shaffof', "ko'k", 'qizil', 'yashil', 'sariq', 'qora', 'kulrang'];
const BRANDS = ['Standart', 'Premium'];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }

async function main() {
  // Avvalgi seed mahsulotlarini tozalash (sotuvga bog'lanmaganlarini)
  await query(`DELETE FROM products WHERE id NOT IN (
    SELECT DISTINCT product_id FROM sales WHERE product_id IS NOT NULL
  )`);
  const existing = await query('SELECT COUNT(*) as count FROM products');
  console.log('Tozalashdan keyin qolgan mahsulotlar:', existing.rows[0].count);

  const products = [];
  for (const t of TYPES) {
    for (const size of t.sizes) {
      for (const color of COLORS) {
        for (const brand of BRANDS) {
          const name = `${t.name} ${size} ${color} (${brand})`;
          const price = rnd(3, 600) * 100;          // 300 — 60000 so'm
          const stock = rnd(0, 2000);
          products.push({ name, type: t.name, price, stock, unit: t.unit });
        }
      }
    }
  }

  console.log('Yaratiladigan mahsulotlar:', products.length);

  const client = await getClient();
  await client.query('BEGIN');
  let inserted = 0;
  try {
    for (const p of products) {
      await client.query(
        `INSERT INTO products (name, type, price, stock_quantity, daily_production, unit)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.name, p.type, p.price, p.stock, rnd(50, 500), p.unit]
      );
      inserted++;
    }
    await client.query('COMMIT');
    console.log(`✅ ${inserted} ta mahsulot qo'shildi`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Xato:', e.message);
  }

  const total = await query('SELECT COUNT(*) as count FROM products');
  console.log('Jami mahsulotlar:', total.rows[0].count);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
