// Fungsi bantu tampilan: membuat elemen, format angka, dialog, form, tabel, grafik.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- Format ---------- */
const rpFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat('id-ID');
export const rp = (n) => rpFmt.format(Math.round(Number(n) || 0)).replace(/\s/g, ' ');
export const int = (n) => intFmt.format(Number(n) || 0);
const rpdFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const rpd = (n) => rpdFmt.format(Number(n) || 0).replace(/\s/g, ' ');
export const fmtMonth = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '');
export const pct = (n) => `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`;
export const today = () => new Date().toLocaleDateString('sv-SE');
export const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/* ---------- Toast ---------- */
let toastTimer;
export function toast(message, kind = '', ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, ms);
}

/* ---------- Dialog ---------- */
const dialogEl = () => document.getElementById('dialog');
export function openDialog(node) {
  const d = dialogEl();
  d.replaceChildren(node);
  if (!d.open) d.showModal();
}
export function closeDialog() { const d = dialogEl(); if (d.open) d.close(); }

export function confirmBox(message, okLabel = 'Hapus') {
  return new Promise((resolve) => {
    const done = (v) => { closeDialog(); resolve(v); };
    openDialog(h('div', { class: 'dialog-body' },
      h('h2', {}, message),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Batal'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => done(true) }, okLabel))));
    dialogEl().addEventListener('close', () => resolve(false), { once: true });
  });
}

export function formShell({ title, children, onSubmit, submitLabel = 'Simpan', wide = false }) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn primary' }, submitLabel);
  const form = h('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      save.disabled = true;
      try { await onSubmit(); closeDialog(); } catch (ex) { err.textContent = ex.message; } finally { save.disabled = false; }
    },
  }, children, err,
  h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Batal'), save));
  openDialog(h('div', { class: `dialog-body${wide ? ' wide' : ''}` }, h('h2', {}, title), form));
}

/* ---------- Form dari definisi field (lihat config.js) ---------- */
function resolveOptions(f, ctx, current) {
  let opts = [];
  if (typeof f.options === 'function') opts = f.options(ctx.data, ctx.settings);
  else if (Array.isArray(f.options)) opts = f.options;
  else if (f.source) {
    opts = (ctx.data[f.source] || [])
      .filter((i) => i.id === current || !f.filter || f.filter(i))
      .map((i) => ({ value: i.id, label: f.label_of ? f.label_of(i) : i.name || i.code }));
  }
  return opts.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/* ---------- Daftar baris dinamis: bahan per botol (mode 'materials') atau biaya (mode 'costs') ---------- */
function linesWidget(f, initial, ctx) {
  const rows = (Array.isArray(initial) ? initial : []).map((r) => ({ ...r }));
  const box = h('div', { class: 'lines-box' });
  const isMat = f.mode === 'materials';
  const materials = ctx.data.materials || [];
  const hint = (row) => {
    const m = materials.find((x) => x.id === row.materialId);
    return m ? `${rpd(m.costPerUse)} per ${m.unit || 'pemakaian'}` : '';
  };
  const draw = () => {
    box.replaceChildren();
    if (!rows.length) box.append(h('p', { class: 'muted', style: 'margin-bottom:8px' }, f.emptyText || 'Belum ada baris.'));
    rows.forEach((row, idx) => {
      const remove = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Hapus baris', onclick: () => { rows.splice(idx, 1); draw(); } }, '✕');
      const num = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: isMat ? 'Jumlah' : 'Nominal (Rp)' });
      num.value = isMat ? (row.qty ?? '') : (row.amount ?? '');
      num.addEventListener('input', () => { if (isMat) row.qty = num.value; else row.amount = num.value; });
      if (isMat) {
        const sel = h('select', { 'aria-label': 'Bahan' }, h('option', { value: '' }, '— pilih bahan —'), materials.map((m) => h('option', { value: m.id }, m.name)));
        sel.value = row.materialId || '';
        const hintEl = h('span', { class: 'muted' }, hint(row));
        sel.addEventListener('change', () => { row.materialId = sel.value; hintEl.textContent = hint(row); });
        box.append(h('div', { class: 'line mat' }, sel, num, hintEl, remove));
      } else {
        const name = h('input', { type: 'text', list: `dl_${f.key}`, placeholder: 'Nama biaya', autocomplete: 'off' });
        name.value = row.name || '';
        name.addEventListener('input', () => { row.name = name.value; });
        box.append(h('div', { class: 'line cost' }, name, num, remove));
      }
    });
  };
  draw();
  const suggestions = typeof f.suggest === 'function' ? f.suggest(ctx.data, ctx.settings) : f.suggest || [];
  const node = h('div', {}, box, !isMat ? h('datalist', { id: `dl_${f.key}` }, suggestions.map((x) => h('option', { value: x }))) : null,
    h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push(isMat ? { materialId: '', qty: 1 } : { name: '', amount: '' }); draw(); } }, f.addLabel || 'Tambah baris'));
  const get = () => (isMat
    ? rows.filter((r) => r.materialId && Number(r.qty) > 0).map((r) => ({ materialId: r.materialId, qty: Number(r.qty) }))
    : rows.filter((r) => r.name && Number(r.amount) >= 0 && r.amount !== '').map((r) => ({ name: r.name, amount: Number(r.amount) })));
  return { node, get };
}

