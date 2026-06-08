const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function formatMoney(amount) {
  return new Intl.NumberFormat('uz-UZ').format(parseFloat(amount || 0)) + ' so\'m';
}

async function generateMonthlyPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('TEKNOPLAST', { align: 'center' });
    doc.fontSize(14).font('Helvetica').text(`${data.period} - Oylik Hisobot`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Moliyaviy ko'rsatkichlar
    doc.fontSize(12).font('Helvetica-Bold').text('MOLIYAVIY KO\'RSATKICHLAR');
    doc.moveDown(0.5);
    doc.font('Helvetica');

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
    doc.fontSize(12).font('Helvetica-Bold').text('SOTUV');
    doc.font('Helvetica');
    const s = data.sales || {};
    doc.text(`Jami: ${s.count || 0} ta, ${formatMoney(s.total)}`);
    doc.text(`To'langan: ${formatMoney(s.paid)}`);
    doc.moveDown();

    // Xarajatlar
    doc.fontSize(12).font('Helvetica-Bold').text('XARAJATLAR');
    doc.font('Helvetica');
    if (data.expenses?.by_category) {
      data.expenses.by_category.forEach(c => {
        doc.text(`${c.category}: ${formatMoney(c.total)}`);
      });
    }
    doc.moveDown();

    // Ishlab chiqarish
    doc.fontSize(12).font('Helvetica-Bold').text('ISHLAB CHIQARISH');
    doc.font('Helvetica');
    const prod = data.production || {};
    doc.text(`Jami ishlab chiqarildi: ${prod.total_qty || 0} dona`);
    doc.text(`Ishchilar soni: ${prod.workers || 0} nafar`);
    doc.moveDown();

    // Oylik
    doc.fontSize(12).font('Helvetica-Bold').text('OYLIKLAR');
    doc.font('Helvetica');
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

// Nakladnoy (yuk xati) — QR kod bilan
async function generateWaybillPDF(order) {
  const QRCode = require('qrcode');
  const qrDataUrl = await QRCode.toDataURL(order.order_ref, { margin: 1, width: 160 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Sarlavha
    doc.fontSize(20).font('Helvetica-Bold').text('TEKNOPLAST', 50, 50);
    doc.fontSize(13).font('Helvetica').text('NAKLADNOY (Yuk xati)', 50, 75);

    // QR kod o'ng yuqorida
    doc.image(qrBuffer, 420, 45, { width: 110 });
    doc.fontSize(9).font('Helvetica').text(order.order_ref, 420, 158, { width: 110, align: 'center' });

    doc.moveTo(50, 175).lineTo(545, 175).stroke();

    // Buyurtma ma'lumotlari
    let y = 190;
    doc.fontSize(10).font('Helvetica');
    doc.text(`Buyurtma kodi: ${order.order_ref}`, 50, y); y += 16;
    doc.text(`Sana: ${new Date(order.sale_date || Date.now()).toLocaleDateString('uz-UZ')}`, 50, y); y += 16;
    doc.text(`Mijoz: ${order.customer_name || 'Noma\'lum'}`, 50, y); y += 16;
    if (order.customer_phone) { doc.text(`Telefon: ${order.customer_phone}`, 50, y); y += 16; }
    y += 10;

    // Jadval sarlavhasi
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('№', 50, y); doc.text('Mahsulot', 80, y); doc.text('Miqdor', 360, y); doc.text('Summa', 450, y);
    y += 4; doc.moveTo(50, y + 12).lineTo(545, y + 12).stroke(); y += 18;

    doc.font('Helvetica').fontSize(10);
    let total = 0;
    (order.items || []).forEach((it, i) => {
      const name = `${it.product_name || ''}${it.razmer ? ' ' + it.razmer : ''}${it.rang ? ' ' + it.rang : ''}`;
      doc.text(String(i + 1), 50, y);
      doc.text(name.slice(0, 45), 80, y, { width: 270 });
      doc.text(`${it.quantity} ${it.unit || 'dona'}`, 360, y);
      doc.text(formatMoney(it.total_amount), 450, y);
      total += parseFloat(it.total_amount || 0);
      y += 18;
      if (y > 720) { doc.addPage(); y = 50; }
    });

    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke(); y += 14;
    doc.font('Helvetica-Bold').text(`JAMI: ${formatMoney(total)}`, 360, y);

    y += 50;
    doc.font('Helvetica').fontSize(9);
    doc.text('Topshirdi (Omborchi): ____________________', 50, y);
    doc.text('Qabul qildi (Mijoz): ____________________', 320, y);

    doc.end();
  });
}

// Status nomlari (schyot-faktura uchun)
const INVOICE_STATUS_LABELS = {
  PAID: "To'langan",
  PENDING: 'Kutilmoqda',
  PARTIALLY_PAID: "Qisman to'langan",
};

// Schyot-faktura (счет-фактура) — bitta sotuv/buyurtma uchun, QR kod bilan
// QR kod tizimdagi haqiqiy "/invoice/:id" sahifasiga yo'naltiradi (viewUrl orqali beriladi)
async function generateInvoicePDF(sale, items, viewUrl) {
  const QRCode = require('qrcode');
  const qrDataUrl = await QRCode.toDataURL(viewUrl, { margin: 1, width: 160 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const orderRef = sale.order_ref || sale.id;
    const saleDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('uz-UZ');
    const rows = (items && items.length) ? items : [sale];

    // Sarlavha
    doc.fontSize(18).font('Helvetica-Bold').text('TEKNOPLAST', 50, 50);
    doc.fontSize(13).font('Helvetica-Bold').text(`SCHYOT-FAKTURA №  ${orderRef}`, 50, 75);
    doc.fontSize(9).font('Helvetica').text(`Sana: ${saleDate}`, 50, 95);

    // QR kod — o'ng yuqori burchakda — ushbu hujjatni tizimda ko'rish havolasi
    doc.image(qrBuffer, 420, 45, { width: 110 });
    doc.fontSize(7.5).font('Helvetica')
      .text("Hujjatni tizimda ko'rish uchun skanerlang", 420, 158, { width: 110, align: 'center' });

    doc.moveTo(50, 178).lineTo(545, 178).stroke();

    // Sotuvchi / Xaridor
    let y = 193;
    doc.font('Helvetica-Bold').fontSize(10).text('Sotuvchi:', 50, y);
    doc.font('Helvetica').text('TEKNOPLAST MCHJ', 150, y);
    y += 16;
    doc.font('Helvetica-Bold').text('Xaridor:', 50, y);
    doc.font('Helvetica').text(sale.customer_full_name || sale.customer_name || "Noma'lum", 150, y);
    y += 16;
    const phone = sale.customer_full_phone || sale.customer_phone;
    if (phone) {
      doc.font('Helvetica-Bold').text('Telefon:', 50, y);
      doc.font('Helvetica').text(phone, 150, y);
      y += 16;
    }
    if (sale.customer_address) {
      doc.font('Helvetica-Bold').text('Manzil:', 50, y);
      doc.font('Helvetica').text(sale.customer_address, 150, y, { width: 380 });
      y += 16;
    }
    y += 6;
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 16;

    // Jadval sarlavhasi
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('№', 50, y);
    doc.text('Mahsulot nomi', 80, y);
    doc.text('Birlik', 300, y);
    doc.text('Miqdor', 350, y);
    doc.text('Narx', 405, y);
    doc.text('Summa', 475, y);
    y += 4; doc.moveTo(50, y + 12).lineTo(545, y + 12).stroke(); y += 18;

    doc.font('Helvetica').fontSize(9);
    let total = 0;
    rows.forEach((it, i) => {
      doc.text(String(i + 1), 50, y);
      doc.text((it.product_name || '').slice(0, 40), 80, y, { width: 215 });
      doc.text(it.unit || 'dona', 300, y);
      doc.text(String(it.quantity), 350, y);
      doc.text(new Intl.NumberFormat('uz-UZ').format(parseFloat(it.unit_price || 0)), 405, y, { width: 65 });
      doc.text(new Intl.NumberFormat('uz-UZ').format(parseFloat(it.total_amount || 0)), 470, y, { width: 75 });
      total += parseFloat(it.total_amount || 0);
      y += 18;
      if (y > 700) { doc.addPage(); y = 50; }
    });

    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke(); y += 16;
    doc.font('Helvetica-Bold').fontSize(11).text(`JAMI: ${formatMoney(total)}`, 380, y, { width: 165, align: 'right' });

    y += 26;
    doc.font('Helvetica').fontSize(9);
    doc.text(`To'lov holati: ${INVOICE_STATUS_LABELS[sale.status] || sale.status || ''}`, 50, y);

    y += 50;
    doc.font('Helvetica').fontSize(9);
    doc.text('Sotuvchi: ____________________', 50, y);
    doc.text('Xaridor: ____________________', 320, y);

    doc.fontSize(7).fillColor('gray')
      .text('Hujjat Texno Plast tizimi orqali avtomatik generatsiya qilindi. Haqiqiyligini QR kod orqali tekshiring.', 50, 770, { width: 495, align: 'center' });

    doc.end();
  });
}

module.exports = { generateMonthlyPDF, generateSalesExcel, generateSalaryExcel, generateWaybillPDF, generateInvoicePDF };
