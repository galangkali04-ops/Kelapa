// Ringkasan: laporan laba, angka botol, pengeluaran per kategori, per mitra, per batch, grafik.
import { h, rp, int, pct, fmtDate, dataTable, pageHeader, trendChart, setChildren } from '../ui.js';
import { api } from '../api.js';
import { rangeFilters, rangeQuery, pdfButton } from '../range.js';

// Tabel rinci disembunyikan dulu supaya laporan tidak ramai. Klik judulnya untuk membuka.
const fold = (title, ...content) => h('details', { class: 'fold' }, h('summary', {}, title), ...content);

const stat = (value, label, bad) => h('div', { class: `stat${bad ? ' bad' : ''}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
const ledgerRow = (label, value, cls = '') => h('div', { class: `ledger-row ${cls}` }, h('span', {}, label), h('span', {}, value));

export async function renderDashboard(root, page, ctx) {
  const rep = await api(`/report?${rangeQuery()}`);
  const t = rep.totals;
  const again = () => renderDashboard(root, page, ctx).catch(console.error);

  const filters = rangeFilters(again);

  const net = t.netProfit;
  const ledger = h('section', { class: 'ledger', 'aria-label': 'Laporan laba' },
    h('div', { class: 'ledger-rows' },
      ledgerRow('Revenue (penjualan)', rp(t.revenue)),
      ledgerRow('HPP botol terjual', `− ${rp(t.cogs)}`, 'neg'),
      ledgerRow(`Gross profit · margin ${pct(t.grossMargin)}`, rp(t.grossProfit), 'total'),
      ledgerRow(`Botol expired (${int(t.expired)} botol)`, `− ${rp(t.expiredLoss)}`, 'neg'),
      ledgerRow(`Botol kembali tidak layak (${int(t.returnedBad)} botol)`, `− ${rp(t.returnLoss)}`, 'neg'),
      ledgerRow('Bahan terbuang (busuk, pecah, dll)', `− ${rp(t.stockoutLoss)}`, 'neg'),
      ledgerRow('Biaya pengeluaran', `− ${rp(t.expenses)}`, 'neg')),
    h('div', { class: 'ledger-result' },
      h('span', { class: 'label' }, 'Profit setelah semua biaya'),
      h('span', { class: `big${net < 0 ? ' loss' : ''}` }, rp(net)),
      h('span', { class: 'note' }, `Margin bersih ${pct(t.netMargin)}. Modal produksi periode ini ${rp(t.totalModal)}. Revenue dihitung dari botol yang sudah terjual, bukan dari yang dikirim.`)));

  const stats = h('div', { class: 'stats' },
    stat(int(t.produced), 'Botol diproduksi'),
    stat(rp(t.avgHpp), 'HPP rata-rata per botol'),
    stat(int(t.sold), 'Botol terjual'),
    stat(int(t.expired), 'Botol expired', t.expired > 0),
    stat(int(rep.stock.warehouse), 'Stok di gudang (saat ini)'),
    stat(int(rep.stock.atPartners), 'Stok di mart (saat ini)'),
    stat(rp(t.expenses), 'Total pengeluaran', t.expenses > 0),
    stat(rp(t.unpaid), 'Belum dibayar mart', t.unpaid > 0));

  const alerts = rep.alerts.length ? h('section', { class: 'alert' },
    h('h2', {}, 'Botol hampir atau sudah expired'),
    h('ul', {}, rep.alerts.map((a) => {
      const when = a.daysLeft < 0 ? `lewat ${-a.daysLeft} hari` : a.daysLeft === 0 ? 'expired hari ini' : `${a.daysLeft} hari lagi`;
      const where = [a.stockWarehouse > 0 ? `${int(a.stockWarehouse)} di gudang` : '', ...a.partners.map((p) => `${int(p.remaining)} di ${p.name}`)].filter(Boolean).join(', ');
      return h('li', {}, h('b', {}, a.code), ` (${when}, ${fmtDate(a.expiryDate)}): ${where}. Kalau sudah tidak bisa dijual, catat expired di halaman Produksi (gudang) atau Mart (di mart).`);
    }))) : null;

  const categoryCols = [
    { key: 'category', label: 'Kategori' }, { key: 'count', label: 'Jumlah catatan', type: 'int' },
    { key: 'total', label: 'Total', type: 'rp' }, { key: 'share', label: 'Porsi', type: 'pct' },
  ];
  const partnerCols = [
    { key: 'name', label: 'Mart', render: (r) => h('a', { class: 'row-link', href: `#/mart-report?id=${encodeURIComponent(r.id)}`, title: 'Lihat laporan mart ini' }, r.name) }, { key: 'delivered', label: 'Dikirim', type: 'int' }, { key: 'sold', label: 'Terjual', type: 'int' },
    { key: 'returned', label: 'Kembali', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' }, { key: 'remaining', label: 'Sisa di mart', type: 'int' },
    { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' }, { key: 'unpaid', label: 'Belum dibayar', type: 'rp' },
  ];
  const batchCols = [
    { key: 'code', label: 'Batch' }, { key: 'goodBottles', label: 'Botol jadi', type: 'int' }, { key: 'totalCost', label: 'Modal', type: 'rp' },
    { key: 'hpp', label: 'HPP / botol', type: 'rp' }, { key: 'sold', label: 'Terjual', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' },
    { key: 'stockTotal', label: 'Sisa stok', type: 'int' }, { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' },
  ];

  setChildren(root, 
    pageHeader(`Laporan ${ctx.settings.businessName || ''}`.trim(), 'Untung rugi sesuai periode. Belanja bahan tidak mengurangi profit saat dibeli, tapi saat bahannya terpakai di batch.', filters, pdfButton('/report/pdf')),
    ...(alerts ? [alerts] : []), ledger, stats,
    fold('Pengeluaran per kategori', dataTable(categoryCols, rep.perCategory, { emptyText: 'Belum ada pengeluaran pada periode ini.' })),
    fold('Grafik penjualan per hari', rep.trend.length
      ? [trendChart(rep.trend), h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--water)' }), 'Revenue'), h('span', {}, h('i', { style: 'background:var(--husk)' }), 'Gross profit'))]
      : h('p', { class: 'empty' }, 'Belum ada penjualan pada periode ini.')),
    fold('Per mart (klik nama mart untuk melihat laporannya)', dataTable(partnerCols, rep.perPartner, { emptyText: 'Belum ada aktivitas mart pada periode ini.' })),
    fold('Per batch', dataTable(batchCols, rep.perBatch, { emptyText: 'Belum ada batch pada periode ini.' })));
}
