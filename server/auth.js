'use strict';
// Sandi masuk aplikasi.
// - Sandi disimpan sebagai hash scrypt di data/auth.json (terpisah dari db.json, jadi tidak ikut backup/reset/pulihkan).
// - Sesi disimpan di data/sessions.json (hanya hash token), jadi tetap berlaku walau server dinyalakan ulang.
// - Kalau APP_PASSWORD diisi lewat environment, sandi itu dipakai dan tidak bisa diganti dari aplikasi.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const DIR = path.dirname(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
const AUTH_FILE = path.join(DIR, 'auth.json');
const SESSION_FILE = path.join(DIR, 'sessions.json');

const COOKIE = 'dewa_session';
const DAY = 86400000;
const REMEMBER_MS = 30 * DAY;      // "Ingat saya 30 hari"
const SHORT_MS = 12 * 3600000;     // tanpa dicentang: berakhir saat browser ditutup, maksimal 12 jam
const MIN_LEN = 6;
const MAX_LEN = 128;
const MAX_FAILS = 5;               // salah sandi 5x...
const LOCK_MS = 5 * 60000;         // ...dikunci 5 menit

const envPassword = () => process.env.APP_PASSWORD || '';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ---------- Sandi ---------- */
const isConfigured = () => !!envPassword() || !!readJson(AUTH_FILE, null);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return { salt: salt.toString('hex'), hash: key.toString('hex'), updatedAt: new Date().toISOString() };
}

async function verifyPassword(password) {
  if (typeof password !== 'string' || !password || password.length > MAX_LEN) return false;
  if (envPassword()) return safeEqual(sha(password), sha(envPassword()));
  const rec = readJson(AUTH_FILE, null);
  if (!rec) return false;
  const key = await scrypt(password, Buffer.from(rec.salt, 'hex'), 64);
  return safeEqual(key.toString('hex'), rec.hash);
}

function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LEN) return `Sandi minimal ${MIN_LEN} karakter.`;
  if (password.length > MAX_LEN) return `Sandi maksimal ${MAX_LEN} karakter.`;
  return null;
}

async function setPassword(password) {
  writeJson(AUTH_FILE, await hashPassword(password));
}

/* ---------- Sesi ---------- */
const loadSessions = () => {
  const all = readJson(SESSION_FILE, {});
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(all)) if (all[k].exp <= now) { delete all[k]; changed = true; }
  if (changed) writeJson(SESSION_FILE, all);
  return all;
};

function createSession(remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  const ttl = remember ? REMEMBER_MS : SHORT_MS;
  sessions[sha(token)] = { exp: Date.now() + ttl, remember: !!remember, created: new Date().toISOString() };
  writeJson(SESSION_FILE, sessions);
  return { token, ttl, remember: !!remember };
}

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
  const i = p.indexOf('=');
  return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
}));

const tokenOf = (req) => parseCookies(req.headers.cookie)[COOKIE] || '';

function isLoggedIn(req) {
  const token = tokenOf(req);
  if (!token) return false;
  const s = loadSessions()[sha(token)];
  return !!s && s.exp > Date.now();
}

function destroySession(req) {
  const token = tokenOf(req);
  if (!token) return;
  const sessions = loadSessions();
  delete sessions[sha(token)];
  writeJson(SESSION_FILE, sessions);
}

// Setelah sandi diganti: semua perangkat lain harus masuk lagi, perangkat ini tetap masuk.
function destroyOtherSessions(req) {
  const keep = sha(tokenOf(req));
  const sessions = loadSessions();
  for (const k of Object.keys(sessions)) if (k !== keep) delete sessions[k];
  writeJson(SESSION_FILE, sessions);
}

