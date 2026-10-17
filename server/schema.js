'use strict';
// Daftar field yang dikenal tiap koleksi + aturan validasinya.
// Field lain yang dikirim dari browser (angka/teks/boolean sederhana) tetap disimpan apa adanya.
const schemas = {
  materials: {
    name: { t: 'str', req: true, label: 'Nama bahan' },
    unit: { t: 'str', label: 'Satuan' },
    price: { t: 'num0', label: 'Harga per satuan' },
    note: { t: 'str', label: 'Catatan' },
  },
  partners: {
    name: { t: 'str', req: true, label: 'Nama mitra' },
    type: { t: 'str', label: 'Tipe' },
    scheme: { t: 'enum', values: ['titip', 'putus'], label: 'Skema' },
    price: { t: 'num0', label: 'Harga jual default' },
    contact: { t: 'str', label: 'Kontak' },
    address: { t: 'str', label: 'Alamat' },
    note: { t: 'str', label: 'Catatan' },
  },
  batches: {
    code: { t: 'str', label: 'Kode batch' },
    date: { t: 'date', label: 'Tanggal produksi' },
    shelfLifeDays: { t: 'int0', label: 'Masa simpan' },
    goodBottles: { t: 'int0', req: true, label: 'Botol jadi' },
    rejectBottles: { t: 'int0', label: 'Botol gagal' },
    items: { t: 'items' },
    costs: { t: 'costs' },
    note: { t: 'str', label: 'Catatan' },
  },
  deliveries: {
    date: { t: 'date', label: 'Tanggal' },
    batchId: { t: 'ref', req: true, label: 'Batch' },
    partnerId: { t: 'ref', req: true, label: 'Mitra' },
    qty: { t: 'posint', label: 'Jumlah botol' },
    price: { t: 'num0', label: 'Harga per botol' },
    note: { t: 'str', label: 'Catatan' },
  },
  sales: {
    date: { t: 'date', label: 'Tanggal' },
    deliveryId: { t: 'ref', req: true, label: 'Pengiriman' },
    qty: { t: 'posint', label: 'Jumlah terjual' },
    price: { t: 'num0', label: 'Harga per botol' },
    paid: { t: 'bool' },
    note: { t: 'str', label: 'Catatan' },
  },
  returns: {
    date: { t: 'date', label: 'Tanggal' },
    deliveryId: { t: 'ref', req: true, label: 'Pengiriman' },
    qty: { t: 'posint', label: 'Jumlah botol kembali' },
    condition: { t: 'enum', values: ['layak', 'rusak'], label: 'Kondisi' },
    reason: { t: 'str', label: 'Alasan' },
    note: { t: 'str', label: 'Catatan' },
  },
  expirations: {
    date: { t: 'date', label: 'Tanggal' },
    deliveryId: { t: 'ref', label: 'Pengiriman' },
    batchId: { t: 'ref', label: 'Batch' },
    qty: { t: 'posint', label: 'Jumlah expired' },
    note: { t: 'str', label: 'Catatan' },
  },
  expenses: {
    date: { t: 'date', label: 'Tanggal' },
    category: { t: 'str', req: true, label: 'Kategori' },
    description: { t: 'str', label: 'Keterangan' },
    amount: { t: 'num0', req: true, label: 'Nominal' },
    note: { t: 'str', label: 'Catatan' },
  },
};

const isSimple = (v) => ['string', 'number', 'boolean'].includes(typeof v);

function sanitize(col, body) {
  const spec = schemas[col];
  const out = {};
  for (const [k, f] of Object.entries(spec)) {
    let v = body[k];
    const label = f.label || k;
    switch (f.t) {
      case 'str':
        v = v == null ? '' : String(v).trim().slice(0, 500);
        if (f.req && !v) return { error: `${label} wajib diisi.` };
        break;
      case 'num0':
        v = v === '' || v == null ? 0 : Number(v);
        if (!Number.isFinite(v) || v < 0) return { error: `${label} harus berupa angka 0 atau lebih.` };
        if (f.req && v === 0) return { error: `${label} wajib diisi.` };
        break;
      case 'int0':
        v = v === '' || v == null ? 0 : Number(v);
        if (!Number.isInteger(v) || v < 0) return { error: `${label} harus berupa bilangan bulat 0 atau lebih.` };
        break;
      case 'posint':
        v = Number(v);
        if (!Number.isInteger(v) || v <= 0) return { error: `${label} harus bilangan bulat lebih dari 0.` };
        break;
      case 'date':
        v = String(v || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return { error: `${label} tidak valid.` };
        break;
      case 'bool':
        v = v === true || v === 'true' || v === 'on';
        break;
      case 'ref':
        v = v ? String(v) : '';
        if (f.req && !v) return { error: `${label} wajib dipilih.` };
        break;
      case 'enum':
        v = f.values.includes(v) ? v : f.values[0];
        break;
      case 'items':
        v = (Array.isArray(v) ? v : []).map((i) => ({
          materialId: String(i.materialId || ''),
          name: String(i.name || '').trim().slice(0, 120),
          unit: String(i.unit || '').trim().slice(0, 30),
          qty: Number(i.qty),
          price: Number(i.price) || 0,
        }));
        if (v.some((i) => !i.name || !Number.isFinite(i.qty) || i.qty < 0 || i.price < 0)) {
          return { error: 'Ada baris bahan yang tidak valid (nama, jumlah, atau harga).' };
        }
        break;
      case 'costs':
        v = (Array.isArray(v) ? v : []).map((c) => ({ name: String(c.name || '').trim().slice(0, 120), amount: Number(c.amount) }));
        if (v.some((c) => !c.name || !Number.isFinite(c.amount) || c.amount < 0)) {
          return { error: 'Ada baris biaya tambahan yang tidak valid.' };
        }
        break;
      default:
        break;
    }
    out[k] = v;
  }
  for (const [k, v] of Object.entries(body)) {
    if (k in spec || k === 'id' || k === 'createdAt' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) continue;
    if (isSimple(v)) out[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return { value: out };
}

module.exports = { schemas, sanitize, isSimple };
