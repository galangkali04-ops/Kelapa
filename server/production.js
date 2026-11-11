'use strict';
// Produksi sederhana: satu catatan = tanggal + kelapa dipotong + jumlah botol 620 ml + jumlah botol 600 ml.
// Di balik layar, tiap ukuran botol jadi satu "stok" (batch) supaya HPP, expired, dan laporan tetap jalan.
// Modal produksi dibagi ke 620 dan 600 sesuai total liter masing-masing.
const crypto = require('crypto');

const SIZES = ['620', '600']; // ml
const num = (v) => Number(v) || 0;
const int0 = (v) => {
  const n = Number(v === '' || v == null ? 0 : v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};
const cleanPrefix = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

const qtyKey = (size) => `qty${size}`;
const liters = (p) => SIZES.reduce((s, z) => s + num(p[qtyKey(z)]) * (Number(z) / 1000), 0);

// Kode produksi: AWALAN-TANGGAL-NOMOR (nomor naik per tanggal, tetap unik walau ada yang dihapus).
function nextCode(db, date) {
  const prefix = cleanPrefix(db.settings.codePrefix) || 'KLP';
  const head = `${prefix}-${date.replace(/-/g, '')}-`;
  const used = db.productions.filter((p) => String(p.code || '').startsWith(head)).map((p) => Number(String(p.code).slice(head.length)) || 0);
  return head + String(Math.max(0, ...used) + 1).padStart(2, '0');
}

// Bahan "Kelapa" otomatis dipakai dari jumlah kelapa yang dipotong. Dibuat kalau belum ada.
function coconutMaterial(db) {
  let m = db.materials.find((x) => /kelapa/i.test(x.name));
  if (!m) {
    m = { id: crypto.randomUUID(), name: 'Kelapa', unit: 'butir', price: 0, note: '', createdAt: new Date().toISOString() };
    db.materials.push(m);
  }
  return m;
}

function clean(db, body) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
  if (!date) return { error: 'Tanggal produksi tidak valid.' };
  const coconuts = Number(body.coconuts);
  if (!Number.isFinite(coconuts) || coconuts <= 0) return { error: 'Isi jumlah kelapa yang dipotong.' };
  const qty = {};
  for (const z of SIZES) {
    const n = int0(body[qtyKey(z)]);
    if (Number.isNaN(n)) return { error: `Jumlah botol ${z} ml harus bilangan bulat 0 atau lebih.` };
    qty[qtyKey(z)] = n;
  }
  if (SIZES.every((z) => qty[qtyKey(z)] === 0)) return { error: 'Isi jumlah botol 620 ml atau 600 ml.' };

  const coco = coconutMaterial(db);
  const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({
    materialId: String(i.materialId || ''),
    name: String(i.name || '').trim().slice(0, 120),
    unit: String(i.unit || '').trim().slice(0, 30),
    qty: Number(i.qty),
    price: Number(i.price) || 0,
  })).filter((i) => i.qty > 0 && i.materialId !== coco.id);
  if (items.some((i) => !i.name || !Number.isFinite(i.qty) || i.price < 0)) return { error: 'Ada baris bahan yang tidak valid.' };
  const costs = (Array.isArray(body.costs) ? body.costs : []).map((c) => ({ name: String(c.name || '').trim().slice(0, 120), amount: Number(c.amount) }))
    .filter((c) => c.name && c.amount > 0);
  if (costs.some((c) => !Number.isFinite(c.amount))) return { error: 'Ada baris biaya tambahan yang tidak valid.' };
  return { value: { date, coconuts, ...qty, items, costs, note: String(body.note || '').trim().slice(0, 500) }, coco };
}

// Bentuk ulang stok (batch) tiap ukuran dari catatan produksi. Stok yang sudah dikirim tetap terhubung karena id-nya dipertahankan.
function syncLots(db, prod, coco) {
  const totalL = liters(prod);
  const shelf = Number(db.settings.shelfLifeDays) || 3;
  const now = new Date().toISOString();
  for (const z of SIZES) {
    const q = num(prod[qtyKey(z)]);
    const idx = db.batches.findIndex((b) => b.productionId === prod.id && b.size === z);
    if (q <= 0) {
      if (idx >= 0) {
        const used = db.deliveries.some((d) => d.batchId === db.batches[idx].id) || db.expirations.some((e) => e.batchId === db.batches[idx].id);
        if (used) return { error: `Botol ${z} ml dari produksi ini sudah dikirim atau dicatat expired, jadi jumlahnya tidak bisa dijadikan 0.` };
        db.batches.splice(idx, 1);
      }
      continue;
    }
    const share = (q * (Number(z) / 1000)) / totalL;
    const cocoPrice = (db.materials.find((m) => m.id === coco.id) || {}).price || 0;
    const items = [
      { materialId: coco.id, name: coco.name, unit: coco.unit, qty: prod.coconuts * share, price: num(cocoPrice) },
      ...prod.items.map((i) => ({ ...i, qty: i.qty * share })),
    ];
    const costs = prod.costs.map((c) => ({ name: c.name, amount: c.amount * share }));
    const lot = {
      id: idx >= 0 ? db.batches[idx].id : crypto.randomUUID(),
      productionId: prod.id, size: z, prefix: cleanPrefix(db.settings.codePrefix) || 'KLP',
      code: `${prod.code} · ${z} ml`, date: prod.date, shelfLifeDays: idx >= 0 ? db.batches[idx].shelfLifeDays : shelf,
      goodBottles: q, rejectBottles: 0, items, costs, note: prod.note,
      createdAt: idx >= 0 ? db.batches[idx].createdAt : now,
    };
    if (idx >= 0) db.batches[idx] = { ...lot, updatedAt: now }; else db.batches.push(lot);
  }
  return null;
}

function create(db, body) {
  const { value, error, coco } = clean(db, body);
  if (error) return { error };
  const prod = { id: crypto.randomUUID(), code: nextCode(db, value.date), ...value, createdAt: new Date().toISOString() };
  const err = syncLots(db, prod, coco);
  if (err) return err;
  db.productions.push(prod);
  return { value: prod };
}

function update(db, id, body) {
  const idx = db.productions.findIndex((p) => p.id === id);
  if (idx < 0) return { error: 'Produksi tidak ditemukan.', status: 404 };
  const { value, error, coco } = clean(db, body);
  if (error) return { error };
  const old = db.productions[idx];
  const prod = { ...old, ...value, id, updatedAt: new Date().toISOString() };
  if (old.date !== value.date) prod.code = nextCode(db, value.date);
  const err = syncLots(db, prod, coco);
  if (err) return err;
  db.productions[idx] = prod;
  return { value: prod };
}

function remove(db, id) {
  const idx = db.productions.findIndex((p) => p.id === id);
  if (idx < 0) return { error: 'Produksi tidak ditemukan.', status: 404 };
  const lots = db.batches.filter((b) => b.productionId === id);
  const used = lots.some((b) => db.deliveries.some((d) => d.batchId === b.id) || db.expirations.some((e) => e.batchId === b.id));
  if (used) return { error: 'Botol dari produksi ini sudah dikirim ke mart atau dicatat expired. Hapus catatan pengirimannya dulu.', status: 409 };
  db.batches = db.batches.filter((b) => b.productionId !== id);
  db.productions.splice(idx, 1);
  return { value: { ok: true } };
}

module.exports = { SIZES, create, update, remove, liters };
