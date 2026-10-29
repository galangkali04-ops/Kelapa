# Kelola Air Kelapa (versi batch + biaya pengeluaran + notifikasi)

Web app sederhana untuk usaha air kelapa botolan: modal per batch produksi, HPP per botol, pengiriman ke mitra,
penjualan, botol kembali, botol expired, dan biaya pengeluaran.

## Cara menjalankan

```
npm install
npm start
```
Lalu buka http://localhost:3000. Server harus tetap jalan selama aplikasi dipakai.

## Dipakai di HP dan iPad

Tampilan menyesuaikan otomatis: laptop (menu di kiri), iPad landscape (menu kiri lebih ramping), iPad portrait dan HP (menu lewat tombol hamburger di kiri atas, daftar jadi kartu per baris, form jadi lembar dari bawah).

Di HP aplikasi hanya dipakai **tegak (vertikal)**. Kalau HP dimiringkan, muncul layar "Putar HP ke posisi tegak". Aplikasi yang dipasang ke Layar Utama juga meminta kunci tegak ke sistem (Android). iPad dan laptop tidak terpengaruh.

Untuk membuka dari HP atau iPad di WiFi yang sama dengan laptop:
1. Jalankan `npm start` di laptop.
2. Di PowerShell ketik `ipconfig`, cari **IPv4 Address** (misalnya `192.168.1.5`).
3. Di HP/iPad buka `http://192.168.1.5:3000`.

Kalau tidak bisa terbuka, biasanya firewall Windows memblokir. Pilih **Allow** saat Windows menanyakan akses untuk Node.js, atau izinkan port 3000.
Laptop harus menyala dan `npm start` harus berjalan selama aplikasi dipakai dari HP. Supaya bisa dibuka dari mana saja tanpa laptop, aplikasi perlu di-deploy ke hosting.
Tips: di HP, pilih "Tambahkan ke Layar Utama" di menu browser agar muncul seperti aplikasi.

## Pindah dari versi lama (data tetap aman)

1. Ekstrak zip ini ke folder BARU.
2. Salin file `data/db.json` dari folder lama ke folder `data/` di folder baru.
3. `npm install`, lalu `npm start`.

Data lama tidak hilang. Koleksi `expenses` dan kategori pengeluaran dibuat otomatis kalau belum ada.

### Ikon aplikasi (logo DEWA)
Logo ada di `public/icons/` (`icon-180.png` untuk iPhone/iPad, `icon-192.png` dan `icon-512.png` untuk Android, `favicon-32.png` untuk tab browser). Nama di bawah ikon diatur di `public/manifest.webmanifest` (`short_name`, sekarang "DEWA"). Untuk mengganti logo, timpa file-file itu dengan gambar persegi berukuran persis sama.
Ikon hanya dibaca saat aplikasi ditambahkan ke Layar Utama. Kalau sebelumnya sudah ditambahkan dengan ikon lama, hapus dulu ikonnya lalu tambahkan lagi.

## Mulai dari awal (reset data)

Buka **Pengaturan**, scroll ke **Mulai dari awal**. Ada dua pilihan:

- **Hapus transaksi saja**: mengosongkan batch, belanja, pengiriman, penjualan, retur, expired, bahan terbuang, pengeluaran, dan modal. Daftar bahan, mitra, pengingat, dan pengaturan tetap ada. Cocok untuk membuang data uji coba.
- **Hapus semua data**: kembali seperti aplikasi baru.

Keduanya meminta Anda mengetik **HAPUS**. Sebelum menghapus, server menyimpan salinan otomatis di folder `data/` (nama `backup-sebelum-reset-<tanggal>-<jam>.json`). Kalau menyesal, pakai **Pulihkan dari file** dan pilih file itu.
Cara manual: hentikan server, hapus file `data/db.json`, jalankan lagi. Data baru dibuat otomatis.

## Alur harian (7 menu)

Menu mengikuti urutan kerja: **Beranda, Bahan, Produksi, Mart, Pengeluaran, Laporan, Pengaturan**. Di HP dibuka lewat tombol hamburger.

