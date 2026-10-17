# Kelola Air Kelapa (versi batch + biaya pengeluaran)

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

## Biaya pengeluaran

Menu **Biaya pengeluaran** untuk uang keluar di luar modal batch: sampah, gaji, beli botol kaca, listrik, bensin, pengeluaran tak terduga, dan lainnya.

- Isi: tanggal, kategori, keterangan, nominal.
- Kategori bisa dipilih dari saran atau diketik sendiri. Daftar saran diubah di **Pengaturan > Pilihan kategori pengeluaran** (pisahkan dengan koma).
- Total pengeluaran dikurangkan dari profit di **Ringkasan**, mengikuti periode yang dipilih. Ada juga tabel pengeluaran per kategori.
- Jangan catat bahan yang sudah dimasukkan di batch produksi (kelapa, botol, tutup di form batch) supaya tidak terhitung dua kali.

## Rumus

```
Total modal batch = jumlah bahan x harga + biaya lain di batch
HPP per botol     = total modal batch / botol jadi
Revenue           = botol terjual x harga jual
Gross profit      = revenue - HPP botol terjual
Profit akhir      = gross profit - kerugian expired/retur rusak - biaya pengeluaran
```

## Menambah fitur sendiri

Halaman daftar dibuat otomatis dari `public/js/config.js` (kolom dan isian form). Rumus ada di `server/calc.js`,
aturan validasi di `server/schema.js`. Tambah kolom atau isian cukup satu baris di `config.js`.
Menu baru: tambah di `server/schema.js`, `server/db.js` (COLLECTIONS dan defaults), `server/calc.js` (fungsi list), `public/js/api.js`, dan blok baru di `public/js/config.js`.

## Opsi

| Variabel | Fungsi |
|---|---|
| `PORT` | Ganti port (default 3000) |
| `APP_PASSWORD` | Kunci aplikasi dengan password (username default `owner`) |
| `APP_TZ` | Zona waktu server (default `Asia/Makassar`) |
| `DATA_FILE` | Lokasi file database |
