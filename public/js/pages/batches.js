// Produksi per batch: input bahan & biaya, hitung total modal dan HPP per botol.
import { h, rp, int, fmtDate, today, daysBetween, dataTable, pageHeader, formShell, formDialog, buildFields, confirmBox, openDialog, closeDialog, toast, setChildren } from '../ui.js';
import { api } from '../api.js';

const COST_SUGGESTIONS = ['Tenaga kerja', 'Gas / listrik', 'Ongkos kirim', 'Es batu', 'Dus / kemasan', 'Sewa tempat'];

// Kelapa yang dipakai di satu batch (bahan yang namanya mengandung "kelapa") dan hasil botolnya.
const coconutsUsed = (b) => (b.items || []).filter((i) => /kelapa/i.test(i.name)).reduce((s, i) => s + (Number(i.qty) || 0), 0);
const fmt2 = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

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
    { key: 'yield', label: 'Botol / kelapa', render: (b) => { const k = coconutsUsed(b); return k > 0 ? fmt2(b.goodBottles / k) : '—'; } },
    { key: 'stockWarehouse', label: 'Stok gudang', type: 'int' },
    { key: 'remainingAtPartners', label: 'Di mart', type: 'int' },
  ];

  // Botol di gudang yang sudah lewat expired (botol di mart dicatat lewat halaman Mart).
  function expireWarehouse(b) {
    formDialog({
      title: `Botol expired di gudang · ${b.code}`, ctx, submitLabel: 'Simpan',
      fields: [
        { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
        { key: 'qty', label: `Jumlah botol (gudang ${int(b.stockWarehouse)})`, type: 'int', required: true },
        { key: 'note', label: 'Catatan', type: 'text' },
      ],
      onSubmit: async (v) => {
        await api('/expirations', { method: 'POST', body: { ...v, batchId: b.id } });
        toast('Botol expired dicatat');
        await ctx.refresh();
      },
    });
  }

  async function remove(b) {
    if (!(await confirmBox(`Hapus batch ${b.code}?`))) return;
    try { await api(`/batches/${b.id}`, { method: 'DELETE' }); toast('Batch dihapus'); await ctx.refresh(); } catch (e) { toast(e.message, 'error'); }
  }

  // Rata-rata semua batch: total botol jadi dibagi total kelapa. Berguna untuk memperkirakan belanja kelapa.
  const used = ctx.data.batches.filter((b) => coconutsUsed(b) > 0);
  const totalCoconuts = used.reduce((s, b) => s + coconutsUsed(b), 0);
  const totalBottles = used.reduce((s, b) => s + (Number(b.goodBottles) || 0), 0);
  const yieldInfo = totalCoconuts > 0 && totalBottles > 0
    ? h('p', { class: 'yield-note' },
      h('b', {}, `1 kelapa ≈ ${fmt2(totalBottles / totalCoconuts)} botol`),
      ` (rata-rata ${used.length} batch). Untuk 100 botol siapkan sekitar ${Math.ceil(100 * totalCoconuts / totalBottles)} kelapa.`)
    : null;

  setChildren(root, 
    pageHeader('Produksi', 'Isi botol jadi dan kelapa yang dipakai. Botol, tutup, dan label terisi otomatis, HPP per botol dihitung sendiri.',
      h('button', { class: 'btn primary', onclick: () => openBatchForm(null, ctx) }, 'Tambah batch')),
    ...(yieldInfo ? [yieldInfo] : []),
    h('div', { class: 'panel flush' }, dataTable(columns, ctx.data.batches, {
      stack: true,
      emptyText: 'Belum ada batch. Klik "Tambah batch" untuk mencatat produksi pertama.',
      actions: (b) => [
        h('button', { class: 'btn small', onclick: () => showDetail(b) }, 'Rincian'),
        b.stockWarehouse > 0 ? h('button', { class: 'btn small', onclick: () => expireWarehouse(b) }, 'Expired') : null,
        h('button', { class: 'btn small', onclick: () => openBatchForm(b, ctx) }, 'Ubah'),
        h('button', { class: 'btn small danger', onclick: () => remove(b) }, 'Hapus'),
      ].filter(Boolean),
    })));

  if (ctx.params && ctx.params.has('add')) { history.replaceState(null, '', `#/${page.id}`); openBatchForm(null, ctx); }
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
  const mainFields = [
    { key: 'date', label: 'Tanggal produksi', type: 'date', required: true, default: 'today' },
    { key: 'goodBottles', label: 'Botol jadi (layak jual)', type: 'int', required: true },
    { key: 'rejectBottles', label: 'Botol gagal produksi', type: 'int', default: 0 },
  ];
  const moreFields = [
    { key: 'code', label: 'Kode batch', type: 'text', help: 'Kosongkan untuk dibuat otomatis.' },
    { key: 'shelfLifeDays', label: 'Masa simpan (hari)', type: 'int', required: true, default: () => ctx.settings.shelfLifeDays },
    { key: 'note', label: 'Catatan', type: 'text', full: true },
  ];
  const A = buildFields(mainFields, batch || {}, ctx);
  const B = buildFields(moreFields, batch || {}, ctx);
  const inputs = { ...A.inputs, ...B.inputs };
  const getValues = () => ({ ...A.getValues(), ...B.getValues() });
  const top = h('div', {}, A.node, h('details', { class: 'more' }, h('summary', {}, 'Kode batch, masa simpan, catatan'), B.node));

  // Batch baru: semua bahan langsung muncul sebagai baris, tinggal isi jumlah.
  const items = isEdit
    ? batch.items.map((i) => ({ ...i }))
    : ctx.data.materials.map((m) => ({ materialId: m.id, name: m.name, unit: m.unit, qty: '', price: m.tracked ? m.avgCost : m.price }));
  const costs = isEdit ? batch.costs.map((c) => ({ ...c })) : [];

  const itemsBox = h('div'); const costsBox = h('div');
  const totalEl = h('strong'); const hppEl = h('strong');
  const breakdown = h('div', { class: 'breakdown' });

  const update = () => {
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0)
      + costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const good = Number(inputs.goodBottles.value) || 0;
    totalEl.textContent = rp(total);
    hppEl.textContent = good > 0 ? rp(total / good) : '—';
    // Rincian: tiap bahan = jumlah x harga, lalu dibagi botol jadi
    const rows = items.filter((i) => Number(i.qty) > 0).map((i) => {
      const sub = (Number(i.qty) || 0) * (Number(i.price) || 0);
      return h('div', { class: 'kv' }, h('span', {}, `${i.name}: ${Number(i.qty)} × ${rp(Number(i.price) || 0)} = ${rp(sub)}`), h('span', {}, good > 0 ? `${rp(sub / good)} / botol` : ''));
    });
    const other = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    if (other > 0) rows.push(h('div', { class: 'kv' }, h('span', {}, 'Biaya lain'), h('span', {}, good > 0 ? `${rp(other / good)} / botol` : rp(other))));
    setChildren(breakdown, ...(rows.length ? [h('h3', {}, good > 0 ? `Biaya per botol (dibagi ${int(good)} botol jadi)` : 'Isi botol jadi untuk melihat biaya per botol'), ...rows] : []));
  };
  inputs.goodBottles.addEventListener('input', update);

  const numInput = (value, onInput, ph) => {
    const el = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: ph });
    el.value = value; el.addEventListener('input', () => onInput(el.value)); return el;
  };

  function drawItems() {
    setChildren(itemsBox, h('div', { class: 'line head' }, h('span', {}, 'Bahan'), h('span', {}, 'Jumlah'), h('span', {}, 'Harga satuan'), h('span', { style: 'text-align:right' }, 'Subtotal'), h('span')));
    items.forEach((row, idx) => {
      const sel = h('select', { 'aria-label': 'Bahan' });
      for (const m of ctx.data.materials) sel.append(h('option', { value: m.id }, m.name));
      if (!ctx.data.materials.some((m) => m.id === row.materialId)) sel.append(h('option', { value: row.materialId }, `${row.name} (dihapus)`));
      sel.value = row.materialId;
      const sub = h('span', { class: 'sub' });
      const refreshSub = () => { sub.textContent = rp((Number(row.qty) || 0) * (Number(row.price) || 0)); update(); };
      const mat = () => ctx.data.materials.find((x) => x.id === row.materialId);
      const price = numInput(row.price, (v) => { row.price = v; refreshSub(); }, 'Harga');
      // Bahan yang belanjanya sudah dicatat memakai harga rata-rata stok, tidak perlu diketik.
      const syncTracked = () => {
        const m = mat();
        price.disabled = !!(m && m.tracked);
        price.title = price.disabled ? 'Otomatis dari harga rata-rata stok' : '';
        if (m && m.tracked) { row.price = m.avgCost; price.value = m.avgCost; }
      };
      sel.addEventListener('change', () => {
        const m = ctx.data.materials.find((x) => x.id === sel.value);
        if (m) { Object.assign(row, { materialId: m.id, name: m.name, unit: m.unit, price: m.tracked ? m.avgCost : m.price }); price.value = row.price; syncTracked(); refreshSub(); }
      });
      syncTracked();
      refreshSub();
      const qtyEl = numInput(row.qty, (v) => { row.qty = v; refreshSub(); }, mat() && mat().tracked ? `stok ${mat().stockQty}` : (row.unit || 'Jumlah'));
      itemsBox.append(h('div', { class: 'line' }, sel, qtyEl, price, sub,
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
    h('div', { class: 'lines' }, h('h3', {}, 'Bahan yang dipakai'), h('p', { class: 'muted', style: 'margin:-4px 0 8px' }, 'Isi jumlah yang benar-benar terpakai. Biaya per botol = jumlah × harga per pcs ÷ botol jadi.'), itemsBox,
      h('button', { type: 'button', class: 'btn small', onclick: () => { const m = ctx.data.materials[0]; items.push({ materialId: m ? m.id : '', name: m ? m.name : '', unit: m ? m.unit : '', qty: '', price: m ? (m.tracked ? m.avgCost : m.price) : 0 }); drawItems(); } }, 'Tambah bahan')),
    h('div', { class: 'lines' }, h('h3', {}, 'Biaya lain (tenaga kerja, gas, ongkir, dll)'), costsBox,
      h('datalist', { id: 'dl_costs' }, COST_SUGGESTIONS.map((s) => h('option', { value: s }))),
      h('button', { type: 'button', class: 'btn small', onclick: () => { costs.push({ name: '', amount: '' }); drawCosts(); } }, 'Tambah biaya')),
    breakdown,
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
