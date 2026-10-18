// Halaman daftar + form tambah/ubah/hapus yang dibuat otomatis dari config.js.
import { h, dataTable, pageHeader, formDialog, confirmBox, toast } from '../ui.js';
import { api } from '../api.js';

export function renderCrud(root, page, ctx) {
  const rows = ctx.data[page.collection] || [];
  const add = h('button', { class: 'btn primary', onclick: () => openForm(null) }, `Tambah ${page.singular}`);

  function openForm(row) {
    formDialog({
      title: row ? `Ubah ${page.singular}` : `Tambah ${page.singular}`,
      fields: page.fields, values: row || {}, ctx, preview: page.preview,
      onSubmit: async (values) => {
        const path = `/${page.collection}${row ? `/${row.id}` : ''}`;
        await api(path, { method: row ? 'PUT' : 'POST', body: values });
        toast(row ? 'Perubahan disimpan' : `${page.singular[0].toUpperCase()}${page.singular.slice(1)} ditambahkan`);
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

  root.replaceChildren(
    pageHeader(page.label, page.intro, add),
    h('div', { class: 'panel flush' },
      dataTable(page.columns, rows, {
        stack: true,
        emptyText: `Belum ada data. Klik "Tambah ${page.singular}" untuk mulai.`,
        actions: (r) => [
          h('button', { class: 'btn small', onclick: () => openForm(r) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => remove(r) }, 'Hapus'),
        ],
      })));

  // Tautan cepat dari Beranda: #/halaman?add langsung membuka form tambah.
  if (ctx.params && ctx.params.has('add')) { history.replaceState(null, '', `#/${page.id}`); openForm(null); }
}