export function buildFields(fields, values, ctx) {
  const node = h('div', { class: 'fields' });
  const inputs = {};
  const getters = {};
  const wrappers = {};
  for (const f of fields) {
    const id = `f_${f.key}`;
    if (f.type === 'heading') {
      node.append(h('div', { class: 'field full fields-heading' }, h('h3', {}, f.label), f.help ? h('p', { class: 'muted' }, f.help) : null));
      continue;
    }
    if (f.type === 'lines') {
      const widget = linesWidget(f, values[f.key] ?? f.default, ctx);
      getters[f.key] = widget.get;
      node.append(h('div', { class: 'field full' }, h('span', { class: 'lbl' }, f.label), widget.node, f.help ? h('span', { class: 'help' }, f.help) : null));
      continue;
    }
    let v = values[f.key];
    if (v === undefined) v = typeof f.default === 'function' ? f.default(ctx) : f.default === 'today' ? today() : f.default;
    if (v === undefined || v === null) v = f.type === 'checkbox' ? false : '';
    let input;
    let extra = null;
    if (f.type === 'select') {
      input = h('select', { id, name: f.key, required: !!f.required });
      input.append(h('option', { value: '' }, f.emptyLabel || '— pilih —'));
      for (const o of resolveOptions(f, ctx, v)) input.append(h('option', { value: o.value }, o.label));
      input.value = v;
    } else if (f.type === 'textarea') {
      input = h('textarea', { id, name: f.key, rows: 2 });
      input.value = v;
    } else if (f.type === 'checkbox') {
      input = h('input', { id, name: f.key, type: 'checkbox' });
      input.checked = !!v;
    } else {
      const numeric = ['number', 'money', 'int'].includes(f.type);
      input = h('input', {
        id, name: f.key, required: !!f.required, placeholder: f.placeholder,
        type: numeric ? 'number' : f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : f.type === 'time' ? 'time' : 'text',
        step: f.type === 'int' ? '1' : numeric ? 'any' : null,
        min: numeric ? '0' : null, inputmode: numeric ? 'decimal' : null,
        list: f.suggest ? `dl_${f.key}` : null, autocomplete: 'off',
      });
      input.value = v;
      if (f.suggest) {
        const list = typeof f.suggest === 'function' ? f.suggest(ctx.data, ctx.settings) : f.suggest;
        extra = h('datalist', { id: `dl_${f.key}` }, list.map((s) => h('option', { value: s })));
      }
    }
    inputs[f.key] = input;
    const wrap = h('div', { class: `field${f.full || f.type === 'textarea' ? ' full' : ''}${f.type === 'checkbox' ? ' check' : ''}` },
      h('label', { for: id }, f.label), input, extra, f.help ? h('span', { class: 'help' }, f.help) : null);
    wrappers[f.key] = wrap;
    node.append(wrap);
  }
  // Tampilkan isian hanya jika isian lain bernilai tertentu: showIf: { field, in: ['nilai'] }.
  // Checkbox bernilai 'true' atau 'false'. Isian yang disembunyikan tidak ikut diwajibkan.
  const valueOf = (el) => (el.type === 'checkbox' ? String(el.checked) : el.value);
  const applyVisibility = () => {
    for (const f of fields) {
      if (!f.showIf || !wrappers[f.key]) continue;
      const src = f.showIf.field;
      const visible = !(wrappers[src] && wrappers[src].hidden) && !!inputs[src] && f.showIf.in.includes(valueOf(inputs[src]));
      wrappers[f.key].hidden = !visible;
      if (f.required) inputs[f.key].required = visible;
    }
  };
  for (const f of fields) if (f.showIf && inputs[f.showIf.field]) inputs[f.showIf.field].addEventListener('change', applyVisibility);
  applyVisibility();
  // Isi otomatis dari field lain (mis. harga dari mitra yang dipilih).
  for (const f of fields) {
    if (!f.defaultFrom || !inputs[f.key]) continue;
    const { field, source, prop } = f.defaultFrom;
    const target = inputs[f.key];
    if (values[f.key] !== undefined && values[f.key] !== '') target.dataset.touched = '1';
    target.addEventListener('input', () => { target.dataset.touched = '1'; });
    inputs[field].addEventListener('change', () => {
      const item = (ctx.data[source] || []).find((x) => x.id === inputs[field].value);
      if (item && !target.dataset.touched) target.value = item[prop] ?? '';
    });
  }
  const getValues = () => {
    const out = {};
    for (const f of fields) {
      if (f.type === 'heading') continue;
      if (getters[f.key]) { out[f.key] = getters[f.key](); continue; }
      const el = inputs[f.key];
      if (f.type === 'checkbox') out[f.key] = el.checked;
      else if (['number', 'money', 'int'].includes(f.type)) out[f.key] = el.value === '' ? '' : Number(el.value);
      else out[f.key] = el.value;
    }
    return out;
  };
  return { node, inputs, getValues };
}

