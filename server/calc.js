'use strict';
// Semua rumus perhitungan ada di file ini.
//
//   Total modal batch = Σ(bahan x harga) + biaya tambahan
//   HPP per botol     = total modal batch / botol jadi
//   Revenue           = Σ(botol terjual x harga jual)
//   HPP terjual       = botol terjual x HPP batch asalnya
//   Gross profit      = revenue - HPP terjual
//   Kerugian          = (botol expired + botol kembali rusak) x HPP
//   Pengeluaran       = Σ biaya di menu Biaya pengeluaran
//   Profit akhir      = gross profit - kerugian - pengeluaran
const num = (v) => Number(v) || 0;
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: process.env.APP_TZ || 'Asia/Makassar' });
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + num(days));
  return d.toISOString().slice(0, 10);
}
function diffDays(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function compute(db) {
  const partners = new Map(db.partners.map((p) => [p.id, { ...p, remaining: 0 }]));

  const batches = new Map();
  for (const b of db.batches) {
    const itemsCost = sum(b.items || [], (i) => num(i.qty) * num(i.price));
    const extraCost = sum(b.costs || [], (k) => num(k.amount));
    const totalCost = itemsCost + extraCost;
    const good = num(b.goodBottles);
    batches.set(b.id, {
      ...b, itemsCost, extraCost, totalCost,
      hpp: good > 0 ? totalCost / good : 0,
      expiryDate: addDays(b.date, b.shelfLifeDays),
      delivered: 0, sold: 0, revenue: 0, returnedGood: 0, returnedBad: 0,
      expiredWh: 0, expiredPartner: 0, remainingAtPartners: 0,
    });
  }

  const deliveries = new Map();
  for (const d of db.deliveries) {
    const b = batches.get(d.batchId);
    const p = partners.get(d.partnerId);
    deliveries.set(d.id, {
      ...d,
      batchCode: b ? b.code : '?', partnerName: p ? p.name : '?',
      hpp: b ? b.hpp : 0, expiryDate: b ? b.expiryDate : '',
      sold: 0, returned: 0, expired: 0, revenue: 0, unpaid: 0,
    });
    if (b) b.delivered += num(d.qty);
  }

  const salesView = db.sales.map((s) => {
    const d = deliveries.get(s.deliveryId);
    const qty = num(s.qty);
    const total = qty * num(s.price);
    const cogs = qty * (d ? d.hpp : 0);
    if (d) {
      d.sold += qty; d.revenue += total;
      if (!s.paid) d.unpaid += total;
      const b = batches.get(d.batchId);
      if (b) { b.sold += qty; b.revenue += total; }
    }
    return {
      ...s, total, cogs, profit: total - cogs,
      partnerId: d && d.partnerId, partnerName: d ? d.partnerName : '?',
      batchId: d && d.batchId, batchCode: d ? d.batchCode : '?',
    };
  });

  const returnsView = db.returns.map((r) => {
    const d = deliveries.get(r.deliveryId);
    const qty = num(r.qty);
    if (d) {
      d.returned += qty;
      const b = batches.get(d.batchId);
      if (b) { if (r.condition === 'rusak') b.returnedBad += qty; else b.returnedGood += qty; }
    }
    return {
      ...r, loss: r.condition === 'rusak' ? qty * (d ? d.hpp : 0) : 0,
      partnerId: d && d.partnerId, partnerName: d ? d.partnerName : '?',
      batchId: d && d.batchId, batchCode: d ? d.batchCode : '?',
    };
  });

  const expirationsView = db.expirations.map((e) => {
    const d = e.deliveryId ? deliveries.get(e.deliveryId) : null;
    const b = batches.get(d ? d.batchId : e.batchId);
    const qty = num(e.qty);
    if (d) d.expired += qty;
    if (b) { if (d) b.expiredPartner += qty; else b.expiredWh += qty; }
    return {
      ...e, batchId: b ? b.id : e.batchId, batchCode: b ? b.code : '?',
      partnerId: d ? d.partnerId : '', partnerName: d ? d.partnerName : 'Gudang',
      loss: qty * (b ? b.hpp : 0),
    };
  });

  for (const d of deliveries.values()) {
    d.remaining = num(d.qty) - d.sold - d.returned - d.expired;
    const p = partners.get(d.partnerId);
    const b = batches.get(d.batchId);
    if (p) p.remaining += d.remaining;
    if (b) b.remainingAtPartners += d.remaining;
  }
  for (const b of batches.values()) {
    b.stockWarehouse = num(b.goodBottles) - b.delivered + b.returnedGood - b.expiredWh;
    b.stockTotal = b.stockWarehouse + b.remainingAtPartners;
    b.expired = b.expiredWh + b.expiredPartner;
    b.cogs = b.sold * b.hpp;
    b.grossProfit = b.revenue - b.cogs;
    b.loss = (b.expired + b.returnedBad) * b.hpp;
  }
  return { partners, batches, deliveries, salesView, returnsView, expirationsView };
}

function check(db) {
  const c = compute(db);
  for (const d of db.deliveries) {
    if (!c.batches.has(d.batchId)) return 'Ada pengiriman yang memakai batch yang tidak ada.';
    if (!c.partners.has(d.partnerId)) return 'Ada pengiriman yang memakai mitra yang tidak ada.';
  }
  for (const x of [...db.sales, ...db.returns]) {
    if (!c.deliveries.has(x.deliveryId)) return 'Ada catatan penjualan/retur yang memakai pengiriman yang tidak ada.';
  }
  for (const e of db.expirations) {
    if (e.deliveryId && !c.deliveries.has(e.deliveryId)) return 'Pengiriman untuk data expired tidak ditemukan.';
    if (!e.deliveryId && !c.batches.has(e.batchId)) return 'Pilih pengiriman (stok di mitra) atau batch (stok di gudang) untuk data expired.';
  }
  for (const b of c.batches.values()) {
    if (b.stockWarehouse < 0) return `Stok gudang batch ${b.code} tidak cukup (kurang ${-b.stockWarehouse} botol).`;
  }
  for (const d of c.deliveries.values()) {
    if (d.remaining < 0) return `Sisa botol di ${d.partnerName} (batch ${d.batchCode}) tidak cukup (kurang ${-d.remaining} botol).`;
  }
  return null;
}

function usage(db, col, id) {
  switch (col) {
    case 'materials':
      return db.batches.some((b) => (b.items || []).some((i) => i.materialId === id))
        ? 'Bahan ini sudah dipakai di batch produksi. Ubah jumlahnya jadi 0 di batch tersebut atau biarkan saja.' : null;
    case 'partners':
      return db.deliveries.some((d) => d.partnerId === id) ? 'Mitra ini sudah punya pengiriman. Hapus pengirimannya dulu.' : null;
    case 'batches':
      return db.deliveries.some((d) => d.batchId === id) || db.expirations.some((e) => e.batchId === id)
        ? 'Batch ini sudah dipakai di pengiriman atau data expired. Hapus data terkait dulu.' : null;
    case 'deliveries':
      return db.sales.some((s) => s.deliveryId === id) || db.returns.some((r) => r.deliveryId === id) || db.expirations.some((e) => e.deliveryId === id)
        ? 'Pengiriman ini sudah punya catatan penjualan, retur, atau expired. Hapus dulu catatan tersebut.' : null;
    default:
      return null;
  }
}

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');

function list(db, col) {
  const c = compute(db);
  switch (col) {
    case 'materials': return db.materials.slice().sort((a, b) => a.name.localeCompare(b.name));
    case 'partners': return [...c.partners.values()].sort((a, b) => a.name.localeCompare(b.name));
    case 'batches': return [...c.batches.values()].sort(byDateDesc);
    case 'deliveries': return [...c.deliveries.values()].sort(byDateDesc);
    case 'sales': return c.salesView.sort(byDateDesc);
    case 'returns': return c.returnsView.sort(byDateDesc);
    case 'expirations': return c.expirationsView.sort(byDateDesc);
    case 'expenses': return (db.expenses || []).slice().sort(byDateDesc);
    default: return [];
  }
}

function report(db, from, to) {
  const c = compute(db);
  const inR = (d) => (!from || d >= from) && (!to || d <= to);

  const batches = [...c.batches.values()].filter((b) => inR(b.date)).sort(byDateDesc);
  const deliveries = [...c.deliveries.values()].filter((d) => inR(d.date));
  const sales = c.salesView.filter((s) => inR(s.date));
  const returns = c.returnsView.filter((r) => inR(r.date));
  const expirations = c.expirationsView.filter((e) => inR(e.date));
  const expenseRows = (db.expenses || []).filter((x) => inR(x.date));

  const totalModal = sum(batches, (b) => b.totalCost);
  const produced = sum(batches, (b) => num(b.goodBottles));
  const revenue = sum(sales, (s) => s.total);
  const cogs = sum(sales, (s) => s.cogs);
  const grossProfit = revenue - cogs;
  const expiredLoss = sum(expirations, (e) => e.loss);
  const returnLoss = sum(returns, (r) => r.loss);
  const expenses = sum(expenseRows, (x) => num(x.amount));

  const totals = {
    totalModal, produced,
    rejected: sum(batches, (b) => num(b.rejectBottles)),
    avgHpp: produced > 0 ? totalModal / produced : 0,
    delivered: sum(deliveries, (d) => num(d.qty)),
    sold: sum(sales, (s) => num(s.qty)),
    revenue, cogs, grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    returned: sum(returns, (r) => num(r.qty)),
    returnedGood: sum(returns.filter((r) => r.condition !== 'rusak'), (r) => num(r.qty)),
    returnedBad: sum(returns.filter((r) => r.condition === 'rusak'), (r) => num(r.qty)),
    expired: sum(expirations, (e) => num(e.qty)),
    expiredLoss, returnLoss, expenses,
    lossTotal: expiredLoss + returnLoss,
    netProfit: grossProfit - expiredLoss - returnLoss - expenses,
    unpaid: sum(sales.filter((s) => !s.paid), (s) => s.total),
  };
  totals.netMargin = revenue > 0 ? (totals.netProfit / revenue) * 100 : 0;

  const byCat = new Map();
  for (const x of expenseRows) {
    const key = (x.category || 'Lainnya').trim() || 'Lainnya';
    const row = byCat.get(key) || { category: key, count: 0, total: 0 };
    row.count += 1; row.total += num(x.amount);
    byCat.set(key, row);
  }
  const perCategory = [...byCat.values()].sort((a, b) => b.total - a.total)
    .map((r) => ({ ...r, share: expenses > 0 ? (r.total / expenses) * 100 : 0 }));

  const stock = {
    warehouse: sum([...c.batches.values()], (b) => b.stockWarehouse),
    atPartners: sum([...c.deliveries.values()], (d) => d.remaining),
  };

  const perPartner = [...c.partners.values()].map((p) => {
    const ps = sales.filter((s) => s.partnerId === p.id);
    return {
      id: p.id, name: p.name,
      delivered: sum(deliveries.filter((d) => d.partnerId === p.id), (d) => num(d.qty)),
      sold: sum(ps, (s) => num(s.qty)), revenue: sum(ps, (s) => s.total), grossProfit: sum(ps, (s) => s.profit),
      returned: sum(returns.filter((r) => r.partnerId === p.id), (r) => num(r.qty)),
      expired: sum(expirations.filter((e) => e.partnerId === p.id), (e) => num(e.qty)),
      remaining: p.remaining,
      unpaid: sum(ps.filter((s) => !s.paid), (s) => s.total),
    };
  }).filter((p) => p.delivered || p.sold || p.returned || p.expired || p.remaining).sort((a, b) => b.revenue - a.revenue);

  const perBatch = batches.map((b) => ({
    id: b.id, code: b.code, date: b.date, expiryDate: b.expiryDate,
    goodBottles: b.goodBottles, totalCost: b.totalCost, hpp: b.hpp,
    sold: b.sold, revenue: b.revenue, grossProfit: b.grossProfit,
    expired: b.expired, returnedBad: b.returnedBad, loss: b.loss, stockTotal: b.stockTotal,
  }));

  const byDay = new Map();
  for (const s of sales) {
    const row = byDay.get(s.date) || { date: s.date, revenue: 0, profit: 0 };
    row.revenue += s.total; row.profit += s.profit;
    byDay.set(s.date, row);
  }
  const trend = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  const t = today();
  const alerts = [...c.batches.values()]
    .filter((b) => b.stockTotal > 0 && diffDays(b.expiryDate, t) <= 2)
    .map((b) => ({
      batchId: b.id, code: b.code, expiryDate: b.expiryDate, daysLeft: diffDays(b.expiryDate, t),
      stockWarehouse: b.stockWarehouse,
      partners: [...c.deliveries.values()].filter((d) => d.batchId === b.id && d.remaining > 0).map((d) => ({ name: d.partnerName, remaining: d.remaining })),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return { range: { from: from || '', to: to || '' }, today: t, totals, stock, perPartner, perBatch, perCategory, trend, alerts };
}

module.exports = { compute, check, usage, list, report, today };
