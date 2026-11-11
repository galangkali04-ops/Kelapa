'use strict';
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const calc = require('./calc');
const visit = require('./visit');
const production = require('./production');
const pdf = require('./pdf');
const { schemas, sanitize, isSimple, validators } = require('./schema');

const api = express.Router();

// Jalankan perubahan pada salinan data, periksa konsistensi, baru simpan.
function mutate(res, fn) {
  const draft = structuredClone(store.get());
  const result = fn(draft);
  if (result && result.error) return res.status(result.status || 400).json({ error: result.error });
  const err = calc.check(draft);
  if (err) return res.status(409).json({ error: err });
  store.set(draft);
  return res.json(result.value);
}

// Awalan kode batch: huruf/angka saja, huruf besar, maksimal 8 karakter (mis. KLP, SRS).
const cleanPrefix = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const prefixOf = (b) => cleanPrefix(b.prefix) || cleanPrefix(String(b.code || '').split('-')[0]);

// Kode otomatis: AWALAN-TANGGAL-NOMOR. Nomor = nomor terbesar yang sudah dipakai awalan dan tanggal itu + 1,
// jadi tetap unik walau ada batch yang dihapus.
function nextCode(db, prefix, date, skipId) {
  const head = `${prefix}-${date.replace(/-/g, '')}-`;
  const used = db.batches.filter((b) => b.id !== skipId && String(b.code || '').startsWith(head)).map((b) => Number(String(b.code).slice(head.length)) || 0);
  return head + String(Math.max(0, ...used) + 1).padStart(2, '0');
}

// Isi otomatis sebelum disimpan (kode batch, batch dari pengiriman, dst). `old` = data sebelum diubah (kalau ubah).
function prepare(col, db, item, old) {
  if (col === 'batches') {
    if (!item.shelfLifeDays) item.shelfLifeDays = Number(db.settings.shelfLifeDays) || 3;
    item.prefix = cleanPrefix(item.prefix) || cleanPrefix(db.settings.codePrefix) || 'KLP';
    // Kode lama yang dibuat otomatis ikut berganti kalau awalan atau tanggalnya diubah. Kode yang diketik sendiri dibiarkan.
    const wasAuto = old && new RegExp(`^${prefixOf(old)}-${String(old.date).replace(/-/g, '')}-\\d+$`).test(old.code || '');
    const moved = old && (prefixOf(old) !== item.prefix || old.date !== item.date);
    if (!item.code || (old && item.code === old.code && wasAuto && moved)) item.code = nextCode(db, item.prefix, item.date, item.id);
  }
  if (col === 'reminders' && item.repeat !== 'once') item.date = '';
  if (col === 'expirations' && item.deliveryId) {
    const d = db.deliveries.find((x) => x.id === item.deliveryId);
    if (d) item.batchId = d.batchId;
  }
}

// Pengeluaran yang tanggalnya sudah lewat terkunci: tidak bisa ditambah, diubah, atau dihapus.
const LOCK_MSG = 'Pengeluaran tanggal yang sudah lewat terkunci dan tidak bisa diubah lagi. Catat sebagai pengeluaran hari ini kalau memang baru dibayar sekarang.';
const PAST_MSG = 'Pengeluaran hanya bisa dicatat untuk hari ini atau tanggal berikutnya. Tanggal yang sudah lewat terkunci.';

api.get('/settings', (req, res) => res.json(store.get().settings));

api.put('/settings', (req, res) => {
  const clean = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k) && isSimple(v)) clean[k] = typeof v === 'string' ? v.trim().slice(0, 1000) : v;
  }
  clean.shelfLifeDays = Math.max(1, Math.round(Number(clean.shelfLifeDays)) || 3);
  const toInt = (v, def, min, max) => {
    const n = Math.round(Number(v));
    return v === '' || !Number.isFinite(n) ? def : Math.min(max, Math.max(min, n));
  };
  if ('notifExpiryDays' in clean) clean.notifExpiryDays = toInt(clean.notifExpiryDays, 2, 0, 14);
  if ('notifUnpaidDays' in clean) clean.notifUnpaidDays = toInt(clean.notifUnpaidDays, 3, 1, 60);
  if (!clean.businessName) clean.businessName = 'Air Kelapa Saya';
  const db = structuredClone(store.get());
  db.settings = { ...db.settings, ...clean };
  store.set(db);
  res.json(db.settings);
});

// Peringatan otomatis (batch hampir expired, pembayaran menunggak) sesuai pengaturan notifikasi.
api.get('/notifications', (req, res) => res.json(calc.notifications(store.get())));

api.get('/home', (req, res) => res.json(calc.home(store.get())));

// Order mart: hasil nota sebelumnya + order baru dalam satu simpan.
api.post('/visits', (req, res) => mutate(res, (db) => visit.applyVisit(db, req.body || {})));

const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

api.get('/report', (req, res) => {
  res.json(calc.report(store.get(), okDate(req.query.from), okDate(req.query.to)));
});

// Laporan satu mart: hanya transaksi dan batch milik mart itu.
api.get('/report/mart/:id', (req, res) => {
  const rep = calc.martReport(store.get(), req.params.id, okDate(req.query.from), okDate(req.query.to));
  if (!rep) return res.status(404).json({ error: 'Mart tidak ditemukan.' });
  return res.json(rep);
});