function cookieHeader(req, session) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${COOKIE}=${session.token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (session.remember) parts.push(`Max-Age=${Math.floor(session.ttl / 1000)}`); // tanpa Max-Age = hilang saat browser ditutup
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
const clearCookie = (req) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

/* ---------- Batas percobaan salah sandi (per alamat IP) ---------- */
const attempts = new Map();
const ipOf = (req) => req.socket.remoteAddress || 'unknown';

function lockRemaining(req) {
  const a = attempts.get(ipOf(req));
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0;
}
function recordFail(req) {
  const ip = ipOf(req);
  const a = attempts.get(ip) || { fails: 0, until: 0 };
  if (a.until && a.until <= Date.now()) { a.fails = 0; a.until = 0; }
  a.fails += 1;
  if (a.fails >= MAX_FAILS) { a.until = Date.now() + LOCK_MS; a.fails = 0; }
  attempts.set(ip, a);
}
const recordSuccess = (req) => attempts.delete(ipOf(req));

/* ---------- Penjaga akses ---------- */
// Yang boleh dibuka tanpa masuk: halaman masuk beserta file pendukungnya dan endpoint /api/auth.
const PUBLIC = [/^\/login\.html$/, /^\/css\/style\.css$/, /^\/js\/(login|password-field)\.js$/, /^\/icons\//, /^\/manifest\.webmanifest$/, /^\/api\/auth\//];

function guard(req, res, next) {
  if (PUBLIC.some((re) => re.test(req.path)) || isLoggedIn(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk lagi.', login: true });
  return res.redirect(302, '/login.html'); // fragmen (#/halaman) ikut terbawa oleh browser
}

/* ---------- Endpoint /api/auth ---------- */
const express = require('express');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/status', (req, res) => res.json({
  configured: isConfigured(), loggedIn: isLoggedIn(req), managedByEnv: !!envPassword(), minLength: MIN_LEN,
}));

function startSession(req, res, remember) {
  const session = createSession(remember);
  res.set('Set-Cookie', cookieHeader(req, session));
}

// Buat sandi pertama kali (hanya bisa kalau belum ada sandi).
router.post('/setup', async (req, res) => {
  if (isConfigured()) return res.status(409).json({ error: 'Sandi sudah dibuat. Silakan masuk.' });
  const { password, confirm, remember } = req.body || {};
  const bad = checkNewPassword(password);
  if (bad) return res.status(400).json({ error: bad });
  if (password !== confirm) return res.status(400).json({ error: 'Ulangi sandi tidak sama.' });
  await setPassword(password);
  startSession(req, res, remember !== false);
  return res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  if (!isConfigured()) return res.status(409).json({ error: 'Belum ada sandi. Buat sandi dulu.', needsSetup: true });
  const wait = lockRemaining(req);
  if (wait) return res.status(429).json({ error: `Terlalu banyak percobaan salah. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, retryAfter: wait });
  const { password, remember } = req.body || {};
  if (!(await verifyPassword(password))) {
    recordFail(req);
    await new Promise((r) => setTimeout(r, 400)); // memperlambat tebak-tebakan
    const left = lockRemaining(req);
    return res.status(401).json({ error: left ? 'Sandi salah. Akses dikunci 5 menit.' : 'Sandi salah.' });
  }
  recordSuccess(req);
  startSession(req, res, !!remember);
  return res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  destroySession(req);
  res.set('Set-Cookie', clearCookie(req));
  res.json({ ok: true });
});

// Ganti sandi (harus sudah masuk).
router.post('/password', async (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk lagi.', login: true });
  if (envPassword()) return res.status(400).json({ error: 'Sandi diatur lewat APP_PASSWORD di server, jadi tidak bisa diganti dari sini.' });
  const wait = lockRemaining(req);
  if (wait) return res.status(429).json({ error: `Terlalu banyak percobaan salah. Coba lagi dalam ${Math.ceil(wait / 60)} menit.` });
  const { current, next, confirm } = req.body || {};
  if (!(await verifyPassword(current))) { recordFail(req); return res.status(401).json({ error: 'Sandi lama salah.' }); }
  const bad = checkNewPassword(next);
  if (bad) return res.status(400).json({ error: bad });
  if (next !== confirm) return res.status(400).json({ error: 'Ulangi sandi tidak sama.' });
  recordSuccess(req);
  await setPassword(next);
  destroyOtherSessions(req);
  return res.json({ ok: true });
});

module.exports = { router, guard, isConfigured, MIN_LEN };
