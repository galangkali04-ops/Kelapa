// Ringkasan: laporan laba, angka botol, pengeluaran per kategori, per mitra, per batch, grafik.
import { h, rp, int, pct, fmtDate, dataTable, pageHeader, trendChart, openDialog, closeDialog } from '../ui.js';
import { api } from '../api.js';
import { openResultForm } from './result.js';

const range = { preset: 'month', from: '', to: '' };
let reportOpen = false; // laporan keuangan disembunyikan dulu supaya Ringkasan tetap simpel
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

/* ---------- Detail satu mitra: tanggal kirim + hasilnya ---------- */
function openPartner(partnerId, ctx) {
  const p = (ctx.data.partners || []).find((x) => x.id === partnerId);
  if (!p) return;
  const dels = (ctx.data.deliveries || []).filter((d) => d.partnerId === p.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const total = (f) => dels.reduce((s, d) => s + (Number(d[f]) || 0), 0);
  const box = (value, label) => h('div', {}, h('b', {}, value), h('span', {}, label));

  const history = (d) => {
    const lines = [
      ...(ctx.data.sales || []).filter((x) => x.deliveryId === d.id).map((x) => ({
        date: x.date, at: x.createdAt, text: `Terjual ${int(x.qty)} botol · ${rp(x.total)}`, badge: x.paid ? ['Lunas', ''] : ['Belum dibayar', 'warn'] })),
      ...(ctx.data.returns || []).filter((x) => x.deliveryId === d.id).map((x) => ({
        date: x.date, at: x.createdAt, text: `Kembali ${int(x.qty)} botol${x.reason ? ` (${x.reason})` : ''}`, badge: x.condition === 'rusak' ? ['Tidak layak', 'bad'] : ['Layak', ''] })),
      ...(ctx.data.expirations || []).filter((x) => x.deliveryId === d.id).map((x) => ({
        date: x.date, at: x.createdAt, text: `Expired ${int(x.qty)} botol`, badge: ['Rugi', 'bad'] })),
    ].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''));
    if (!lines.length) return h('p', { class: 'muted dlv-empty' }, 'Belum ada hasil yang dicatat.');
    return h('ul', { class: 'dlv-history' }, lines.map((l) => h('li', {},
      h('span', { class: 'when' }, fmtDate(l.date)), h('span', { class: 'what' }, l.text), h('span', { class: `badge ${l.badge[1]}` }, l.badge[0]))));
  };

  const card = (d) => h('article', { class: 'dlv' },
    h('div', { class: 'dlv-top' },
      h('strong', {}, `Dikirim ${fmtDate(d.date)}`),
      d.remaining > 0 ? h('span', { class: 'badge warn' }, `Sisa ${int(d.remaining)} botol`) : h('span', { class: 'badge muted' }, 'Selesai')),
    h('p', { class: 'muted dlv-meta' }, `Batch ${d.batchCode} · ${int(d.qty)} botol · ${rp(d.price)} per botol`),
    h('div', { class: 'dlv-nums' },
      h('div', {}, h('b', {}, int(d.sold)), h('span', {}, 'Terjual')),
      h('div', {}, h('b', {}, int(d.returned)), h('span', {}, 'Kembali')),
      h('div', {}, h('b', {}, int(d.expired)), h('span', {}, 'Expired')),
      h('div', {}, h('b', {}, rp(d.revenue)), h('span', {}, 'Revenue'))),
    history(d),
    d.remaining > 0 ? h('button', { type: 'button', class: 'btn small primary', onclick: () => openResultForm(d, ctx, () => openPartner(p.id, ctx)) }, 'Catat hasil') : null);

  openDialog(h('div', { class: 'dialog-body wide' },
    h('h2', {}, p.name),
    h('p', { class: 'muted', style: 'margin-bottom:14px' }, [p.type, p.scheme === 'putus' ? 'Beli putus' : 'Titip jual', p.contact].filter(Boolean).join(' · ')),
    h('div', { class: 'detail-grid' },
      box(int(total('qty')), 'Total dikirim'), box(int(total('sold')), 'Terjual'), box(int(total('returned')), 'Kembali'),
      box(int(total('remaining')), 'Sisa di mitra'), box(rp(total('revenue')), 'Revenue'),
      total('unpaid') > 0 ? box(rp(total('unpaid')), 'Belum dibayar') : null),
    h('h3', { class: 'dlv-title' }, 'Riwayat pengiriman'),
    dels.length ? dels.map(card) : h('p', { class: 'empty' }, 'Belum ada pengiriman ke mitra ini.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Tutup'))));
}

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
      ledgerRow('Biaya pengeluaran', `− ${rp(t.expenses)}`, 'neg')),
    h('div', { class: 'ledger-result' },
      h('span', { class: 'label' }, 'Profit setelah semua biaya'),
      h('span', { class: `big${net < 0 ? ' loss' : ''}` }, rp(net)),
      h('span', { class: 'note' }, `Margin bersih ${pct(t.netMargin)}. Modal produksi periode ini ${rp(t.totalModal)}. Revenue dihitung dari botol yang sudah terjual, bukan dari yang dikirim.`)));

  const stats = h('div', { class: 'stats' },
    stat(rp(t.totalModal), 'Total modal produksi'),
    stat(rp(t.expenses), 'Total pengeluaran', t.expenses > 0),
    stat(int(t.produced), 'Botol diproduksi'),
    stat(rp(t.avgHpp), 'HPP rata-rata per botol'),
    stat(int(t.delivered), 'Botol dikirim ke mitra'),
    stat(int(t.sold), 'Botol terjual'),
    stat(int(t.returned), `Botol kembali (${int(t.returnedGood)} layak)`),
    stat(int(t.expired), 'Botol expired', t.expired > 0),
    stat(int(rep.stock.warehouse), 'Stok di gudang (saat ini)'),
    stat(int(rep.stock.atPartners), 'Stok di mitra (saat ini)'),
    stat(rp(t.unpaid), 'Belum dibayar mitra', t.unpaid > 0));

  const alerts = rep.alerts.length ? h('section', { class: 'alert' },
    h('h2', {}, 'Botol hampir atau sudah expired'),
    h('ul', {}, rep.alerts.map((a) => {
      const when = a.daysLeft < 0 ? `lewat ${-a.daysLeft} hari` : a.daysLeft === 0 ? 'expired hari ini' : `${a.daysLeft} hari lagi`;
      const where = [a.stockWarehouse > 0 ? `${int(a.stockWarehouse)} di gudang` : '', ...a.partners.map((p) => `${int(p.remaining)} di ${p.name}`)].filter(Boolean).join(', ');
      return h('li', {}, h('b', {}, a.code), ` (${when}, ${fmtDate(a.expiryDate)}): ${where}. Catat di menu Botol expired jika sudah tidak bisa dijual.`);
    }))) : null;

  const categoryCols = [
    { key: 'category', label: 'Kategori' }, { key: 'count', label: 'Jumlah catatan', type: 'int' },
    { key: 'total', label: 'Total', type: 'rp' }, { key: 'share', label: 'Porsi', type: 'pct' },
  ];
  const partnerCols = [
    { key: 'name', label: 'Mitra' }, { key: 'delivered', label: 'Dikirim', type: 'int' }, { key: 'sold', label: 'Terjual', type: 'int' },
    { key: 'returned', label: 'Kembali', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' }, { key: 'remaining', label: 'Sisa di mitra', type: 'int' },
    { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' }, { key: 'unpaid', label: 'Belum dibayar', type: 'rp' },
  ];
  const batchCols = [
    { key: 'code', label: 'Batch' }, { key: 'goodBottles', label: 'Botol jadi', type: 'int' }, { key: 'totalCost', label: 'Modal', type: 'rp' },
    { key: 'hpp', label: 'HPP / botol', type: 'rp' }, { key: 'sold', label: 'Terjual', type: 'int' }, { key: 'expired', label: 'Expired', type: 'int' },
    { key: 'stockTotal', label: 'Sisa stok', type: 'int' }, { key: 'revenue', label: 'Revenue', type: 'rp' }, { key: 'grossProfit', label: 'Gross profit', type: 'rp' },
  ];

  const partners = ctx.data.partners || [];
  const partnerPanel = h('section', { class: 'panel' },
    h('h2', {}, 'Mitra'),
    partners.length
      ? h('div', { class: 'partner-list' }, partners.map((p) => h('button', { type: 'button', class: 'partner-row', onclick: () => openPartner(p.id, ctx) },
        h('span', { class: 'nm' }, p.name),
        p.remaining > 0 ? h('span', { class: 'badge warn' }, `Sisa ${int(p.remaining)}`) : null,
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))))
      : h('p', { class: 'empty' }, 'Belum ada mitra. Tambahkan dulu di menu Mitra.'));

  const report = h('details', { class: 'report-box', open: reportOpen, ontoggle: (e) => { reportOpen = e.target.open; } },
    h('summary', {}, 'Laporan keuangan & statistik'),
    h('div', { class: 'report-inner' },
      h('p', { class: 'muted' }, 'Angka di bawah mengikuti periode yang dipilih.'), filters, ledger, stats,
      h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Pengeluaran per kategori'), h('p', { class: 'muted' }, 'Dicatat di menu Biaya pengeluaran.')),
        dataTable(categoryCols, rep.perCategory, { emptyText: 'Belum ada pengeluaran pada periode ini.' })),
      h('section', { class: 'panel' }, h('h2', {}, 'Revenue dan gross profit per hari'),
        rep.trend.length ? [trendChart(rep.trend), h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--water)' }), 'Revenue'), h('span', {}, h('i', { style: 'background:var(--husk)' }), 'Gross profit'))]
          : h('p', { class: 'empty' }, 'Belum ada penjualan pada periode ini.')),
      h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Per mitra')),
        dataTable(partnerCols, rep.perPartner, { emptyText: 'Belum ada aktivitas mitra pada periode ini.' })),
      h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Per batch'), h('p', { class: 'muted' }, 'Batch yang diproduksi pada periode ini, dengan angka penjualan sepanjang batch tersebut.')),
        dataTable(batchCols, rep.perBatch, { emptyText: 'Belum ada batch pada periode ini.' }))));

  root.replaceChildren(
    pageHeader(`Ringkasan ${ctx.settings.businessName || ''}`.trim(), 'Pilih nama mitra untuk melihat tanggal pengiriman dan hasilnya.'),
    ...(alerts ? [alerts] : []), partnerPanel, report);
}
