// Laporan satu mart: hanya batch dan transaksi milik mart itu. Dibuka dari tabel "Per mart" di Laporan.
import { h, rp, int, fmtDate, dataTable, pageHeader, setChildren } from '../ui.js';
import { api } from '../api.js';
import { rangeFilters, rangeQuery, pdfButton } from '../range.js';

const stat = (value, label, bad) => h('div', { class: `stat${bad ? ' bad' : ''}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
const ledgerRow = (label, value, cls = '') => h('div', { class: `ledger-row ${cls}` }, h('span', {}, label), h('span', {}, value));
const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);

const KIND = {
  kirim: () => badge('Pengiriman', 'muted'),
  jual: () => badge('Penjualan'),
  retur: () => badge('Retur layak', 'muted'),
  'retur-rusak': () => badge('Retur rusak', 'bad'),
  expired: () => badge('Expired', 'bad'),
};
const SCHEME = { titip: 'Titip', putus: 'Putus', langsung: 'Langsung' };

export async function renderMartReport(root, page, ctx) {
  const id = ctx.params.get('id') || '';
  const back = h('a', { class: 'btn', href: '#/dashboard' }, '← Laporan');
  let rep;
  try {
    rep = await api(`/report/mart/${encodeURIComponent(id)}?${rangeQuery()}`);
  } catch (e) {
    setChildren(root, pageHeader('Laporan mart', null, back),
      h('div', { class: 'panel' }, h('p', { class: 'muted' }, `${e.message} Kembali ke Laporan lalu pilih mart dari tabel Per mart.`)));
    return;
  }
  const again = () => renderMartReport(root, page, ctx).catch(console.error);
  const t = rep.totals; const p = rep.partner;
  const info = [p.type, SCHEME[p.scheme], p.address, p.contact].filter(Boolean).join(' · ');

  const ledger = h('section', { class: 'ledger', 'aria-label': `Laporan ${p.name}` },
    h('div', { class: 'ledger-rows' },
      ledgerRow('Revenue (penjualan)', rp(t.revenue)),
      ledgerRow('HPP botol terjual', `− ${rp(t.cogs)}`, 'neg'),
      ledgerRow('Gross profit', rp(t.grossProfit), 'total'),
      ledgerRow(`Botol expired (${int(t.expired)} botol)`, `− ${rp(t.expiredLoss)}`, 'neg'),
      ledgerRow(`Botol kembali tidak layak (${int(t.returnedBad)} botol)`, `− ${rp(t.returnLoss)}`, 'neg')),
    h('div', { class: 'ledger-result' },
      h('span', { class: 'label' }, 'Hasil dari mart ini'),
      h('span', { class: `big${t.netProfit < 0 ? ' loss' : ''}` }, rp(t.netProfit)),
      h('span', { class: 'note' }, 'Gross profit dikurangi kerugian expired dan retur rusak. Biaya pengeluaran usaha tidak dibagi per mart.')));

  const stats = h('div', { class: 'stats' },
    stat(int(t.delivered), 'Botol dikirim'),
    stat(int(t.sold), 'Botol terjual'),
    stat(int(t.returned), 'Botol kembali'),
    stat(int(t.expired), 'Botol expired', t.expired > 0),
    stat(int(t.remaining), 'Sisa di mart (saat ini)'),
    stat(rp(t.unpaid), 'Belum dibayar', t.unpaid > 0));

  const batchCols = [
    { key: 'code', label: 'Batch' },
    { key: 'expiryDate', label: 'Kedaluwarsa', type: 'date' },
    { key: 'delivered', label: 'Dikirim', type: 'int' },
    { key: 'sold', label: 'Terjual', type: 'int' },
    { key: 'returned', label: 'Kembali', type: 'int' },
    { key: 'expired', label: 'Expired', type: 'int' },
    { key: 'remaining', label: 'Sisa di mart', type: 'int' },
    { key: 'revenue', label: 'Revenue', type: 'rp' },
    { key: 'grossProfit', label: 'Gross profit', type: 'rp' },
  ];
  const txCols = [
    { key: 'date', label: 'Tanggal', type: 'date' },
    { key: 'kind', label: 'Jenis', render: (r) => (KIND[r.kind] || (() => r.kind))() },
    { key: 'batchCode', label: 'Batch' },
    { key: 'qty', label: 'Jumlah', type: 'int' },
    { key: 'amount', label: 'Nilai', type: 'rp', render: (r) => (r.kind === 'retur' ? '–' : rp(r.amount)) },
    { key: 'paid', label: 'Status', render: (r) => (r.kind === 'jual' ? (r.paid ? badge('Lunas') : badge('Belum dibayar', 'warn')) : '') },
    { key: 'note', label: 'Catatan' },
  ];

  setChildren(root,
    pageHeader(`Laporan ${p.name}`, info || 'Batch dan transaksi khusus mart ini.', rangeFilters(again), pdfButton(`/report/mart/${encodeURIComponent(id)}/pdf`), back),
    ledger, stats,
    h('section', { class: 'panel flush' },
      h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Batch di mart ini'), h('p', { class: 'muted' }, `Hanya batch yang dikirim ke ${p.name}. Angkanya milik mart ini saja.`)),
      dataTable(batchCols, rep.perBatch, { stack: true, emptyText: 'Belum ada batch yang masuk ke mart ini pada periode ini.' })),
    h('section', { class: 'panel flush' },
      h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Transaksi'), h('p', { class: 'muted' }, 'Pengiriman, penjualan, retur, dan expired di mart ini, terbaru di atas. Nilai retur rusak dan expired adalah kerugian (jumlah × HPP).')),
      dataTable(txCols, rep.transactions, { stack: true, emptyText: 'Belum ada transaksi pada periode ini.' })));
}
