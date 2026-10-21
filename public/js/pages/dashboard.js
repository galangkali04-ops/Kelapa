// Ringkasan: laporan laba, angka botol, pengeluaran per kategori, per mitra, per batch, grafik.
import { h, rp, int, pct, fmtDate, dataTable, pageHeader, trendChart, setChildren } from '../ui.js';
import { api } from '../api.js';

// Tabel rinci disembunyikan dulu supaya laporan tidak ramai. Klik judulnya untuk membuka.
const fold = (title, ...content) => h('details', { class: 'fold' }, h('summary', {}, title), ...content);

const range = { preset: 'month', from: '', to: '' };
const iso = (d) => d.toLocaleDateString('sv-SE');

function presetDates(p) {
  const now = new Date();
  if (p === 'today') return { from: iso(now), to: iso(now) };
  if (p === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); return { from: iso(s), to: iso(now) }; }
  if (p === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (p === 'custom') return { from: range.from, to: range.to };
  return { from: '', to: '' };
}

const stat = (value, label, bad) => h('div', { class: `stat${bad ? ' bad' : ''}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
const ledgerRow = (label, value, cls = '') => h('div', { class: `ledger-row ${cls}` }, h('span', {}, label), h('span', {}, value));

export async function renderDashboard(root, page, ctx) {
  const dates = presetDates(range.preset);
  const qs = new URLSearchParams();
  if (dates.from) qs.set('from', dates.from);
  if (dates.to) qs.set('to', dates.to);
  const rep = await api(`/report?${qs}`);
  const t = rep.totals;
  const again = () => renderDashboard(root, page, ctx).catch(console.error);

  const preset = h('select', { id: 'preset', onchange: (e) => { range.preset = e.target.value; again(); } },
    [['today', 'Hari ini'], ['7d', '7 hari terakhir'], ['month', 'Bulan ini'], ['all', 'Semua waktu'], ['custom', 'Atur tanggal']].map(([v, l]) => h('option', { value: v }, l)));
  preset.value = range.preset;
  const dateInput = (key, label) => {
    const el = h('input', { type: 'date', value: range[key], 'aria-label': label });
    el.addEventListener('change', () => { range[key] = el.value; again(); });
    return el;
  };
  const filters = h('div', { class: 'filters' },
    h('div', { class: 'field' }, h('label', { for: 'preset' }, 'Periode'), preset),
    range.preset === 'custom' ? [h('div', { class: 'field' }, h('label', {}, 'Dari'), dateInput('from', 'Dari tanggal')), h('div', { class: 'field' }, h('label', {}, 'Sampai'), dateInput('to', 'Sampai tanggal'))] : null);

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
    { key: 'name', label: 'Mart' }, { key: 'delivered', label: 'Dikirim', type: 'int' }, { key: 'sold', label: 'Terjual', type: 'int' },
    { key: 'returned', label: 'Kembali', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' }, { key: 'remaining', label: 'Sisa di mart', type: 'int' },
    { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' }, { key: 'unpaid', label: 'Belum dibayar', type: 'rp' },
  ];
  const batchCols = [
    { key: 'code', label: 'Batch' }, { key: 'goodBottles', label: 'Botol jadi', type: 'int' }, { key: 'totalCost', label: 'Modal', type: 'rp' },
    { key: 'hpp', label: 'HPP / botol', type: 'rp' }, { key: 'sold', label: 'Terjual', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' },
    { key: 'stockTotal', label: 'Sisa stok', type: 'int' }, { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' },
  ];

  setChildren(root, 
    pageHeader(`Laporan ${ctx.settings.businessName || ''}`.trim(), 'Untung rugi sesuai periode. Belanja bahan tidak mengurangi profit saat dibeli, tapi saat bahannya terpakai di batch.', filters),
    ...(alerts ? [alerts] : []), ledger, stats,
    fold('Pengeluaran per kategori', dataTable(categoryCols, rep.perCategory, { emptyText: 'Belum ada pengeluaran pada periode ini.' })),
    fold('Grafik penjualan per hari', rep.trend.length
      ? [trendChart(rep.trend), h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--water)' }), 'Revenue'), h('span', {}, h('i', { style: 'background:var(--husk)' }), 'Gross profit'))]
      : h('p', { class: 'empty' }, 'Belum ada penjualan pada periode ini.')),
    fold('Per mart', dataTable(partnerCols, rep.perPartner, { emptyText: 'Belum ada aktivitas mart pada periode ini.' })),
    fold('Per batch', dataTable(batchCols, rep.perBatch, { emptyText: 'Belum ada batch pada periode ini.' })));
}
