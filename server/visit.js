'use strict';
// Order mart dalam satu langkah: hasil nota sebelumnya (laku, kembali, expired) + kirim botol baru.
// Semua jumlah dipisah per ukuran botol (620 ml dan 600 ml). Botol di mitra dihitung berurutan dari pengiriman
// tertua (FIFO) untuk tiap ukuran, botol baru diambil dari stok gudang ukuran itu yang paling dekat expired.
const crypto = require('crypto');
const calc = require('./calc');

const SIZES = ['620', '600'];
const num = (v) => Number(v) || 0;
const int0 = (v) => {
  const n = Number(v === '' || v == null ? 0 : v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const pick = (obj, z) => (obj && typeof obj === 'object' ? obj[z] : 0);

function applyVisit(db, body) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : calc.today();
  const partner = db.partners.find((p) => p.id === String(body.partnerId || ''));
  if (!partner) return { error: 'Pilih mart dulu.' };

  const f = {};
  for (const key of ['sold', 'returnedGood', 'returnedBad', 'expired', 'newQty']) {
    f[key] = {};
    for (const z of SIZES) f[key][z] = int0(pick(body[key], z));
  }
  if (Object.values(f).some((o) => Object.values(o).some(Number.isNaN))) return { error: 'Semua jumlah harus bilangan bulat 0 atau lebih.' };
  const grand = sum(Object.values(f), (o) => sum(SIZES, (z) => o[z]));
  if (grand === 0) return { error: 'Isi minimal satu jumlah.' };
  const paid = body.paid !== false;
  const now = new Date().toISOString();
  const add = (col, row) => db[col].push({ id: crypto.randomUUID(), date, ...row, note: body.note || 'Order mart', createdAt: now });

  const open = [...calc.compute(db).deliveries.values()]
    .filter((d) => d.partnerId === partner.id && d.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const left = new Map(open.map((d) => [d.id, d.remaining]));
  const take = (z, qty, make) => {
    let need = qty;
    for (const d of open) {
      if (!need) break;
      if (d.size !== z) continue;
      const t = Math.min(need, left.get(d.id));
      if (t <= 0) continue;
      left.set(d.id, left.get(d.id) - t); need -= t; make(d, t);
    }
  };

  let revenue = 0; let sold = 0; let delivered = 0;
  let remainingAtPartner = sum(open, (d) => d.remaining);
  for (const z of SIZES) {
    const handled = f.sold[z] + f.returnedGood[z] + f.returnedBad[z] + f.expired[z];
    const openZ = sum(open.filter((d) => d.size === z), (d) => d.remaining);
    if (handled > openZ) return { error: `Botol ${z} ml: jumlahnya ${handled}, padahal di ${partner.name} hanya ada ${openZ} botol.` };
    take(z, f.sold[z], (d, qty) => {
      const price = num(d.price) || num(partner.price);
      revenue += qty * price; sold += qty;
      add('sales', { deliveryId: d.id, qty, price, paid });
    });
    take(z, f.returnedGood[z], (d, qty) => add('returns', { deliveryId: d.id, qty, condition: 'layak', reason: 'Tidak laku' }));
    take(z, f.returnedBad[z], (d, qty) => add('returns', { deliveryId: d.id, qty, condition: 'rusak', reason: 'Rusak' }));
    take(z, f.expired[z], (d, qty) => add('expirations', { deliveryId: d.id, batchId: d.batchId, qty }));
    remainingAtPartner -= handled;
  }

  const used = [];
  for (const z of SIZES) {
    const newQty = f.newQty[z];
    if (newQty <= 0) continue;
    const rawPrice = pick(body.newPrice, z);
    const price = rawPrice === undefined || rawPrice === '' || rawPrice === null ? num(partner.price) : Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) return { error: `Harga botol ${z} ml tidak valid.` };
    const withStock = [...calc.compute(db).batches.values()].filter((b) => b.size === z && b.stockWarehouse > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.date.localeCompare(b.date));
    const fresh = withStock.filter((b) => b.expiryDate >= date);
    const avail = sum(fresh, (b) => b.stockWarehouse);
    if (avail < newQty) {
      const stale = sum(withStock.filter((b) => b.expiryDate < date), (b) => b.stockWarehouse);
      return { error: `Stok botol ${z} ml yang masih layak dikirim hanya ${avail} (kurang ${newQty - avail}).${stale ? ` Ada ${stale} botol ${z} ml di gudang yang sudah lewat expired, catat dulu di halaman Produksi.` : ''}` };
    }
    let need = newQty;
    for (const b of fresh) {
      if (!need) break;
      const qty = Math.min(need, b.stockWarehouse);
      add('deliveries', { batchId: b.id, partnerId: partner.id, qty, price });
      used.push({ code: b.code, size: z, qty }); need -= qty;
    }
    delivered += newQty;
    remainingAtPartner += newQty;
  }
  return { value: { revenue, sold, paid, delivered, batches: used, remainingAtPartner } };
}

module.exports = { applyVisit };
