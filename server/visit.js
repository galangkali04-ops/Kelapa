'use strict';
// Order mart dalam satu langkah: hasil nota sebelumnya (laku, kembali, expired) + kirim order baru.
// Botol di mitra dihitung berurutan dari pengiriman tertua (FIFO), botol baru diambil dari batch yang paling dekat expired.
const crypto = require('crypto');
const calc = require('./calc');

const num = (v) => Number(v) || 0;
const int0 = (v) => {
  const n = Number(v === '' || v == null ? 0 : v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

function applyVisit(db, body) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : calc.today();
  const partner = db.partners.find((p) => p.id === String(body.partnerId || ''));
  if (!partner) return { error: 'Pilih mart dulu.' };

  const sold = int0(body.sold); const goodBack = int0(body.returnedGood); const badBack = int0(body.returnedBad);
  const expired = int0(body.expired); const newQty = int0(body.newQty);
  if ([sold, goodBack, badBack, expired, newQty].some(Number.isNaN)) return { error: 'Semua jumlah harus bilangan bulat 0 atau lebih.' };
  if (sold + goodBack + badBack + expired + newQty === 0) return { error: 'Isi minimal satu jumlah.' };
  const paid = body.paid !== false;
  const now = new Date().toISOString();
  const add = (col, row) => db[col].push({ id: crypto.randomUUID(), date, ...row, note: 'Order mart', createdAt: now });

  const open = [...calc.compute(db).deliveries.values()]
    .filter((d) => d.partnerId === partner.id && d.remaining > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const totalOpen = sum(open, (d) => d.remaining);
  if (sold + goodBack + badBack + expired > totalOpen) {
    return { error: `Jumlahnya melebihi botol yang masih ada di ${partner.name} (${totalOpen} botol).` };
  }
  const left = new Map(open.map((d) => [d.id, d.remaining]));
  const take = (qty, make) => {
    let need = qty;
    for (const d of open) {
      if (!need) break;
      const t = Math.min(need, left.get(d.id));
      if (t <= 0) continue;
      left.set(d.id, left.get(d.id) - t); need -= t; make(d, t);
    }
  };

  let revenue = 0;
  take(sold, (d, qty) => {
    const price = num(d.price) || num(partner.price);
    revenue += qty * price;
    add('sales', { deliveryId: d.id, qty, price, paid });
  });
  take(goodBack, (d, qty) => add('returns', { deliveryId: d.id, qty, condition: 'layak', reason: 'Tidak laku' }));
  take(badBack, (d, qty) => add('returns', { deliveryId: d.id, qty, condition: 'rusak', reason: 'Rusak' }));
  take(expired, (d, qty) => add('expirations', { deliveryId: d.id, batchId: d.batchId, qty }));

  const used = [];
  if (newQty > 0) {
    const price = body.newPrice === undefined || body.newPrice === '' ? num(partner.price) : Number(body.newPrice);
    if (!Number.isFinite(price) || price < 0) return { error: 'Harga per botol tidak valid.' };
    const withStock = [...calc.compute(db).batches.values()].filter((b) => b.stockWarehouse > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.date.localeCompare(b.date));
    const fresh = withStock.filter((b) => b.expiryDate >= date);
    const avail = sum(fresh, (b) => b.stockWarehouse);
    if (avail < newQty) {
      const stale = sum(withStock.filter((b) => b.expiryDate < date), (b) => b.stockWarehouse);
      return { error: `Stok botol yang masih layak dikirim hanya ${avail} (kurang ${newQty - avail}).${stale ? ` Ada ${stale} botol di gudang yang sudah lewat expired, catat dulu di Botol expired.` : ''}` };
    }
    let need = newQty;
    for (const b of fresh) {
      if (!need) break;
      const qty = Math.min(need, b.stockWarehouse);
      add('deliveries', { batchId: b.id, partnerId: partner.id, qty, price });
      used.push({ code: b.code, qty }); need -= qty;
    }
  }
  return { value: { revenue, sold, paid, delivered: newQty, batches: used, remainingAtPartner: totalOpen - sold - goodBack - badBack - expired + newQty } };
}

module.exports = { applyVisit };
