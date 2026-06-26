const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');

function formatMoney(amount) {
  return new Intl.NumberFormat('uz-UZ').format(parseFloat(amount || 0)) + ' so\'m';
}

// PDFKit'ning standart "Helvetica" shrifti kirill harflarini (rus/o'zbek matni)
// qo'llab-quvvatlamaydi — natijada PDF'da matn buzuq belgilar bilan chiqadi.
// Shu sababli kirill-yo'naltirilgan TTF shrift ("Arial") ro'yxatdan o'tkazib,
// "Helvetica"/"Helvetica-Bold" o'rniga ishlatamiz.
const FONT_REGULAR = path.join(__dirname, '..', 'assets', 'fonts', 'Arial.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'Arial-Bold.ttf');

function registerCyrillicFonts(doc) {
  doc.registerFont('Arial', FONT_REGULAR);
  doc.registerFont('Arial-Bold', FONT_BOLD);
  doc.font('Arial');
  return doc;
}

async function generateMonthlyPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    registerCyrillicFonts(doc);
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Arial-Bold').text('TEKNOPLAST', { align: 'center' });
    doc.fontSize(14).font('Arial').text(`${data.period} - Oylik Hisobot`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Moliyaviy ko'rsatkichlar
    doc.fontSize(12).font('Arial-Bold').text('MOLIYAVIY KO\'RSATKICHLAR');
    doc.moveDown(0.5);
    doc.font('Arial');

    const pl = data.profit_loss || {};
    const rows = [
      ['Jami sotuv:', formatMoney(pl.revenue)],
      ['Jami xarajat:', formatMoney(pl.expenses)],
      ['Sof foyda:', formatMoney(pl.profit)],
      ['Foyda ulushi:', `${pl.margin || 0}%`],
    ];

    rows.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 300 });
      doc.text(value, { align: 'right' });
    });

    doc.moveDown();

    // Sotuv
    doc.fontSize(12).font('Arial-Bold').text('SOTUV');
    doc.font('Arial');
    const s = data.sales || {};
    doc.text(`Jami: ${s.count || 0} ta, ${formatMoney(s.total)}`);
    doc.text(`To'langan: ${formatMoney(s.paid)}`);
    doc.moveDown();

    // Xarajatlar
    doc.fontSize(12).font('Arial-Bold').text('XARAJATLAR');
    doc.font('Arial');
    if (data.expenses?.by_category) {
      data.expenses.by_category.forEach(c => {
        doc.text(`${c.category}: ${formatMoney(c.total)}`);
      });
    }
    doc.moveDown();

    // Ishlab chiqarish
    doc.fontSize(12).font('Arial-Bold').text('ISHLAB CHIQARISH');
    doc.font('Arial');
    const prod = data.production || {};
    doc.text(`Jami ishlab chiqarildi: ${prod.total_qty || 0} dona`);
    doc.text(`Ishchilar soni: ${prod.workers || 0} nafar`);
    doc.moveDown();

    // Oylik
    doc.fontSize(12).font('Arial-Bold').text('OYLIKLAR');
    doc.font('Arial');
    const sal = data.salaries || {};
    doc.text(`Jami oylik xarajat: ${formatMoney(sal.total)}`);
    doc.text(`Xodimlar soni: ${sal.count || 0}`);
    doc.text(`To'langan: ${sal.paid_count || 0} nafar`);

    doc.moveDown(2);
    doc.fontSize(10).fillColor('gray').text(
      `Hisobot yaratilgan: ${new Date().toLocaleDateString('uz-UZ')}`,
      { align: 'right' }
    );

    doc.end();
  });
}

