/**
 * Rang bo'yicha ombor (product_color_stock) bilan ishlash.
 * `q` — query funksiyasi: tranzaksiya ichida client.query, aks holda db.query.
 * rang bo'sh ('') bo'lsa "Rangsiz" bucket sifatida saqlanadi.
 */

// Rang bo'yicha ombordagi sonni o'qiydi
async function getColorStock(q, product_id, rang) {
  const key = rang || '';
  const r = await q(
    'SELECT quantity FROM product_color_stock WHERE product_id=$1 AND rang=$2',
    [product_id, key]
  );
  return r.rows.length ? parseFloat(r.rows[0].quantity || 0) : 0;
}

// Rang bo'yicha ombordagi sonni delta ga o'zgartiradi (delta manfiy bo'lishi mumkin)
async function addColorStock(q, product_id, rang, delta) {
  if (!product_id || !delta) return;
  const key = rang || '';
  const ex = await q(
    'SELECT quantity FROM product_color_stock WHERE product_id=$1 AND rang=$2',
    [product_id, key]
  );
  if (ex.rows.length) {
    await q(
      'UPDATE product_color_stock SET quantity = quantity + $1 WHERE product_id=$2 AND rang=$3',
      [delta, product_id, key]
    );
  } else {
    await q(
      'INSERT INTO product_color_stock (product_id, rang, quantity) VALUES ($1,$2,$3)',
      [product_id, key, delta]
    );
  }
}

module.exports = { getColorStock, addColorStock };
