/**
 * Mavjud mahsulot nomlarini base_name + razmer + rang ga ajratuvchi skript.
 * Masalan: "Flakon 100ml oq (Premium)" => base="Flakon (Premium)", razmer="100ml", rang="oq"
 * Ishga tushirish: node backfill_size_color.js
 */
const { query, getClient } = require('./src/db');

const COLORS = ['oq', 'shaffof', "ko'k", 'qizil', 'yashil', 'sariq', 'qora', 'kulrang'];

function parseName(fullName) {
  let brandSuffix = '';
  const m = fullName.match(/\s*\(([^)]+)\)\s*$/);
  let core = fullName;
  if (m) { brandSuffix = ' (' + m[1] + ')'; core = fullName.slice(0, m.index); }
  const tokens = core.trim().split(/\s+/);

  // Oxirgi so'z rang bo'lsa va kamida 3 ta token bo'lsa — ajratamiz
  if (tokens.length >= 3 && COLORS.includes(tokens[tokens.length - 1])) {
    const rang = tokens[tokens.length - 1];
    const razmer = tokens[tokens.length - 2];
    const type = tokens.slice(0, tokens.length - 2).join(' ');
    return { base_name: (type + brandSuffix).trim(), razmer, rang };
  }
  // Ajratib bo'lmasa — to'liq nomni base sifatida qoldiramiz
  return { base_name: fullName, razmer: '', rang: '' };
}

async function main() {
  const res = await query("SELECT id, name FROM products WHERE base_name IS NULL OR base_name = ''");
  console.log('Ajratiladigan mahsulotlar:', res.rows.length);
  if (!res.rows.length) { console.log('Hammasi allaqachon ajratilgan.'); process.exit(0); }

  const client = await getClient();
  await client.query('BEGIN');
  let done = 0;
  try {
    for (const p of res.rows) {
      const { base_name, razmer, rang } = parseName(p.name);
      await client.query(
        'UPDATE products SET base_name=$1, razmer=$2, rang=$3 WHERE id=$4',
        [base_name, razmer, rang, p.id]
      );
      done++;
      if (done <= 5) console.log(`  "${p.name}" => base="${base_name}" | razmer="${razmer}" | rang="${rang}"`);
    }
    await client.query('COMMIT');
    console.log(`✅ ${done} ta mahsulot ajratildi`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Xato:', e.message);
  }

  // Tekshiruv: nechta rang variant guruhi bor
  const groups = await query(`
    SELECT base_name, razmer, COUNT(*) as rang_soni
    FROM products WHERE razmer != '' GROUP BY base_name, razmer
    HAVING COUNT(*) > 1 ORDER BY rang_soni DESC LIMIT 5
  `);
  console.log('\nEng ko\'p rangli guruhlar (namuna):');
  groups.rows.forEach(g => console.log(`  ${g.base_name} ${g.razmer}: ${g.rang_soni} xil rang`));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
