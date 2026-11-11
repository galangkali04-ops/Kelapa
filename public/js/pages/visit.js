// Mart: pilih mart, lalu klik "Tambah pengiriman" (botol 620 ml dan 600 ml diambil dari stok gudang)
// atau "Catat hasil nota" (laku, kembali, expired). Di bawahnya ada riwayat untuk koreksi.
import { h, rp, int, fmtDate, today, pageHeader, openDialog, closeDialog, formShell, toast, dataTable, setChildren } from '../ui.js';
import { api } from '../api.js';
import { DEF } from '../config.js';
import { openForm, removeRow } from '../crudkit.js';

const SIZES = ['620', '600'];
const badge = (text, cls = '') => h('span', { class: `badge ${cls}` }, text);
const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('span', { class: 'help' }, help) : null);
const numInput = (onInput, placeholder = '0') => {
  const el = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder });
  el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
  return el;
};
const sizeOf = (x) => x.size || '600';

// Semua pergerakan botol mart (kirim, laku, kembali, expired), terbaru dulu.
function historyRows(ctx, partnerId) {
  const d = ctx.data;
  const sz = (x) => {
    const del = x.deliveryId ? d.deliveries.find((q) => q.id === x.deliveryId) : null;
    const b = d.batches.find((q) => q.id === x.batchId);
    return `${(del && sizeOf(del)) || (b && sizeOf(b)) || sizeOf(x)} ml`;
  };
  const rows = [
    ...d.deliveries.map((x) => ({ col: 'deliveries', x, kind: 'Kirim', cls: '', text: `${int(x.qty)} botol ${sizeOf(x)} ml @ ${rp(x.price)}`, amount: null })),
    ...d.sales.map((x) => ({ col: 'sales', x, kind: 'Laku', cls: 'ok', text: `${int(x.qty)} botol ${sz(x)}${x.paid ? '' : ' · belum dibayar'}`, amount: x.total })),
    ...d.returns.map((x) => ({ col: 'returns', x, kind: 'Kembali', cls: 'warn', text: `${int(x.qty)} botol ${sz(x)} (${x.condition})`, amount: null })),
    ...d.expirations.map((x) => ({ col: 'expirations', x, kind: 'Expired', cls: 'bad', text: `${int(x.qty)} botol ${sz(x)}`, amount: null })),
  ];
  return rows
    .filter((r) => !partnerId || r.x.partnerId === partnerId)
    .map((r) => ({ ...r, date: r.x.date, partnerName: r.x.partnerName, batchCode: r.x.batchCode }))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.x.createdAt || '').localeCompare(a.x.createdAt || ''))
    .slice(0, 40);
}