export function formDialog({ title, fields, values = {}, ctx, submitLabel, onSubmit, preview }) {
  const { node, getValues } = buildFields(fields, values, ctx);
  let children = node;
  if (preview) { // teks hitungan langsung di bawah isian, mis. harga per botol dari bal
    const bar = h('div', { class: 'preview' });
    const update = () => { bar.textContent = preview(getValues(), ctx); };
    node.addEventListener('input', update); node.addEventListener('change', update); update();
    children = h('div', {}, node, bar);
  }
  formShell({ title, children, submitLabel, onSubmit: () => onSubmit(getValues()) });
}

/* ---------- Tabel ---------- */
const numericTypes = ['rp', 'rpd', 'int', 'pct'];
function cell(c, r) {
  if (c.render) return c.render(r);
  const v = r[c.key];
  switch (c.type) {
    case 'rp': return rp(v);
    case 'int': return int(v);
    case 'rpd': return rpd(v);
    case 'month': return fmtMonth(v);
    case 'pct': return pct(v);
    case 'date': return fmtDate(v);
    default: return v ?? '';
  }
}

export function dataTable(columns, rows, { actions, emptyText = 'Belum ada data.', stack = false } = {}) {
  if (!rows.length) return h('p', { class: 'empty' }, emptyText);
  const cls = (c) => (numericTypes.includes(c.type) ? 'num' : '');
  return h('div', { class: 'table-wrap' }, h('table', { class: stack ? 'stack' : null },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: cls(c) }, c.label)), actions ? h('th', {}) : null)),
    h('tbody', {}, rows.map((r) => h('tr', {},
      columns.map((c) => h('td', { class: cls(c), 'data-label': c.label }, cell(c, r))),
      actions ? h('td', { class: 'actions' }, actions(r)) : null)))));
}

export function pageHeader(title, intro, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), intro ? h('p', { class: 'intro' }, intro) : null),
    h('div', { class: 'row-actions' }, actions));
}

/* ---------- Grafik batang sederhana (SVG) ---------- */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const shortRp = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));

export function trendChart(points) {
  const small = window.innerWidth < 640; // di HP grafik dibuat lebih ringkas supaya teks tetap terbaca
  const W = small ? 380 : 720; const H = small ? 260 : 240; const P = { l: small ? 46 : 58, r: 8, t: 12, b: 30 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Grafik omzet dan profit' });
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.profit]));
  const iw = W - P.l - P.r; const ih = H - P.t - P.b;
  const step = iw / points.length; const bw = Math.min(26, step / 2.6);
  for (let i = 0; i <= 4; i += 1) {
    const y = P.t + ih - (ih * i) / 4;
    svg.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: 'grid' }),
      svgEl('text', { x: P.l - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' }, shortRp((max * i) / 4)));
  }
  points.forEach((p, i) => {
    const cx = P.l + step * i + step / 2;
    const hr = (ih * p.revenue) / max; const hp = Math.max(0, (ih * p.profit) / max);
    const rev = svgEl('rect', { x: cx - bw - 1, y: P.t + ih - hr, width: bw, height: hr, class: 'bar-rev' });
    const pro = svgEl('rect', { x: cx + 1, y: P.t + ih - hp, width: bw, height: hp, class: 'bar-profit' });
    rev.append(svgEl('title', {}, `${p.label || fmtDate(p.date)}: omzet ${rp(p.revenue)}`));
    pro.append(svgEl('title', {}, `${p.label || fmtDate(p.date)}: profit ${rp(p.profit)}`));
    svg.append(rev, pro);
    if (points.length <= 8 || i % 2 === 0) {
      svg.append(svgEl('text', { x: cx, y: H - 10, class: 'tick', 'text-anchor': 'middle' }, p.label || `${p.date.slice(8)}/${p.date.slice(5, 7)}`));
    }
  });
  return svg;
}
