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

// Stok bahan dengan harga rata-rata bergerak. Dihitung berurutan menurut tanggal:
// belanja menambah stok, produksi dan bahan terbuang mengurangi stok. Barang rusak/penyok saat
// belanja tidak masuk stok, jadi harganya otomatis ikut terbagi ke barang yang bagus.
// Bahan yang belum pernah dicatat belanjanya tetap memakai harga manual di batch (data lama aman).
function inventory(db) {
  const mats = new Map(db.materials.map((m) => [m.id, {
    id: m.id, name: m.name, unit: m.unit, fallback: num(m.price), qty: 0, value: 0, avg: num(m.price), tracked: false,
  }]));
  const events = [
    ...(db.purchases || []).map((x) => ({ k: 0, x })),
    ...db.batches.map((x) => ({ k: 1, x })),
    ...(db.stockouts || []).map((x) => ({ k: 2, x })),
  ].sort((a, b) => (a.x.date || '').localeCompare(b.x.date || '') || a.k - b.k || (a.x.createdAt || '').localeCompare(b.x.createdAt || ''));

  const batchItems = new Map(); const batchCash = new Map(); const stockoutLoss = new Map(); const purchaseView = new Map();
  for (const { k, x } of events) {
    if (k === 0) {
      const m = mats.get(x.materialId);
      if (!m) continue;
      const usable = num(x.qty) - num(x.damaged);
      m.tracked = true; m.qty += usable; m.value += num(x.total);
      m.avg = m.qty > 0 ? m.value / m.qty : usable > 0 ? num(x.total) / usable : m.avg;
      purchaseView.set(x.id, { usable, unitCost: usable > 0 ? num(x.total) / usable : 0 });
    } else if (k === 1) {
      let untracked = 0;
      batchItems.set(x.id, (x.items || []).map((i) => {
        const m = mats.get(i.materialId);
        const qty = num(i.qty);
        if (m && m.tracked) { m.qty -= qty; m.value -= qty * m.avg; return { ...i, price: m.avg, tracked: true }; }
        untracked += qty * num(i.price);
        return { ...i, tracked: false };
      }));
      batchCash.set(x.id, untracked);
    } else {
      const m = mats.get(x.materialId);
      const qty = num(x.qty);
      const price = m && m.tracked ? m.avg : m ? m.fallback : 0;
      if (m && m.tracked) { m.qty -= qty; m.value -= qty * price; }
      stockoutLoss.set(x.id, qty * price);
    }
  }
  return { mats, batchItems, batchCash, stockoutLoss, purchaseView };
}

function compute(db) {
  const inv = inventory(db);
  const partners = new Map(db.partners.map((p) => [p.id, { ...p, remaining: 0 }]));

  const batches = new Map();
  for (const b of db.batches) {
    const items = inv.batchItems.get(b.id) || b.items || [];
    const itemsCost = sum(items, (i) => num(i.qty) * num(i.price));
    const extraCost = sum(b.costs || [], (k) => num(k.amount));
    const totalCost = itemsCost + extraCost;
    const good = num(b.goodBottles);
    batches.set(b.id, {
      ...b, items, itemsCost, extraCost, totalCost, untrackedCost: inv.batchCash.get(b.id) || 0,
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
  return { partners, batches, deliveries, salesView, returnsView, expirationsView, inv };
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
      if ((db.purchases || []).some((p) => p.materialId === id) || (db.stockouts || []).some((s) => s.materialId === id)) {
        return 'Bahan ini sudah punya catatan belanja atau bahan terbuang. Hapus catatan itu dulu.';
      }
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
    case 'materials': return db.materials.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
      const s = c.inv.mats.get(m.id);
      return { ...m, tracked: s.tracked, stockQty: s.tracked ? Math.round(s.qty * 100) / 100 : null, avgCost: s.tracked ? s.avg : num(m.price), stockValue: s.tracked ? Math.max(0, s.value) : 0 };
    });
    case 'partners': return [...c.partners.values()].sort((a, b) => a.name.localeCompare(b.name));
    case 'batches': return [...c.batches.values()].sort(byDateDesc);
    case 'deliveries': return [...c.deliveries.values()].sort(byDateDesc);
    case 'sales': return c.salesView.sort(byDateDesc);
    case 'returns': return c.returnsView.sort(byDateDesc);
    case 'expirations': return c.expirationsView.sort(byDateDesc);
    case 'expenses': return (db.expenses || []).slice().sort(byDateDesc);
    case 'purchases': return (db.purchases || []).map((p) => {
      const m = c.inv.mats.get(p.materialId); const v = c.inv.purchaseView.get(p.id) || {};
      return { ...p, materialName: m ? m.name : '?', unit: m ? m.unit : '', usable: v.usable, unitCost: v.unitCost };
    }).sort(byDateDesc);
    case 'stockouts': return (db.stockouts || []).map((s) => {
      const m = c.inv.mats.get(s.materialId);
      return { ...s, materialName: m ? m.name : '?', unit: m ? m.unit : '', loss: c.inv.stockoutLoss.get(s.id) || 0 };
    }).sort(byDateDesc);
    case 'capital': return (db.capital || []).slice().sort(byDateDesc);
    case 'reminders': return (db.reminders || []).slice().sort((a, b) => String(a.time).localeCompare(String(b.time)) || String(a.title).localeCompare(String(b.title)));
    default: return [];
  }
}

