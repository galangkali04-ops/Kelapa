// Belanja: stok bahan sekarang, tombol catat belanja / bahan terbuang / bahan baru, dan riwayatnya dalam satu halaman.
import { h, rp, rpd, int, dataTable, pageHeader, toast, setChildren } from '../ui.js';
import { api } from '../api.js';
import { DEF } from '../config.js';
import { openForm, removeRow } from '../crudkit.js';

const badge = (text, cls = '') => h('span', { class: `badge ${cls}` }, text);

export function renderStock(root, page, ctx) {
  const add = (def) => () => openForm(def, null, ctx);

  // Simpan harga per pcs langsung dari tabel.
  async function patch(m, changes) {
    try {
      await api(`/materials/${m.id}`, { method: 'PUT', body: { name: m.name, unit: m.unit, price: Number(m.price) || 0, note: m.note || '', ...changes } });
      toast('Tersimpan');
      await ctx.refresh();
    } catch (e) { toast(e.message, 'error'); }
  }
  const editCell = (m, key, label, suffix) => {
    const el = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', class: 'cell-input', placeholder: '0', 'aria-label': `${m.name}: ${label}`, value: Number(m[key]) ? m[key] : '' });
    el.addEventListener('change', () => patch(m, { [key]: el.value === '' ? 0 : Number(el.value) })); // tersimpan saat selesai mengetik
    return h('span', { class: 'cell-edit' }, el, h('span', { class: 'muted' }, suffix));
  };

  const stockCols = [
    { key: 'name', label: 'Bahan' },
    { key: 'price', label: 'Harga per pcs (Rp)', render: (m) => (m.tracked
      ? h('span', {}, `${rpd(m.avgCost)}${m.unit ? ` / ${m.unit}` : ''} `, h('span', { class: 'muted' }, '(rata-rata belanja)'))
      : editCell(m, 'price', 'harga per pcs', m.unit ? `/ ${m.unit}` : '')) },
    { key: 'stockQty', label: 'Stok', render: (m) => (m.tracked ? `${int(m.stockQty)} ${m.unit || ''}`.trim() : h('span', { class: 'muted' }, 'belum ada belanja')) },
  ];

  const rows = [
    ...ctx.data.purchases.map((p) => ({
      def: DEF.purchases, row: p, date: p.date, created: p.createdAt, kind: 'Belanja', name: p.materialName,
      detail: `${int(p.qty)}${p.damaged > 0 ? ` (${int(p.damaged)} rusak)` : ''} · ${rpd(p.unitCost)}/satuan`, amount: p.total,
    })),
    ...ctx.data.stockouts.map((s) => ({
      def: DEF.stockouts, row: s, date: s.date, created: s.createdAt, kind: 'Terbuang', name: s.materialName,
      detail: `${int(s.qty)}${s.reason ? ` · ${s.reason}` : ''}`, amount: s.loss,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (b.created || '').localeCompare(a.created || '')).slice(0, 40);

  const histCols = [
    { key: 'date', label: 'Tanggal', type: 'date' },
    { key: 'kind', label: 'Jenis', render: (r) => badge(r.kind, r.kind === 'Terbuang' ? 'warn' : '') },
    { key: 'name', label: 'Bahan' },
    { key: 'detail', label: 'Rincian' },
    { key: 'amount', label: 'Rp', type: 'rp' },
  ];

  setChildren(root, 
    pageHeader('Bahan & belanja', page.intro,
      h('button', { class: 'btn primary', onclick: add(DEF.purchases) }, 'Belanja bahan'),
      h('button', { class: 'btn', onclick: add(DEF.stockouts) }, 'Buang / rusak'),
      h('button', { class: 'btn', onclick: add(DEF.materials) }, 'Bahan baru')),
    h('p', { class: 'yield-note' }, 'Di Produksi, tulis jumlah bahan yang benar-benar terpakai (mis. kelapa). Biaya per botol = jumlah × harga per pcs ÷ botol jadi.'),
    h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Bahan dan harga')),
      dataTable(stockCols, ctx.data.materials, {
        stack: true, emptyText: 'Belum ada bahan.',
        actions: (m) => [
          h('button', { class: 'btn small', onclick: () => openForm(DEF.materials, m, ctx) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => removeRow(DEF.materials, m, ctx) }, 'Hapus'),
        ],
      })),
    h('section', { class: 'panel flush' }, h('div', { style: 'padding:20px 20px 0' }, h('h2', {}, 'Riwayat'),
      h('p', { class: 'muted' }, 'Salah catat? Klik Ubah atau hapus lalu catat ulang.')),
    dataTable(histCols, rows, {
      stack: true, emptyText: 'Belum ada catatan. Klik "Belanja bahan" setiap beli kelapa atau botol.',
      actions: (r) => [
        h('button', { class: 'btn small', onclick: () => openForm(r.def, r.row, ctx) }, 'Ubah'),
        h('button', { class: 'btn small danger', onclick: () => removeRow(r.def, r.row, ctx, r.kind === 'Belanja' ? 'catatan belanja' : 'catatan bahan terbuang') }, 'Hapus'),
      ],
    })));

  // Tautan cepat dari Beranda: #/purchases?add
  if (ctx.params && ctx.params.has('add')) { history.replaceState(null, '', `#/${page.id}`); openForm(DEF.purchases, null, ctx); }
}
