// Notifikasi: pengingat buatan sendiri (menu Notifikasi) + peringatan otomatis (expired, belum dibayar).
// Semuanya dicek di browser tiap 30 detik selama aplikasi terbuka. Hasilnya masuk ke lonceng,
// dan jika izin perangkat diberikan, muncul juga sebagai notifikasi sistem saat aplikasi di latar belakang.
import { h, toast, openDialog, closeDialog } from './ui.js';
import { api } from './api.js';

const INBOX_KEY = 'kelapa.notif.inbox';
const FIRED_KEY = 'kelapa.notif.fired';
const MAX_INBOX = 50;
const DAY = 86400000;
const KIND = {
  reminder: { label: 'Pengingat', cls: '' },
  expiry: { label: 'Expired', cls: 'warn' },
  unpaid: { label: 'Belum dibayar', cls: 'bad' },
};

/* ---------- Penyimpanan lokal (per perangkat) ---------- */
const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penyimpanan penuh atau dimatikan */ } };

let inbox = [];
let ctxRef = null;
let timer = null;
let busy = false;

/* ---------- Jadwal pengingat ---------- */
// Waktu jadwal terakhir yang sudah lewat (atau null kalau belum ada).
function latestOccurrence(r, now) {
  const [hh, mm] = String(r.time || '').split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (r.repeat === 'once') {
    if (!r.date) return null;
    const d = new Date(`${r.date}T${r.time}:00`);
    return d <= now ? d : null;
  }
  for (let i = 0; i <= 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, hh, mm, 0, 0);
    if (d > now) continue;
    const wd = d.getDay();
    if (r.repeat === 'weekdays' && (wd === 0 || wd === 6)) continue;
    if (r.repeat === 'weekly' && wd !== Number(r.weekday)) continue;
    return d;
  }
  return null;
}

function lateText(minutes) {
  if (minutes < 60) return `${minutes} menit`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam`;
  return `${Math.floor(minutes / 1440)} hari`;
}

// Pengingat yang waktunya sudah tiba. Jadwal sebelum pengingat dibuat/diubah diabaikan,
// begitu juga jadwal yang terlewat lebih dari 2 hari.
export function dueReminders(reminders, now = new Date()) {
  const items = [];
  for (const r of reminders || []) {
    if (!r.active) continue;
    const occ = latestOccurrence(r, now);
    if (!occ) continue;
    const since = new Date(r.updatedAt || r.createdAt || 0);
    if (occ <= since || now - occ > 2 * DAY) continue;
    const late = Math.round((now - occ) / 60000);
    items.push({
      key: `rem:${r.id}:${occ.getTime()}`, kind: 'reminder', page: '',
      title: r.title,
      body: [r.message, late >= 15 ? `(terlewat ${lateText(late)})` : ''].filter(Boolean).join(' '),
    });
  }
  return items;
}

/* ---------- Notifikasi perangkat ---------- */
export function deviceSupport() {
  if (!('Notification' in window)) {
    return { ok: false, reason: 'Browser ini belum mendukung notifikasi perangkat. Di iPhone/iPad, buka aplikasi dari ikon Layar Utama dulu (perlu iOS 16.4 atau lebih baru). Notifikasi di dalam aplikasi (lonceng) tetap jalan.' };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: 'Notifikasi perangkat hanya bisa jalan lewat https atau localhost. Alamat http://192.168… dari HP tidak diizinkan browser. Notifikasi di dalam aplikasi (lonceng) tetap jalan.' };
  }
  return { ok: true, permission: Notification.permission };
}

export async function requestDevicePermission() {
  return Notification.requestPermission();
}

async function deviceNotify(title, body, page) {
  const support = deviceSupport();
  if (!support.ok || Notification.permission !== 'granted') return false;
  const opts = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: page ? `/#/${page}` : '/' } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts); // eslint-disable-line no-new
    return true;
  } catch { return false; }
}

export const sendTestNotification = () => deviceNotify('Notifikasi tes', 'Kalau ini muncul, notifikasi perangkat sudah aktif.', '');

