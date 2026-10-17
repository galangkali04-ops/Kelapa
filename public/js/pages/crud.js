// Halaman daftar + form tambah/ubah/hapus yang dibuat otomatis dari config.js.
import { h, dataTable, pageHeader, formDialog, confirmBox, toast } from '../ui.js';
import { api } from '../api.js';
import { openResultForm } from './result.js';

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
        onRowClick: quick ? (r) => (r.remaining > 0 ? openResultForm(r, ctx) : toast('Pengiriman ini sudah selesai (sisa 0).')) : null,
        actions: (r) => [
          quick && r.remaining > 0 ? h('button', { class: 'btn small primary', onclick: () => openResultForm(r, ctx) }, 'Catat hasil') : null,
          quick && r.remaining <= 0 ? h('span', { class: 'badge muted' }, 'Selesai') : null,
          h('button', { class: 'btn small', onclick: () => openForm(r) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => remove(r) }, 'Hapus'),
        ],
      })));
}