// Batas "hampir expired" (hari) dari Pengaturan > Notifikasi. Dipakai juga oleh peringatan di Ringkasan.
function expiryLimit(settings) {
  const n = Number(settings && settings.notifExpiryDays);
  return settings && settings.notifExpiryDays !== '' && Number.isFinite(n) ? n : 2;
}

const idr = (n) => `Rp ${Math.round(num(n)).toLocaleString('id-ID')}`;

// Daftar peringatan otomatis saat ini. Browser memberi tahu sekali per hari untuk tiap `key`.
function notifications(db) {
  const s = db.settings || {};
  if (s.notifEnabled === false) return [];
  const c = compute(db);
  const t = today();
  const out = [];

  if (s.notifExpiry !== false) {
    const limit = expiryLimit(s);
    for (const b of c.batches.values()) {
      if (b.stockTotal <= 0) continue;
      const left = diffDays(b.expiryDate, t);
      if (left > limit) continue;
      const when = left < 0 ? `sudah lewat expired ${-left} hari` : left === 0 ? 'expired hari ini' : `expired ${left} hari lagi`;
      out.push({
        key: `exp:${b.id}:${t}`, kind: 'expiry', page: 'home', sort: left,
        title: `Batch ${b.code} ${when}`,
        body: `Sisa ${b.stockTotal} botol (gudang ${b.stockWarehouse}, di mitra ${b.remainingAtPartners}).`,
      });
    }
  }

  if (s.notifUnpaid !== false) {
    const limit = Math.max(1, num(s.notifUnpaidDays) || 3);
    const byPartner = new Map();
    for (const v of c.salesView) {
      if (v.paid || !v.partnerId || diffDays(t, v.date) < limit) continue;
      const row = byPartner.get(v.partnerId) || { name: v.partnerName, total: 0, count: 0, oldest: v.date };
      row.total += v.total; row.count += 1;
      if (v.date < row.oldest) row.oldest = v.date;
      byPartner.set(v.partnerId, row);
    }
    for (const [partnerId, r] of byPartner) {
      out.push({
        key: `unpaid:${partnerId}:${t}`, kind: 'unpaid', page: 'sales', sort: 100,
        title: `${r.name} belum membayar ${idr(r.total)}`,
        body: `${r.count} catatan penjualan, yang tertua ${diffDays(t, r.oldest)} hari lalu.`,
      });
    }
  }

  return out.sort((a, b) => a.sort - b.sort).map(({ sort, ...rest }) => rest); // eslint-disable-line no-unused-vars
}

// Uang di tangan (kas). Bahan yang sudah dicatat belanjanya dihitung saat dibeli, bukan saat dipakai.
// Bahan yang belum pernah dicatat belanjanya dihitung saat dipakai di batch (supaya data lama tetap masuk akal).
function cashSummary(db, c) {
  const caps = db.capital || [];
  const deposits = sum(caps.filter((x) => x.type !== 'tarik'), (x) => num(x.amount));
  const withdrawals = sum(caps.filter((x) => x.type === 'tarik'), (x) => num(x.amount));
  const received = sum(c.salesView.filter((s) => s.paid), (s) => s.total);
  const purchases = sum(db.purchases || [], (p) => num(p.total));
  const expenses = sum(db.expenses || [], (x) => num(x.amount));
  const production = sum([...c.batches.values()], (b) => b.extraCost + b.untrackedCost);
  const batchList = [...c.batches.values()];
  const stockValue = sum([...c.inv.mats.values()].filter((m) => m.tracked), (m) => Math.max(0, m.value))
    + sum(batchList, (b) => Math.max(0, b.stockTotal) * b.hpp);
  return {
    balance: deposits - withdrawals + received - purchases - expenses - production,
    deposits, withdrawals, received, purchases, expenses, production,
    receivable: sum(c.salesView.filter((s) => !s.paid), (s) => s.total),
    stockValue,
  };
}

