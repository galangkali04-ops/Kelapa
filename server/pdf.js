'use strict';
// Membuat file PDF laporan (keseluruhan dan per mart) memakai pdfkit.
// Hanya memakai font bawaan PDF (Helvetica), jadi simbol khusus dihindari.
const PDFDocument = require('pdfkit');

const COLOR = { ink: '#1b2b27', soft: '#5d6b66', line: '#d5dcd9', head: '#12352f', headText: '#ffffff', zebra: '#f4f7f6', bad: '#b3261e', accent: '#1f6f5c' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const num = (v) => Number(v) || 0;
const group = (n) => String(Math.abs(Math.round(num(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const int = (n) => `${num(n) < 0 ? '-' : ''}${group(n)}`;
const rp = (n) => `${num(n) < 0 && Math.round(num(n)) !== 0 ? '-' : ''}Rp${group(n)}`;
const pct = (n) => `${num(n).toFixed(1).replace('.', ',')}%`;
const date = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const periodText = (r) => {
  if (!r.from && !r.to) return 'Semua waktu';
  if (r.from && r.to) return r.from === r.to ? date(r.from) : `${date(r.from)} - ${date(r.to)}`;
  return r.from ? `Mulai ${date(r.from)}` : `Sampai ${date(r.to)}`;
};

function slug(s) {
  return String(s || 'laporan').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'laporan';
}

function create(title, subtitle) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 48, left: 36, right: 36 }, bufferPages: true, info: { Title: title, Author: 'Kelola Air Kelapa' } });
  doc.x = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(17).fillColor(COLOR.head).text(title);
  if (subtitle) doc.moveDown(0.15).font('Helvetica').fontSize(9.5).fillColor(COLOR.soft).text(subtitle);
  doc.moveDown(0.8);
  return doc;
}

const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottomLimit = (doc) => doc.page.height - doc.page.margins.bottom;

function ensure(doc, h) {
  if (doc.y + h > bottomLimit(doc)) doc.addPage();
}

function heading(doc, text) {
  ensure(doc, 60);
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11.5).fillColor(COLOR.head).text(text, doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
}

function note(doc, text) {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.soft).text(text, doc.page.margins.left, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.3);
}

// Baris label - nilai (untuk ringkasan).
function ledger(doc, rows) {
  const left = doc.page.margins.left; const w = contentWidth(doc);
  for (const r of rows) {
    ensure(doc, 18);
    const y = doc.y;
    doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(r.bold ? 10.5 : 9.5).fillColor(r.bad ? COLOR.bad : COLOR.ink);
    doc.text(r.label, left, y, { width: w * 0.62, lineBreak: true });
    const after = doc.y;
    doc.text(r.value, left + w * 0.62, y, { width: w * 0.38, align: 'right' });
    doc.y = Math.max(after, doc.y) + 3;
    doc.moveTo(left, doc.y - 1).lineTo(left + w, doc.y - 1).strokeColor(COLOR.line).lineWidth(0.4).stroke();
    doc.y += 2;
  }
}

// Kotak angka ringkas, 4 per baris.
function stats(doc, items) {
  const left = doc.page.margins.left; const w = contentWidth(doc); const gap = 8; const perRow = 4;
  const bw = (w - gap * (perRow - 1)) / perRow; const bh = 42;
  for (let i = 0; i < items.length; i += perRow) {
    ensure(doc, bh + 6);
    const y = doc.y;
    items.slice(i, i + perRow).forEach((it, j) => {
      const x = left + j * (bw + gap);
      doc.roundedRect(x, y, bw, bh, 4).fillAndStroke(COLOR.zebra, COLOR.line);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(it.bad ? COLOR.bad : COLOR.head).text(it.value, x + 6, y + 8, { width: bw - 12, lineBreak: false, ellipsis: true });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.soft).text(it.label, x + 6, y + 25, { width: bw - 12, height: 14 });
    });
    doc.y = y + bh + 6;
  }
}

