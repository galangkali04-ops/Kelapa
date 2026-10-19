// ===========================================================================
//  PUSAT PENGATURAN FITUR
//  Owner bisa mengubah atau menambah isi aplikasi dari file ini:
//   - Tambah/ubah kolom tabel  -> edit `columns`
//   - Tambah/ubah isian form   -> edit `fields` (field baru otomatis tersimpan)
//   - Tambah menu/halaman baru -> salin salah satu blok bertipe 'crud' di bawah,
//                                 lalu lihat README bagian "Menambah fitur".
//  Jenis field: text, textarea, number, money, int, date, select, checkbox
// ===========================================================================
import { int, h, fmtDate, rp, rpd } from './ui.js';

const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
const DAY_NAMES = { 0: 'Minggu', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu' };
const schedule = (r) => {
  const when = { once: fmtDate(r.date), daily: 'Setiap hari', weekdays: 'Senin–Jumat', weekly: `Setiap ${DAY_NAMES[Number(r.weekday)] || 'Senin'}` }[r.repeat] || '';
  return `${when} · ${r.time}`;
};
const csv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

const ALL = [
  { id: 'home', label: 'Beranda', type: 'home' },
  { id: 'visit', label: 'Mart', type: 'visit' },
  { id: 'dashboard', label: 'Laporan', type: 'dashboard' },
  { id: 'batches', label: 'Produksi', type: 'batches' },

  {
    id: 'purchases', label: 'Belanja', type: 'stock', collection: 'purchases', singular: 'belanja',
    intro: 'Catat setiap beli kelapa, botol, tutup, atau label. Stok dan harga rata-rata terisi sendiri, botol penyok tidak ikut dihitung.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'materialName', label: 'Bahan' },
      { key: 'qty', label: 'Dibeli', type: 'int' },
      { key: 'damaged', label: 'Rusak', type: 'int' },
      { key: 'usable', label: 'Masuk stok', type: 'int' },
      { key: 'total', label: 'Total bayar', type: 'rp' },
      { key: 'unitCost', label: 'Harga per satuan', type: 'rpd' },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'materialId', label: 'Bahan', type: 'select', required: true, source: 'materials',
        label_of: (m) => `${m.name}${m.tracked ? ` · stok ${int(m.stockQty)}` : ''}` },
      { key: 'qty', label: 'Jumlah dibeli', type: 'number', required: true, help: 'Mis. 1 bal botol = 84, atau 100 butir kelapa.' },
      { key: 'damaged', label: 'Rusak / penyok (tidak terpakai)', type: 'number', default: 0 },
      { key: 'total', label: 'Total bayar (Rp)', type: 'money', required: true, full: true, help: 'Total yang dibayar untuk pembelian ini, bukan harga satuan.' },
      { key: 'note', label: 'Catatan', type: 'text', full: true, placeholder: 'Mis. beli di pasar, ongkir sudah termasuk' },
    ],
    preview: (v) => {
      const usable = (Number(v.qty) || 0) - (Number(v.damaged) || 0);
      if (!(usable > 0) || !(Number(v.total) > 0)) return 'Isi jumlah dan total bayar untuk melihat harga per satuan.';
      const raw = Number(v.damaged) > 0 ? ` (tanpa memperhitungkan rusak: ${rpd(v.total / v.qty)})` : '';
      return `Masuk stok ${int(usable)} dari ${int(v.qty)} · harga per satuan terpakai ${rpd(v.total / usable)}${raw}`;
    },
  },

  {
    id: 'stockouts', label: 'Bahan terbuang', type: 'crud', collection: 'stockouts', singular: 'bahan terbuang',
    intro: 'Kelapa busuk, botol pecah, atau bahan hilang di luar produksi. Stok berkurang dan nilainya dihitung sebagai kerugian di Laporan. Bahan yang dipakai produksi tidak perlu dicatat di sini.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'materialName', label: 'Bahan' },
      { key: 'qty', label: 'Jumlah', type: 'int' },
      { key: 'reason', label: 'Alasan' },
      { key: 'loss', label: 'Kerugian', type: 'rp' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'materialId', label: 'Bahan', type: 'select', required: true, source: 'materials', label_of: (m) => `${m.name}${m.tracked ? ` · stok ${int(m.stockQty)}` : ''}` },
      { key: 'qty', label: 'Jumlah', type: 'number', required: true },
      { key: 'reason', label: 'Alasan', type: 'text', suggest: ['Busuk', 'Pecah', 'Penyok', 'Hilang', 'Dikonsumsi sendiri'] },
      { key: 'note', label: 'Catatan', type: 'text', full: true },
    ],
  },

  {
    id: 'capital', label: 'Modal & kas', type: 'crud', collection: 'capital', singular: 'catatan modal',
    links: [{ label: 'Kembali ke Pengeluaran', href: '#/expenses' }],
    intro: 'Catat saldo awal atau modal yang Anda setor, dan uang usaha yang Anda tarik untuk pribadi. Dengan ini Saldo kas di Beranda cocok dengan uang yang benar-benar ada. Uang dari mart dan belanja bahan sudah dihitung otomatis.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'type', label: 'Jenis', render: (r) => (r.type === 'tarik' ? badge('Ditarik pribadi', 'warn') : badge('Setor / saldo awal')) },
      { key: 'amount', label: 'Nominal', type: 'rp' },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'type', label: 'Jenis', type: 'select', required: true, default: 'setor', options: [{ value: 'setor', label: 'Setor modal / saldo awal' }, { value: 'tarik', label: 'Tarik untuk pribadi' }] },
      { key: 'amount', label: 'Nominal (Rp)', type: 'money', required: true },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'expenses', label: 'Pengeluaran', type: 'crud', collection: 'expenses', singular: 'pengeluaran',
    links: [{ label: 'Modal & tarik uang', href: '#/capital' }],
    intro: 'Catat semua uang keluar di luar modal batch: sampah, gaji, beli botol kaca, listrik, bensin, sampai pengeluaran tak terduga. Total pengeluaran dikurangkan dari profit di Ringkasan. Bahan yang sudah dimasukkan di batch produksi jangan dicatat lagi di sini supaya tidak terhitung dua kali.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'category', label: 'Kategori' },
      { key: 'description', label: 'Keterangan' },
      { key: 'amount', label: 'Nominal', type: 'rp' },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'category', label: 'Kategori', type: 'text', required: true, placeholder: 'Pilih atau ketik sendiri', suggest: (d, s) => csv(s.expenseCategories),
        help: 'Daftar kategori bisa diubah di menu Pengaturan.' },
      { key: 'description', label: 'Keterangan', type: 'text', full: true, placeholder: 'Mis. beli 50 botol kaca' },
      { key: 'amount', label: 'Nominal (Rp)', type: 'money', required: true },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'materials', label: 'Bahan & stok', type: 'crud', collection: 'materials', singular: 'bahan',
    intro: 'Daftar bahan baku. Stok dan harga rata-rata terisi otomatis dari menu Belanja bahan. Harga manual hanya dipakai untuk bahan yang belanjanya belum pernah dicatat.',
    columns: [
      { key: 'name', label: 'Bahan' },
      { key: 'unit', label: 'Satuan' },
      { key: 'stockQty', label: 'Stok', render: (r) => (r.tracked ? `${int(r.stockQty)} ${r.unit || ''}`.trim() : '—') },
      { key: 'avgCost', label: 'Harga rata-rata', type: 'rpd' },
      { key: 'stockValue', label: 'Nilai stok', render: (r) => (r.tracked ? rp(r.stockValue) : '—') },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'name', label: 'Nama bahan', type: 'text', required: true, placeholder: 'Mis. Kelapa muda' },
      { key: 'unit', label: 'Satuan', type: 'text', suggest: ['butir', 'pcs', 'kg', 'liter', 'dus'], placeholder: 'butir, pcs, kg…' },
      { key: 'price', label: 'Harga perkiraan per satuan (Rp)', type: 'money', default: 0, help: 'Hanya dipakai kalau belanja bahan ini belum dicatat.' },
      { key: 'perBottle', label: 'Dipakai 1 per botol', type: 'checkbox', default: false, full: true, help: 'Di form Produksi jumlahnya terisi otomatis sesuai jumlah botol (cocok untuk botol, tutup, label).' },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'partners', label: 'Mitra', type: 'crud', collection: 'partners', singular: 'mitra',
    intro: 'Tempat dan mart yang menjual produk Anda. Harga jual default akan terisi otomatis saat mencatat pengiriman.',
    columns: [
      { key: 'name', label: 'Mitra' },
      { key: 'type', label: 'Tipe' },
      { key: 'scheme', label: 'Skema', render: (r) => (r.scheme === 'putus' ? 'Beli putus' : 'Titip jual') },
      { key: 'price', label: 'Harga jual', type: 'rp' },
      { key: 'remaining', label: 'Botol di mitra', type: 'int' },
      { key: 'contact', label: 'Kontak' },
    ],
    fields: [
      { key: 'name', label: 'Nama mitra', type: 'text', required: true },
      { key: 'type', label: 'Tipe', type: 'text', suggest: (d, s) => csv(s.partnerTypes) },
      { key: 'scheme', label: 'Skema', type: 'select', required: true, default: 'titip', options: [{ value: 'titip', label: 'Titip jual' }, { value: 'putus', label: 'Beli putus' }] },
      { key: 'price', label: 'Harga jual default per botol (Rp)', type: 'money', default: 0 },
      { key: 'contact', label: 'Kontak', type: 'text' },
      { key: 'address', label: 'Alamat', type: 'text', full: true },
      { key: 'note', label: 'Catatan', type: 'textarea' },
    ],
  },

  {
    id: 'deliveries', label: 'Pengiriman', type: 'crud', collection: 'deliveries', singular: 'pengiriman',
    intro: 'Catat botol yang dikirim ke mitra. Jumlah kirim tidak bisa melebihi stok gudang batch tersebut.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'partnerName', label: 'Mitra' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'qty', label: 'Dikirim', type: 'int' },
      { key: 'price', label: 'Harga', type: 'rp' },
      { key: 'sold', label: 'Terjual', type: 'int' },
      { key: 'returned', label: 'Kembali', type: 'int' },
      { key: 'expired', label: 'Expired', type: 'int' },
      { key: 'remaining', label: 'Sisa di mitra', type: 'int' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal kirim', type: 'date', required: true, default: 'today' },
      { key: 'batchId', label: 'Batch', type: 'select', required: true, source: 'batches', label_of: (b) => `${b.code} · stok gudang ${int(b.stockWarehouse)}` },
      { key: 'partnerId', label: 'Mitra', type: 'select', required: true, source: 'partners' },
      { key: 'qty', label: 'Jumlah botol', type: 'int', required: true },
      { key: 'price', label: 'Harga jual per botol (Rp)', type: 'money', defaultFrom: { field: 'partnerId', source: 'partners', prop: 'price' } },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'sales', label: 'Penjualan', type: 'crud', collection: 'sales', singular: 'penjualan',
    intro: 'Catat botol yang sudah terjual di mitra (atau saat settlement). Revenue dan gross profit dihitung dari sini.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'partnerName', label: 'Mitra' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'qty', label: 'Terjual', type: 'int' },
      { key: 'price', label: 'Harga', type: 'rp' },
      { key: 'total', label: 'Revenue', type: 'rp' },
      { key: 'profit', label: 'Gross profit', type: 'rp' },
      { key: 'paid', label: 'Pembayaran', render: (r) => (r.paid ? badge('Lunas') : badge('Belum dibayar', 'warn')) },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'deliveryId', label: 'Dari pengiriman', type: 'select', required: true, source: 'deliveries', full: true,
        filter: (d) => d.remaining > 0,
        label_of: (d) => `${d.partnerName} · ${d.batchCode} · kirim ${fmtDate(d.date)} · sisa ${int(d.remaining)}` },
      { key: 'qty', label: 'Jumlah terjual', type: 'int', required: true },
      { key: 'price', label: 'Harga per botol (Rp)', type: 'money', defaultFrom: { field: 'deliveryId', source: 'deliveries', prop: 'price' } },
      { key: 'paid', label: 'Sudah dibayar mitra', type: 'checkbox', default: true },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'returns', label: 'Botol kembali', type: 'crud', collection: 'returns', singular: 'botol kembali',
    intro: 'Botol yang dikembalikan mitra karena tidak laku. Yang masih layak masuk lagi ke stok gudang, yang tidak layak dihitung sebagai kerugian.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'partnerName', label: 'Mitra' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'qty', label: 'Jumlah', type: 'int' },
      { key: 'condition', label: 'Kondisi', render: (r) => (r.condition === 'rusak' ? badge('Tidak layak', 'bad') : badge('Layak dijual')) },
      { key: 'reason', label: 'Alasan' },
      { key: 'loss', label: 'Kerugian', type: 'rp' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'deliveryId', label: 'Dari pengiriman', type: 'select', required: true, source: 'deliveries', full: true,
        filter: (d) => d.remaining > 0,
        label_of: (d) => `${d.partnerName} · ${d.batchCode} · kirim ${fmtDate(d.date)} · sisa ${int(d.remaining)}` },
      { key: 'qty', label: 'Jumlah botol kembali', type: 'int', required: true },
      { key: 'condition', label: 'Kondisi', type: 'select', required: true, default: 'layak', options: [{ value: 'layak', label: 'Masih layak dijual' }, { value: 'rusak', label: 'Tidak layak (rugi)' }] },
      { key: 'reason', label: 'Alasan', type: 'text', suggest: (d, s) => csv(s.returnReasons) },
    ],
  },

  {
    id: 'expirations', label: 'Botol expired', type: 'crud', collection: 'expirations', singular: 'botol expired',
    intro: 'Botol yang lewat tanggal expired dan tidak bisa dijual. Nilainya dihitung sebagai kerugian sebesar HPP per botol.',
    columns: [
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'batchCode', label: 'Batch' },
      { key: 'partnerName', label: 'Lokasi' },
      { key: 'qty', label: 'Jumlah', type: 'int' },
      { key: 'loss', label: 'Kerugian', type: 'rp' },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today' },
      { key: 'deliveryId', label: 'Botol ada di mitra (pilih pengiriman)', type: 'select', source: 'deliveries', full: true, emptyLabel: '— Tidak, botol ada di gudang —',
        filter: (d) => d.remaining > 0,
        label_of: (d) => `${d.partnerName} · ${d.batchCode} · sisa ${int(d.remaining)}` },
      { key: 'batchId', label: 'Batch (isi jika botol ada di gudang)', type: 'select', source: 'batches', full: true, emptyLabel: '—',
        label_of: (b) => `${b.code} · stok gudang ${int(b.stockWarehouse)}` },
      { key: 'qty', label: 'Jumlah expired', type: 'int', required: true },
      { key: 'note', label: 'Catatan', type: 'text' },
    ],
  },

  {
    id: 'reminders', label: 'Pengingat', type: 'crud', collection: 'reminders', singular: 'pengingat',
    links: [{ label: 'Kembali ke Pengaturan', href: '#/settings' }],
    intro: 'Buat pengingat sendiri, misalnya kirim botol ke mitra, tagih pembayaran, atau belanja kelapa. Pengingat muncul di lonceng dan sebagai notifikasi perangkat. Notifikasi otomatis (batch hampir expired, pembayaran menunggak) diatur di Pengaturan.',
    columns: [
      { key: 'title', label: 'Pengingat' },
      { key: 'time', label: 'Jadwal', render: schedule },
      { key: 'message', label: 'Pesan' },
      { key: 'active', label: 'Status', render: (r) => (r.active ? badge('Aktif') : badge('Mati', 'muted')) },
    ],
    fields: [
      { key: 'title', label: 'Judul', type: 'text', required: true, full: true, placeholder: 'Mis. Kirim botol ke Mart A' },
      { key: 'message', label: 'Pesan (opsional)', type: 'text', full: true, placeholder: 'Mis. Bawa 40 botol dari batch terbaru' },
      { key: 'time', label: 'Jam', type: 'time', required: true, default: '08:00' },
      { key: 'repeat', label: 'Ulangi', type: 'select', required: true, default: 'daily', options: [
        { value: 'once', label: 'Sekali saja' }, { value: 'daily', label: 'Setiap hari' },
        { value: 'weekdays', label: 'Senin sampai Jumat' }, { value: 'weekly', label: 'Setiap minggu' }] },
      { key: 'date', label: 'Tanggal', type: 'date', required: true, default: 'today', showIf: { field: 'repeat', in: ['once'] } },
      { key: 'weekday', label: 'Hari', type: 'select', required: true, default: '1', showIf: { field: 'repeat', in: ['weekly'] },
        options: [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: DAY_NAMES[d] })) },
      { key: 'active', label: 'Aktif', type: 'checkbox', default: true, full: true, help: 'Matikan untuk menjeda pengingat tanpa menghapusnya.' },
    ],
  },

  {
    id: 'settings', label: 'Pengaturan', type: 'settings',
    fields: [
      { key: 'businessName', label: 'Nama usaha', type: 'text', required: true, full: true },
      { key: 'shelfLifeDays', label: 'Masa simpan botol (hari)', type: 'int', required: true, help: 'Tanggal expired batch otomatis dihitung dari tanggal produksi.' },
      { key: 'expenseCategories', label: 'Pilihan kategori pengeluaran', type: 'text', full: true, help: 'Pisahkan dengan koma.' },

      { key: 'notifHead', type: 'heading', label: 'Notifikasi otomatis', help: 'Pengingat buatan sendiri ada di bagian Pengingat di bawah.' },
      { key: 'notifEnabled', label: 'Aktifkan notifikasi', type: 'checkbox', default: true, full: true },
      { key: 'notifExpiry', label: 'Ingatkan batch yang hampir expired', type: 'checkbox', default: true, full: true, showIf: { field: 'notifEnabled', in: ['true'] } },
      { key: 'notifExpiryDays', label: 'Mulai ingatkan (hari sebelum expired)', type: 'int', default: 2, showIf: { field: 'notifExpiry', in: ['true'] }, help: '0 = hanya di hari expired.' },
      { key: 'notifUnpaid', label: 'Ingatkan pembayaran mart yang belum masuk', type: 'checkbox', default: true, full: true, showIf: { field: 'notifEnabled', in: ['true'] } },
      { key: 'notifUnpaidDays', label: 'Dianggap menunggak setelah (hari)', type: 'int', default: 3, showIf: { field: 'notifUnpaid', in: ['true'] } },
    ],
  },
];

// Semua definisi form tetap tersedia lewat DEF (dipakai halaman Belanja, Mart, Produksi).
export const DEF = Object.fromEntries(ALL.map((p) => [p.id, p]));

// Menu hanya 7: urutannya mengikuti kerja harian. Halaman tersembunyi dibuka lewat tombol di halaman induknya.
const ROUTES = [
  ['home'], ['purchases'], ['batches'], ['visit'], ['expenses'], ['dashboard'], ['settings'],
  ['capital', { hidden: true, nav: 'expenses' }],
  ['reminders', { hidden: true, nav: 'settings' }],
];
export const PAGES = ROUTES.map(([id, extra]) => ({ ...DEF[id], ...extra }));
