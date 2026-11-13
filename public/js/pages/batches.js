// Produksi sederhana: isi tanggal, kelapa yang dipotong, jumlah botol 620 ml dan 600 ml. Selesai.
// Total liter dan liter per kelapa langsung dihitung. Stok gudang dicatat per ukuran botol.
import { h, rp, int, fmtDate, today, daysBetween, dayGroups, dataTable, pageHeader, formShell, formDialog, openDialog, closeDialog, confirmBox, toast, setChildren } from '../ui.js';
import { api } from '../api.js';

const SIZES = ['620', '600'];
const LITER = { 620: 0.62, 600: 0.6 };
const COST_SUGGESTIONS = ['Tenaga kerja', 'Gas / listrik', 'Ongkos kirim', 'Es batu', 'Dus / kemasan', 'Sewa tempat'];
const openDays = new Set();
const fmt2 = (n) => (Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const liters = (q620, q600) => (Number(q620) || 0) * LITER[620] + (Number(q600) || 0) * LITER[600];

function expiryCell(p) {
  if (!p.expiryDate) return '';
  if (p.stockTotal <= 0) return fmtDate(p.expiryDate);
  const left = daysBetween(p.expiryDate, today());
  if (left < 0) return h('span', { class: 'badge bad' }, `Lewat ${-left} hari`);
  if (left <= 2) return h('span', { class: 'badge warn' }, left === 0 ? 'Expired hari ini' : `${left} hari lagi`);
  return fmtDate(p.expiryDate);
}

const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));