// Kirim PDF ke browser sebagai unduhan.
function sendPdf(res, doc, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
  doc.end();
}

api.get('/report/pdf', (req, res) => {
  const db = store.get();
  const rep = calc.report(db, okDate(req.query.from), okDate(req.query.to));
  sendPdf(res, pdf.overallReport(rep, db.settings.businessName || 'Air Kelapa'), `laporan-${pdf.slug(db.settings.businessName)}-${calc.today()}.pdf`);
});

api.get('/report/mart/:id/pdf', (req, res) => {
  const db = store.get();
  const rep = calc.martReport(db, req.params.id, okDate(req.query.from), okDate(req.query.to));
  if (!rep) return res.status(404).json({ error: 'Mart tidak ditemukan.' });
  return sendPdf(res, pdf.martReport(rep, db.settings.businessName || 'Air Kelapa'), `laporan-${pdf.slug(rep.partner.name)}-${calc.today()}.pdf`);
});

api.get('/backup', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="backup-air-kelapa-${calc.today()}.json"`);
  res.json(store.get());
});

// Mulai dari awal. mode 'transactions' = hapus semua catatan tapi simpan bahan, mitra, pengingat, dan pengaturan.
// mode 'all' = kembali seperti baru. Salinan data disimpan otomatis di folder data/ sebelum dihapus.
api.post('/reset', (req, res) => {
  const { mode, confirm } = req.body || {};
  if (!['transactions', 'all'].includes(mode)) return res.status(400).json({ error: 'Pilihan reset tidak valid.' });
  if (confirm !== 'HAPUS') return res.status(400).json({ error: 'Ketik HAPUS untuk melanjutkan.' });
  const file = store.backup('sebelum-reset');
  const current = store.get();
  const next = store.defaults();
  if (mode === 'transactions') {
    next.settings = current.settings;
    next.materials = current.materials;
    next.partners = current.partners;
    next.reminders = current.reminders;
  }
  store.set(store.normalize(next));
  return res.json({ ok: true, backupFile: file });
});

api.post('/restore', (req, res) => {
  const body = req.body || {};
  if (!body.settings || !store.COLLECTIONS.filter((c) => !['expenses', 'reminders', 'purchases', 'stockouts', 'capital', 'productions'].includes(c)).every((c) => Array.isArray(body[c]))) {
    return res.status(400).json({ error: 'File backup tidak valid.' });
  }
  const next = store.normalize(body);
  const err = calc.check(next);
  if (err) return res.status(400).json({ error: `Backup tidak konsisten: ${err}` });
  store.set(next);
  return res.json({ ok: true });
});

// Produksi: satu catatan (kelapa + botol 620 + botol 600). Stok per ukuran dibuat otomatis.
api.post('/productions', (req, res) => mutate(res, (db) => production.create(db, req.body || {})));
api.put('/productions/:id', (req, res) => mutate(res, (db) => production.update(db, req.params.id, req.body || {})));
api.delete('/productions/:id', (req, res) => mutate(res, (db) => production.remove(db, req.params.id)));

api.get('/:col', (req, res) => {
  if (!schemas[req.params.col]) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  return res.json(calc.list(store.get(), req.params.col));
});

api.post('/:col', (req, res) => {
  const col = req.params.col;
  if (!schemas[col]) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  const { value, error } = sanitize(col, req.body || {});
  if (error) return res.status(400).json({ error });
  const invalid = validators[col] && validators[col](value);
  if (invalid) return res.status(400).json({ error: invalid });
  if (col === 'expenses' && value.date < calc.today()) return res.status(400).json({ error: PAST_MSG });
  return mutate(res, (db) => {
    const item = { id: crypto.randomUUID(), ...value, createdAt: new Date().toISOString() };
    prepare(col, db, item);
    db[col].push(item);
    return { value: item };
  });
});

api.put('/:col/:id', (req, res) => {
  const { col, id } = req.params;
  if (!schemas[col]) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  const { value, error } = sanitize(col, req.body || {});
  if (error) return res.status(400).json({ error });
  const invalid = validators[col] && validators[col](value);
  if (invalid) return res.status(400).json({ error: invalid });
  return mutate(res, (db) => {
    const idx = db[col].findIndex((x) => x.id === id);
    if (idx < 0) return { error: 'Data tidak ditemukan.', status: 404 };
    if (col === 'expenses') {
      if (db.expenses[idx].date < calc.today()) return { error: LOCK_MSG, status: 403 };
      if (value.date < calc.today()) return { error: PAST_MSG, status: 400 };
    }
    const item = { id, ...value, createdAt: db[col][idx].createdAt, updatedAt: new Date().toISOString() };
    prepare(col, db, item, db[col][idx]);
    db[col][idx] = item;
    return { value: item };
  });
});

api.delete('/:col/:id', (req, res) => {
  const { col, id } = req.params;
  if (!schemas[col]) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  return mutate(res, (db) => {
    const idx = db[col].findIndex((x) => x.id === id);
    if (idx < 0) return { error: 'Data tidak ditemukan.', status: 404 };
    if (col === 'expenses' && db.expenses[idx].date < calc.today()) return { error: LOCK_MSG, status: 403 };
    const used = calc.usage(db, col, id);
    if (used) return { error: used, status: 409 };
    db[col].splice(idx, 1);
    return { value: { ok: true } };
  });
});

module.exports = { api };
