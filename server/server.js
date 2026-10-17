'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { api } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

// Kunci aplikasi dengan password (opsional): jalankan dengan
//   APP_PASSWORD=rahasia npm start      (user default: owner, ubah lewat APP_USER)
if (process.env.APP_PASSWORD) {
  const user = process.env.APP_USER || 'owner';
  const same = (a, b) => {
    const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  app.use((req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && token) {
      const [u, ...rest] = Buffer.from(token, 'base64').toString().split(':');
      if (same(u, user) && same(rest.join(':'), process.env.APP_PASSWORD)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Air Kelapa"');
    return res.status(401).send('Perlu login.');
  });
}

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

app.listen(PORT, () => console.log(`Air Kelapa App jalan di http://localhost:${PORT}`));
