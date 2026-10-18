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

Tampilan menyesuaikan otomatis: laptop (menu di kiri), iPad landscape (menu kiri lebih ramping), iPad portrait dan HP (menu di atas yang bisa digeser, daftar jadi kartu per baris, form jadi lembar dari bawah).

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

## Alur harian (ringkas)

| Kejadian | Catat di | Hasilnya |
|---|---|---|
| Beli kelapa, botol, tutup, label | **Belanja bahan** | Stok naik, harga rata-rata dihitung otomatis |
| Produksi hari ini | **Produksi & HPP** | Stok bahan berkurang, HPP per botol dihitung dari harga rata-rata stok |
| Mart bayar nota lama dan order baru | **Order mart** | Penjualan, retur, expired, dan pengiriman baru tercatat sekaligus |
| Uang keluar lain (gaji, bensin, sampah) | **Pengeluaran** | Mengurangi profit dan saldo kas |
| Kelapa busuk, botol pecah | **Bahan terbuang** | Stok berkurang, dihitung sebagai kerugian |
| Setor modal atau tarik uang pribadi | **Modal & kas** | Saldo kas cocok dengan uang asli |

**Beranda** menampilkan angka hari ini: kelapa dan bahan masuk, bahan keluar, botol jadi, botol keluar ke mart, botol yang masih di mart, dan saldo kas. **Laporan** menampilkan untung rugi per periode.

### Botol penyok (bal 84, terpakai 70)
Di **Belanja bahan** isi dibeli 84, rusak 14, total bayar Rp420.000. Yang masuk stok 70 botol dan harga per botol dihitung dari 70 (Rp6.000), bukan 84 (Rp5.000). Formulir menampilkan hitungannya langsung. Kalau penyoknya ketahuan belakangan, catat di **Bahan terbuang**.

### Order mart (mart bayar saat order berikutnya)
Pilih mart, isi hasil nota sebelumnya (laku, kembali layak, kembali rusak, expired), lalu isi botol baru yang dikirim. Aplikasi menghitung uang yang harus diterima. Botol yang belum dihitung tetap tercatat di mart. Botol di mart dihitung dari pengiriman tertua, dan botol baru diambil dari batch yang paling dekat expired. Order pertama cukup isi botol yang dikirim.

### Saldo kas
`Saldo kas = modal disetor - ditarik + uang dari mart (lunas) - belanja bahan - pengeluaran - biaya produksi lain`.
Catat saldo awal di **Modal & kas** sekali saja. Bahan yang belanjanya sudah dicatat dihitung saat dibeli. Bahan yang belum pernah dicatat belanjanya (data lama) dihitung saat dipakai di batch.
Untuk memulai stok: catat stok bahan yang ada sekarang sebagai satu kali **Belanja bahan** (perkiraan harga boleh).

## Notifikasi

Ada dua jenis notifikasi. Semuanya masuk ke **ikon lonceng** (kiri atas, di samping nama usaha) dengan penanda jumlah yang belum dibaca.

**1. Pengingat buatan sendiri** (menu **Notifikasi**). Isi judul, pesan, jam, dan pengulangan: sekali saja (pilih tanggal), setiap hari, Senin sampai Jumat, atau setiap minggu (pilih hari). Pengingat bisa dimatikan sementara tanpa dihapus.

**2. Peringatan otomatis** (diatur di **Pengaturan > Notifikasi**):

| Pengaturan | Fungsi |
|---|---|
| Aktifkan semua notifikasi | Saklar utama |
| Ingatkan batch yang hampir expired | Muncul jika batch masih punya stok dan expired dalam N hari (0 = hanya hari expired). Angka N juga dipakai di peringatan Ringkasan |
| Ingatkan pembayaran mitra yang belum masuk | Muncul per mitra jika ada penjualan belum lunas lebih dari N hari |
| Jam tenang | Di jam ini notifikasi tidak muncul sebagai notifikasi perangkat (tetap masuk lonceng) |

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
