// Order mart: mart bayar saat order berikutnya, jadi satu layar untuk hasil nota lama + kirim order baru.
import { h, rp, int, fmtDate, today, pageHeader, openDialog, closeDialog, toast } from '../ui.js';
import { api } from '../api.js';

const numInput = (onInput, placeholder = '0') => {
  const el = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder });
  el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
  return el;
};
const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('span', { class: 'help' }, help) : null);

export function renderVisit(root, page, ctx) {
  const partners = ctx.data.partners;
  const state = { partnerId: (ctx.params && ctx.params.get('partner')) || '', date: today(), sold: 0, returnedGood: 0, returnedBad: 0, expired: 0, paid: true, newQty: 0, newPrice: '' };

  const body = h('div');
  const pick = h('select', { 'aria-label': 'Pilih mart' }, h('option', { value: '' }, '— pilih mart —'),
    partners.map((p) => h('option', { value: p.id }, `${p.name}${p.remaining > 0 ? ` · ${int(p.remaining)} botol di mart` : ''}`)));
  pick.value = state.partnerId;
  pick.addEventListener('change', () => { Object.assign(state, { partnerId: pick.value, sold: 0, returnedGood: 0, returnedBad: 0, expired: 0, newQty: 0, newPrice: '' }); draw(); });
  const dateEl = h('input', { type: 'date', value: state.date });
  dateEl.addEventListener('change', () => { state.date = dateEl.value || today(); });

  function draw() {
    const partner = partners.find((p) => p.id === state.partnerId);
    if (!partner) { body.replaceChildren(h('p', { class: 'empty' }, partners.length ? 'Pilih mart untuk mulai.' : 'Belum ada mart. Tambahkan dulu di menu Mitra.')); return; }

    const open = ctx.data.deliveries.filter((d) => d.partnerId === partner.id && d.remaining > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const totalOpen = open.reduce((s, d) => s + d.remaining, 0);
    const warehouse = ctx.data.batches.reduce((s, b) => s + Math.max(0, b.stockWarehouse), 0);
    if (!state.newPrice && state.newPrice !== 0) state.newPrice = partner.price || '';

    const summary = h('div', { class: 'bill' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Simpan order');

    function refresh() {
      // Hitung tagihan dengan urutan yang sama seperti server: pengiriman tertua dulu.
      let need = state.sold; let bill = 0;
      for (const d of open) { const t = Math.min(need, d.remaining); bill += t * (Number(d.price) || Number(partner.price) || 0); need -= t; }
      const handled = state.sold + state.returnedGood + state.returnedBad + state.expired;
      const over = handled > totalOpen;
      const after = totalOpen - handled + state.newQty;
      summary.replaceChildren(
        open.length ? h('div', { class: 'kv' }, h('span', {}, `Laku ${int(state.sold)} botol`), h('span', {}, rp(bill))) : null,
        open.length ? h('div', { class: 'kv total' }, h('span', {}, state.paid ? 'Uang yang diterima' : 'Tagihan (belum dibayar)'), h('span', {}, rp(bill))) : null,
        h('div', { class: 'kv' }, h('span', {}, 'Botol di mart setelah ini'), h('span', {}, `${int(Math.max(0, after))} botol`)),
        state.newQty > 0 ? h('div', { class: 'kv' }, h('span', {}, 'Nilai order baru'), h('span', {}, rp(state.newQty * (Number(state.newPrice) || 0)))) : null);
      err.textContent = over ? `Jumlahnya ${int(handled)} botol, padahal di mart hanya ${int(totalOpen)} botol.` : state.newQty > warehouse ? `Stok gudang sekarang ${int(warehouse)} botol (botol kembali yang layak akan menambah stok).` : '';
      save.disabled = over || handled + state.newQty === 0;
    }
    const num = (key, placeholder) => { const el = numInput((v) => { state[key] = v; refresh(); }, placeholder); el.value = state[key] || ''; return el; };

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

    body.replaceChildren(
      open.length ? h('section', { class: 'panel' },
        h('h2', {}, 'Hasil dari order sebelumnya'),
        h('p', { class: 'muted', style: 'margin:4px 0 12px' }, `Di ${partner.name} masih ada ${int(totalOpen)} botol. Isi sesuai nota, yang belum dihitung tetap tercatat di mart.`),
        h('ul', { class: 'open-list' }, open.map((d) => h('li', {}, `${fmtDate(d.date)} · ${d.batchCode} · sisa ${int(d.remaining)} dari ${int(d.qty)} botol @ ${rp(d.price)}`))),
        h('div', { class: 'fields', style: 'margin-top:14px' },
          field('Laku (botol)', num('sold')), field('Kembali, masih layak', num('returnedGood')),
          field('Kembali, rusak', num('returnedBad')), field('Expired di mart', num('expired')),
          h('div', { class: 'field check full' }, h('label', {}, 'Mart sudah bayar sekarang'), paidBox)))
        : h('p', { class: 'muted', style: 'margin-bottom:14px' }, `${partner.name} belum punya botol dari kita. Ini order pertama, cukup catat botol yang dikirim.`),
      h('section', { class: 'panel' },
        h('h2', {}, 'Order baru'),
        h('p', { class: 'muted', style: 'margin:4px 0 12px' }, `Stok gudang saat ini ${int(warehouse)} botol. Diambil otomatis dari batch yang paling dekat expired.`),
        h('div', { class: 'fields' }, field('Botol dikirim', num('newQty')), field('Harga per botol (Rp)', priceEl))),
      summary, err, h('div', { class: 'form-actions' }, save));
    refresh();
  }

  function showResult(partner, r) {
    const lines = [
      r.sold > 0 ? h('div', { class: 'kv total' }, h('span', {}, `${r.paid ? 'Uang diterima' : 'Tagihan belum dibayar'} (${int(r.sold)} botol laku)`), h('span', {}, rp(r.revenue))) : null,
      r.delivered > 0 ? h('div', { class: 'kv' }, h('span', {}, `Dikirim ke ${partner.name}`), h('span', {}, `${int(r.delivered)} botol`)) : null,
      ...r.batches.map((b) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, `dari batch ${b.code}`), h('span', {}, `${int(b.qty)} botol`))),
      h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} sekarang`), h('span', {}, `${int(r.remainingAtPartner)} botol`)),
    ];
    openDialog(h('div', { class: 'dialog-body' }, h('h2', {}, 'Order tersimpan'), ...lines,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: closeDialog }, 'Selesai'))));
    toast('Order tersimpan');
  }

  root.replaceChildren(
    pageHeader('Order mart', 'Mart bayar saat order berikutnya. Pilih mart, isi hasil nota sebelumnya, lalu isi order barunya.'),
    h('section', { class: 'panel' }, h('div', { class: 'fields' }, field('Mart', pick), field('Tanggal', dateEl))),
    body);
  draw();
}