export function renderVisit(root, page, ctx) {
  const partners = ctx.data.partners;
  const state = { partnerId: (ctx.params && ctx.params.get('partner')) || '' };
  if (!partners.some((p) => p.id === state.partnerId)) state.partnerId = '';

  const body = h('div');
  const pick = h('select', { 'aria-label': 'Pilih mart' }, h('option', { value: '' }, '— pilih mart —'),
    partners.map((p) => h('option', { value: p.id }, `${p.name}${p.remaining > 0 ? ` · ${int(p.remaining)} botol di mart` : ''}`)));
  pick.value = state.partnerId;
  const choose = (id) => {
    state.partnerId = id;
    pick.value = id;
    history.replaceState(null, '', id ? `#/visit?partner=${id}` : '#/visit'); // supaya tetap terpilih setelah simpan
    draw();
  };
  pick.addEventListener('change', () => choose(pick.value));

  const newPartner = () => openForm(DEF.partners, null, ctx, { after: (saved) => history.replaceState(null, '', `#/visit?partner=${saved.id}`) });

  const warehouse = (z) => ctx.data.batches.filter((b) => sizeOf(b) === z).reduce((s, b) => s + Math.max(0, b.stockWarehouse), 0);
  const openOf = (partner) => ctx.data.deliveries.filter((d) => d.partnerId === partner.id && d.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));

  function historySection(partnerId) {
    const cols = [
      { key: 'date', label: 'Tanggal', type: 'date' },
      ...(partnerId ? [] : [{ key: 'partnerName', label: 'Mart' }]),
      { key: 'kind', label: 'Jenis', render: (r) => badge(r.kind, r.cls) },
      { key: 'text', label: 'Rincian' },
      { key: 'batchCode', label: 'Produksi' },
      { key: 'amount', label: 'Rp', render: (r) => (r.amount == null ? '' : rp(r.amount)) },
    ];
    return h('section', { class: 'panel flush' },
      h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Riwayat'), h('p', { class: 'muted' }, 'Salah catat? Hapus barisnya lalu catat ulang.')),
      dataTable(cols, historyRows(ctx, partnerId), {
        stack: true, emptyText: 'Belum ada catatan.',
        actions: (r) => [
          r.col === 'sales' && !r.x.paid ? h('button', { class: 'btn small primary', onclick: () => markPaid(r.x) }, 'Tandai lunas') : null,
          h('button', { class: 'btn small danger', onclick: () => removeRow(DEF[r.col], r.x, ctx, `catatan ${r.kind.toLowerCase()}`) }, 'Hapus'),
        ].filter(Boolean),
      }));
  }

  async function markPaid(sale) {
    try {
      await api(`/sales/${sale.id}`, { method: 'PUT', body: { date: sale.date, deliveryId: sale.deliveryId, qty: sale.qty, price: sale.price, paid: true, note: sale.note || '' } });
      toast('Ditandai lunas');
      await ctx.refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- Tambah pengiriman ----------
  function openDelivery(partner) {
    const st = { date: today(), qty: { 620: 0, 600: 0 }, price: {} };
    for (const z of SIZES) {
      const last = ctx.data.deliveries.filter((d) => d.partnerId === partner.id && sizeOf(d) === z).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
      st.price[z] = (last && last.price) || partner.price || '';
    }
    const dateEl = h('input', { type: 'date', value: st.date });
    dateEl.addEventListener('change', () => { st.date = dateEl.value || today(); });
    const summary = h('div', { class: 'bill' });
    const warn = h('p', { class: 'form-error' });
    const totalOpen = openOf(partner).reduce((s, d) => s + d.remaining, 0);
    const refresh = () => {
      const total = SIZES.reduce((s, z) => s + st.qty[z], 0);
      const value = SIZES.reduce((s, z) => s + st.qty[z] * (Number(st.price[z]) || 0), 0);
      warn.textContent = SIZES.filter((z) => st.qty[z] > warehouse(z)).map((z) => `Stok gudang ${z} ml hanya ${int(warehouse(z))} botol.`).join(' ');
      setChildren(summary,
        h('div', { class: 'kv total' }, h('span', {}, 'Total dikirim'), h('span', {}, `${int(total)} botol`)),
        h('div', { class: 'kv' }, h('span', {}, 'Nilai pengiriman'), h('span', {}, rp(value))),
        h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} setelah ini`), h('span', {}, `${int(totalOpen + total)} botol`)),
        ...SIZES.map((z) => h('div', { class: 'kv' }, h('span', {}, `Sisa stok gudang ${z} ml`), h('span', {}, `${int(Math.max(0, warehouse(z) - st.qty[z]))} botol`))));
    };
    const rows = SIZES.map((z) => {
      const qty = numInput((v) => { st.qty[z] = v; refresh(); });
      const price = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: st.price[z] });
      price.addEventListener('input', () => { st.price[z] = price.value; refresh(); });
      return h('div', { class: 'fields', style: 'margin-top:10px' },
        field(`Botol ${z} ml · stok gudang ${int(warehouse(z))}`, qty), field(`Harga per botol ${z} ml (Rp)`, price));
    });
    formShell({
      title: `Tambah pengiriman · ${partner.name}`, submitLabel: 'Kirim',
      children: h('div', {}, h('div', { class: 'fields' }, field('Tanggal kirim', dateEl)), ...rows, summary, warn),
      onSubmit: async () => {
        if (SIZES.every((z) => st.qty[z] === 0)) throw new Error('Isi jumlah botol yang dikirim.');
        const res = await api('/visits', { method: 'POST', body: { partnerId: partner.id, date: st.date, newQty: st.qty, newPrice: st.price } });
        await ctx.refresh();
        setTimeout(() => showResult(partner, res), 0); // setelah form tertutup
      },
    });
    refresh();
  }

  // ---------- Catat hasil nota ----------
  function openNota(partner) {
    const open = openOf(partner);
    const st = { date: today(), paid: true, sold: {}, returnedGood: {}, returnedBad: {}, expired: {} };
    const openBy = (z) => open.filter((d) => sizeOf(d) === z);
    const left = (z) => openBy(z).reduce((s, d) => s + d.remaining, 0);
    const sizes = SIZES.filter((z) => left(z) > 0);
    for (const z of SIZES) for (const k of ['sold', 'returnedGood', 'returnedBad', 'expired']) st[k][z] = 0;
    const dateEl = h('input', { type: 'date', value: st.date });
    dateEl.addEventListener('change', () => { st.date = dateEl.value || today(); });
    const paidBox = h('input', { type: 'checkbox', checked: true });
    paidBox.addEventListener('change', () => { st.paid = paidBox.checked; refresh(); });
    const bill = h('div', { class: 'bill' });
    const warn = h('p', { class: 'form-error' });
    const refresh = () => {
      let money = 0; let sold = 0; const over = [];
      for (const z of SIZES) {
        let need = st.sold[z];
        for (const d of openBy(z)) { const t = Math.min(need, d.remaining); money += t * (Number(d.price) || Number(partner.price) || 0); need -= t; }
        sold += st.sold[z];
        const handled = st.sold[z] + st.returnedGood[z] + st.returnedBad[z] + st.expired[z];
        if (handled > left(z)) over.push(`Botol ${z} ml: ${int(handled)} melebihi sisa di mart (${int(left(z))}).`);
      }
      warn.textContent = over.join(' ');
      setChildren(bill, h('div', { class: 'kv total' }, h('span', {}, `${st.paid ? 'Uang diterima' : 'Tagihan belum dibayar'} (${int(sold)} laku)`), h('span', {}, rp(money))));
    };
    const groups = sizes.map((z) => {
      const num = (k) => numInput((v) => { st[k][z] = v; refresh(); });
      return h('div', { style: 'margin-top:14px' },
        h('h3', {}, `Botol ${z} ml · sisa di mart ${int(left(z))}`),
        h('div', { class: 'fields', style: 'margin-top:8px' },
          field('Laku', num('sold')), field('Kembali, layak', num('returnedGood')),
          field('Kembali, rusak', num('returnedBad')), field('Expired di mart', num('expired'))));
    });
    if (!sizes.length) { toast(`${partner.name} belum punya botol di mart. Tambah pengiriman dulu.`, 'error'); return; }
    formShell({
      title: `Hasil nota · ${partner.name}`,
      children: h('div', {},
        h('div', { class: 'fields' }, field('Tanggal', dateEl), h('div', { class: 'field check full' }, h('label', {}, 'Mart sudah bayar sekarang'), paidBox)),
        ...groups, bill, warn),
      onSubmit: async () => {
        const total = SIZES.reduce((s, z) => s + st.sold[z] + st.returnedGood[z] + st.returnedBad[z] + st.expired[z], 0);
        if (total === 0) throw new Error('Isi minimal satu jumlah.');
        const res = await api('/visits', { method: 'POST', body: { partnerId: partner.id, date: st.date, paid: st.paid, sold: st.sold, returnedGood: st.returnedGood, returnedBad: st.returnedBad, expired: st.expired } });
        await ctx.refresh();
        setTimeout(() => showResult(partner, res), 0); // setelah form tertutup
      },
    });
    refresh();
  }

  function draw() {
    const partner = partners.find((p) => p.id === state.partnerId);
    if (!partner) {
      setChildren(body,
        partners.length
          ? h('section', { class: 'panel' }, h('h2', {}, 'Pilih mart'),
            h('div', { class: 'mart-list' }, partners.map((p) => h('button', { class: 'mart-item', type: 'button', onclick: () => choose(p.id) },
              h('b', {}, p.name), h('span', {}, p.remaining > 0 ? `${int(p.remaining)} botol di mart` : 'belum ada botol')))))
          : h('p', { class: 'empty' }, 'Belum ada mart. Klik "Mart baru" untuk menambah.'),
        historySection(''));
      return;
    }
    const open = openOf(partner);
    const atMart = (z) => open.filter((d) => sizeOf(d) === z).reduce((s, d) => s + d.remaining, 0);
    setChildren(body,
      h('div', { class: 'row-actions', style: 'margin-bottom:12px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => choose('') }, 'Ganti mart'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openForm(DEF.partners, partner, ctx) }, 'Ubah mart'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => removeRow(DEF.partners, partner, ctx, `mart ${partner.name}`) }, 'Hapus mart')),
      h('section', { class: 'panel' },
        h('h2', {}, partner.name),
        h('div', { class: 'stats', style: 'margin:12px 0' },
          ...SIZES.map((z) => h('div', { class: 'stat' }, h('div', { class: 'v' }, `${int(warehouse(z))} botol`), h('div', { class: 'l' }, `Stok gudang ${z} ml`))),
          ...SIZES.map((z) => h('div', { class: 'stat' }, h('div', { class: 'v' }, `${int(atMart(z))} botol`), h('div', { class: 'l' }, `Di ${partner.name} · ${z} ml`)))),
        h('div', { class: 'form-actions', style: 'justify-content:flex-start' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => openDelivery(partner) }, 'Tambah pengiriman'),
          h('button', { class: 'btn', type: 'button', onclick: () => openNota(partner) }, 'Catat hasil nota'))),
      open.length ? h('section', { class: 'panel' }, h('h2', {}, 'Botol yang masih di mart'),
        h('ul', { class: 'open-list' }, open.map((d) => h('li', {}, `${fmtDate(d.date)} · ${sizeOf(d)} ml · sisa ${int(d.remaining)} dari ${int(d.qty)} botol @ ${rp(d.price)}`)))) : null,
      historySection(partner.id));
  }

  function showResult(partner, r) {
    const lines = [
      r.sold > 0 ? h('div', { class: 'kv total' }, h('span', {}, `${r.paid ? 'Uang diterima' : 'Tagihan belum dibayar'} (${int(r.sold)} laku)`), h('span', {}, rp(r.revenue))) : null,
      r.delivered > 0 ? h('div', { class: 'kv' }, h('span', {}, `Dikirim ke ${partner.name}`), h('span', {}, `${int(r.delivered)} botol`)) : null,
      ...r.batches.map((b) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, `${b.size} ml · dari ${b.code}`), h('span', {}, `${int(b.qty)} botol`))),
      h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} sekarang`), h('span', {}, `${int(r.remainingAtPartner)} botol`)),
    ];
    openDialog(h('div', { class: 'dialog-body' }, h('h2', {}, 'Tersimpan'), ...lines,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: closeDialog }, 'Selesai'))));
  }

  setChildren(root,
    pageHeader('Mart', 'Pilih mart, lalu klik Tambah pengiriman. Stok gudang 620 ml dan 600 ml langsung terpotong.',
      h('button', { class: 'btn primary', type: 'button', onclick: newPartner }, 'Mart baru')),
    ...(partners.length ? [h('section', { class: 'panel' }, h('div', { class: 'fields' }, field('Mart', pick)))] : []),
    body);
  draw();
}