function _applyHeaderStyle(row, argb = 'FF1E40AF') {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

async function generateSalesExcel(salesData, period) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teknoplast';

  /* ── 1-varaq: Sotuv tarixi ── */
  const sheet1 = workbook.addWorksheet('Sotuv tarixi');
  sheet1.columns = [
    { header: '№',            key: 'num',             width: 5  },
    { header: 'Sana',         key: 'sale_date',        width: 12 },
    { header: 'Mahsulot',     key: 'product_name',     width: 25 },
    { header: 'Miqdor',       key: 'quantity',         width: 10 },
    { header: "Birlik narx",  key: 'unit_price',       width: 16 },
    { header: "Jami (so'm)",  key: 'total_amount',     width: 18 },
    { header: "To'langan",    key: 'payment_amount',   width: 16 },
    { header: "Qarz",         key: 'debt',             width: 14 },
    { header: 'Mijoz',        key: 'customer_name',    width: 20 },
    { header: 'Status',       key: 'status',           width: 13 },
    { header: 'Kim sotdi',    key: 'created_by_name',  width: 18 },
  ];
  _applyHeaderStyle(sheet1.getRow(1));

  const statusMap = { PAID: "To'langan", PENDING: 'Kutilmoqda', PARTIAL: 'Qisman' };
  salesData.forEach((s, i) => {
    const total = parseFloat(s.total_amount || 0);
    const paid  = parseFloat(s.payment_amount || 0);
    sheet1.addRow({
      num:             i + 1,
      sale_date:       new Date(s.sale_date).toLocaleDateString('uz-UZ'),
      product_name:    s.product_name,
      quantity:        s.quantity,
      unit_price:      parseFloat(s.unit_price || 0),
      total_amount:    total,
      payment_amount:  paid,
      debt:            Math.max(0, total - paid),
      customer_name:   s.customer_name || '-',
      status:          statusMap[s.status] || s.status,
      created_by_name: s.created_by_name,
    });
  });
  const t1 = sheet1.addRow({
    sale_date: 'JAMI:',
    quantity:      salesData.reduce((a, s) => a + parseFloat(s.quantity || 0), 0),
    total_amount:  salesData.reduce((a, s) => a + parseFloat(s.total_amount || 0), 0),
    payment_amount:salesData.reduce((a, s) => a + parseFloat(s.payment_amount || 0), 0),
    debt:          salesData.reduce((a, s) => a + Math.max(0, parseFloat(s.total_amount||0)-parseFloat(s.payment_amount||0)), 0),
  });
  t1.font = { bold: true };

  /* ── 2-varaq: Mijozlar bo'yicha ── */
  const sheet2 = workbook.addWorksheet('Mijozlar');
  sheet2.columns = [
    { header: '№',              key: 'num',     width: 5  },
    { header: 'Mijoz',          key: 'name',    width: 28 },
    { header: 'Xaridlar soni',  key: 'cnt',     width: 15 },
    { header: "Jami summa",     key: 'total',   width: 18 },
    { header: "To'langan",      key: 'paid',    width: 18 },
    { header: 'Qarz',           key: 'debt',    width: 16 },
  ];
  _applyHeaderStyle(sheet2.getRow(1), 'FF065F46');

  const custMap = new Map();
  salesData.forEach(s => {
    const k = s.customer_name || 'Noma\'lum';
    if (!custMap.has(k)) custMap.set(k, { cnt: 0, total: 0, paid: 0 });
    const c = custMap.get(k);
    c.cnt++;
    c.total += parseFloat(s.total_amount || 0);
    c.paid  += parseFloat(s.payment_amount || 0);
  });
  [...custMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([name, c], i) => {
      sheet2.addRow({ num: i + 1, name, cnt: c.cnt, total: c.total, paid: c.paid, debt: Math.max(0, c.total - c.paid) });
    });
  const t2 = sheet2.addRow({
    name: 'JAMI:',
    cnt:   [...custMap.values()].reduce((a, c) => a + c.cnt, 0),
    total: [...custMap.values()].reduce((a, c) => a + c.total, 0),
    paid:  [...custMap.values()].reduce((a, c) => a + c.paid, 0),
    debt:  [...custMap.values()].reduce((a, c) => a + Math.max(0, c.total - c.paid), 0),
  });
  t2.font = { bold: true };

  /* ── 3-varaq: Mahsulotlar bo'yicha ── */
  const sheet3 = workbook.addWorksheet('Mahsulotlar');
  sheet3.columns = [
    { header: '№',              key: 'num',    width: 5  },
    { header: 'Mahsulot',       key: 'name',   width: 28 },
    { header: 'Birligi',        key: 'unit',   width: 10 },
    { header: 'Jami miqdor',    key: 'qty',    width: 14 },
    { header: "Jami summa",     key: 'total',  width: 18 },
    { header: 'Savdolar soni',  key: 'cnt',    width: 14 },
  ];
  _applyHeaderStyle(sheet3.getRow(1), 'FF7C3AED');

  const prodMap = new Map();
  salesData.forEach(s => {
    const k = s.product_name || '-';
    if (!prodMap.has(k)) prodMap.set(k, { unit: s.unit || 'dona', qty: 0, total: 0, cnt: 0 });
    const p = prodMap.get(k);
    p.qty   += parseFloat(s.quantity || 0);
    p.total += parseFloat(s.total_amount || 0);
    p.cnt++;
  });
  [...prodMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([name, p], i) => {
      sheet3.addRow({ num: i + 1, name, unit: p.unit, qty: p.qty, total: p.total, cnt: p.cnt });
    });
  const t3 = sheet3.addRow({
    name:  'JAMI:',
    qty:   [...prodMap.values()].reduce((a, p) => a + p.qty, 0),
    total: [...prodMap.values()].reduce((a, p) => a + p.total, 0),
    cnt:   [...prodMap.values()].reduce((a, p) => a + p.cnt, 0),
  });
  t3.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

async function generateSalaryExcel(salaryData, period) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Maoshlar ${period}`);

  sheet.columns = [
    { header: '№', key: 'num', width: 5 },
    { header: 'Xodim', key: 'employee_name', width: 25 },
    { header: 'Turi', key: 'employee_type', width: 15 },
    { header: 'Ish kunlari', key: 'work_days', width: 12 },
    { header: 'Ishlab chiqargan', key: 'total_produced', width: 18 },
    { header: 'Hisoblanган', key: 'total_calculated', width: 18 },
    { header: 'Bonus', key: 'bonuses', width: 15 },
    { header: 'Jarima', key: 'penalties', width: 15 },
    { header: 'Sof maosh', key: 'net_amount', width: 18 },
    { header: 'Status', key: 'status', width: 15 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

  const statusMap = { 'CALCULATED': 'Hisoblangan', 'APPROVED': 'Tasdiqlangan', 'PAID': 'To\'langan' };

  salaryData.forEach((s, i) => {
    sheet.addRow({
      num: i + 1,
      employee_name: s.employee_name,
      employee_type: s.employee_type,
      work_days: s.work_days || 0,
      total_produced: s.total_produced || 0,
      total_calculated: parseFloat(s.total_calculated),
      bonuses: parseFloat(s.bonuses || 0),
      penalties: parseFloat(s.penalties || 0),
      net_amount: parseFloat(s.net_amount),
      status: statusMap[s.status] || s.status,
    });
  });

  const totalRow = sheet.addRow({
    num: '', employee_name: 'JAMI:',
    total_calculated: salaryData.reduce((a, s) => a + parseFloat(s.total_calculated), 0),
    bonuses: salaryData.reduce((a, s) => a + parseFloat(s.bonuses || 0), 0),
    penalties: salaryData.reduce((a, s) => a + parseFloat(s.penalties || 0), 0),
    net_amount: salaryData.reduce((a, s) => a + parseFloat(s.net_amount), 0),
  });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// Ishlab chiqarish — davr bo'yicha statistika (Stanokchi/Detalchi)
async function generateProductionRangeExcel(rows, startDate, endDate) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${startDate}_${endDate}`.slice(0, 31));

  sheet.columns = [
    { header: '№', key: 'num', width: 5 },
    { header: 'Xodim', key: 'name', width: 25 },
    { header: 'Turi', key: 'type', width: 14 },
    { header: 'Smena', key: 'shift', width: 12 },
    { header: 'Ish kunlari', key: 'work_days', width: 12 },
    { header: "Ishlab chiqargan (dona)", key: 'total_produced', width: 20 },
    { header: "Hisoblangan haq (so'm)", key: 'total_earned', width: 20 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

  const typeMap = { STANOKCHI: 'Stanokchi', DETALCHI: 'Detalchi' };
  const shiftMap = { '1-SMENA': '1-Smena', '2-SMENA': '2-Smena' };

  rows.forEach((r, i) => {
    sheet.addRow({
      num: i + 1,
      name: r.name,
      type: typeMap[r.type] || r.type,
      shift: r.type === 'STANOKCHI' ? (shiftMap[r.shift] || r.shift || '—') : '—',
      work_days: r.work_days || 0,
      total_produced: parseFloat(r.total_produced || 0),
      total_earned: parseFloat(r.total_earned || 0),
    });
  });

  const totalRow = sheet.addRow({
    num: '', name: 'JAMI:',
    work_days: rows.reduce((a, r) => a + (parseInt(r.work_days) || 0), 0),
    total_produced: rows.reduce((a, r) => a + parseFloat(r.total_produced || 0), 0),
    total_earned: rows.reduce((a, r) => a + parseFloat(r.total_earned || 0), 0),
  });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// Хом ашё — танланган давр учун Бошланғич/Кирим/Сарф/Якуний қолдиқ ҳисоботи (профессионал Excel)
async function generateRawMaterialRangeExcel(rows, startDate, endDate) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TEKNOPLAST';
  const sheet = workbook.addWorksheet('Хом ашё ҳисоботи');

  const COLS = 10;           // А..Ж (10 устун)
  const last = String.fromCharCode(64 + COLS); // 'J'
  const num = '#,##0';
  const money = '#,##0';
  const GREEN = 'FF065F46';
  const LIGHT = 'FFE8F5EE';

  const thin = { style: 'thin', color: { argb: 'FFBFD8C9' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // --- Сарлавҳа блоки ---
  sheet.mergeCells(`A1:${last}1`);
  const t1 = sheet.getCell('A1');
  t1.value = 'TEKNOPLAST — Хом ашё ҳисоботи';
  t1.font = { bold: true, size: 16, color: { argb: GREEN } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(`A2:${last}2`);
  const t2 = sheet.getCell('A2');
  t2.value = `Давр: ${startDate}  —  ${endDate}`;
  t2.font = { size: 11, color: { argb: 'FF374151' } };
  t2.alignment = { horizontal: 'center' };

  sheet.mergeCells(`A3:${last}3`);
  const t3 = sheet.getCell('A3');
  t3.value = `Тузилди: ${new Date().toLocaleString('uz-UZ')}`;
  t3.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
  t3.alignment = { horizontal: 'center' };

  // --- Жадвал сарлавҳаси (4-қатор) ---
  const headerRowIdx = 4;
  const headers = ['№', 'Хом ашё', 'Бирлик', 'Бошланғич қолдиқ', 'Кирим миқдор', "Кирим сумма (сўм)", 'Сарф миқдор', "Сарф сумма (сўм)", 'Якуний қолдиқ', "Якуний сумма (сўм)"];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  headerRow.height = 30;

  // Устун кенгликлари
  const widths = [5, 28, 9, 16, 14, 18, 14, 18, 16, 20];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  // --- Маълумот қаторлари ---
  const num2 = (v) => parseFloat(v) || 0;
  let r = headerRowIdx;
  rows.forEach((row, i) => {
    r++;
    const dataRow = sheet.getRow(r);
    const vals = [
      i + 1, row.name, row.unit || 'kg',
      num2(row.opening), num2(row.kirim_qty), num2(row.kirim_cost),
      num2(row.sarf_qty), num2(row.sarf_cost), num2(row.closing), num2(row.closing_cost),
    ];
    vals.forEach((v, c) => {
      const cell = dataRow.getCell(c + 1);
      cell.value = v;
      cell.border = border;
      if (c === 0) cell.alignment = { horizontal: 'center' };
      if (c === 2) cell.alignment = { horizontal: 'center' };
      if (c >= 3) cell.numFmt = (c === 5 || c === 7 || c === 9) ? money : num;
    });
    if (i % 2 === 1) {
      for (let c = 1; c <= COLS; c++) dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    }
    // Якуний қолдиқ манфий бўлса — қизил (9-устун)
    if (num2(row.closing) < 0) dataRow.getCell(9).font = { color: { argb: 'FFDC2626' }, bold: true };
  });

  // --- ЖАМИ қатори ---
  r++;
  const totalRow = sheet.getRow(r);
  const sum = (key) => rows.reduce((a, x) => a + num2(x[key]), 0);
  const totals = ['', 'ЖАМИ:', '', sum('opening'), sum('kirim_qty'), sum('kirim_cost'), sum('sarf_qty'), sum('sarf_cost'), sum('closing'), sum('closing_cost')];
  totals.forEach((v, c) => {
    const cell = totalRow.getCell(c + 1);
    cell.value = v;
    cell.font = { bold: true, color: { argb: GREEN } };
    cell.border = border;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    if (c >= 3) cell.numFmt = (c === 5 || c === 7 || c === 9) ? money : num;
  });

  // Музлатиш + автофильтр
  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  sheet.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: COLS } };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// Nakladnoy (yuk xati) — QR kod bilan
async function generateWaybillPDF(order) {
  const QRCode = require('qrcode');
  const qrDataUrl = await QRCode.toDataURL(order.order_ref, { margin: 1, width: 160 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    registerCyrillicFonts(doc);
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Sarlavha
    doc.fontSize(20).font('Arial-Bold').text('TEKNOPLAST', 50, 50);
    doc.fontSize(13).font('Arial').text('NAKLADNOY (Yuk xati)', 50, 75);

    // QR kod o'ng yuqorida
    doc.image(qrBuffer, 420, 45, { width: 110 });
    doc.fontSize(9).font('Arial').text(order.order_ref, 420, 158, { width: 110, align: 'center' });

    doc.moveTo(50, 175).lineTo(545, 175).stroke();

    // Buyurtma ma'lumotlari
    let y = 190;
    doc.fontSize(10).font('Arial');
    doc.text(`Buyurtma kodi: ${order.order_ref}`, 50, y); y += 16;
    doc.text(`Sana: ${new Date(order.sale_date || Date.now()).toLocaleDateString('uz-UZ')}`, 50, y); y += 16;
    doc.text(`Mijoz: ${order.customer_name || 'Noma\'lum'}`, 50, y); y += 16;
    if (order.customer_phone) { doc.text(`Telefon: ${order.customer_phone}`, 50, y); y += 16; }
    y += 10;

    // Jadval sarlavhasi
    doc.font('Arial-Bold').fontSize(10);
    doc.text('№', 50, y); doc.text('Mahsulot', 80, y); doc.text('Miqdor', 360, y); doc.text('Summa', 450, y);
    y += 4; doc.moveTo(50, y + 12).lineTo(545, y + 12).stroke(); y += 18;

    doc.font('Arial').fontSize(9);
    let total = 0;
    let grandQtyW = 0;
    const wGroups = groupSaleItems(order.items || []);
    const wUnit = wGroups[0]?.unit || 'dona';
    wGroups.forEach((g, i) => {
      const totalQty = g.items.reduce((s, x) => s + parseFloat(x.quantity || 0), 0);
      const totalSum = g.items.reduce((s, x) => s + parseFloat(x.total_amount || 0), 0);
      total += totalSum;
      grandQtyW += totalQty;
      const multiColor = g.items.length > 1 && g.items.some(x => x.rang);
      const singleColor = g.items.length === 1 && g.items[0].rang;
      const baseName = `${g.product_name}${g.razmer ? ' ' + g.razmer : ''}`.trim();
      doc.text(String(i + 1), 50, y);
      doc.text(baseName.slice(0, 42), 80, y, { width: 265 });
      doc.text(`${totalQty} ${g.unit}`, 355, y, { width: 90, align: 'right' });
      doc.text(formatMoney(totalSum), 450, y, { width: 95 });
      let rowH = 17;
      if (multiColor) {
        const colorLine = g.items.map(x => `${x.rang || '?'}: ${x.quantity}`).join('   ');
        doc.fontSize(7.5).fillColor('#666')
          .text(colorLine, 84, y + 11, { width: 340 });
        doc.fontSize(9).fillColor('black');
        rowH = 26;
      } else if (singleColor) {
        doc.fontSize(7.5).fillColor('#888')
          .text(g.items[0].rang, 84, y + 11, { width: 200 });
        doc.fontSize(9).fillColor('black');
        rowH = 26;
      }
      y += rowH;
      if (y > 720) { doc.addPage(); y = 50; }
    });

    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke(); y += 14;
    doc.font('Arial').fontSize(9).text(`Jami miqdor: ${grandQtyW} ${wUnit}`, 50, y);
    doc.font('Arial-Bold').text(`JAMI: ${formatMoney(total)}`, 360, y, { width: 185, align: 'right' });

    y += 50;
    doc.font('Arial').fontSize(9);
    doc.text('Topshirdi (Omborchi): ____________________', 50, y);
    doc.text('Qabul qildi (Mijoz): ____________________', 320, y);

    doc.end();
  });
}

// To'lov turini sotuv yozuvidan aniqlaymiz
function getInvoicePaymentLabel(sale) {
  const notes = sale?.notes || '';
  const total = parseFloat(sale?.total_amount || 0);
  const paid = parseFloat(sale?.payment_amount || 0);
  const parseAmt = (m) => parseFloat((m?.[1] || '0').replace(/[^\d.]/g, '')) || 0;
  const parts = [];
  const cashMatch = notes.match(/Naqd:\s*([\d\s,.]+)/);
  const cardMatch = notes.match(/Karta:\s*([\d\s,.]+)/);
  const bankMatch = notes.match(/Bank:\s*([\d\s,.]+)/);
  const paymeMatch = notes.match(/Payme:\s*([\d\s,.]+)/);
  if (cashMatch) parts.push(`Naqd: ${formatMoney(parseAmt(cashMatch))}`);
  if (cardMatch) parts.push(`Karta: ${formatMoney(parseAmt(cardMatch))}`);
  if (bankMatch) parts.push(`Bank: ${formatMoney(parseAmt(bankMatch))}`);
  if (paymeMatch) parts.push(`Pay Me: ${formatMoney(parseAmt(paymeMatch))}`);
  const discMatch = notes.match(/Chegirma:\s*([\d\s,.]+)/);
  if (parts.length) {
    const debt = Math.max(0, total - paid);
    if (debt > 0) parts.push(`Qarz: ${formatMoney(debt)}`);
    if (discMatch) parts.push(`Chegirma: ${formatMoney(parseAmt(discMatch))}`);
    return parts.join(' · ');
  }
  if (sale?.status === 'PAID') {
    if (notes.includes('Karta')) return 'Karta';
    if (notes.includes('Naqd')) return 'Naqd';
    return "To'langan";
  }
  if (sale?.status === 'PARTIALLY_PAID') return "Qisman to'langan";
  return 'Qarz';
}

// Bir xil mahsulot (ism+razmer) bo'lgan qatorlarni birlashtiramiz —
// turli ranglar bitta qatorda ko'rsatiladi
function groupSaleItems(rows) {
  const order = [];
  const map = {};
  rows.forEach(it => {
    const key = `${it.product_name || ''}||${it.razmer || ''}`;
    if (!map[key]) {
      map[key] = {
        product_name: it.product_name || '',
        razmer: it.razmer || '',
        unit: it.unit || 'dona',
        unit_price: it.unit_price,
        items: []
      };
      order.push(map[key]);
    }
    map[key].items.push(it);
  });
  return order;
}

// Schyot-faktura — ixcham, ranglar bitta qatorda ko'rsatiladi
async function generateInvoicePDF(sale, items, viewUrl) {
  const QRCode = require('qrcode');
  const qrDataUrl = await QRCode.toDataURL(viewUrl, { margin: 1, width: 140 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    registerCyrillicFonts(doc);
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 35;
    const W = 525;
    const fn = n => new Intl.NumberFormat('uz-UZ').format(parseFloat(n || 0));
    const orderRef = sale.order_ref || sale.id;
    const saleDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('uz-UZ');
    const rows = (items && items.length) ? items : [sale];
    const groups = groupSaleItems(rows);

    // ── HEADER: yetkazib beruvchi rekvizitlari ────────────
    const COMPANY = {
      name: 'ТЕХНО-ИННОВАТОР МЧЖ',
      address: 'АНДИЖОН ТУМАН Найманобод М.Ф.Й. Темир йул куча №2',
      phone: '+998 99-444-70-99',
      account: '20208000304436294001',
      bank: 'АТБ "Хамкорбанк" Андижон булими',
      mfo: '00083',
      inn: '205811951',
    };

    // QR — yuqori o'ng burchak
    doc.image(qrBuffer, M + W - 70, 28, { width: 70 });

    // Kompaniya nomi + rekvizitlar — yuqori chap burchak
    doc.fontSize(13).font('Arial-Bold').fillColor('#111').text(COMPANY.name, M, 28);
    let hy = 46;
    doc.fontSize(7.5).font('Arial').fillColor('#555');
    doc.text(`Манзил: ${COMPANY.address}`, M, hy, { width: 430 }); hy += 11;
    doc.text(`Тел: ${COMPANY.phone}      ИНН: ${COMPANY.inn}`, M, hy, { width: 430 }); hy += 11;
    doc.text(`Х/р: ${COMPANY.account}      МФО: ${COMPANY.mfo}`, M, hy, { width: 430 }); hy += 11;
    doc.text(`Банк: ${COMPANY.bank}`, M, hy, { width: 430 }); hy += 11;

    // Ajratuvchi chiziq
    let y = Math.max(hy + 4, 104);
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.8).stroke('#333');
    y += 7;

    // Faktura raqami + sana
    doc.fontSize(10.5).font('Arial-Bold').fillColor('#111')
      .text(`SCHYOT-FAKTURA  №  ${orderRef}`, M, y);
    doc.fontSize(8.5).font('Arial').fillColor('#555')
      .text(`Sana: ${saleDate}`, M, y + 1, { width: W, align: 'right' });
    y += 18;

    // Sotuvchi xodim / Xaridor — 2 ustun
    doc.fontSize(8.5).font('Arial-Bold').fillColor('#111');
    doc.text('Sotuvchi:', M, y);
    doc.font('Arial').text(sale.created_by_name || COMPANY.name, M + 50, y, { width: 200 });
    doc.font('Arial-Bold').text("Xaridor:", M + 260, y);
    doc.font('Arial').text(
      (sale.customer_full_name || sale.customer_name || "Noma'lum").slice(0, 32),
      M + 305, y, { width: 165 }
    );
    y += 13;
    const phone = sale.customer_full_phone || sale.customer_phone;
    if (phone) {
      doc.font('Arial-Bold').text('Telefon:', M + 260, y);
      doc.font('Arial').text(phone, M + 305, y);
      y += 13;
    }
    if (sale.customer_address) {
      doc.font('Arial-Bold').text('Manzil:', M + 260, y);
      doc.font('Arial').text(sale.customer_address.slice(0, 30), M + 305, y);
      y += 13;
    }

    y += 4;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).stroke('#333');
    y += 8;

    // ── JADVAL SARLAVHASI ─────────────────────────────────
    const C = { n: M, name: M + 22, unit: M + 275, qty: M + 312, price: M + 360, sum: M + 448 };

    doc.fontSize(8.5).font('Arial-Bold').fillColor('#111');
    doc.text('№',            C.n,    y, { width: 18 });
    doc.text('Mahsulot nomi', C.name, y, { width: 248 });
    doc.text('Birlik',        C.unit, y, { width: 36 });
    doc.text('Miqdor',        C.qty,  y, { width: 46, align: 'right' });
    doc.text('Narx',          C.price,y, { width: 82, align: 'right' });
    doc.text('Summa',         C.sum,  y, { width: 77, align: 'right' });
    y += 5;
    doc.moveTo(M, y + 7).lineTo(M + W, y + 7).lineWidth(0.8).stroke('#333');
    y += 14;

    // ── QATORLAR ──────────────────────────────────────────
    doc.fontSize(8.5).font('Arial').fillColor('black');
    let grandTotal = 0;
    let grandQty   = 0;
    const defaultUnit = groups[0]?.unit || 'dona';

    groups.forEach((g, i) => {
      const totalQty = g.items.reduce((s, x) => s + parseFloat(x.quantity || 0), 0);
      const totalSum = g.items.reduce((s, x) => s + parseFloat(x.total_amount || 0), 0);
      grandTotal += totalSum;
      grandQty   += totalQty;

      const multiColor = g.items.length > 1 && g.items.some(x => x.rang);
      const singleColor = g.items.length === 1 && g.items[0].rang;
      const samePrice = g.items.every(
        x => Math.abs(parseFloat(x.unit_price || 0) - parseFloat(g.items[0].unit_price || 0)) < 1
      );
      const rowH = multiColor ? 24 : (singleColor ? 24 : 16);

      // Alternating background
      if (i % 2 === 1) {
        doc.save().rect(M, y - 2, W, rowH).fill('#f7f7f7').restore();
      }

      doc.fillColor('#555').text(String(i + 1), C.n, y, { width: 18 });
      doc.fillColor('#111');

      const baseName = `${g.product_name}${g.razmer ? ' ' + g.razmer : ''}`.trim();
      doc.text(baseName.slice(0, 46), C.name, y, { width: 248 });
      doc.text(g.unit, C.unit, y, { width: 36 });
      doc.text(String(totalQty), C.qty, y, { width: 46, align: 'right' });

      if (samePrice) {
        doc.text(fn(g.items[0].unit_price), C.price, y, { width: 82, align: 'right' });
      } else {
        doc.fillColor('#aaa').text('—', C.price, y, { width: 82, align: 'right' }).fillColor('#111');
      }
      doc.text(fn(totalSum), C.sum, y, { width: 77, align: 'right' });

      // Rang tafsilotlari (kichik qator)
      if (multiColor) {
        const colorLine = g.items.map(x => `${x.rang || '?'}: ${x.quantity}`).join('    ');
        doc.fontSize(7.5).fillColor('#666').font('Arial')
          .text(colorLine, C.name + 3, y + 12, { width: 360 });
        doc.fontSize(8.5).fillColor('#111').font('Arial');
      } else if (singleColor) {
        doc.fontSize(7.5).fillColor('#888').font('Arial')
          .text(g.items[0].rang, C.name + 3, y + 12, { width: 200 });
        doc.fontSize(8.5).fillColor('#111').font('Arial');
      }

      doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(0.25).stroke('#ddd');
      y += rowH + 2;

      if (y > 760) { doc.addPage(); y = 35; }
    });

    // ── JAMI ──────────────────────────────────────────────
    doc.moveTo(M, y + 3).lineTo(M + W, y + 3).lineWidth(1).stroke('#333');
    y += 12;

    doc.font('Arial').fontSize(8.5).fillColor('#555')
      .text(`Jami miqdor: ${grandQty} ${defaultUnit}`, M, y);
    doc.font('Arial-Bold').fontSize(10.5).fillColor('#111')
      .text(`JAMI: ${formatMoney(grandTotal)}`, M, y, { width: W, align: 'right' });
    y += 16;

    // To'langan summa (qarz to'lovlari bilan birga — payment_amount'dan) va qoldiq qarz
    const grandPaid = rows.reduce((s, it) => s + parseFloat(it.payment_amount || 0), 0);
    const grandDebt = Math.max(0, grandTotal - grandPaid);
    doc.font('Arial-Bold').fontSize(9).fillColor('#1a7a3c')
      .text(`To'langan: ${formatMoney(grandPaid)}`, M, y);
    if (grandDebt > 0) {
      doc.font('Arial-Bold').fontSize(9).fillColor('#c0392b')
        .text(`Qarz: ${formatMoney(grandDebt)}`, M, y, { width: W, align: 'right' });
    }
    y += 14;
    doc.font('Arial').fontSize(8).fillColor('#777')
      .text(`To'lov holati: ${getInvoicePaymentLabel(sale)}`, M, y);

    // ── MIJOZ BALANSI (eski qarzlar bilan) ────────────────
    if (sale.balance_after != null && (parseFloat(sale.balance_before) !== 0 || parseFloat(sale.balance_after) !== 0)) {
      const bal = n => (parseFloat(n) > 0 ? '+' : '') + formatMoney(n);
      y += 16;
      doc.font('Arial').fontSize(8.5).fillColor('#555')
        .text(`Savdodan oldingi balans: ${bal(sale.balance_before)}`, M, y);
      y += 13;
      doc.font('Arial-Bold').fontSize(8.5)
        .fillColor(parseFloat(sale.balance_after) < 0 ? '#c0392b' : '#1a5fb4')
        .text(`Savdodan keyingi balans: ${bal(sale.balance_after)}`, M, y);
    }

    // ── IMZOLAR ───────────────────────────────────────────
    y += 38;
    doc.fontSize(8.5).fillColor('#111');
    const sigSeller = sale.created_by_name ? `Sotuvchi (${sale.created_by_name}): ____________` : 'Sotuvchi: ____________________';
    doc.text(sigSeller, M, y);
    doc.text("Xaridor: ____________________", M + 285, y);

    // ── FOOTER ────────────────────────────────────────────
    doc.fontSize(6.5).fillColor('#bbb')
      .text(
        'Hujjat Texno Plast tizimi orqali avtomatik generatsiya qilindi. Haqiqiyligini QR kod orqali tekshiring.',
        M, 815, { width: W, align: 'center' }
      );

    doc.end();
  });
}

// Bitta mijozning to'liq tarixi — xaridlar + to'lovlar (Excel)
async function generateCustomerExcel(data) {
  const { customer, stats, sales = [], payments = [] } = data;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TEKNOPLAST';

  const BLUE = 'FF1E40AF';
  const money = '#,##0';
  const statusLabel = (s) => s === 'PAID' ? "To'langan" : s === 'PENDING' ? 'Kutilmoqda' : 'Qisman';
  const methodLabel = (m) => ({ CASH: 'Naqd', CARD: 'Karta', TRANSFER: 'Bank', OTHER: 'Boshqa' }[m] || m || '');

  // ---- 1-varaq: Xaridlar ----
  const s1 = workbook.addWorksheet('Xaridlar');
  s1.mergeCells('A1:H1');
  const h1 = s1.getCell('A1');
  h1.value = `TEKNOPLAST — Mijoz hisoboti: ${customer.name}`;
  h1.font = { bold: true, size: 15, color: { argb: BLUE } };
  h1.alignment = { horizontal: 'center', vertical: 'middle' };
  s1.getRow(1).height = 24;

  s1.mergeCells('A2:H2');
  const h2 = s1.getCell('A2');
  const debt = parseFloat(stats?.total_debt || 0);
  h2.value = `Tel: ${customer.phone || '—'}   |   Xaridlar: ${stats?.purchase_count || 0} ta   |   Jami: ${Math.round(parseFloat(stats?.total_purchases || 0)).toLocaleString('ru-RU')} so'm   |   ` +
    (debt > 0 ? `Qarz: ${Math.round(debt).toLocaleString('ru-RU')} so'm` : debt < 0 ? `Haqdor: +${Math.round(Math.abs(debt)).toLocaleString('ru-RU')} so'm` : 'Qarz yo\'q');
  h2.font = { size: 10, color: { argb: 'FF374151' } };
  h2.alignment = { horizontal: 'center' };

  s1.mergeCells('A3:H3');
  const h3 = s1.getCell('A3');
  h3.value = `Tuzildi: ${new Date().toLocaleString('uz-UZ')}`;
  h3.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
  h3.alignment = { horizontal: 'center' };

  const cols1 = ['№', 'Sana', 'Mahsulot', 'Miqdor', 'Birlik narx', 'Jami', "To'langan", 'Qarz', 'Status'];
  const widths1 = [5, 13, 28, 10, 14, 16, 16, 16, 13];
  const hr1 = s1.getRow(4);
  cols1.forEach((c, i) => {
    const cell = hr1.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  widths1.forEach((w, i) => { s1.getColumn(i + 1).width = w; });

  let r = 4;
  sales.forEach((s, i) => {
    r++;
    const total = parseFloat(s.total_amount) || 0;
    const paid = parseFloat(s.payment_amount) || 0;
    const row = s1.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = s.sale_date ? new Date(s.sale_date).toLocaleDateString('uz-UZ') : '';
    row.getCell(3).value = s.product_name || '';
    row.getCell(4).value = `${s.quantity || 0} ${s.unit || ''}`.trim();
    row.getCell(5).value = parseFloat(s.unit_price) || 0;
    row.getCell(6).value = total;
    row.getCell(7).value = paid;
    row.getCell(8).value = Math.max(0, total - paid);
    row.getCell(9).value = statusLabel(s.status);
    [5, 6, 7, 8].forEach(c => { row.getCell(c).numFmt = money; });
  });

  r++;
  const tot1 = s1.getRow(r);
  tot1.getCell(2).value = 'JAMI:';
  tot1.getCell(6).value = sales.reduce((a, s) => a + (parseFloat(s.total_amount) || 0), 0);
  tot1.getCell(7).value = sales.reduce((a, s) => a + (parseFloat(s.payment_amount) || 0), 0);
  tot1.getCell(8).value = sales.reduce((a, s) => a + Math.max(0, (parseFloat(s.total_amount) || 0) - (parseFloat(s.payment_amount) || 0)), 0);
  [6, 7, 8].forEach(c => { tot1.getCell(c).numFmt = money; });
  tot1.font = { bold: true };

  // ---- 2-varaq: To'lovlar ----
  const s2 = workbook.addWorksheet("To'lovlar");
  const cols2 = ['№', 'Sana', 'Summa', 'Usul', 'Mahsulot', 'Izoh'];
  const widths2 = [5, 14, 16, 12, 28, 30];
  const hr2 = s2.getRow(1);
  cols2.forEach((c, i) => {
    const cell = hr2.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  widths2.forEach((w, i) => { s2.getColumn(i + 1).width = w; });

  let r2 = 1;
  payments.forEach((p, i) => {
    r2++;
    const row = s2.getRow(r2);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = p.payment_date ? new Date(p.payment_date).toLocaleDateString('uz-UZ') : '';
    row.getCell(3).value = parseFloat(p.amount) || 0;
    row.getCell(3).numFmt = money;
    row.getCell(4).value = methodLabel(p.method);
    row.getCell(5).value = p.product_name || '';
    row.getCell(6).value = p.notes || '';
  });
  if (!payments.length) {
    s2.getRow(2).getCell(1).value = "To'lov tarixi yo'q";
  } else {
    r2++;
    const tot2 = s2.getRow(r2);
    tot2.getCell(2).value = 'JAMI:';
    tot2.getCell(3).value = payments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    tot2.getCell(3).numFmt = money;
    tot2.font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// ─── Kirimlar (intake) — Excel va PDF hisobot ────────────────────────────────
const INTAKE_STATUS_UZ = { PENDING: 'Kutilmoqda', APPROVED: 'Tasdiqlangan', REJECTED: 'Rad etilgan' };
const rangUz = (r) => (r && String(r).trim()) ? r : 'Rangsiz';
const periodLabel = (f) => {
  if (f.start_date && f.end_date) return `${f.start_date} — ${f.end_date}`;
  if (f.start_date) return `${f.start_date} dan`;
  if (f.end_date) return `${f.end_date} gacha`;
  return 'Barcha davr';
};

async function generateIntakesExcel(rows, filters = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kirimlar');

  sheet.columns = [
    { header: '№', key: 'num', width: 5 },
    { header: 'Sana', key: 'date', width: 14 },
    { header: 'Holat', key: 'status', width: 16 },
    { header: 'Mahsulot', key: 'product', width: 34 },
    { header: 'Rang', key: 'rang', width: 14 },
    { header: 'Miqdor', key: 'qty', width: 12 },
    { header: 'Kiritdi', key: 'created_by', width: 20 },
    { header: 'Tasdiqladi', key: 'approved_by', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };

  rows.forEach((r, i) => {
    sheet.addRow({
      num: i + 1,
      date: r.created_at ? new Date(r.created_at).toLocaleDateString('uz-UZ') : '',
      status: INTAKE_STATUS_UZ[r.status] || r.status,
      product: r.product_name || '—',
      rang: rangUz(r.rang),
      qty: parseFloat(r.quantity || 0),
      created_by: r.created_by_name || '—',
      approved_by: r.approved_by_name || '—',
    });
  });

  const totalRow = sheet.addRow({
    product: 'JAMI:',
    qty: rows.reduce((a, r) => a + parseFloat(r.quantity || 0), 0),
  });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

async function generateIntakesPDF(rows, filters = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    registerCyrillicFonts(doc);
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Arial-Bold').text('TEKNOPLAST', { align: 'center' });
    doc.fontSize(12).font('Arial').text('Kirimlar hisoboti', { align: 'center' });
    doc.fontSize(9).fillColor('#666').text(`Davr: ${periodLabel(filters)}   ·   Yaratildi: ${new Date().toLocaleDateString('uz-UZ')}`, { align: 'center' });
    doc.fillColor('black').moveDown(0.8);

    // Ustun x-koordinatalari (A4, margin 40 → 40..555)
    const col = { num: 40, date: 70, product: 140, rang: 330, qty: 405, status: 470 };
    const right = 555;

    const drawHeader = (y) => {
      doc.font('Arial-Bold').fontSize(9).fillColor('black');
      doc.text('№', col.num, y);
      doc.text('Sana', col.date, y);
      doc.text('Mahsulot', col.product, y);
      doc.text('Rang', col.rang, y);
      doc.text('Miqdor', col.qty, y);
      doc.text('Holat', col.status, y);
      doc.moveTo(40, y + 13).lineTo(right, y + 13).strokeColor('#999').stroke();
      return y + 18;
    };

    let y = drawHeader(doc.y);
    doc.font('Arial').fontSize(8.5);
    let totalQty = 0;

    rows.forEach((r, i) => {
      if (y > 780) { doc.addPage(); y = drawHeader(40); doc.font('Arial').fontSize(8.5); }
      const qty = parseFloat(r.quantity || 0);
      totalQty += qty;
      doc.fillColor('black');
      doc.text(String(i + 1), col.num, y, { width: 25 });
      doc.text(r.created_at ? new Date(r.created_at).toLocaleDateString('uz-UZ') : '', col.date, y, { width: 65 });
      doc.text(r.product_name || '—', col.product, y, { width: 185 });
      doc.text(rangUz(r.rang), col.rang, y, { width: 70 });
      doc.text(`${qty}`, col.qty, y, { width: 55 });
      doc.text(INTAKE_STATUS_UZ[r.status] || r.status, col.status, y, { width: 85 });
      const h = Math.max(
        doc.heightOfString(r.product_name || '—', { width: 185 }),
        12
      );
      y += h + 4;
    });

    doc.moveTo(40, y).lineTo(right, y).strokeColor('#999').stroke();
    y += 6;
    doc.font('Arial-Bold').fontSize(10).fillColor('black');
    doc.text(`JAMI: ${rows.length} ta yozuv · ${totalQty} dona`, 40, y, { width: right - 40, align: 'right' });

    doc.end();
  });
}

// ── Umumiy ombor (inventar) ro'yxati — Excel ──
// columns: [{ header, key, w, money?, total?, align? }], rows: [{ key: value }]
async function generateInventoryExcel({ title, columns, rows, headerColor = 'FF1E40AF' }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teknoplast';
  const safeName = String(title || 'Ombor').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
  const sheet = workbook.addWorksheet(safeName);

  sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.w || 14 }));
  _applyHeaderStyle(sheet.getRow(1), headerColor);
  columns.forEach(c => { if (c.money) sheet.getColumn(c.key).numFmt = '#,##0'; });

  rows.forEach(r => sheet.addRow(r));

  const totalCols = columns.filter(c => c.total);
  if (totalCols.length && rows.length) {
    const labelKey = (columns[1] || columns[0]).key;
    const totalObj = { [labelKey]: 'JAMI:' };
    totalCols.forEach(c => { totalObj[c.key] = rows.reduce((a, r) => a + (parseFloat(r[c.key]) || 0), 0); });
    sheet.addRow(totalObj).font = { bold: true };
  }

  return workbook.xlsx.writeBuffer();
}

// ── Umumiy ombor (inventar) ro'yxati — PDF jadval ──
async function generateInventoryPDF({ title, columns, rows, subtitle }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    registerCyrillicFonts(doc);
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Arial-Bold').text('TEKNOPLAST', { align: 'center' });
    doc.fontSize(12).font('Arial').text(title || 'Ombor hisoboti', { align: 'center' });
    doc.fontSize(9).fillColor('#666').text(
      `${subtitle ? subtitle + '   ·   ' : ''}Yaratildi: ${new Date().toLocaleDateString('uz-UZ')}`,
      { align: 'center' }
    );
    doc.fillColor('black').moveDown(0.8);

    const left = 40, right = 555;
    const totalW = columns.reduce((a, c) => a + (c.w || 14), 0);
    const scale = (right - left) / totalW;
    let x = left;
    const cols = columns.map(c => { const o = { ...c, x, width: (c.w || 14) * scale }; x += (c.w || 14) * scale; return o; });

    const drawHeader = (y) => {
      doc.font('Arial-Bold').fontSize(9).fillColor('black');
      cols.forEach(c => doc.text(c.header, c.x, y, { width: c.width, align: c.align || 'left' }));
      doc.moveTo(left, y + 13).lineTo(right, y + 13).strokeColor('#999').stroke();
      return y + 18;
    };

    let y = drawHeader(doc.y);
    doc.font('Arial').fontSize(8.5);

    if (!rows.length) {
      doc.fillColor('#888').text("Ma'lumot yo'q", left, y + 6);
      doc.end();
      return;
    }

    const totals = {};
    cols.filter(c => c.total).forEach(c => { totals[c.key] = 0; });

    rows.forEach((r) => {
      if (y > 780) { doc.addPage(); y = drawHeader(40); doc.font('Arial').fontSize(8.5); }
      doc.fillColor('black');
      cols.forEach(c => {
        const raw = r[c.key];
        const val = c.money ? formatMoney(raw) : (raw == null ? '' : String(raw));
        doc.text(val, c.x, y, { width: c.width, align: c.align || 'left' });
        if (c.total) totals[c.key] += parseFloat(raw) || 0;
      });
      const h = Math.max(...cols.map(c => doc.heightOfString(String(r[c.key] ?? ''), { width: c.width })), 12);
      y += h + 4;
    });

    doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').stroke();
    y += 6;
    doc.font('Arial-Bold').fontSize(9).fillColor('black');
    if (cols[1]) doc.text('JAMI:', cols[1].x, y, { width: cols[1].width });
    cols.filter(c => c.total).forEach(c => {
      doc.text(c.money ? formatMoney(totals[c.key]) : String(totals[c.key]), c.x, y, { width: c.width, align: c.align || 'left' });
    });

    doc.end();
  });
}

// ── Tovar aylanmasi (ombor) — davr bo'yicha qoldiq + kirim + chiqim ──
async function generateTurnoverExcel({ rows, start_date, end_date, warehouse }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Teknoplast';
  const sheet = wb.addWorksheet('Tovar aylanmasi');

  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'TOVAR AYLANMASI';
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  sheet.getCell('A1').font = { bold: true, size: 13 };
  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = `Davr: ${start_date || '...'} — ${end_date || '...'}`;
  sheet.getCell('A2').alignment = { horizontal: 'center' };
  sheet.mergeCells('A3:L3');
  sheet.getCell('A3').value = `OMBOR: ${warehouse || 'Bosh ombor'} (so'm)`;
  sheet.getCell('A3').alignment = { horizontal: 'center' };
  sheet.getCell('A3').font = { bold: true };

  const h1 = 5, h2 = 6;
  [{ c: 1, w: 5, t: '№' }, { c: 2, w: 32, t: 'Mahsulot nomi' }, { c: 3, w: 13, t: 'Kirim narxi' }, { c: 4, w: 13, t: 'Sotuv narxi' }].forEach(s => {
    sheet.mergeCells(h1, s.c, h2, s.c);
    sheet.getCell(h1, s.c).value = s.t;
    sheet.getColumn(s.c).width = s.w;
  });
  [{ s: 5, t: 'Davr boshidagi qoldiq' }, { s: 7, t: 'KIRIM' }, { s: 9, t: 'CHIQIM' }, { s: 11, t: 'Davr oxiridagi qoldiq' }].forEach(g => {
    sheet.mergeCells(h1, g.s, h1, g.s + 1);
    sheet.getCell(h1, g.s).value = g.t;
    sheet.getCell(h2, g.s).value = 'Soni';
    sheet.getCell(h2, g.s + 1).value = 'Summa';
    sheet.getColumn(g.s).width = 11;
    sheet.getColumn(g.s + 1).width = 18;
  });
  [h1, h2].forEach(r => {
    const row = sheet.getRow(r);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = 1; c <= 12; c++) sheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  });

  let r = h2 + 1;
  rows.forEach((d, i) => {
    const cells = [i + 1, d.product, Math.round(d.kirim_narxi), Math.round(d.sotuv_narxi),
      d.open_qty, Math.round(d.open_sum), d.kirim_qty, Math.round(d.kirim_sum),
      d.chiqim_qty, Math.round(d.chiqim_sum), d.close_qty, Math.round(d.close_sum)];
    cells.forEach((v, idx) => { sheet.getCell(r, idx + 1).value = v; });
    r++;
  });
  const sum = k => Math.round(rows.reduce((a, x) => a + (parseFloat(x[k]) || 0), 0));
  const tot = [null, 'JAMI', null, null, sum('open_qty'), sum('open_sum'), sum('kirim_qty'), sum('kirim_sum'), sum('chiqim_qty'), sum('chiqim_sum'), sum('close_qty'), sum('close_sum')];
  tot.forEach((v, idx) => { if (v != null) sheet.getCell(r, idx + 1).value = v; });
  sheet.getRow(r).font = { bold: true };
  [3, 4, 6, 8, 10, 12].forEach(c => { sheet.getColumn(c).numFmt = '#,##0'; });

  return wb.xlsx.writeBuffer();
}

async function generateTurnoverPDF({ rows, start_date, end_date, warehouse }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 28, size: 'A4', layout: 'landscape' });
    registerCyrillicFonts(doc);
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M = 28, W = 842 - M * 2;
    const money = n => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

    doc.fontSize(14).font('Arial-Bold').fillColor('#111').text('TOVAR AYLANMASI', M, M, { width: W, align: 'center' });
    doc.fontSize(9).font('Arial').fillColor('#555').text(`Davr: ${start_date || '...'} — ${end_date || '...'}`, M, doc.y + 2, { width: W, align: 'center' });
    doc.fontSize(10).font('Arial-Bold').fillColor('#111').text(`OMBOR: ${warehouse || 'Bosh ombor'} (so'm)`, M, doc.y + 2, { width: W, align: 'center' });
    let y = doc.y + 8;

    const cols = [
      { key: 'n', t: '№', w: 22, a: 'center' },
      { key: 'product', t: 'Mahsulot nomi', w: 148, a: 'left' },
      { key: 'kirim_narxi', t: 'Kirim narxi', w: 58, a: 'right' },
      { key: 'sotuv_narxi', t: 'Sotuv narxi', w: 58, a: 'right' },
      { key: 'open_qty', t: 'Soni', w: 48, a: 'right' },
      { key: 'open_sum', t: 'Summa', w: 80, a: 'right' },
      { key: 'kirim_qty', t: 'Soni', w: 42, a: 'right' },
      { key: 'kirim_sum', t: 'Summa', w: 70, a: 'right' },
      { key: 'chiqim_qty', t: 'Soni', w: 48, a: 'right' },
      { key: 'chiqim_sum', t: 'Summa', w: 74, a: 'right' },
      { key: 'close_qty', t: 'Soni', w: 48, a: 'right' },
      { key: 'close_sum', t: 'Summa', w: 80, a: 'right' },
    ];
    let x0 = M;
    cols.forEach(c => { c.x = x0; x0 += c.w; });
    const col = k => cols.find(c => c.key === k);

    const drawHeader = (yy) => {
      doc.font('Arial-Bold').fontSize(7.5).fillColor('#111');
      [{ g: 'Davr boshidagi qoldiq', a: 'open_qty', b: 'open_sum' }, { g: 'KIRIM', a: 'kirim_qty', b: 'kirim_sum' },
       { g: 'CHIQIM', a: 'chiqim_qty', b: 'chiqim_sum' }, { g: 'Davr oxiridagi qoldiq', a: 'close_qty', b: 'close_sum' }].forEach(gr => {
        const a = col(gr.a), b = col(gr.b);
        doc.text(gr.g, a.x, yy, { width: (b.x + b.w) - a.x, align: 'center' });
      });
      const yy2 = yy + 11;
      cols.forEach(c => doc.text(c.t, c.x + 2, yy2, { width: c.w - 4, align: c.a }));
      const ly = yy2 + 11;
      doc.moveTo(M, ly).lineTo(M + W, ly).lineWidth(0.5).strokeColor('#333').stroke();
      return ly + 3;
    };

    y = drawHeader(y);
    doc.font('Arial').fontSize(7);
    rows.forEach((d, i) => {
      if (y > 545) { doc.addPage(); y = 30; y = drawHeader(y); doc.font('Arial').fontSize(7); }
      const vals = {
        n: i + 1, product: d.product, kirim_narxi: money(d.kirim_narxi), sotuv_narxi: money(d.sotuv_narxi),
        open_qty: money(d.open_qty), open_sum: money(d.open_sum), kirim_qty: money(d.kirim_qty), kirim_sum: money(d.kirim_sum),
        chiqim_qty: money(d.chiqim_qty), chiqim_sum: money(d.chiqim_sum), close_qty: money(d.close_qty), close_sum: money(d.close_sum),
      };
      doc.fillColor('#111');
      cols.forEach(c => doc.text(String(vals[c.key]), c.x + 2, y, { width: c.w - 4, align: c.a }));
      const h = Math.max(doc.heightOfString(String(d.product), { width: col('product').w - 4 }), 10);
      doc.moveTo(M, y + h + 2).lineTo(M + W, y + h + 2).lineWidth(0.2).strokeColor('#ddd').stroke();
      y += h + 4;
    });

    const tot = k => money(rows.reduce((a, x) => a + (parseFloat(x[k]) || 0), 0));
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor('#333').stroke(); y += 3;
    doc.font('Arial-Bold').fontSize(7.5).fillColor('#111');
    doc.text('JAMI', col('product').x + 2, y, { width: col('product').w - 4 });
    ['open_qty', 'open_sum', 'kirim_qty', 'kirim_sum', 'chiqim_qty', 'chiqim_sum', 'close_qty', 'close_sum'].forEach(k => {
      const c = col(k);
      doc.text(tot(k), c.x + 2, y, { width: c.w - 4, align: 'right' });
    });

    doc.end();
  });
}

module.exports = { generateMonthlyPDF, generateSalesExcel, generateSalaryExcel, generateProductionRangeExcel, generateRawMaterialRangeExcel, generateWaybillPDF, generateInvoicePDF, generateCustomerExcel, generateIntakesExcel, generateIntakesPDF, generateInventoryExcel, generateInventoryPDF, generateTurnoverExcel, generateTurnoverPDF };
