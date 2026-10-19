// Beranda: angka hari ini, stok bahan, botol, dan botol yang masih di mart. Semua dalam satu layar.
import { h, rp, rpd, int, fmtDate, dataTable, pageHeader } from '../ui.js';
import { api } from '../api.js';

const stat = (value, label, bad) => h('div', { class: `stat${bad ? ' bad' : ''}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
const row = (label, value, cls = '') => h('div', { class: `ledger-row ${cls}` }, h('span', {}, label), h('span', {}, value));
const qty = (n, unit) => `${int(n)}${unit ? ` ${unit}` : ''}`;

export async function renderHome(root, page, ctx) {
  const d = await api('/home');
  const m = d.money; const c = d.cash;
  const dateLabel = new Date(`${d.today}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  const quick = h('div', { class: 'quick' },
    h('a', { class: 'btn primary', href: '#/purchases?add' }, 'Belanja bahan'),
    h('a', { class: 'btn primary', href: '#/batches?add' }, 'Catat produksi'),
    h('a', { class: 'btn primary', href: '#/visit' }, 'Mart'),
    h('a', { class: 'btn', href: '#/expenses?add' }, 'Pengeluaran'));

  const alerts = d.alerts.length ? h('section', { class: 'alert' }, h('h2', {}, 'Perlu perhatian'),
    h('ul', {}, d.alerts.map((a) => h('li', {}, h('b', {}, a.title), `. ${a.body}`)))) : null;

  const money = h('section', { class: 'ledger', 'aria-label': 'Uang' },
    h('div', { class: 'ledger-rows' },
      row('Uang masuk hari ini', rp(m.receivedToday)),
      row('Uang keluar hari ini', `− ${rp(m.spentToday)}`, 'neg'),
      row('Nilai stok (bahan + botol)', rp(c.stockValue)),
      row('Belum dibayar mart', rp(c.receivable))),
    h('div', { class: 'ledger-result' },
      h('span', { class: 'label' }, 'Saldo kas (uang di tangan)'),
      h('span', { class: `big${c.balance < 0 ? ' loss' : ''}` }, rp(c.balance)),
      h('span', { class: 'note' }, c.deposits === 0
        ? ['Saldo masih dihitung dari nol. ', h('a', { href: '#/capital' }, 'Catat saldo awal'), ' supaya pas dengan uang asli.']
        : `Modal masuk ${rp(c.deposits)}, ditarik ${rp(c.withdrawals)}.`)));

  const bottles = h('div', { class: 'stats' },
    stat(int(d.bottles.madeToday), 'Botol jadi hari ini'),
    stat(int(d.bottles.deliveredToday), 'Botol keluar ke mart hari ini'),
    stat(int(d.bottles.warehouse), 'Botol di gudang'),
    stat(int(d.bottles.atPartners), 'Botol di mart'));

  const matCols = [
    { key: 'name', label: 'Bahan' },
    { key: 'qty', label: 'Stok', render: (r) => qty(r.qty, r.unit) },
    { key: 'inToday', label: 'Masuk hari ini', render: (r) => (r.inToday || r.damagedToday ? `${int(r.inToday)}${r.damagedToday ? ` (+${int(r.damagedToday)} rusak)` : ''}` : '0') },
    { key: 'outToday', label: 'Keluar hari ini', type: 'int' },
    { key: 'avg', label: 'Harga rata-rata', render: (r) => `${rpd(r.avg)}${r.unit ? ` / ${r.unit}` : ''}` },
  ];
  const partnerCols = [
    { key: 'name', label: 'Mart' },
    { key: 'remaining', label: 'Botol di mart', type: 'int' },
    { key: 'since', label: 'Order tertua', render: (r) => fmtDate(r.since) },
  ];

  root.replaceChildren(
    pageHeader('Beranda', `${dateLabel}`),
    quick, ...(alerts ? [alerts] : []), money, bottles,
    h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Stok bahan'),
      h('p', { class: 'muted' }, 'Kelapa masuk, kelapa keluar, botol plastik, dan lainnya. Botol penyok tidak masuk stok.')),
    d.hasTracked ? dataTable(matCols, d.materials, { stack: true })
      : h('p', { class: 'empty' }, 'Belum ada stok. Klik "Belanja bahan" setiap beli kelapa atau botol, nanti stok dan harga rata-rata terisi sendiri.')),
    h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Botol yang masih di mart'),
      h('p', { class: 'muted' }, 'Bawa nota order sebelumnya, lalu klik Tukar nota untuk mencatat yang laku dan order baru sekaligus.')),
    dataTable(partnerCols, d.partners, {
      stack: true, emptyText: 'Tidak ada botol di mart saat ini.',
      actions: (p) => [h('a', { class: 'btn small primary', href: `#/visit?partner=${p.id}` }, 'Tukar nota')],
    })));
}
