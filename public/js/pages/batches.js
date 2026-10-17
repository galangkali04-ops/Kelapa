// Produksi per batch: input bahan & biaya, hitung total modal dan HPP per botol.
import { h, rp, int, fmtDate, today, daysBetween, dataTable, pageHeader, formShell, buildFields, confirmBox, openDialog, closeDialog, toast } from '../ui.js';
import { api } from '../api.js';

const COST_SUGGESTIONS = ['Tenaga kerja', 'Gas / listrik', 'Ongkos kirim', 'Es batu', 'Dus / kemasan', 'Sewa tempat'];

function expiryCell(b) {
  if (b.stockTotal <= 0) return fmtDate(b.expiryDate);
  const left = daysBetween(b.expiryDate, today());
  if (left < 0) return h('span', { class: 'badge bad' }, `Lewat ${-left} hari`);
  if (left <= 2) return h('span', { class: 'badge warn' }, left === 0 ? 'Expired hari ini' : `${left} hari lagi`);
  return fmtDate(b.expiryDate);
}

export function renderBatches(root, page, ctx) {
  const columns = [
    { key: 'code', label: 'Kode batch' },
    { key: 'date', label: 'Produksi', type: 'date' },
    { key: 'expiryDate', label: 'Expired', render: expiryCell },
    { key: 'goodBottles', label: 'Botol jadi', type: 'int' },
    { key: 'totalCost', label: 'Total modal', type: 'rp' },
    { key: 'hpp', label: 'HPP per botol', type: 'rp' },
    { key: 'stockWarehouse', label: 'Stok gudang', type: 'int' },
    { key: 'remainingAtPartners', label: 'Di mitra', type: 'int' },
  ];

  async function remove(b) {
    if (!(await confirmBox(`Hapus batch ${b.code}?`))) return;
    try { await api(`/batches/${b.id}`, { method: 'DELETE' }); toast('Batch dihapus'); await ctx.refresh(); } catch (e) { toast(e.message, 'error'); }
  }

  root.replaceChildren(
    pageHeader('Produksi & HPP', 'Satu batch = satu kali produksi. Isi bahan yang dipakai dan biaya lain, HPP per botol dihitung otomatis.',
      h('button', { class: 'btn primary', onclick: () => openBatchForm(null, ctx) }, 'Tambah batch')),
    h('div', { class: 'panel flush' }, dataTable(columns, ctx.data.batches, {
      stack: true,
      emptyText: 'Belum ada batch. Klik "Tambah batch" untuk mencatat produksi pertama.',
      actions: (b) => [
        h('button', { class: 'btn small', onclick: () => showDetail(b) }, 'Rincian'),
        h('button', { class: 'btn small', onclick: () => openBatchForm(b, ctx) }, 'Ubah'),
        h('button', { class: 'btn small danger', onclick: () => remove(b) }, 'Hapus'),
      ],
    })));
}

