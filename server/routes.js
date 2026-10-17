'use strict';
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const calc = require('./calc');
const { schemas, sanitize, isSimple } = require('./schema');

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
  if (!clean.businessName) clean.businessName = 'Air Kelapa Saya';
  const db = structuredClone(store.get());
  db.settings = { ...db.settings, ...clean };
  store.set(db);
  res.json(db.settings);
});

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
  if (!body.settings || !store.COLLECTIONS.filter((c) => c !== 'expenses').every((c) => Array.isArray(body[c]))) {
    return res.status(400).json({ error: 'File backup tidak valid.' });
  }
  const next = store.normalize(body);
  const err = calc.check(next);
  if (err) return res.status(400).json({ error: `Backup tidak konsisten: ${err}` });
  store.set(next);
  return res.json({ ok: true });
});

// Catat hasil satu pengiriman sekaligus: botol terjual + botol kembali (retur) dalam satu langkah.
api.post('/deliveries/:id/result', (req, res) => {
  const b = req.body || {};
  const soldQty = b.soldQty === '' || b.soldQty == null ? 0 : Number(b.soldQty);
  const retQty = b.returnedQty === '' || b.returnedQty == null ? 0 : Number(b.returnedQty);
  if (!Number.isInteger(soldQty) || soldQty < 0) return res.status(400).json({ error: 'Jumlah terjual harus bilangan bulat 0 atau lebih.' });
  if (!Number.isInteger(retQty) || retQty < 0) return res.status(400).json({ error: 'Jumlah kembali harus bilangan bulat 0 atau lebih.' });
  if (soldQty + retQty === 0) return res.status(400).json({ error: 'Isi jumlah terjual atau jumlah kembali.' });
  const date = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Tanggal tidak valid.' });
  const priceIn = b.price === '' || b.price == null ? null : Number(b.price);
  if (priceIn !== null && (!Number.isFinite(priceIn) || priceIn < 0)) return res.status(400).json({ error: 'Harga harus angka 0 atau lebih.' });

  return mutate(res, (db) => {
    const d = db.deliveries.find((x) => x.id === req.params.id);
    if (!d) return { error: 'Pengiriman tidak ditemukan.', status: 404 };
    const now = new Date().toISOString();
    if (soldQty > 0) {
      db.sales.push({
        id: crypto.randomUUID(), date, deliveryId: d.id, qty: soldQty,
        price: priceIn === null ? Number(d.price) || 0 : priceIn,
        paid: b.paid === true || b.paid === 'true', note: '', createdAt: now,
      });
    }
    if (retQty > 0) {
      db.returns.push({
        id: crypto.randomUUID(), date, deliveryId: d.id, qty: retQty,
        condition: b.condition === 'rusak' ? 'rusak' : 'layak',
        reason: String(b.reason || '').trim().slice(0, 500), note: '', createdAt: now,
      });
    }
    return { value: { ok: true } };
  });
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
