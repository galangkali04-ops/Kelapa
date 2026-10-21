// Mart: semua urusan mart dalam satu halaman. Mart bayar saat order berikutnya, jadi hasil nota lama
// dan order baru diisi bersamaan. Di bawahnya ada riwayat untuk koreksi.
import { h, rp, int, fmtDate, today, pageHeader, openDialog, closeDialog, toast, dataTable, setChildren } from '../ui.js';
import { api } from '../api.js';
import { DEF } from '../config.js';
import { openForm, removeRow } from '../crudkit.js';

const numInput = (onInput, placeholder = '0') => {
  const el = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder });
  el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
  return el;
};
const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('span', { class: 'help' }, help) : null);
const badge = (text, cls = '') => h('span', { class: `badge ${cls}` }, text);

// Semua pergerakan botol mart (kirim, laku, kembali, expired), terbaru dulu.
function historyRows(ctx, partnerId) {
  const d = ctx.data;
  const rows = [
    ...d.deliveries.map((x) => ({ col: 'deliveries', x, kind: 'Kirim', cls: '', text: `${int(x.qty)} botol @ ${rp(x.price)}`, amount: null })),
    ...d.sales.map((x) => ({ col: 'sales', x, kind: 'Laku', cls: 'ok', text: `${int(x.qty)} botol${x.paid ? '' : ' · belum dibayar'}`, amount: x.total })),
    ...d.returns.map((x) => ({ col: 'returns', x, kind: 'Kembali', cls: 'warn', text: `${int(x.qty)} botol (${x.condition})`, amount: null })),
    ...d.expirations.map((x) => ({ col: 'expirations', x, kind: 'Expired', cls: 'bad', text: `${int(x.qty)} botol`, amount: null })),
  ];
  return rows
    .filter((r) => !partnerId || r.x.partnerId === partnerId)
    .map((r) => ({ ...r, date: r.x.date, partnerName: r.x.partnerName, batchCode: r.x.batchCode }))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.x.createdAt || '').localeCompare(a.x.createdAt || ''))
    .slice(0, 40);
}

