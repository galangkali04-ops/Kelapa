// Tambah / ubah / hapus satu catatan memakai definisi form di config.js. Dipakai halaman Belanja, Mart, dan Produksi.
import { formDialog, confirmBox, toast } from './ui.js';
import { api } from './api.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function openForm(def, row, ctx, { after } = {}) {
  formDialog({
    title: `${row ? 'Ubah' : 'Tambah'} ${def.singular}`,
    fields: def.fields, values: row || {}, ctx, preview: def.preview,
    onSubmit: async (values) => {
      const saved = await api(`/${def.collection}${row ? `/${row.id}` : ''}`, { method: row ? 'PUT' : 'POST', body: values });
      toast(row ? 'Perubahan disimpan' : `${cap(def.singular)} ditambahkan`);
      if (after) after(saved);
      await ctx.refresh();
    },
  });
}

export async function removeRow(def, row, ctx, label) {
  if (!(await confirmBox(`Hapus ${label || def.singular} ini?`))) return;
  try {
    await api(`/${def.collection}/${row.id}`, { method: 'DELETE' });
    toast('Data dihapus');
    await ctx.refresh();
  } catch (e) { toast(e.message, 'error'); }
}
