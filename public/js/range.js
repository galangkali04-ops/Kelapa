// Pilihan periode laporan. Dipakai bersama oleh Laporan dan Laporan per mart,
// jadi periode yang dipilih tetap sama saat pindah di antara keduanya.
import { h } from './ui.js';

export const range = { preset: 'month', from: '', to: '' };
const iso = (d) => d.toLocaleDateString('sv-SE');

export function presetDates(p = range.preset) {
  const now = new Date();
  if (p === 'today') return { from: iso(now), to: iso(now) };
  if (p === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
  if (p === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); return { from: iso(s), to: iso(now) }; }
  if (p === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (p === 'custom') return { from: range.from, to: range.to };
  return { from: '', to: '' };
}

// Query string ?from=...&to=... sesuai periode yang dipilih (kosong = semua waktu).
export function rangeQuery() {
  const dates = presetDates();
  const qs = new URLSearchParams();
  if (dates.from) qs.set('from', dates.from);
  if (dates.to) qs.set('to', dates.to);
  return qs.toString();
}

// Kotak pilihan periode. `again` dipanggil setiap pilihan berubah.
export function rangeFilters(again) {
  const preset = h('select', { id: 'preset', onchange: (e) => { range.preset = e.target.value; again(); } },
    [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7d', '7 hari terakhir'], ['month', 'Bulan ini'], ['all', 'Semua waktu'], ['custom', 'Atur tanggal']].map(([v, l]) => h('option', { value: v }, l)));
  preset.value = range.preset;
  const dateInput = (key, label) => {
    const el = h('input', { type: 'date', value: range[key], 'aria-label': label });
    el.addEventListener('change', () => { range[key] = el.value; again(); });
    return el;
  };
  return h('div', { class: 'filters' },
    h('div', { class: 'field' }, h('label', { for: 'preset' }, 'Periode'), preset),
    range.preset === 'custom' ? [h('div', { class: 'field' }, h('label', {}, 'Dari'), dateInput('from', 'Dari tanggal')), h('div', { class: 'field' }, h('label', {}, 'Sampai'), dateInput('to', 'Sampai tanggal'))] : null);
}

// Tombol unduh PDF. `path` mis. '/report/pdf'. Periode yang sedang dipilih ikut terkirim.
export function pdfButton(path, label = 'Unduh PDF', primary = false) {
  const qs = rangeQuery();
  return h('a', { class: primary ? 'btn primary' : 'btn', href: `/api${path}${qs ? `?${qs}` : ''}`, download: '', target: '_blank', rel: 'noopener' }, label);
}
