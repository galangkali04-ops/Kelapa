// Mart: pilih mart, lalu klik "Tambah pengiriman" (botol 620 ml dan 600 ml diambil dari stok gudang).
// Mart titip jual punya tombol "Catat hasil nota". Beli putus dan langsung: botol yang dikirim otomatis terjual.
// Ada unduh PDF (tagihan mart dan laporan owner), HPP per botol, rincian bahan, dan riwayat pengiriman.
import { h, rp, int, fmtDate, today, pageHeader, openDialog, closeDialog, formShell, toast, dataTable, setChildren, confirmBox } from '../ui.js';
import { api } from '../api.js';
import { DEF } from '../config.js';
import { removeRow } from '../crudkit.js';
import { openPartnerForm } from './partnerform.js';
import { rangeFilters, pdfButton } from '../range.js';

const SIZES = ['620', '600'];
const badge = (text, cls = '') => h('span', { class: `badge ${cls}` }, text);
const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('span', { class: 'help' }, help) : null);
const numInput = (onInput, placeholder = '0') => {
  const el = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder });
  el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
  return el;
};
const sizeOf = (x) => x.size || '600';

const SCHEME = { titip: 'Titip jual', putus: 'Beli putus', langsung: 'Langsung' };
const isTitip = (p) => (p.scheme || 'titip') === 'titip';

