// Form mart: data mart + bahan kemasan per botol kosong (botol, stiker, dll) untuk tiap ukuran.
// Begitu disimpan, harga 1 botol kosong untuk mart itu langsung dihitung dari harga bahan di menu Bahan.
import { h, rp, rpd, formShell, buildFields, toast, setChildren } from '../ui.js';
import { api } from '../api.js';
import { DEF } from '../config.js';

const SIZES = ['620', '600'];

export function openPartnerForm(partner, ctx, { after } = {}) {
  const isEdit = !!partner;
  const mats = (ctx.data.materials || []).filter((m) => !/kelapa/i.test(m.name)); // kelapa dihitung di Produksi
  const priceOf = (m) => (m ? (m.tracked ? m.avgCost : m.price) || 0 : 0);
  const base = buildFields(DEF.partners.fields, partner || {}, ctx);

  // Satu bagian per ukuran botol.
  const sections = SIZES.map((z) => {
    const rows = ((partner && partner.pack && partner.pack[z]) || []).map((r) => ({ materialId: r.materialId, qty: r.qty }));
    const box = h('div');
    const totalEl = h('strong');
    const total = () => rows.reduce((s, r) => s + (Number(r.qty) || 0) * priceOf(mats.find((m) => m.id === r.materialId)), 0);
    const refreshTotal = () => { totalEl.textContent = rows.length ? rp(total()) : '—'; };

    const draw = () => {
      setChildren(box,
        rows.length ? h('div', { class: 'line head' }, h('span', {}, 'Bahan'), h('span', {}, 'Jumlah per botol'), h('span', {}, 'Harga per satuan'), h('span', { style: 'text-align:right' }, 'Subtotal'), h('span')) : null,
        rows.map((row, idx) => {
          const sel = h('select', { 'aria-label': 'Bahan' }, h('option', { value: '' }, '— pilih bahan —'), mats.map((m) => h('option', { value: m.id }, m.name)));
          sel.value = row.materialId || '';
          const qty = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '1' });
          qty.value = row.qty ?? '';
          const unit = h('span', { class: 'muted' });
          const sub = h('span', { class: 'sub' });
          const refreshRow = () => {
            const m = mats.find((x) => x.id === row.materialId);
            const price = priceOf(m);
            unit.textContent = m ? (price > 0 ? `${rpd(price)} / ${m.unit || 'pcs'}` : 'Harga belum ada, catat belanja di Bahan') : '';
            sub.textContent = rp((Number(row.qty) || 0) * price);
            refreshTotal();
          };
          sel.addEventListener('change', () => { row.materialId = sel.value; refreshRow(); });
          qty.addEventListener('input', () => { row.qty = qty.value; refreshRow(); });
          refreshRow();
          return h('div', { class: 'line' }, sel, qty, unit, sub,
            h('button', { type: 'button', class: 'btn small', 'aria-label': 'Hapus baris', onclick: () => { rows.splice(idx, 1); draw(); refreshTotal(); } }, '✕'));
        }));
      refreshTotal();
    };
    draw();

    const node = h('div', { class: 'lines' },
      h('h3', {}, `Bahan 1 botol kosong ${z} ml`),
      h('p', { class: 'muted', style: 'margin:4px 0 8px' }, z === '620' ? 'Kosongkan kalau mart ini tidak memakai botol 620 ml.' : 'Mis. botol 600 ml, stiker A, stiker B. Kosongkan kalau tidak memakai botol 600 ml.'),
      box,
      h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push({ materialId: '', qty: 1 }); draw(); } }, 'Tambah bahan'),
      h('div', { class: 'preview' }, h('span', {}, `Harga 1 botol kosong ${z} ml: `, totalEl)));
    return { z, rows, node };
  });

  formShell({
    title: isEdit ? `Ubah mart ${partner.name}` : 'Mart baru', wide: true,
    children: h('div', {}, base.node, ...sections.map((s) => s.node)),
    onSubmit: async () => {
      const pack = {};
      for (const s of sections) pack[s.z] = s.rows.filter((r) => r.materialId && Number(r.qty) > 0).map((r) => ({ materialId: r.materialId, qty: Number(r.qty) }));
      const body = { ...base.getValues(), pack };
      const saved = await api(`/partners${isEdit ? `/${partner.id}` : ''}`, { method: isEdit ? 'PUT' : 'POST', body });
      toast(isEdit ? 'Perubahan disimpan' : 'Mart ditambahkan');
      if (after) after(saved);
      await ctx.refresh();
    },
  });
}
