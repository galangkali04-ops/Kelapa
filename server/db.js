'use strict';
// Penyimpanan data berbasis file JSON (data/db.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
const COLLECTIONS = ['materials', 'partners', 'batches', 'deliveries', 'sales', 'returns', 'expirations', 'expenses'];

function defaults() {
  const mat = (name, unit) => ({ id: crypto.randomUUID(), name, unit, price: 0, note: '', createdAt: new Date().toISOString() });
  return {
    settings: {
      businessName: 'Dewa Fresh Coco',
      codePrefix: 'KLP',
      shelfLifeDays: 3,
      partnerTypes: 'Mart, Kafe, Reseller, Restoran, Gym, Langsung',
      returnReasons: 'Tidak laku, Kemasan rusak, Mendekati expired',
      expenseCategories: 'Sampah, Gaji staff, Beli botol kaca, Listrik & gas, Transport / bensin, Perawatan alat, Pengeluaran tak terduga, Lainnya',
    },
    materials: [mat('Kelapa', 'butir'), mat('Botol', 'pcs'), mat('Tutup botol', 'pcs'), mat('Label / stiker', 'pcs')],
    partners: [], batches: [], deliveries: [], sales: [], returns: [], expirations: [], expenses: [],
  };
}

function normalize(raw) {
  const base = defaults();
  const db = { settings: { ...base.settings, ...((raw && raw.settings) || {}) } };
  for (const c of COLLECTIONS) db[c] = Array.isArray(raw && raw[c]) ? raw[c] : (base[c] || []);
  return db;
}

function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function load() {
  try {
    if (fs.existsSync(FILE)) return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (e) {
    console.error('Gagal membaca database, memakai data kosong:', e.message);
  }
  const fresh = defaults();
  save(fresh);
  return fresh;
}

let db = load();
module.exports = {
  COLLECTIONS,
  normalize,
  get: () => db,
  set: (next) => { save(next); db = next; },
};
