// ===========================================================================
//  PUSAT PENGATURAN FITUR
//  Owner bisa mengubah atau menambah isi aplikasi dari file ini:
//   - Tambah/ubah kolom tabel  -> edit `columns`
//   - Tambah/ubah isian form   -> edit `fields` (field baru otomatis tersimpan)
//   - Menu utama di HP/iPad portrait -> beri `primary: true`; menu lainnya masuk ke tombol hamburger
//   - Tambah menu/halaman baru -> salin salah satu blok bertipe 'crud' di bawah,
//                                 lalu lihat README bagian "Menambah fitur".
//  Jenis field: text, textarea, number, money, int, date, select, checkbox
// ===========================================================================
import { int, h, fmtDate } from './ui.js';

const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
const csv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

export const PAGES = [
  { id: 'dashboard', label: 'Ringkasan', type: 'dashboard', primary: true },
  { id: 'batches', label: 'Produksi & HPP', type: 'batches', primary: true },

  {
    id: 'expenses', label: 'Biaya pengeluaran', type: 'crud', collection: 'expenses', singular: 'pengeluaran',
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
    id: 'materials', label: 'Bahan & biaya', type: 'crud', collection: 'materials', singular: 'bahan',
    intro: 'Daftar bahan baku dan harganya (kelapa, botol, tutup, label, dan lainnya). Tambahkan bahan apa pun yang ikut jadi modal.',
    columns: [
      { key: 'name', label: 'Bahan' },
      { key: 'unit', label: 'Satuan' },
      { key: 'price', label: 'Harga per satuan', type: 'rp' },
      { key: 'note', label: 'Catatan' },
    ],
    fields: [
      { key: 'name', label: 'Nama bahan', type: 'text', required: true, placeholder: 'Mis. Kelapa muda' },
      { key: 'unit', label: 'Satuan', type: 'text', suggest: ['butir', 'pcs', 'kg', 'liter', 'dus'], placeholder: 'butir, pcs, kg…' },
      { key: 'price', label: 'Harga per satuan (Rp)', type: 'money', default: 0 },
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
    id: 'deliveries', label: 'Pengiriman', primary: true, type: 'crud', collection: 'deliveries', singular: 'pengiriman',
    intro: 'Catat botol yang dikirim ke mitra. Klik salah satu pengiriman (atau tombol Catat hasil) untuk langsung mengisi berapa yang terjual dan berapa yang kembali.',
    quickResult: true,
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
    id: 'settings', label: 'Pengaturan', type: 'settings',
    fields: [
      { key: 'businessName', label: 'Nama usaha', type: 'text', required: true },
      { key: 'codePrefix', label: 'Awalan kode batch', type: 'text', help: 'Contoh: KLP menghasilkan KLP-20261009-01' },
      { key: 'shelfLifeDays', label: 'Masa simpan default (hari)', type: 'int', required: true },
      { key: 'partnerTypes', label: 'Pilihan tipe mitra', type: 'text', full: true, help: 'Pisahkan dengan koma.' },
      { key: 'returnReasons', label: 'Pilihan alasan botol kembali', type: 'text', full: true, help: 'Pisahkan dengan koma.' },
      { key: 'expenseCategories', label: 'Pilihan kategori pengeluaran', type: 'text', full: true, help: 'Pisahkan dengan koma. Tambah sendiri sesuai kebutuhan.' },
    ],
  },
];