// Data untuk halaman Beranda: angka hari ini, stok bahan, botol, dan botol yang masih di mitra.
function home(db) {
  const c = compute(db);
  const t = today();
  const round = (n) => Math.round(num(n) * 100) / 100;
  const buyToday = (db.purchases || []).filter((p) => p.date === t);
  const batchToday = [...c.batches.values()].filter((b) => b.date === t);
  const outToday = (db.stockouts || []).filter((s) => s.date === t);

  const materials = [...c.inv.mats.values()].filter((m) => m.tracked).map((m) => ({
    id: m.id, name: m.name, unit: m.unit, qty: round(m.qty), avg: m.avg,
    inToday: round(sum(buyToday.filter((p) => p.materialId === m.id), (p) => num(p.qty) - num(p.damaged))),
    damagedToday: round(sum(buyToday.filter((p) => p.materialId === m.id), (p) => num(p.damaged))),
    outToday: round(sum(batchToday, (b) => sum(b.items.filter((i) => i.materialId === m.id), (i) => num(i.qty)))
      + sum(outToday.filter((s) => s.materialId === m.id), (s) => num(s.qty))),
  }));

  const salesToday = c.salesView.filter((s) => s.date === t);
  const open = [...c.deliveries.values()].filter((d) => d.remaining > 0);
  const partners = [...c.partners.values()].filter((p) => p.remaining > 0).map((p) => {
    const mine = open.filter((d) => d.partnerId === p.id).sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: p.id, name: p.name, remaining: p.remaining, since: mine[0] ? mine[0].date : '',
      estimate: sum(mine, (d) => d.remaining * (num(d.price) || num(p.price))),
    };
  }).sort((a, b) => a.since.localeCompare(b.since));

  const spentBuy = sum(buyToday, (p) => num(p.total));
  const spentExp = sum((db.expenses || []).filter((x) => x.date === t), (x) => num(x.amount));
  const spentProd = sum(batchToday, (b) => b.extraCost + b.untrackedCost);
  return {
    today: t, materials, hasTracked: materials.length > 0, partners,
    bottles: {
      madeToday: sum(batchToday, (b) => num(b.goodBottles)),
      deliveredToday: sum([...c.deliveries.values()].filter((d) => d.date === t), (d) => num(d.qty)),
      soldToday: sum(salesToday, (s) => num(s.qty)),
      warehouse: sum([...c.batches.values()], (b) => b.stockWarehouse),
      atPartners: sum(open, (d) => d.remaining),
    },
    money: {
      receivedToday: sum(salesToday.filter((s) => s.paid), (s) => s.total),
      spentToday: spentBuy + spentExp + spentProd, spentBuy, spentExp, spentProd,
    },
    cash: cashSummary(db, c),
    alerts: notifications(db).filter((n) => n.kind === 'expiry'),
  };
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
  const purchases = sum((db.purchases || []).filter((x) => inR(x.date)), (x) => num(x.total));
  const stockoutLoss = sum((db.stockouts || []).filter((x) => inR(x.date)), (x) => c.inv.stockoutLoss.get(x.id) || 0);

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
    expiredLoss, returnLoss, expenses, purchases, stockoutLoss,
    lossTotal: expiredLoss + returnLoss + stockoutLoss,
    netProfit: grossProfit - expiredLoss - returnLoss - stockoutLoss - expenses,
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
    .filter((b) => b.stockTotal > 0 && diffDays(b.expiryDate, t) <= expiryLimit(db.settings))
    .map((b) => ({
      batchId: b.id, code: b.code, expiryDate: b.expiryDate, daysLeft: diffDays(b.expiryDate, t),
      stockWarehouse: b.stockWarehouse,
      partners: [...c.deliveries.values()].filter((d) => d.batchId === b.id && d.remaining > 0).map((d) => ({ name: d.partnerName, remaining: d.remaining })),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return { range: { from: from || '', to: to || '' }, today: t, totals, stock, perPartner, perBatch, perCategory, trend, alerts };
}

module.exports = { compute, check, usage, list, report, notifications, home, today };
