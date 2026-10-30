// Halaman masuk. Dua mode: "Masuk" (sandi sudah ada) dan "Buat sandi" (pertama kali dipakai).
import { passwordField } from './password-field.js';

const form = document.getElementById('form');
const title = document.getElementById('title');
const sub = document.getElementById('sub');

const post = async (path, body) => {
  const res = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'Terjadi kesalahan. Coba lagi.'), { data: json });
  return json;
};

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function build({ setup, minLength }) {
  title.textContent = setup ? 'Buat sandi' : 'Masuk';
  sub.textContent = setup ? `Buat sandi supaya hanya Anda yang bisa membuka aplikasi ini (minimal ${minLength} karakter).` : 'Masukkan sandi untuk membuka aplikasi.';

  const pw = passwordField({ id: 'pw', label: setup ? 'Sandi baru' : 'Sandi', autocomplete: setup ? 'new-password' : 'current-password' });
  const again = setup ? passwordField({ id: 'pw2', label: 'Ulangi sandi', autocomplete: 'new-password' }) : null;

  const remember = el('input', { type: 'checkbox', id: 'remember', checked: false });
  const rememberRow = el('label', { className: 'remember', htmlFor: 'remember' }, remember, el('span', {}, 'Ingat saya 30 hari'));
  const hint = el('p', { className: 'login-hint' }, 'Jangan dicentang di perangkat milik orang lain.');
  const error = el('p', { className: 'form-error', role: 'alert' });
  const submit = el('button', { className: 'btn primary login-submit', type: 'submit' }, setup ? 'Buat sandi dan masuk' : 'Masuk');

  form.replaceChildren(pw.node, ...(again ? [again.node] : []), rememberRow, hint, error, submit);
  pw.input.focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (!pw.input.value) { error.textContent = 'Sandi belum diisi.'; pw.input.focus(); return; }
    if (setup && pw.input.value.length < minLength) { error.textContent = `Sandi minimal ${minLength} karakter.`; pw.input.focus(); return; }
    if (setup && pw.input.value !== again.input.value) { error.textContent = 'Ulangi sandi tidak sama.'; again.input.focus(); return; }
    submit.disabled = true; submit.textContent = 'Memeriksa…';
    try {
      await post(setup ? 'setup' : 'login', { password: pw.input.value, confirm: setup ? again.input.value : undefined, remember: remember.checked });
      location.replace(`/${location.hash}`); // kembali ke halaman yang tadi dibuka
    } catch (ex) {
      error.textContent = ex.message;
      pw.input.select();
      submit.disabled = false; submit.textContent = setup ? 'Buat sandi dan masuk' : 'Masuk';
      if (ex.data && ex.data.needsSetup) init();
    }
  };
}

async function init() {
  try {
    const st = await (await fetch('/api/auth/status')).json();
    if (st.loggedIn) { location.replace(`/${location.hash}`); return; }
    build({ setup: !st.configured, minLength: st.minLength });
  } catch {
    form.replaceChildren(el('p', { className: 'form-error', role: 'alert' }, 'Tidak bisa terhubung ke server. Periksa apakah server masih berjalan, lalu muat ulang halaman.'));
  }
}
init();
