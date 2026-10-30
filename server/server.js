'use strict';
const express = require('express');
const path = require('path');
const { api } = require('./routes');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
// Header keamanan dasar.
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

// Semua halaman dan data dikunci dengan sandi. Hanya halaman masuk dan /api/auth yang terbuka.
app.use(auth.guard);
app.use('/api/auth', express.json({ limit: '10kb' }), auth.router);
app.use(express.json({ limit: '5mb' })); // data usaha (termasuk pulihkan backup) hanya diproses setelah masuk
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public'), {
  // Halaman HTML tidak disimpan di cache, supaya tombol Back setelah keluar tidak menampilkan halaman lama.
  setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-store'); },
}));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

app.listen(PORT, () => {
  console.log(`Air Kelapa App jalan di http://localhost:${PORT}`);
  if (!auth.isConfigured()) console.log('Belum ada sandi. Buka alamat di atas sekarang untuk membuat sandi (sebelum alamatnya dibagikan ke orang lain).');
});