| Kejadian | Menu | Hasilnya |
|---|---|---|
| Beli kelapa, botol, tutup, label (kelapa masuk) | **Bahan** > Belanja bahan | Stok naik, harga rata-rata dihitung otomatis |
| Produksi hari ini (kelapa keluar) | **Produksi** | Isi botol jadi dan jumlah bahan yang terpakai (mis. kelapa). HPP dihitung sendiri |
| Botol ke mart, nota lama, bayar | **Mart** | Penjualan, retur, expired, dan pengiriman baru tercatat sekaligus |
| Uang keluar lain (gaji, bensin, sampah) | **Pengeluaran** | Mengurangi profit dan saldo kas |
| Kelapa busuk, botol pecah | **Bahan** > Buang / rusak | Stok berkurang, dihitung sebagai kerugian |
| Setor modal, tarik uang pribadi | **Pengeluaran** > Modal & tarik uang | Saldo kas cocok dengan uang asli |
| Tambah mart, ubah harga, koreksi salah catat | **Mart** | Tombol Mart baru, Ubah mart, dan Riwayat di bawahnya |
| Botol di gudang kedaluwarsa | **Produksi** > tombol Expired di barisnya | Dihitung sebagai kerugian |
| Pengingat buatan sendiri | **Pengaturan** > Kelola pengingat | Muncul di lonceng dan notifikasi perangkat |

Halaman Produksi juga menampilkan kolom **Botol / kelapa** per batch dan rata-rata semua batch (mis. 1 kelapa ≈ 1,18 botol), berguna untuk memperkirakan berapa kelapa yang perlu dibeli.

**Beranda** menampilkan angka hari ini: saldo kas, stok bahan (masuk dan keluar hari ini), botol jadi, botol keluar, dan botol yang masih di mart. **Laporan** menampilkan untung rugi per periode, tabel rincinya dilipat (klik judulnya untuk membuka).

### Bahan dan harga per pcs
Di menu **Bahan** ada tabel bahan dan harganya. Kolom **Harga per pcs** bisa diisi langsung (mis. kelapa 7000, botol 1500), tersimpan otomatis saat selesai mengetik. Bahan lain (plastik segel, kardus, dan lain-lain) ditambah lewat tombol **Bahan baru**.
Harga manual dipakai selama belanja bahan itu belum dicatat. Begitu belanja mulai dicatat (**Belanja bahan**), harga rata-rata dari belanja otomatis menggantikannya.

### Cara menghitung biaya per botol
Di **Produksi**, admin menulis jumlah bahan yang **benar-benar terpakai** (mis. kelapa 38) dan botol jadi (mis. 45). Tidak ada isi otomatis, jadi angkanya selalu sesuai kenyataan.

```
Biaya kelapa per botol = kelapa dipakai x harga per kelapa / botol jadi
                       = 38 x 7.000 / 45 = Rp5.911
```
Rincian ini tampil langsung di bawah form untuk setiap bahan, jadi admin bisa mengecek sebelum menyimpan. HPP per botol = total semua bahan dan biaya lain dibagi botol jadi.

### Botol penyok (bal 84, terpakai 70)
Di **Belanja bahan** isi dibeli 84, rusak 14, total bayar Rp420.000. Yang masuk stok 70 botol dan harga per botol dihitung dari 70 (Rp6.000), bukan 84 (Rp5.000). Formulir menampilkan hitungannya langsung. Kalau penyoknya ketahuan belakangan, catat di **Bahan terbuang**.

### Mart (mart bayar saat order berikutnya)
Pilih mart, isi hasil nota sebelumnya (laku, kembali layak, kembali rusak, expired), lalu isi botol baru yang dikirim. Aplikasi menghitung uang yang harus diterima. Botol yang belum dihitung tetap tercatat di mart. Botol di mart dihitung dari pengiriman tertua, dan botol baru diambil dari batch yang paling dekat expired. Order pertama cukup isi botol yang dikirim.