export function renderBatches(root, page, ctx) {
  const prods = ctx.data.productions || [];
  const batches = ctx.data.batches || [];
  // Total botol yang keluar (dikirim ke mart) pada satu tanggal.
  const outOn = (date) => (ctx.data.deliveries || []).filter((d) => d.date === date).reduce((n, d) => n + (Number(d.qty) || 0), 0);
  const stock = (z) => batches.filter((b) => (b.size || '600') === z).reduce((s, b) => s + Math.max(0, b.stockWarehouse), 0);

  const columns = [
    { key: 'code', label: 'Kode', render: (p) => h('button', { class: 'row-link', type: 'button', title: 'Lihat rincian', onclick: () => showDetail(p) }, p.code) },
    { key: 'coconuts', label: 'Kelapa', type: 'int' },
    { key: 'qty620', label: 'Botol 620 ml', type: 'int' },
    { key: 'qty600', label: 'Botol 600 ml', type: 'int' },
    { key: 'totalLiters', label: 'Total liter', render: (p) => `${fmt2(p.totalLiters)} L` },
    { key: 'litersPerCoconut', label: 'Liter / kelapa', render: (p) => `${fmt2(p.litersPerCoconut)} L` },
    { key: 'totalCost', label: 'Total modal', type: 'rp' },
    { key: 'stockWarehouse', label: 'Stok gudang', type: 'int' },
    { key: 'expiryDate', label: 'Expired', render: expiryCell },
  ];

  // Botol expired di gudang: pilih ukuran yang masih ada stoknya.
  function expireWarehouse(p) {
    const lots = p.lots.filter((b) => b.stockWarehouse > 0);
    formDialog({
      title: `Botol expired di gudang · ${p.code}`, ctx, submitLabel: 'Simpan',
      fields: [
        { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
        { key: 'batchId', label: 'Ukuran botol', type: 'select', required: true, options: lots.map((b) => ({ value: b.id, label: `${b.size} ml · stok gudang ${int(b.stockWarehouse)}` })) },
        { key: 'qty', label: 'Jumlah botol expired', type: 'int', required: true },
        { key: 'note', label: 'Catatan', type: 'text' },
      ],
      onSubmit: async (v) => {
        await api('/expirations', { method: 'POST', body: v });
        toast('Botol expired dicatat');
        await ctx.refresh();
      },
    });
  }

  async function remove(p) {
    if (!(await confirmBox(`Hapus produksi ${p.code}?`))) return;
    try { await api(`/productions/${p.id}`, { method: 'DELETE' }); toast('Produksi dihapus'); await ctx.refresh(); } catch (e) { toast(e.message, 'error'); }
  }

  // Rata-rata semua produksi, untuk memperkirakan berapa kelapa yang perlu dibeli.
  const totalCoco = prods.reduce((s, p) => s + p.coconuts, 0);
  const totalL = prods.reduce((s, p) => s + p.totalLiters, 0);
  const totalB = prods.reduce((s, p) => s + p.totalBottles, 0);
  const yieldInfo = totalCoco > 0 && totalL > 0
    ? h('p', { class: 'yield-note' },
      h('b', {}, `1 kelapa ≈ ${fmt2(totalL / totalCoco)} liter (${fmt2(totalB / totalCoco)} botol)`),
      ` · rata-rata ${prods.length} produksi. Untuk 100 botol siapkan sekitar ${Math.ceil(100 * totalCoco / totalB)} kelapa.`)
    : null;

  setChildren(root,
    pageHeader('Produksi', 'Isi kelapa yang dipotong dan jumlah botol 620 ml dan 600 ml. Total liter dan HPP air kelapa dihitung otomatis. Botol kosong dan stiker dihitung per mart saat pengiriman.',
      h('button', { class: 'btn primary', onclick: () => openProductionForm(null, ctx) }, 'Catat produksi')),
    h('div', { class: 'stats' },
      stat(`${int(stock('620'))} botol`, 'Stok gudang 620 ml'),
      stat(`${int(stock('600'))} botol`, 'Stok gudang 600 ml')),
    ...(yieldInfo ? [yieldInfo] : []),
    dayGroups(prods, {
      keep: openDays,
      emptyText: 'Belum ada produksi. Klik "Catat produksi" untuk mulai.',
      meta: (date, list) => [
        `${int(list.reduce((n, p) => n + p.coconuts, 0))} kelapa`,
        h('b', {}, `${fmt2(list.reduce((n, p) => n + p.totalLiters, 0))} liter`),
        `${int(list.reduce((n, p) => n + p.totalBottles, 0))} botol`,
        h('b', {}, `Keluar ${int(outOn(date))} botol`),
        `Modal ${rp(list.reduce((n, p) => n + p.totalCost, 0))}`,
        list.some((p) => p.stockTotal > 0 && daysBetween(p.expiryDate, today()) < 0) ? h('span', { class: 'badge bad' }, 'Ada yang lewat expired') : null,
      ],
      body: (list) => dataTable(columns, list, {
        stack: true,
        actions: (p) => [
          p.stockWarehouse > 0 ? h('button', { class: 'btn small', onclick: () => expireWarehouse(p) }, 'Expired') : null,
          h('button', { class: 'btn small', onclick: () => openProductionForm(p, ctx) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => remove(p) }, 'Hapus'),
        ].filter(Boolean),
      }),
    }));

  if (ctx.params && ctx.params.has('add')) { history.replaceState(null, '', `#/${page.id}`); openProductionForm(null, ctx); }
}

function showDetail(p) {
  const rowsItems = p.items.map((i) => ({ name: i.name, qty: `${fmt2(i.qty)} ${i.unit || ''}`.trim(), price: i.price, sub: i.qty * i.price }));
  const rowsCosts = p.costs.map((c) => ({ name: c.name, qty: '', price: '', sub: c.amount }));
  const cols = [{ key: 'name', label: 'Komponen' }, { key: 'qty', label: 'Jumlah' }, { key: 'price', label: 'Harga satuan', type: 'rp' }, { key: 'sub', label: 'Subtotal', type: 'rp' }];
  const lotCols = [
    { key: 'size', label: 'Ukuran', render: (b) => `${b.size} ml` },
    { key: 'goodBottles', label: 'Botol', type: 'int' },
    { key: 'totalCost', label: 'Modal', type: 'rp' },
    { key: 'hpp', label: 'HPP / botol', type: 'rp' },
    { key: 'stockWarehouse', label: 'Stok gudang', type: 'int' },
    { key: 'remainingAtPartners', label: 'Di mart', type: 'int' },
    { key: 'sold', label: 'Terjual', type: 'int' },
  ];
  const coco = p.lots[0] && p.lots[0].items[0];
  const cocoCost = p.lots.reduce((s, b) => s + (b.items[0] ? b.items[0].qty * b.items[0].price : 0), 0);
  openDialog(h('div', { class: 'dialog-body wide' },
    h('h2', {}, `Rincian ${p.code}`),
    h('div', { class: 'detail-grid' },
      h('div', {}, h('b', {}, fmtDate(p.date)), h('span', {}, 'Tanggal produksi')),
      h('div', {}, h('b', {}, int(p.coconuts)), h('span', {}, 'Kelapa dipotong')),
      h('div', {}, h('b', {}, `${fmt2(p.totalLiters)} L`), h('span', {}, 'Total air kelapa')),
      h('div', {}, h('b', {}, `${fmt2(p.litersPerCoconut)} L`), h('span', {}, 'Liter per kelapa')),
      h('div', {}, h('b', {}, int(p.qty620)), h('span', {}, 'Botol 620 ml')),
      h('div', {}, h('b', {}, int(p.qty600)), h('span', {}, 'Botol 600 ml')),
      h('div', {}, h('b', {}, rp(p.totalCost)), h('span', {}, 'Total modal')),
      h('div', {}, h('b', {}, fmtDate(p.expiryDate)), h('span', {}, 'Expired'))),
    h('h3', { style: 'margin:16px 0 8px' }, 'Per ukuran botol'),
    dataTable(lotCols, p.lots, { stack: true }),
    h('h3', { style: 'margin:16px 0 8px' }, 'Bahan dan biaya (total produksi)'),
    dataTable(cols, [
      ...(coco ? [{ name: coco.name, qty: `${int(p.coconuts)} ${coco.unit || ''}`.trim(), price: p.coconuts > 0 ? cocoCost / p.coconuts : 0, sub: cocoCost }] : []),
      ...rowsItems, ...rowsCosts,
    ], { emptyText: 'Belum ada rincian bahan.' }),
    h('p', { class: 'muted', style: 'margin-top:12px' }, 'Modal dibagi ke botol 620 ml dan 600 ml sesuai total liter masing-masing.'),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', onclick: closeDialog }, 'Tutup'))));
}

function openProductionForm(prod, ctx) {
  const isEdit = !!prod;
  const mats = ctx.data.materials || [];
  const cocoMat = mats.find((m) => /kelapa/i.test(m.name));
  const others = mats.filter((m) => !cocoMat || m.id !== cocoMat.id);
  const priceOf = (m) => (m.tracked ? m.avgCost : m.price) || 0;

  // Isian utama: hanya 4 hal.
  const mk = (id, label, value, ph) => {
    const el = h('input', { id, type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: ph || '0' });
    el.value = value ?? '';
    return h('div', { class: 'field' }, h('label', { for: id }, label), el);
  };
  const dateEl = h('input', { id: 'p_date', type: 'date', required: true, value: prod ? prod.date : today() });
  const cocoEl = mk('p_coco', 'Kelapa dipotong (butir)', prod ? prod.coconuts : '', 'mis. 50');
  const q620El = mk('p_620', 'Total botol 620 ml', prod ? prod.qty620 : '');
  const q600El = mk('p_600', 'Total botol 600 ml', prod ? prod.qty600 : '');
  const inp = (w) => w.querySelector('input');
  const main = h('div', { class: 'fields' },
    h('div', { class: 'field' }, h('label', { for: 'p_date' }, 'Tanggal produksi'), dateEl), cocoEl, q620El, q600El);

  // Bahan lain: baris untuk tiap bahan selain kelapa. Botol, tutup, label otomatis mengikuti total botol sampai diketik manual.
  const items = isEdit
    ? others.map((m) => {
      const found = prod.items.find((i) => i.materialId === m.id);
      return { materialId: m.id, name: m.name, unit: m.unit, qty: found ? found.qty : '', price: found ? found.price : priceOf(m), auto: false, m };
    })
    : others.map((m) => ({ materialId: m.id, name: m.name, unit: m.unit, qty: '', price: priceOf(m), auto: false, m }));
  const costs = isEdit ? prod.costs.map((c) => ({ ...c })) : [];

  const itemsBox = h('div'); const costsBox = h('div');
  const literEl = h('div', { class: 'yield-note' });
  const outEl = h('p', { class: 'yield-note', style: 'margin-top:10px' });
  const showOut = () => {
    const rows = (ctx.data.deliveries || []).filter((d) => d.date === dateEl.value);
    const by = (z) => rows.filter((d) => (d.size || '600') === z).reduce((n, d) => n + (Number(d.qty) || 0), 0);
    const total = rows.reduce((n, d) => n + (Number(d.qty) || 0), 0);
    setChildren(outEl, h('b', {}, `Botol keluar pada ${fmtDate(dateEl.value)}: ${int(total)} botol`), total > 0 ? ` (620 ml: ${int(by('620'))} · 600 ml: ${int(by('600'))})` : ' · belum ada pengiriman ke mart');
  };
  dateEl.addEventListener('change', showOut);
  showOut();
  const costNote = h('div', { class: 'breakdown' });
  const totalEl = h('strong');

  const vals = () => ({ coco: Number(inp(cocoEl).value) || 0, q620: Number(inp(q620El).value) || 0, q600: Number(inp(q600El).value) || 0 });
  const cocoPrice = () => (cocoMat ? priceOf(cocoMat) : 0);

  const update = () => {
    const { coco, q620, q600 } = vals();
    const totalBottles = q620 + q600;
    for (const r of items) if (r.auto) { r.qty = totalBottles > 0 ? totalBottles : ''; if (r.input) r.input.value = r.qty; }
    const L = liters(q620, q600);
    setChildren(literEl,
      L > 0 && coco > 0
        ? [h('b', {}, `Total air kelapa: ${fmt2(L)} liter`), ` · ${fmt2(L / coco)} liter per kelapa · ${fmt2(totalBottles / coco)} botol per kelapa`]
        : h('span', { class: 'muted' }, 'Isi kelapa dan jumlah botol untuk melihat total liter.'));
    const itemsTotal = items.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
    const costsTotal = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const total = coco * cocoPrice() + itemsTotal + costsTotal;
    totalEl.textContent = rp(total);
    const rows = [];
    if (L > 0) {
      for (const z of SIZES) {
        const q = z === '620' ? q620 : q600;
        if (q > 0) rows.push(h('div', { class: 'kv' }, h('span', {}, `HPP botol ${z} ml (${int(q)} botol)`), h('span', {}, rp((total * ((q * LITER[z]) / L)) / q))));
      }
    }
    setChildren(costNote, rows);
  };
  for (const w of [cocoEl, q620El, q600El]) inp(w).addEventListener('input', update);

  const numInput = (value, onInput, ph) => {
    const el = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: ph });
    el.value = value; el.addEventListener('input', () => onInput(el.value)); return el;
  };

  function drawItems() {
    setChildren(itemsBox, h('div', { class: 'line head' }, h('span', {}, 'Bahan'), h('span', {}, 'Jumlah'), h('span', {}, 'Harga satuan'), h('span', { style: 'text-align:right' }, 'Subtotal'), h('span')));
    items.forEach((row) => {
      const sub = h('span', { class: 'sub' });
      const refreshSub = () => { sub.textContent = rp((Number(row.qty) || 0) * (Number(row.price) || 0)); };
      const price = numInput(row.price, (v) => { row.price = v; refreshSub(); update(); }, 'Harga');
      if (row.m && row.m.tracked) { price.disabled = true; price.title = 'Otomatis dari harga rata-rata stok'; }
      const qty = numInput(row.qty, (v) => { row.qty = v; row.auto = false; refreshSub(); update(); }, row.m && row.m.tracked ? `stok ${row.m.stockQty}` : row.unit || 'Jumlah');
      row.input = qty;
      refreshSub();
      itemsBox.append(h('div', { class: 'line' }, h('span', {}, row.name), qty, price, sub, h('span')));
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

  const noteEl = h('input', { type: 'text', placeholder: 'Catatan (opsional)' });
  noteEl.value = prod ? prod.note || '' : '';

  const content = h('div', {},
    main, outEl, literEl,
    h('details', { class: 'more', open: isEdit && (prod.items.length > 0 || prod.costs.length > 0) },
      h('summary', {}, 'Bahan tambahan dan biaya lain (opsional)'),
      h('div', { class: 'lines' },
        h('p', { class: 'muted', style: 'margin:4px 0 8px' }, 'Botol kosong dan stiker tidak diisi di sini, tapi dihitung per mart saat pengiriman. Kelapa sudah dihitung dari jumlah yang dipotong. Isi bagian ini hanya kalau ada bahan lain yang ikut terpakai saat produksi.'),
        itemsBox),
      h('div', { class: 'lines' }, h('h3', {}, 'Biaya lain (tenaga kerja, gas, dll)'), costsBox,
        h('datalist', { id: 'dl_costs' }, COST_SUGGESTIONS.map((s) => h('option', { value: s }))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { costs.push({ name: '', amount: '' }); drawCosts(); } }, 'Tambah biaya')),
      h('div', { class: 'field full', style: 'margin-top:12px' }, h('label', {}, 'Catatan'), noteEl)),
    costNote,
    h('div', { class: 'preview' }, h('span', {}, 'Total modal: ', totalEl)));

  formShell({
    title: isEdit ? `Ubah produksi ${prod.code}` : 'Catat produksi', wide: true, children: content,
    onSubmit: async () => {
      const { coco, q620, q600 } = vals();
      const body = {
        date: dateEl.value, coconuts: coco, qty620: q620, qty600: q600, note: noteEl.value,
        items: items.filter((i) => Number(i.qty) > 0).map((i) => ({ materialId: i.materialId, name: i.name, unit: i.unit, qty: Number(i.qty), price: Number(i.price) || 0 })),
        costs: costs.filter((c) => c.name && Number(c.amount) > 0).map((c) => ({ name: c.name, amount: Number(c.amount) })),
      };
      await api(isEdit ? `/productions/${prod.id}` : '/productions', { method: isEdit ? 'PUT' : 'POST', body });
      openDays.add(body.date);
      toast(isEdit ? 'Produksi diperbarui' : 'Produksi dicatat');
      await ctx.refresh();
    },
  });
}
