// Halaman daftar + form tambah/ubah/hapus yang dibuat otomatis dari config.js.
import { h, dataTable, pageHeader, formDialog, formShell, buildFields, confirmBox, toast, int, fmtDate, today } from '../ui.js';
import { api } from '../api.js';

const csvList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

export function renderCrud(root, page, ctx) {
  const rows = ctx.data[page.collection] || [];
  const add = h('button', { class: 'btn primary', onclick: () => openForm(null) }, `Tambah ${page.singular}`);

  function openForm(row) {
    formDialog({
      title: row ? `Ubah ${page.singular}` : `Tambah ${page.singular}`,
      fields: page.fields, values: row || {}, ctx,
      onSubmit: async (values) => {
        const path = `/${page.collection}${row ? `/${row.id}` : ''}`;
        await api(path, { method: row ? 'PUT' : 'POST', body: values });
        toast(row ? 'Perubahan disimpan' : `${page.singular[0].toUpperCase()}${page.singular.slice(1)} ditambahkan`);
        await ctx.refresh();
      },
    });
  }

  // Catat terjual + kembali untuk satu pengiriman dalam satu form.
  function openResult(d) {
    const fields = [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'soldQty', label: 'Terjual (botol)', type: 'int', placeholder: '0' },
      { key: 'price', label: 'Harga per botol (Rp)', type: 'money', default: d.price },
      { key: 'paid', label: 'Sudah dibayar mitra', type: 'checkbox', default: true },
      { key: 'returnedQty', label: 'Kembali / retur (botol)', type: 'int', placeholder: '0' },
      { key: 'condition', label: 'Kondisi botol kembali', type: 'select', default: 'layak',
        options: [{ value: 'layak', label: 'Masih layak dijual' }, { value: 'rusak', label: 'Tidak layak (rugi)' }] },
      { key: 'reason', label: 'Alasan kembali', type: 'text', full: true, suggest: (data, s) => csvList(s.returnReasons) },
    ];
    const { node, inputs, getValues } = buildFields(fields, { date: today() }, ctx);
    inputs.condition.querySelector('option[value=""]')?.remove();
    inputs.condition.value = 'layak';

    const left = h('p', { class: 'result-left' });
    const wrap = (k) => inputs[k].closest('.field');
    const refresh = () => {
      const sold = Number(inputs.soldQty.value) || 0;
      const back = Number(inputs.returnedQty.value) || 0;
      const rest = d.remaining - sold - back;
      left.textContent = `Sisa di mitra setelah ini: ${int(rest)} botol`;
      left.className = `result-left${rest < 0 ? ' bad' : ''}`;
      for (const k of ['price', 'paid']) wrap(k).style.display = sold > 0 ? '' : 'none';
      for (const k of ['condition', 'reason']) wrap(k).style.display = back > 0 ? '' : 'none';
    };
    inputs.soldQty.addEventListener('input', refresh);
    inputs.returnedQty.addEventListener('input', refresh);
    refresh();

    const info = h('div', { class: 'result-info' },
      h('strong', {}, `${d.partnerName} · ${d.batchCode}`),
      h('span', {}, `Dikirim ${fmtDate(d.date)} · ${int(d.qty)} botol · terjual ${int(d.sold)} · kembali ${int(d.returned)} · sisa ${int(d.remaining)}`));

    formShell({
      title: 'Catat hasil pengiriman',
      children: [info, node, left],
      submitLabel: 'Simpan hasil',
      onSubmit: async () => {
        const v = getValues();
        const sold = Number(v.soldQty) || 0;
        const back = Number(v.returnedQty) || 0;
        if (sold + back === 0) throw new Error('Isi jumlah terjual atau jumlah kembali.');
        if (sold + back > d.remaining) throw new Error(`Jumlah melebihi sisa di mitra (${int(d.remaining)} botol).`);
        await api(`/deliveries/${d.id}/result`, { method: 'POST', body: v });
        toast('Hasil pengiriman disimpan');
        await ctx.refresh();
      },
    });
  }

  async function remove(row) {
    if (!(await confirmBox(`Hapus ${page.singular} ini?`))) return;
    try {
      await api(`/${page.collection}/${row.id}`, { method: 'DELETE' });
      toast('Data dihapus');
      await ctx.refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  const quick = page.quickResult;
  root.replaceChildren(
    pageHeader(page.label, page.intro, add),
    h('div', { class: 'panel flush' },
      dataTable(page.columns, rows, {
        stack: true,
        emptyText: `Belum ada data. Klik "Tambah ${page.singular}" untuk mulai.`,
        onRowClick: quick ? (r) => (r.remaining > 0 ? openResult(r) : toast('Pengiriman ini sudah selesai (sisa 0).')) : null,
        actions: (r) => [
          quick && r.remaining > 0 ? h('button', { class: 'btn small primary', onclick: () => openResult(r) }, 'Catat hasil') : null,
          quick && r.remaining <= 0 ? h('span', { class: 'badge muted' }, 'Selesai') : null,
          h('button', { class: 'btn small', onclick: () => openForm(r) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => remove(r) }, 'Hapus'),
        ],
      })));
}
