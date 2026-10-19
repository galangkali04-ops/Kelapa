'use strict';
// Penyimpanan data berbasis file JSON (data/db.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
const COLLECTIONS = ['materials', 'partners', 'batches', 'deliveries', 'sales', 'returns', 'expirations', 'expenses', 'reminders', 'purchases', 'stockouts', 'capital'];

function defaults() {
  const mat = (name, unit, perBottle = false) => ({ id: crypto.randomUUID(), name, unit, price: 0, note: '', perBottle, createdAt: new Date().toISOString() });
  return {
    settings: {
      businessName: 'Air Kelapa Saya',
      codePrefix: 'KLP',
      shelfLifeDays: 3,
      partnerTypes: 'Mart, Kafe, Reseller, Langsung',
      returnReasons: 'Tidak laku, Kemasan rusak, Mendekati expired',
      expenseCategories: 'Sampah, Gaji staff, Beli botol kaca, Listrik & gas, Transport / bensin, Perawatan alat, Pengeluaran tak terduga, Lainnya',
      notifEnabled: true,
      notifExpiry: true,
      notifExpiryDays: 2,
      notifUnpaid: true,
      notifUnpaidDays: 3,
    },
    materials: [mat('Kelapa', 'butir'), mat('Botol', 'pcs', true), mat('Tutup botol', 'pcs', true), mat('Label / stiker', 'pcs', true)],
    partners: [], batches: [], deliveries: [], sales: [], returns: [], expirations: [], expenses: [], reminders: [], purchases: [], stockouts: [], capital: [],
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

// Simpan salinan data sekarang di folder data/ (dipakai sebelum reset). Mengembalikan nama file.
function backup(label) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = `backup-${label}-${stamp}.json`;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(FILE), name), JSON.stringify(db, null, 2));
  return name;
}

module.exports = {
  COLLECTIONS,
  defaults,
  backup,
  normalize,
  get: () => db,
  set: (next) => { save(next); db = next; },
};
