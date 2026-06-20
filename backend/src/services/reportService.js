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

async function generateSalesExcel(salesData, period) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Teknoplast';
  const sheet = workbook.addWorksheet(`Sotuv ${period}`);

  sheet.columns = [
    { header: '№', key: 'num', width: 5 },
    { header: 'Sana', key: 'sale_date', width: 12 },
    { header: 'Mahsulot', key: 'product_name', width: 25 },
    { header: 'Miqdor', key: 'quantity', width: 10 },
    { header: 'Birlik narx', key: 'unit_price', width: 15 },
    { header: 'Jami', key: 'total_amount', width: 18 },
    { header: 'Mijoz', key: 'customer_name', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Kim kiritdi', key: 'created_by_name', width: 20 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  salesData.forEach((s, i) => {
    sheet.addRow({
      num: i + 1,
      sale_date: new Date(s.sale_date).toLocaleDateString('uz-UZ'),
      product_name: s.product_name,
      quantity: s.quantity,
      unit_price: parseFloat(s.unit_price),
      total_amount: parseFloat(s.total_amount),
      customer_name: s.customer_name || '-',
      status: s.status === 'PAID' ? 'To\'langan' : s.status === 'PENDING' ? 'Kutilmoqda' : 'Qisman',
      created_by_name: s.created_by_name,
    });
  });

  const totalRow = sheet.addRow({
    num: '',
    sale_date: 'JAMI:',
    quantity: salesData.reduce((a, s) => a + s.quantity, 0),
    total_amount: salesData.reduce((a, s) => a + parseFloat(s.total_amount), 0),
  });
  totalRow.font = { bold: true };

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
  if (cashMatch) parts.push(`Naqd: ${formatMoney(parseAmt(cashMatch))}`);
  if (cardMatch) parts.push(`Karta: ${formatMoney(parseAmt(cardMatch))}`);
  if (bankMatch) parts.push(`Bank: ${formatMoney(parseAmt(bankMatch))}`);
  if (parts.length) {
    const debt = Math.max(0, total - paid);
    if (debt > 0) parts.push(`Qarz: ${formatMoney(debt)}`);
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

    doc.font('Arial').fontSize(8.5).fillColor('#333')
      .text(`To'lov holati: ${getInvoicePaymentLabel(sale)}`, M, y);

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

module.exports = { generateMonthlyPDF, generateSalesExcel, generateSalaryExcel, generateProductionRangeExcel, generateRawMaterialRangeExcel, generateWaybillPDF, generateInvoicePDF };
