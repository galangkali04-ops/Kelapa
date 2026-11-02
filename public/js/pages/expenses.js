// Pengeluaran per tanggal. Tiap tanggal satu baris berisi total hari itu; klik untuk melihat daftarnya.
// Hari ini masih bisa diubah. Tanggal yang sudah lewat terkunci (server juga menolak perubahannya).
import { h, rp, int, dataTable, dayGroups, pageHeader, formDialog, confirmBox, toast, setChildren } from '../ui.js';
import { api } from '../api.js';

const openDays = new Set(); // tanggal yang sedang terbuka. Awalnya tertutup semua; tanggal yang baru disimpan otomatis terbuka

export function renderExpenses(root, page, ctx) {
  const rows = ctx.data.expenses || [];

  function openForm(row) {
    formDialog({
      title: row ? 'Ubah pengeluaran' : 'Tambah pengeluaran',
      fields: page.fields, values: row || {}, ctx,
      onSubmit: async (values) => {
        await api(`/expenses${row ? `/${row.id}` : ''}`, { method: row ? 'PUT' : 'POST', body: values });
        openDays.add(values.date);
        toast(row ? 'Perubahan disimpan' : 'Pengeluaran ditambahkan');
        await ctx.refresh();
      },
    });
  }

  async function remove(row) {
    if (!(await confirmBox('Hapus pengeluaran ini?'))) return;
    try { await api(`/expenses/${row.id}`, { method: 'DELETE' }); toast('Data dihapus'); await ctx.refresh(); } catch (e) { toast(e.message, 'error'); }
  }

  const cols = [
    { key: 'category', label: 'Kategori' },
    { key: 'description', label: 'Keterangan' },
    { key: 'amount', label: 'Nominal', type: 'rp' },
    { key: 'note', label: 'Catatan' },
  ];

  const groups = dayGroups(rows, {
    keep: openDays,
    emptyText: 'Belum ada pengeluaran. Klik "Tambah pengeluaran" untuk mulai.',
    meta: (date, list) => [
      `${int(list.length)} catatan`,
      h('b', {}, `Total ${rp(list.reduce((s, r) => s + (Number(r.amount) || 0), 0))}`),
      list[0].locked ? h('span', { class: 'badge muted' }, 'Terkunci') : h('span', { class: 'badge' }, 'Bisa diubah'),
    ],
    body: (list) => (list[0].locked
      ? dataTable(cols, list, { stack: true })
      : dataTable(cols, list, {
        stack: true,
        actions: (r) => [
          h('button', { class: 'btn small', onclick: () => openForm(r) }, 'Ubah'),
          h('button', { class: 'btn small danger', onclick: () => remove(r) }, 'Hapus'),
        ],
      })),
  });

  setChildren(root,
    pageHeader(page.label, page.intro,
      ...(page.links || []).map((l) => h('a', { class: 'btn', href: l.href }, l.label)),
      h('button', { class: 'btn primary', onclick: () => openForm(null) }, 'Tambah pengeluaran')),
    groups);

  if (ctx.params && ctx.params.has('add')) { history.replaceState(null, '', `#/${page.id}`); openForm(null); }
}