/* ---------- Lonceng + daftar notifikasi ---------- */
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  if (m < 1440) return `${Math.floor(m / 60)} jam lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function updateBell() {
  const unread = inbox.filter((i) => !i.read).length;
  const badge = document.getElementById('bellCount');
  if (!badge) return;
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  document.getElementById('bell').setAttribute('aria-label', unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi');
}

function openInbox() {
  const snapshot = inbox.map((i) => ({ ...i })); // simpan status baca sebelum ditandai
  const list = snapshot.length
    ? h('ul', { class: 'notif-list' }, snapshot.map((i) => {
      const kind = KIND[i.kind] || KIND.reminder;
      return h('li', { class: `notif-item${i.read ? '' : ' unread'}` },
        h('div', { class: 'notif-top' }, h('span', { class: `badge ${kind.cls}` }, kind.label), h('span', { class: 'notif-time' }, ago(i.ts))),
        h('strong', {}, i.title),
        i.body ? h('p', {}, i.body) : null,
        i.page ? h('a', { href: `#/${i.page}`, onclick: closeDialog }, 'Buka halamannya') : null);
    }))
    : h('p', { class: 'empty' }, 'Belum ada notifikasi. Pengingat dan peringatan otomatis akan muncul di sini.');
  openDialog(h('div', { class: 'dialog-body' },
    h('h2', {}, 'Notifikasi'), list,
    h('div', { class: 'form-actions' },
      snapshot.length ? h('button', { class: 'btn', type: 'button', onclick: () => { inbox = []; save(INBOX_KEY, inbox); updateBell(); closeDialog(); } }, 'Kosongkan') : null,
      h('button', { class: 'btn primary', type: 'button', onclick: closeDialog }, 'Tutup'))));
  inbox.forEach((i) => { i.read = true; });
  save(INBOX_KEY, inbox);
  updateBell();
}

/* ---------- Pemeriksaan berkala ---------- */
function announce(items) {
  if (document.visibilityState === 'visible') {
    toast(items.length === 1 ? `${items[0].title}${items[0].body ? ` · ${items[0].body}` : ''}` : `${items.length} notifikasi baru`, '', 7000);
    return;
  }
  if (items.length === 1) deviceNotify(items[0].title, items[0].body, items[0].page);
  else deviceNotify(`${items.length} notifikasi baru`, items.map((i) => i.title).join(' · ').slice(0, 200), '');
}

async function tick() {
  if (busy || !ctxRef) return;
  busy = true;
  try {
    const settings = ctxRef.settings || {};
    if (settings.notifEnabled === false) return;
    let candidates = dueReminders(ctxRef.data.reminders);
    try { candidates = candidates.concat(await api('/notifications')); } catch { /* server tidak terjangkau, coba lagi nanti */ }

    const fired = load(FIRED_KEY, {});
    const fresh = candidates.filter((c) => !fired[c.key]);
    if (!fresh.length) return;

    const now = Date.now();
    for (const c of fresh) fired[c.key] = now;
    for (const k of Object.keys(fired)) if (now - fired[k] > 45 * DAY) delete fired[k];
    save(FIRED_KEY, fired);

    inbox = [...fresh.map((c) => ({ id: c.key, kind: c.kind, title: c.title, body: c.body, page: c.page, ts: now, read: false })), ...inbox].slice(0, MAX_INBOX);
    save(INBOX_KEY, inbox);
    updateBell();
    announce(fresh);
  } finally { busy = false; }
}

// Dipakai saat data direset: kosongkan lonceng dan catatan "sudah diberi tahu" di perangkat ini.
export function clearNotificationHistory() {
  inbox = [];
  save(INBOX_KEY, inbox);
  save(FIRED_KEY, {});
  updateBell();
}

export function startNotifications(ctx) {
  ctxRef = ctx;
  inbox = load(INBOX_KEY, []);
  document.getElementById('bell').addEventListener('click', openInbox);
  updateBell();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  clearInterval(timer);
  timer = setInterval(tick, 30000);
  tick();
}