// Tabel dengan header yang diulang di tiap halaman. col: { label, get(row), w (bobot lebar), align }
function table(doc, cols, rows, empty = 'Tidak ada data pada periode ini.') {
  if (!rows.length) { note(doc, empty); return; }
  const left = doc.page.margins.left; const total = cols.reduce((s, c) => s + (c.w || 1), 0);
  const unit = contentWidth(doc) / total; const pad = 4; const size = 7.8;
  const widths = cols.map((c) => (c.w || 1) * unit);
  const measure = (cells, font) => {
    doc.font(font).fontSize(size);
    return Math.max(...cells.map((t, i) => doc.heightOfString(String(t), { width: widths[i] - pad * 2 })));
  };
  const drawHeader = () => {
    const hgt = measure(cols.map((c) => c.label), 'Helvetica-Bold') + pad * 2;
    const y = doc.y; let x = left;
    doc.rect(left, y, contentWidth(doc), hgt).fill(COLOR.head);
    cols.forEach((c, i) => {
      doc.font('Helvetica-Bold').fontSize(size).fillColor(COLOR.headText).text(c.label, x + pad, y + pad, { width: widths[i] - pad * 2, align: c.align || 'left' });
      x += widths[i];
    });
    doc.y = y + hgt;
  };
  ensure(doc, 60);
  drawHeader();
  rows.forEach((r, idx) => {
    const cells = cols.map((c) => c.get(r));
    const hgt = measure(cells, 'Helvetica') + pad * 2;
    if (doc.y + hgt > bottomLimit(doc)) { doc.addPage(); drawHeader(); }
    const y = doc.y; let x = left;
    if (idx % 2 === 1) doc.rect(left, y, contentWidth(doc), hgt).fill(COLOR.zebra);
    cols.forEach((c, i) => {
      doc.font('Helvetica').fontSize(size).fillColor(c.bad && c.bad(r) ? COLOR.bad : COLOR.ink)
        .text(String(cells[i]), x + pad, y + pad, { width: widths[i] - pad * 2, align: c.align || 'left' });
      x += widths[i];
    });
    doc.moveTo(left, y + hgt).lineTo(left + contentWidth(doc), y + hgt).strokeColor(COLOR.line).lineWidth(0.3).stroke();
    doc.y = y + hgt;
  });
  doc.moveDown(0.5);
}