export function renderVisit(root, page, ctx) {
  const partners = ctx.data.partners;
  const fresh = () => ({ sold: 0, returnedGood: 0, returnedBad: 0, expired: 0, paid: true, newQty: 0, newPrice: '' });
  const state = { partnerId: (ctx.params && ctx.params.get('partner')) || '', date: today(), ...fresh() };
  if (!partners.some((p) => p.id === state.partnerId)) state.partnerId = '';

  const body = h('div');
  const pick = h('select', { 'aria-label': 'Pilih mart' }, h('option', { value: '' }, '— pilih mart —'),
    partners.map((p) => h('option', { value: p.id }, `${p.name}${p.remaining > 0 ? ` · ${int(p.remaining)} botol di mart` : ''}`)));
  pick.value = state.partnerId;
  const choose = (id) => {
    Object.assign(state, fresh(), { partnerId: id });
    pick.value = id;
    history.replaceState(null, '', id ? `#/visit?partner=${id}` : '#/visit'); // supaya tetap terpilih setelah simpan
    draw();
  };
  pick.addEventListener('change', () => choose(pick.value));
  const dateEl = h('input', { type: 'date', value: state.date });
  dateEl.addEventListener('change', () => { state.date = dateEl.value || today(); });

  const newPartner = () => openForm(DEF.partners, null, ctx, { after: (saved) => history.replaceState(null, '', `#/visit?partner=${saved.id}`) });

  function historySection(partnerId) {
    const cols = [
      { key: 'date', label: 'Tanggal', type: 'date' },
      ...(partnerId ? [] : [{ key: 'partnerName', label: 'Mart' }]),
      { key: 'kind', label: 'Jenis', render: (r) => badge(r.kind, r.cls) },
      { key: 'text', label: 'Rincian' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'amount', label: 'Rp', render: (r) => (r.amount == null ? '' : rp(r.amount)) },
    ];
    return h('section', { class: 'panel flush' },
      h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Riwayat'), h('p', { class: 'muted' }, 'Salah catat? Hapus barisnya lalu catat ulang di atas.')),
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

    const open = ctx.data.deliveries.filter((d) => d.partnerId === partner.id && d.remaining > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const totalOpen = open.reduce((s, d) => s + d.remaining, 0);
    const warehouse = ctx.data.batches.reduce((s, b) => s + Math.max(0, b.stockWarehouse), 0);
    if (state.newPrice === '') state.newPrice = partner.price || '';

    const summary = h('div', { class: 'bill' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Simpan');

    function refresh() {
      // Tagihan dihitung dengan urutan yang sama seperti server: pengiriman tertua dulu.
      let need = state.sold; let bill = 0;
      for (const d of open) { const t = Math.min(need, d.remaining); bill += t * (Number(d.price) || Number(partner.price) || 0); need -= t; }
      const handled = state.sold + state.returnedGood + state.returnedBad + state.expired;
      const over = handled > totalOpen;
      const after = totalOpen - handled + state.newQty;
      setChildren(summary, 
        open.length ? h('div', { class: 'kv total' }, h('span', {}, `${state.paid ? 'Uang diterima' : 'Tagihan belum dibayar'} (${int(state.sold)} laku)`), h('span', {}, rp(bill))) : null,
        state.newQty > 0 ? h('div', { class: 'kv' }, h('span', {}, 'Nilai order baru'), h('span', {}, rp(state.newQty * (Number(state.newPrice) || 0)))) : null,
        h('div', { class: 'kv' }, h('span', {}, 'Botol di mart setelah ini'), h('span', {}, `${int(Math.max(0, after))} botol`)));
      err.textContent = over ? `Jumlahnya ${int(handled)} botol, padahal di mart hanya ${int(totalOpen)} botol.`
        : state.newQty > warehouse ? `Stok gudang sekarang ${int(warehouse)} botol (botol kembali yang layak akan menambah stok).` : '';
      save.disabled = over || handled + state.newQty === 0;
    }
    const num = (key) => { const el = numInput((v) => { state[key] = v; refresh(); }); el.value = state[key] || ''; return el; };

    const paidBox = h('input', { type: 'checkbox', checked: state.paid });
    paidBox.addEventListener('change', () => { state.paid = paidBox.checked; refresh(); });
    const priceEl = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: state.newPrice });
    priceEl.addEventListener('input', () => { state.newPrice = priceEl.value; refresh(); });

    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const res = await api('/visits', { method: 'POST', body: { ...state, newPrice: state.newPrice === '' ? undefined : Number(state.newPrice) } });
        await ctx.refresh();
        showResult(partner, res);
      } catch (e) { err.textContent = e.message; refresh(); }
    });

    setChildren(body, 
      h('div', { class: 'row-actions', style: 'margin-bottom:12px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => choose('') }, 'Ganti mart'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openForm(DEF.partners, partner, ctx) }, 'Ubah mart'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => removeRow(DEF.partners, partner, ctx, `mart ${partner.name}`) }, 'Hapus mart')),
      open.length ? h('section', { class: 'panel' },
        h('h2', {}, 'Nota sebelumnya'),
        h('p', { class: 'muted', style: 'margin:4px 0 12px' }, `Di ${partner.name} masih ada ${int(totalOpen)} botol. Isi sesuai nota. Yang belum dihitung tetap tercatat di mart.`),
        h('ul', { class: 'open-list' }, open.map((d) => h('li', {}, `${fmtDate(d.date)} · ${d.batchCode} · sisa ${int(d.remaining)} dari ${int(d.qty)} botol @ ${rp(d.price)}`))),
        h('div', { class: 'fields', style: 'margin-top:14px' },
          field('Laku (botol)', num('sold')), field('Kembali, masih layak', num('returnedGood')),
          field('Kembali, rusak', num('returnedBad')), field('Expired di mart', num('expired')),
          h('div', { class: 'field check full' }, h('label', {}, 'Mart sudah bayar sekarang'), paidBox)))
        : h('p', { class: 'muted', style: 'margin-bottom:14px' }, `${partner.name} belum punya botol dari kita. Ini order pertama, cukup isi botol yang dikirim.`),
      h('section', { class: 'panel' },
        h('h2', {}, 'Order baru'),
        h('p', { class: 'muted', style: 'margin:4px 0 12px' }, `Stok gudang ${int(warehouse)} botol. Diambil otomatis dari batch yang paling dekat expired.`),
        h('div', { class: 'fields' }, field('Botol dikirim', num('newQty')), field('Harga per botol (Rp)', priceEl))),
      summary, err, h('div', { class: 'form-actions' }, save),
      historySection(partner.id));
    refresh();
  }

  function showResult(partner, r) {
    const lines = [
      r.sold > 0 ? h('div', { class: 'kv total' }, h('span', {}, `${r.paid ? 'Uang diterima' : 'Tagihan belum dibayar'} (${int(r.sold)} laku)`), h('span', {}, rp(r.revenue))) : null,
      r.delivered > 0 ? h('div', { class: 'kv' }, h('span', {}, `Dikirim ke ${partner.name}`), h('span', {}, `${int(r.delivered)} botol`)) : null,
      ...r.batches.map((b) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, `dari batch ${b.code}`), h('span', {}, `${int(b.qty)} botol`))),
      h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} sekarang`), h('span', {}, `${int(r.remainingAtPartner)} botol`)),
    ];
    openDialog(h('div', { class: 'dialog-body' }, h('h2', {}, 'Tersimpan'), ...lines,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: closeDialog }, 'Selesai'))));
  }

  setChildren(root, 
    pageHeader('Mart', 'Mart bayar saat order berikutnya. Pilih mart, isi hasil nota sebelumnya, lalu isi order barunya.',
      h('button', { class: 'btn primary', type: 'button', onclick: newPartner }, 'Mart baru')),
    ...(partners.length ? [h('section', { class: 'panel' }, h('div', { class: 'fields' }, field('Mart', pick), field('Tanggal', dateEl)))] : []),
    body);
  draw();
}
