// Kolom sandi dengan tombol mata untuk melihat / menyembunyikan sandi. Dipakai di halaman masuk dan di Pengaturan.
const EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a17.7 17.7 0 0 1 4.1-4.9M9.9 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 7 10 7a17.8 17.8 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/></svg>';

export function passwordField({ id, label, autocomplete = 'current-password', placeholder = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.htmlFor = id; lab.textContent = label;

  const box = document.createElement('div');
  box.className = 'pw-box';
  const input = document.createElement('input');
  Object.assign(input, { id, type: 'password', autocomplete, placeholder, required: true });
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');

  const eye = document.createElement('button');
  eye.type = 'button'; eye.className = 'pw-eye'; eye.innerHTML = EYE;
  eye.setAttribute('aria-label', 'Tampilkan sandi'); eye.setAttribute('aria-pressed', 'false');
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.innerHTML = show ? EYE_OFF : EYE;
    eye.setAttribute('aria-label', show ? 'Sembunyikan sandi' : 'Tampilkan sandi');
    eye.setAttribute('aria-pressed', String(show));
    input.focus({ preventScroll: true });
  });

  box.append(input, eye);
  wrap.append(lab, box);
  return { node: wrap, input };
}