function footers(doc, label) {
  const range = doc.bufferedPageRange();
  const stamp = new Date().toLocaleString('id-ID', { timeZone: process.env.APP_TZ || 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' });
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 34; const left = doc.page.margins.left; const w = contentWidth(doc);
    // Matikan batas bawah sementara supaya teks footer tidak memicu halaman baru.
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.soft);
    doc.text(`${label} - dicetak ${stamp}`, left, y, { width: w * 0.75, align: 'left', lineBreak: false });
    doc.text(`Halaman ${i + 1} dari ${range.count}`, left + w * 0.75, y, { width: w * 0.25, align: 'right', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
}

const KIND = { kirim: 'Pengiriman', jual: 'Penjualan', retur: 'Retur layak', 'retur-rusak': 'Retur rusak', expired: 'Expired' };

/* ---------- Laporan keseluruhan ---------- */
function overallReport(rep, businessName) {
  const t = rep.totals;
  const doc = create(`Laporan ${businessName}`, `Periode: ${periodText(rep.range)}`);

  heading(doc, 'Laporan laba');
  ledger(doc, [
    { label: 'Revenue (penjualan)', value: rp(t.revenue) },
    { label: 'HPP botol terjual', value: `- ${rp(t.cogs)}` },
    { label: `Gross profit (margin ${pct(t.grossMargin)})`, value: rp(t.grossProfit), bold: true },
    { label: `Botol expired (${int(t.expired)} botol)`, value: `- ${rp(t.expiredLoss)}` },
    { label: `Botol kembali tidak layak (${int(t.returnedBad)} botol)`, value: `- ${rp(t.returnLoss)}` },
    { label: 'Bahan terbuang (busuk, pecah, dll)', value: `- ${rp(t.stockoutLoss)}` },
    { label: 'Biaya pengeluaran', value: `- ${rp(t.expenses)}` },
    { label: `Profit setelah semua biaya (margin bersih ${pct(t.netMargin)})`, value: rp(t.netProfit), bold: true, bad: t.netProfit < 0 },
  ]);
  note(doc, `Modal produksi periode ini ${rp(t.totalModal)}. Revenue dihitung dari botol yang sudah terjual, bukan dari yang dikirim.`);

  heading(doc, 'Ringkasan botol dan uang');
  stats(doc, [
    { value: int(t.produced), label: 'Botol diproduksi' },
    { value: rp(t.avgHpp), label: 'HPP rata-rata per botol' },
    { value: int(t.sold), label: 'Botol terjual' },
    { value: int(t.expired), label: 'Botol expired', bad: t.expired > 0 },
    { value: int(rep.stock.warehouse), label: 'Stok di gudang (saat ini)' },
    { value: int(rep.stock.atPartners), label: 'Stok di mart (saat ini)' },
    { value: rp(t.expenses), label: 'Total pengeluaran' },
    { value: rp(t.unpaid), label: 'Belum dibayar mart', bad: t.unpaid > 0 },
  ]);

  if (rep.alerts.length) {
    heading(doc, 'Botol hampir atau sudah expired');
    table(doc, [
      { label: 'Batch', get: (a) => a.code, w: 1.4 },
      { label: 'Expired', get: (a) => date(a.expiryDate), w: 1.2 },
      { label: 'Sisa waktu', get: (a) => (a.daysLeft < 0 ? `lewat ${-a.daysLeft} hari` : a.daysLeft === 0 ? 'hari ini' : `${a.daysLeft} hari lagi`), w: 1.2, bad: (a) => a.daysLeft <= 0 },
      { label: 'Lokasi stok', get: (a) => [a.stockWarehouse > 0 ? `${int(a.stockWarehouse)} di gudang` : '', ...a.partners.map((p) => `${int(p.remaining)} di ${p.name}`)].filter(Boolean).join(', '), w: 3.4 },
    ], rep.alerts);
  }

  heading(doc, 'Per mart');
  table(doc, [
    { label: 'Mart', get: (r) => r.name, w: 2 },
    { label: 'Dikirim', get: (r) => int(r.delivered), align: 'right', w: 0.9 },
    { label: 'Terjual', get: (r) => int(r.sold), align: 'right', w: 0.9 },
    { label: 'Kembali', get: (r) => int(r.returned), align: 'right', w: 0.9 },
    { label: 'Expired', get: (r) => int(r.expired), align: 'right', w: 0.9 },
    { label: 'Sisa', get: (r) => int(r.remaining), align: 'right', w: 0.8 },
    { label: 'Revenue', get: (r) => rp(r.revenue), align: 'right', w: 1.6 },
    { label: 'Gross profit', get: (r) => rp(r.grossProfit), align: 'right', w: 1.6 },
    { label: 'Belum dibayar', get: (r) => rp(r.unpaid), align: 'right', w: 1.6, bad: (r) => r.unpaid > 0 },
  ], rep.perPartner, 'Belum ada aktivitas mart pada periode ini.');

  heading(doc, 'Per batch');
  table(doc, [
    { label: 'Batch', get: (r) => r.code, w: 1.8 },
    { label: 'Botol jadi', get: (r) => int(r.goodBottles), align: 'right', w: 0.9 },
    { label: 'Modal', get: (r) => rp(r.totalCost), align: 'right', w: 1.5 },
    { label: 'HPP/botol', get: (r) => rp(r.hpp), align: 'right', w: 1.2 },
    { label: 'Terjual', get: (r) => int(r.sold), align: 'right', w: 0.9 },
    { label: 'Expired', get: (r) => int(r.expired), align: 'right', w: 0.9 },
    { label: 'Sisa stok', get: (r) => int(r.stockTotal), align: 'right', w: 0.9 },
    { label: 'Revenue', get: (r) => rp(r.revenue), align: 'right', w: 1.5 },
    { label: 'Gross profit', get: (r) => rp(r.grossProfit), align: 'right', w: 1.5 },
  ], rep.perBatch, 'Belum ada batch pada periode ini.');

  heading(doc, 'Pengeluaran per kategori');
  table(doc, [
    { label: 'Kategori', get: (r) => r.category, w: 3 },
    { label: 'Jumlah catatan', get: (r) => int(r.count), align: 'right', w: 1.2 },
    { label: 'Total', get: (r) => rp(r.total), align: 'right', w: 1.6 },
    { label: 'Porsi', get: (r) => pct(r.share), align: 'right', w: 1 },
  ], rep.perCategory, 'Belum ada pengeluaran pada periode ini.');

  heading(doc, 'Penjualan per hari (maksimal 14 hari terakhir)');
  table(doc, [
    { label: 'Tanggal', get: (r) => date(r.date), w: 2 },
    { label: 'Revenue', get: (r) => rp(r.revenue), align: 'right', w: 1.6 },
    { label: 'Gross profit', get: (r) => rp(r.profit), align: 'right', w: 1.6 },
  ], rep.trend, 'Belum ada penjualan pada periode ini.');

  footers(doc, `Laporan ${businessName}`);
  return doc;
}

/* ---------- Laporan satu mart ---------- */
function martReport(rep, businessName) {
  const t = rep.totals; const p = rep.partner;
  const info = [p.type, p.scheme === 'putus' ? 'Putus' : p.scheme === 'titip' ? 'Titip' : '', p.address, p.contact].filter(Boolean).join(' | ');
  const doc = create(`Laporan ${p.name}`, [`${businessName}`, `Periode: ${periodText(rep.range)}`, info].filter(Boolean).join('\n'));

  heading(doc, 'Ringkasan');
  ledger(doc, [
    { label: 'Revenue (penjualan)', value: rp(t.revenue) },
    { label: 'HPP botol terjual', value: `- ${rp(t.cogs)}` },
    { label: 'Gross profit', value: rp(t.grossProfit), bold: true },
    { label: `Botol expired (${int(t.expired)} botol)`, value: `- ${rp(t.expiredLoss)}` },
    { label: `Botol kembali tidak layak (${int(t.returnedBad)} botol)`, value: `- ${rp(t.returnLoss)}` },
    { label: 'Hasil dari mart ini setelah kerugian', value: rp(t.netProfit), bold: true, bad: t.netProfit < 0 },
  ]);
  doc.moveDown(0.4);
  stats(doc, [
    { value: int(t.delivered), label: 'Botol dikirim' },
    { value: int(t.sold), label: 'Botol terjual' },
    { value: int(t.returned), label: 'Botol kembali' },
    { value: int(t.expired), label: 'Botol expired', bad: t.expired > 0 },
    { value: int(t.remaining), label: 'Sisa di mart (saat ini)' },
    { value: rp(t.unpaid), label: 'Belum dibayar', bad: t.unpaid > 0 },
  ]);

  heading(doc, 'Batch di mart ini');
  table(doc, [
    { label: 'Batch', get: (r) => r.code, w: 1.8 },
    { label: 'Tgl produksi', get: (r) => date(r.date), w: 1.4 },
    { label: 'Expired', get: (r) => date(r.expiryDate), w: 1.4 },
    { label: 'Dikirim', get: (r) => int(r.delivered), align: 'right', w: 0.9 },
    { label: 'Terjual', get: (r) => int(r.sold), align: 'right', w: 0.9 },
    { label: 'Kembali', get: (r) => int(r.returned), align: 'right', w: 0.9 },
    { label: 'Expired', get: (r) => int(r.expired), align: 'right', w: 0.9 },
    { label: 'Sisa', get: (r) => int(r.remaining), align: 'right', w: 0.8 },
    { label: 'Revenue', get: (r) => rp(r.revenue), align: 'right', w: 1.5 },
  ], rep.perBatch, 'Belum ada batch yang masuk ke mart ini pada periode ini.');

  heading(doc, 'Transaksi');
  table(doc, [
    { label: 'Tanggal', get: (r) => date(r.date), w: 1.3 },
    { label: 'Jenis', get: (r) => KIND[r.kind] || r.kind, w: 1.3 },
    { label: 'Batch', get: (r) => r.batchCode, w: 1.7 },
    { label: 'Jumlah', get: (r) => int(r.qty), align: 'right', w: 0.8 },
    { label: 'Nilai', get: (r) => (r.kind === 'retur' ? '-' : rp(r.amount)), align: 'right', w: 1.5 },
    { label: 'Status', get: (r) => (r.kind === 'jual' ? (r.paid ? 'Lunas' : 'Belum bayar') : ''), w: 1.1, bad: (r) => r.kind === 'jual' && !r.paid },
    { label: 'Catatan', get: (r) => r.note, w: 2 },
  ], rep.transactions, 'Belum ada transaksi pada periode ini.');
  note(doc, 'Nilai pengiriman = jumlah x harga per botol. Nilai retur rusak dan expired = kerugian (jumlah x HPP).');

  footers(doc, `Laporan ${p.name}`);
  return doc;
}

module.exports = { overallReport, martReport, slug };