function showDetail(b) {
  const rowsItems = (b.items || []).map((i) => ({ name: i.name, qty: `${int(i.qty)} ${i.unit || ''}`.trim(), price: i.price, sub: i.qty * i.price }));
  const rowsCosts = (b.costs || []).map((c) => ({ name: c.name, qty: '', price: '', sub: c.amount }));
  const cols = [{ key: 'name', label: 'Komponen' }, { key: 'qty', label: 'Jumlah' }, { key: 'price', label: 'Harga satuan', type: 'rp' }, { key: 'sub', label: 'Subtotal', type: 'rp' }];
  openDialog(h('div', { class: 'dialog-body wide' },
    h('h2', {}, `Rincian ${b.code}`),
    h('div', { class: 'detail-grid' },
      h('div', {}, h('b', {}, rp(b.totalCost)), h('span', {}, 'Total modal')),
      h('div', {}, h('b', {}, int(b.goodBottles)), h('span', {}, 'Botol jadi')),
      h('div', {}, h('b', {}, rp(b.hpp)), h('span', {}, 'HPP per botol')),
      h('div', {}, h('b', {}, int(b.rejectBottles)), h('span', {}, 'Botol gagal produksi')),
      h('div', {}, h('b', {}, int(b.sold)), h('span', {}, 'Terjual')),
      h('div', {}, h('b', {}, rp(b.grossProfit)), h('span', {}, 'Gross profit batch ini'))),
    dataTable(cols, [...rowsItems, ...rowsCosts], { emptyText: 'Belum ada rincian bahan.' }),
    h('p', { class: 'muted', style: 'margin-top:12px' }, `HPP = total modal ${rp(b.totalCost)} dibagi ${int(b.goodBottles)} botol jadi. Botol gagal tidak ikut dibagi, jadi biayanya tertanggung di HPP.`),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', onclick: closeDialog }, 'Tutup'))));
}

function openBatchForm(batch, ctx) {
  const isEdit = !!batch;
  const baseFields = [
    { key: 'date', label: 'Tanggal produksi', type: 'date', required: true, default: 'today' },
    { key: 'code', label: 'Kode batch', type: 'text', help: 'Kosongkan untuk dibuat otomatis.' },
    { key: 'shelfLifeDays', label: 'Masa simpan (hari)', type: 'int', required: true, default: () => ctx.settings.shelfLifeDays },
    { key: 'goodBottles', label: 'Botol jadi (layak jual)', type: 'int', required: true },
    { key: 'rejectBottles', label: 'Botol gagal produksi', type: 'int', default: 0 },
    { key: 'note', label: 'Catatan', type: 'text' },
  ];
  const { node: top, inputs, getValues } = buildFields(baseFields, batch || {}, ctx);

  // Batch baru: semua bahan langsung muncul sebagai baris, tinggal isi jumlah.
  const items = isEdit
    ? batch.items.map((i) => ({ ...i }))
    : ctx.data.materials.map((m) => ({ materialId: m.id, name: m.name, unit: m.unit, qty: '', price: m.price }));
  const costs = isEdit ? batch.costs.map((c) => ({ ...c })) : [];

  const itemsBox = h('div'); const costsBox = h('div');
  const totalEl = h('strong'); const hppEl = h('strong');

  const update = () => {
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0)
      + costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const good = Number(inputs.goodBottles.value) || 0;
    totalEl.textContent = rp(total);
    hppEl.textContent = good > 0 ? rp(total / good) : '—';
  };
  inputs.goodBottles.addEventListener('input', update);

  const numInput = (value, onInput, ph) => {
    const el = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: ph });
    el.value = value; el.addEventListener('input', () => onInput(el.value)); return el;
  };

  function drawItems() {
    itemsBox.replaceChildren(h('div', { class: 'line head' }, h('span', {}, 'Bahan'), h('span', {}, 'Jumlah'), h('span', {}, 'Harga satuan'), h('span', { style: 'text-align:right' }, 'Subtotal'), h('span')));
    items.forEach((row, idx) => {
      const sel = h('select', { 'aria-label': 'Bahan' });
      for (const m of ctx.data.materials) sel.append(h('option', { value: m.id }, m.name));
      if (!ctx.data.materials.some((m) => m.id === row.materialId)) sel.append(h('option', { value: row.materialId }, `${row.name} (dihapus)`));
      sel.value = row.materialId;
      const sub = h('span', { class: 'sub' });
      const refreshSub = () => { sub.textContent = rp((Number(row.qty) || 0) * (Number(row.price) || 0)); update(); };
      const price = numInput(row.price, (v) => { row.price = v; refreshSub(); }, 'Harga');
      sel.addEventListener('change', () => {
        const m = ctx.data.materials.find((x) => x.id === sel.value);
        if (m) { Object.assign(row, { materialId: m.id, name: m.name, unit: m.unit, price: m.price }); price.value = m.price; refreshSub(); }
      });
      refreshSub();
      itemsBox.append(h('div', { class: 'line' }, sel, numInput(row.qty, (v) => { row.qty = v; refreshSub(); }, row.unit || 'Jumlah'), price, sub,
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Hapus baris', onclick: () => { items.splice(idx, 1); drawItems(); } }, '✕')));
    });
  }

  function drawCosts() {
    costsBox.replaceChildren();
    costs.forEach((row, idx) => {
      const name = h('input', { type: 'text', list: 'dl_costs', placeholder: 'Nama biaya', autocomplete: 'off' });
      name.value = row.name; name.addEventListener('input', () => { row.name = name.value; });
      costsBox.append(h('div', { class: 'line cost' }, name, numInput(row.amount, (v) => { row.amount = v; update(); }, 'Nominal (Rp)'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Hapus baris', onclick: () => { costs.splice(idx, 1); drawCosts(); update(); } }, '✕')));
    });
  }

  drawItems(); drawCosts(); update();

  const content = h('div', {},
    top,
    h('div', { class: 'lines' }, h('h3', {}, 'Bahan yang dipakai'), itemsBox,
      h('button', { type: 'button', class: 'btn small', onclick: () => { const m = ctx.data.materials[0]; items.push({ materialId: m ? m.id : '', name: m ? m.name : '', unit: m ? m.unit : '', qty: '', price: m ? m.price : 0 }); drawItems(); } }, 'Tambah bahan')),
    h('div', { class: 'lines' }, h('h3', {}, 'Biaya lain (tenaga kerja, gas, ongkir, dll)'), costsBox,
      h('datalist', { id: 'dl_costs' }, COST_SUGGESTIONS.map((s) => h('option', { value: s }))),
      h('button', { type: 'button', class: 'btn small', onclick: () => { costs.push({ name: '', amount: '' }); drawCosts(); } }, 'Tambah biaya')),
    h('div', { class: 'preview' }, h('span', {}, 'Total modal: ', totalEl), h('span', {}, 'HPP per botol: ', hppEl)));

  formShell({
    title: isEdit ? `Ubah batch ${batch.code}` : 'Tambah batch produksi', wide: true, children: content,
    onSubmit: async () => {
      const body = {
        ...getValues(),
        items: items.filter((i) => Number(i.qty) > 0).map((i) => ({ materialId: i.materialId, name: i.name, unit: i.unit, qty: Number(i.qty), price: Number(i.price) || 0 })),
        costs: costs.filter((c) => c.name && Number(c.amount) > 0).map((c) => ({ name: c.name, amount: Number(c.amount) })),
      };
      await api(isEdit ? `/batches/${batch.id}` : '/batches', { method: isEdit ? 'PUT' : 'POST', body });
      toast(isEdit ? 'Batch diperbarui' : 'Batch ditambahkan');
      await ctx.refresh();
    },
  });
}
