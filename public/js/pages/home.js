// Beranda: hanya tiga hal. Tanggal hari ini, sisa saldo kas, dan botol yang keluar hari ini
// (klik untuk melihat daftar mart yang dikirimi).
import { h, rp, int, dataTable, pageHeader, setChildren } from '../ui.js';
import { api } from '../api.js';

export async function renderHome(root, page, ctx) {
  const d = await api('/home');
  const c = d.cash;
  const sent = d.deliveriesToday || [];
  const total = d.bottles.deliveredToday;
  const dateLabel = new Date(`${d.today}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const listCols = [
    { key: 'name', label: 'Mart' },
    { key: 'qty', label: 'Botol dikirim', type: 'int' },
    { key: 'batches', label: 'Dari batch', render: (r) => r.batches.map((b) => `${b.code} (${int(b.qty)})`).join(', ') },
  ];
  const list = h('section', { class: 'panel flush', id: 'sentList', hidden: true, 'aria-label': 'Mart yang dikirimi hari ini' },
    h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Botol keluar hari ini'), h('p', { class: 'muted' }, 'Jumlah botol yang dikirim ke tiap mart hari ini.')),
    dataTable(listCols, sent, { stack: true, emptyText: 'Belum ada botol yang keluar hari ini.' }));

  const sentBtn = h('button', { class: 'home-card action', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sentList' },
    h('span', { class: 'hc-label' }, 'Botol keluar hari ini'),
    h('b', { class: 'hc-value' }, `${int(total)} botol`),
    h('span', { class: 'hc-note' }, sent.length ? `Ke ${int(sent.length)} mart · klik untuk lihat daftarnya` : 'Belum ada yang dikirim hari ini'));
  sentBtn.addEventListener('click', () => {
    const open = list.hidden;
    list.hidden = !open;
    sentBtn.setAttribute('aria-expanded', String(open));
    sentBtn.classList.toggle('on', open);
    if (open) list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  setChildren(root,
    pageHeader('Beranda'),
    h('section', { class: 'home-cards' },
      h('div', { class: 'home-card' }, h('span', { class: 'hc-label' }, 'Tanggal hari ini'), h('b', { class: 'hc-value date' }, dateLabel)),
      h('div', { class: 'home-card cash' },
        h('span', { class: 'hc-label' }, 'Sisa saldo kas'),
        h('b', { class: `hc-value${c.balance < 0 ? ' loss' : ''}` }, rp(c.balance)),
        h('span', { class: 'hc-note' }, c.deposits === 0
          ? ['Saldo masih dihitung dari nol. ', h('a', { href: '#/capital' }, 'Catat saldo awal')]
          : `Modal masuk ${rp(c.deposits)}, ditarik ${rp(c.withdrawals)}`)),
      sentBtn),
    list);
}
