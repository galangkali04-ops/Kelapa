'use strict';
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const calc = require('./calc');
const visit = require('./visit');
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

// Isi otomatis sebelum disimpan (kode batch, batch dari pengiriman, dst).
function prepare(col, db, item) {
  if (col === 'batches') {
    if (!item.shelfLifeDays) item.shelfLifeDays = Number(db.settings.shelfLifeDays) || 3;
    if (!item.code) {
      const n = db.batches.filter((b) => b.date === item.date && b.id !== item.id).length + 1;
      item.code = `${db.settings.codePrefix || 'KLP'}-${item.date.replace(/-/g, '')}-${String(n).padStart(2, '0')}`;
    }
  }
  if (col === 'reminders' && item.repeat !== 'once') item.date = '';
  if (col === 'expirations' && item.deliveryId) {
    const d = db.deliveries.find((x) => x.id === item.deliveryId);
    if (d) item.batchId = d.batchId;
  }
}

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
  for (const [k, def] of [['notifQuietFrom', '21:00'], ['notifQuietTo', '05:00']]) {
    if (k in clean && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean[k])) clean[k] = def;
  }
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

api.get('/report', (req, res) => {
  const ok = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  res.json(calc.report(store.get(), ok(req.query.from), ok(req.query.to)));
});

api.get('/backup', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="backup-air-kelapa-${calc.today()}.json"`);
  res.json(store.get());
});

api.post('/restore', (req, res) => {
  const body = req.body || {};
  if (!body.settings || !store.COLLECTIONS.filter((c) => !['expenses', 'reminders', 'purchases', 'stockouts', 'capital'].includes(c)).every((c) => Array.isArray(body[c]))) {
    return res.status(400).json({ error: 'File backup tidak valid.' });
  }
  const next = store.normalize(body);
  const err = calc.check(next);
  if (err) return res.status(400).json({ error: `Backup tidak konsisten: ${err}` });
  store.set(next);
  return res.json({ ok: true });
});

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
    const item = { id, ...value, createdAt: db[col][idx].createdAt, updatedAt: new Date().toISOString() };
    prepare(col, db, item);
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
    const used = calc.usage(db, col, id);
    if (used) return { error: used, status: 409 };
    db[col].splice(idx, 1);
    return { value: { ok: true } };
  });
});

module.exports = { api };