### Saldo kas
`Saldo kas = modal disetor - ditarik + uang dari mart (lunas) - belanja bahan - pengeluaran - biaya produksi lain`.
Catat saldo awal sekali saja lewat tautan "Catat saldo awal" di Beranda (atau Pengeluaran > Modal & tarik uang). Bahan yang belanjanya sudah dicatat dihitung saat dibeli. Bahan yang belum pernah dicatat belanjanya (data lama) dihitung saat dipakai di batch.
Untuk memulai stok: catat stok bahan yang ada sekarang sebagai satu kali **Belanja bahan** (perkiraan harga boleh).

## Notifikasi

Ada dua jenis notifikasi. Semuanya masuk ke **ikon lonceng** (kiri atas, di samping nama usaha) dengan penanda jumlah yang belum dibaca.

**1. Pengingat buatan sendiri** (Pengaturan > **Kelola pengingat**). Isi judul, pesan, jam, dan pengulangan: sekali saja (pilih tanggal), setiap hari, Senin sampai Jumat, atau setiap minggu (pilih hari). Pengingat bisa dimatikan sementara tanpa dihapus.

**2. Peringatan otomatis** (diatur di **Pengaturan > Notifikasi**):

| Pengaturan | Fungsi |
|---|---|
| Aktifkan semua notifikasi | Saklar utama |
| Ingatkan batch yang hampir expired | Muncul jika batch masih punya stok dan expired dalam N hari (0 = hanya hari expired). Angka N juga dipakai di peringatan Ringkasan |
| Ingatkan pembayaran mitra yang belum masuk | Muncul per mitra jika ada penjualan belum lunas lebih dari N hari |

Peringatan otomatis muncul sekali per hari selama kondisinya masih berlaku.

**Notifikasi perangkat** (muncul di layar HP/laptop walau aplikasi di latar belakang): di Pengaturan, klik **Izinkan notifikasi di perangkat ini**, lalu **Kirim notifikasi tes**. Catatan penting:
- Browser hanya mengizinkannya lewat `https` atau `localhost`. Kalau HP membuka `http://192.168.x.x:3000`, notifikasi perangkat tidak tersedia, tapi lonceng dan banner di dalam aplikasi tetap jalan.
- Di iPhone/iPad (iOS 16.4+), tambahkan aplikasi ke Layar Utama dulu, lalu buka dari ikon itu.
- Pengecekan berjalan tiap 30 detik selama aplikasi terbuka (boleh di latar belakang). Kalau aplikasi ditutup penuh, tidak ada yang bisa membunyikan notifikasi. Pengingat yang terlewat (maksimal 2 hari) akan muncul di lonceng begitu aplikasi dibuka lagi.
- Riwayat lonceng dan status "sudah diberi tahu" disimpan di browser tiap perangkat, bukan di server.

## Rumus

```
Harga rata-rata bahan = nilai stok / jumlah stok (barang rusak tidak masuk stok)
Total modal batch     = jumlah bahan x harga rata-rata saat produksi + biaya lain di batch
HPP per botol         = total modal batch / botol jadi
Revenue               = botol terjual x harga jual
Gross profit          = revenue - HPP botol terjual
Profit akhir          = gross profit - kerugian expired/retur rusak - bahan terbuang - pengeluaran
```
Belanja bahan tidak langsung mengurangi profit. Ia menjadi stok, lalu masuk ke profit lewat HPP saat botol terjual.

## Menambah fitur sendiri

Halaman daftar dibuat otomatis dari `public/js/config.js` (kolom dan isian form). Rumus ada di `server/calc.js`,
aturan validasi di `server/schema.js`. Tambah kolom atau isian cukup satu baris di `config.js`.
Menu baru: tambah di `server/schema.js`, `server/db.js` (COLLECTIONS dan defaults), `server/calc.js` (fungsi list), `public/js/api.js`, dan blok baru di `public/js/config.js` (dan daftarkan di `ORDER` di akhir file itu).

## Opsi

| Variabel | Fungsi |
|---|---|
| `PORT` | Ganti port (default 3000) |
| `APP_PASSWORD` | Kunci aplikasi dengan password (username default `owner`) |
| `APP_TZ` | Zona waktu server (default `Asia/Makassar`) |
| `DATA_FILE` | Lokasi file database |