// Riwayat pengiriman saja. Satu baris = satu kali kirim (620 dan 600 digabung).
function deliveryRows(ctx, partnerId) {
  const groups = new Map();
  for (const d of ctx.data.deliveries) {
    if (partnerId && d.partnerId !== partnerId) continue;
    const key = `${d.partnerId}|${d.createdAt || d.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.values()].map((list) => {
    const ids = new Set(list.map((d) => d.id));
    const sales = ctx.data.sales.filter((s) => ids.has(s.deliveryId));
    const per = (z) => list.filter((d) => sizeOf(d) === z).reduce((n, d) => n + d.qty, 0);
    return {
      key: list[0].id, ids: [...ids], date: list[0].date, createdAt: list[0].createdAt || '', partnerName: list[0].partnerName,
      q620: per('620'), q600: per('600'),
      value: list.reduce((n, d) => n + d.qty * d.price, 0),
      remaining: list.reduce((n, d) => n + d.remaining, 0),
      hasSales: sales.length > 0, unpaid: sales.some((x) => !x.paid),
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
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

  const newPartner = () => openPartnerForm(null, ctx, { after: (saved) => history.replaceState(null, '', `#/visit?partner=${saved.id}`) });

  const warehouse = (z) => ctx.data.batches.filter((b) => sizeOf(b) === z).reduce((s, b) => s + Math.max(0, b.stockWarehouse), 0);
  // HPP air kelapa per botol: rata-rata dari stok gudang, atau produksi terakhir kalau stok kosong.
  const waterHpp = (z) => {
    const lots = ctx.data.batches.filter((b) => sizeOf(b) === z);
    const stocked = lots.filter((b) => b.stockWarehouse > 0);
    const q = stocked.reduce((s, b) => s + b.stockWarehouse, 0);
    if (q > 0) return stocked.reduce((s, b) => s + b.hpp * b.stockWarehouse, 0) / q;
    const last = lots.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    return last ? last.hpp : 0;
  };
  const packOfPartner = (partner, z) => Number((partner.packCost || {})[z]) || 0;
  const hasRecipe = (partner) => SIZES.some((z) => ((partner.packDetail || {})[z] || []).length > 0);
  const openOf = (partner) => ctx.data.deliveries.filter((d) => d.partnerId === partner.id && d.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));

  function historySection(partnerId) {
    const sizes = (r) => [r.q620 ? `620 ml × ${int(r.q620)}` : '', r.q600 ? `600 ml × ${int(r.q600)}` : ''].filter(Boolean).join(' · ');
    const cols = [
      { key: 'date', label: 'Tanggal', type: 'date' },
      ...(partnerId ? [] : [{ key: 'partnerName', label: 'Mart' }]),
      { key: 'sizes', label: 'Pengiriman', render: sizes },
      { key: 'value', label: 'Nilai', type: 'rp' },
      { key: 'status', label: 'Status', render: (r) => {
        const p = partners.find((x) => x.name === r.partnerName);
        if (r.hasSales && p && !isTitip(p)) return badge(r.unpaid ? 'Belum dibayar' : 'Lunas', r.unpaid ? 'warn' : 'ok');
        return r.remaining > 0 ? `Sisa ${int(r.remaining)} di mart` : 'Habis';
      } },
    ];
    return h('section', { class: 'panel flush' },
      h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Riwayat pengiriman'), h('p', { class: 'muted' }, 'Salah kirim? Hapus barisnya lalu catat ulang.')),
      dataTable(cols, deliveryRows(ctx, partnerId), {
        stack: true, emptyText: 'Belum ada pengiriman.',
        actions: (r) => [h('button', { class: 'btn small danger', onclick: () => removeDelivery(r) }, 'Hapus')],
      }));
  }

  async function removeDelivery(r) {
    if (!(await confirmBox(`Hapus pengiriman tanggal ${fmtDate(r.date)}?`))) return;
    try {
      for (const id of r.ids) await api(`/deliveries/${id}`, { method: 'DELETE' });
      toast('Pengiriman dihapus');
    } catch (e) { toast(e.message, 'error'); }
    await ctx.refresh();
  }

  async function markAllPaid(partner) {
    try {
      await api(`/partners/${partner.id}/paid`, { method: 'POST', body: {} });
      toast('Semua tagihan ditandai lunas');
      await ctx.refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  // Unduh PDF: pilih periode (hari ini, kemarin, 7 hari, bulan ini, atau atur tanggal), lalu pilih jenis PDF.
  function pdfSection(partner) {
    const box = h('div');
    const id = encodeURIComponent(partner.id);
    const draw = () => setChildren(box,
      rangeFilters(draw),
      h('div', { class: 'form-actions', style: 'justify-content:flex-start' },
        pdfButton(`/report/mart/${id}/bill/pdf`, 'PDF tagihan mart', true),
        pdfButton(`/report/mart/${id}/pdf`, 'PDF laporan owner')));
    draw();
    return h('section', { class: 'panel' }, h('h2', {}, 'Unduh PDF'),
      h('p', { class: 'muted', style: 'margin:4px 0 12px' }, 'Tagihan mart: botol terjual per hari dan total yang harus dibayar (tanpa HPP). Laporan owner: lengkap dengan HPP dan laba.'),
      box);
  }

  // ---------- Tambah pengiriman ----------
  function openDelivery(partner) {
    const st = { date: today(), qty: { 620: 0, 600: 0 }, price: {}, paid: true };
    const direct = !isTitip(partner); // beli putus / langsung: langsung terjual
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
        h('div', { class: 'kv total' }, h('span', {}, direct ? 'Total dikirim (langsung terjual)' : 'Total dikirim'), h('span', {}, `${int(total)} botol`)),
        h('div', { class: 'kv' }, h('span', {}, 'Nilai pengiriman'), h('span', {}, rp(value))),
        ...(direct ? [] : [h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} setelah ini`), h('span', {}, `${int(totalOpen + total)} botol`))]),
        ...SIZES.map((z) => h('div', { class: 'kv' }, h('span', {}, `Sisa stok gudang ${z} ml`), h('span', {}, `${int(Math.max(0, warehouse(z) - st.qty[z]))} botol`))),
        ...SIZES.filter((z) => st.qty[z] > 0).map((z) => h('div', { class: 'kv' }, h('span', {}, `HPP botol ${z} ml (air ${rp(waterHpp(z))} + kemasan ${rp(packOfPartner(partner, z))})`), h('span', {}, rp(waterHpp(z) + packOfPartner(partner, z))))));
    };
    const paidBox = h('input', { type: 'checkbox', checked: true });
    paidBox.addEventListener('change', () => { st.paid = paidBox.checked; });
    const rows = SIZES.map((z) => {
      const qty = numInput((v) => { st.qty[z] = v; refresh(); });
      const price = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: st.price[z] });
      price.addEventListener('input', () => { st.price[z] = price.value; refresh(); });
      return h('div', { class: 'fields', style: 'margin-top:10px' },
        field(`Botol ${z} ml · stok gudang ${int(warehouse(z))}`, qty), field(`Harga per botol ${z} ml (Rp)`, price));
    });
    formShell({
      title: `Tambah pengiriman · ${partner.name}`, submitLabel: 'Kirim',
      children: h('div', {},
        h('div', { class: 'fields' }, field('Tanggal kirim', dateEl),
          direct ? h('div', { class: 'field check full' }, h('label', {}, 'Mart sudah bayar'), paidBox) : null),
        ...rows, summary, warn),
      onSubmit: async () => {
        if (SIZES.every((z) => st.qty[z] === 0)) throw new Error('Isi jumlah botol yang dikirim.');
        const res = await api('/visits', { method: 'POST', body: { partnerId: partner.id, date: st.date, newQty: st.qty, newPrice: st.price, paid: st.paid } });
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
    const openTotal = open.reduce((n, d) => n + d.remaining, 0);
    const titip = isTitip(partner);
    const unpaid = ctx.data.sales.filter((x) => x.partnerId === partner.id && !x.paid).reduce((n, x) => n + x.total, 0);
    const info = [partner.type, SCHEME[partner.scheme || 'titip'], partner.address, partner.contact].filter(Boolean).join(' · ');
    setChildren(body,
      h('div', { class: 'row-actions', style: 'margin-bottom:12px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => choose('') }, 'Ganti mart'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openPartnerForm(partner, ctx) }, 'Ubah mart'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => removeRow(DEF.partners, partner, ctx, `mart ${partner.name}`) }, 'Hapus mart')),
      h('section', { class: 'panel' },
        h('h2', {}, partner.name),
        info ? h('p', { class: 'muted', style: 'margin:4px 0 0' }, info) : null,
        h('div', { class: 'stats', style: 'margin:12px 0' },
          ...(titip || openTotal > 0 ? SIZES.map((z) => h('div', { class: 'stat' }, h('div', { class: 'v' }, `${int(atMart(z))} botol`), h('div', { class: 'l' }, `Di ${partner.name} · ${z} ml`))) : []),
          unpaid > 0 ? h('div', { class: 'stat bad' }, h('div', { class: 'v' }, rp(unpaid)), h('div', { class: 'l' }, 'Belum dibayar')) : null),
        titip ? null : h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Botol yang dikirim langsung dihitung terjual. Cukup tentukan sudah dibayar atau belum saat mengirim.'),
        h('div', { class: 'form-actions', style: 'justify-content:flex-start' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => openDelivery(partner) }, 'Tambah pengiriman'),
          titip || openTotal > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => openNota(partner) }, 'Catat hasil nota') : null,
          unpaid > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => markAllPaid(partner) }, 'Tandai semua lunas') : null)),
      h('section', { class: 'panel' },
        h('h2', {}, 'HPP per botol'),
        h('p', { class: 'muted', style: 'margin:4px 0 0' }, 'Air kelapa dari produksi + botol kosong, stiker, dan bahan kemasan mart ini.'),
        h('div', { class: 'stats', style: 'margin:12px 0' },
          ...SIZES.map((z) => h('div', { class: 'stat' },
            h('div', { class: 'v' }, rp(waterHpp(z) + packOfPartner(partner, z))),
            h('div', { class: 'l' }, `HPP botol ${z} ml`),
            h('div', { class: 'muted', style: 'font-size:.85rem' }, `Air kelapa ${rp(waterHpp(z))} + kemasan ${rp(packOfPartner(partner, z))}`)))),
        hasRecipe(partner)
          ? h('details', { class: 'more' }, h('summary', {}, 'Rincian bahan kemasan per botol'),
            ...SIZES.filter((z) => (partner.packDetail[z] || []).length).map((z) => h('div', { style: 'margin-top:10px' },
              h('b', {}, `Botol kosong ${z} ml: ${rp(packOfPartner(partner, z))}`),
              ...partner.packDetail[z].map((r) => h('div', { class: 'kv' }, h('span', {}, `${r.name} × ${r.qty}`), h('span', {}, rp(r.sub)))))))
          : h('p', { class: 'form-error' }, 'Mart ini belum diisi bahan kemasan, jadi HPP belum termasuk botol dan stiker. ',
            h('button', { class: 'btn small', type: 'button', onclick: () => openPartnerForm(partner, ctx) }, 'Isi bahan kemasan'))),
      pdfSection(partner),
      historySection(partner.id));
  }

  function showResult(partner, r) {
    const lines = [
      r.sold > 0 ? h('div', { class: 'kv total' }, h('span', {}, `${r.paid ? (r.autoSold ? 'Sudah dibayar' : 'Uang diterima') : 'Tagihan belum dibayar'} (${int(r.sold)} ${r.autoSold ? 'terjual' : 'laku'})`), h('span', {}, rp(r.revenue))) : null,
      r.delivered > 0 ? h('div', { class: 'kv' }, h('span', {}, `Dikirim ke ${partner.name}`), h('span', {}, `${int(r.delivered)} botol`)) : null,
      ...r.batches.map((b) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, `${b.size} ml · dari ${b.code}`), h('span', {}, `${int(b.qty)} botol`))),
      r.autoSold ? null : h('div', { class: 'kv' }, h('span', {}, `Botol di ${partner.name} sekarang`), h('span', {}, `${int(r.remainingAtPartner)} botol`)),
    ];
    openDialog(h('div', { class: 'dialog-body' }, h('h2', {}, 'Tersimpan'), ...lines.filter(Boolean),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: closeDialog }, 'Selesai'))));
  }

  setChildren(root,
    pageHeader('Mart', 'Pilih mart, lalu klik Tambah pengiriman. Stok gudang 620 ml dan 600 ml langsung terpotong. Beli putus dan langsung otomatis terjual.',
      h('button', { class: 'btn primary', type: 'button', onclick: newPartner }, 'Mart baru')),
    ...(partners.length ? [h('section', { class: 'panel' }, h('div', { class: 'fields' }, field('Mart', pick)))] : []),
    body);
  draw();
}
