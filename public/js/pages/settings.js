// Pengaturan usaha, backup, dan restore data.
import { h, pageHeader, buildFields, toast, confirmBox, openDialog, closeDialog, setChildren } from '../ui.js';
import { api, logout } from '../api.js';
import { passwordField } from '../password-field.js';
import { deviceSupport, requestDevicePermission, sendTestNotification, clearNotificationHistory } from '../notify.js';

export function renderSettings(root, page, ctx) {
  const { node, getValues } = buildFields(page.fields, ctx.settings, ctx);
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Simpan pengaturan');
  const form = h('form', {
    class: 'settings-grid',
    onsubmit: async (e) => {
      e.preventDefault(); save.disabled = true;
      try { await api('/settings', { method: 'PUT', body: getValues() }); toast('Pengaturan disimpan'); await ctx.refresh(); } catch (ex) { toast(ex.message, 'error'); } finally { save.disabled = false; }
    },
  }, node, h('div', { class: 'form-actions', style: 'justify-content:flex-start' }, save));

  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    if (!(await confirmBox('Pulihkan dari file ini? Semua data sekarang akan diganti.', 'Pulihkan'))) { file.value = ''; return; }
    try { await api('/restore', { method: 'POST', body: JSON.parse(await f.text()) }); toast('Data dipulihkan'); await ctx.refresh(); } catch (ex) { toast(ex.message || 'File tidak bisa dibaca', 'error'); }
    file.value = '';
  });

  // Ganti sandi: sandi lama + sandi baru dua kali, masing-masing punya tombol mata.
  async function askChangePassword() {
    const st = await (await fetch('/api/auth/status')).json().catch(() => ({}));
    const cur = passwordField({ id: 'pwCur', label: 'Sandi lama', autocomplete: 'current-password' });
    const nxt = passwordField({ id: 'pwNew', label: `Sandi baru (minimal ${st.minLength || 6} karakter)`, autocomplete: 'new-password' });
    const rep = passwordField({ id: 'pwRep', label: 'Ulangi sandi baru', autocomplete: 'new-password' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const go = h('button', { class: 'btn primary', type: 'submit' }, 'Simpan sandi');
    const form = h('form', { class: 'fields', style: 'grid-template-columns:1fr', novalidate: true }, cur.node, nxt.node, rep.node, err,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Batal'), go));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (nxt.input.value !== rep.input.value) { err.textContent = 'Ulangi sandi tidak sama.'; rep.input.focus(); return; }
      go.disabled = true;
      try {
        await api('/auth/password', { method: 'POST', body: { current: cur.input.value, next: nxt.input.value, confirm: rep.input.value } });
        closeDialog();
        toast('Sandi diganti. Perangkat lain perlu masuk lagi.', '', 6000);
      } catch (ex) { err.textContent = ex.message; go.disabled = false; }
    });
    openDialog(h('div', { class: 'dialog-body' }, h('h2', {}, 'Ganti sandi'),
      st.managedByEnv ? h('p', { class: 'muted' }, 'Sandi diatur lewat APP_PASSWORD di server, jadi tidak bisa diganti dari sini.') : form));
    cur.input.focus();
  }

  // Mulai dari awal: wajib mengetik HAPUS, dan server menyimpan salinan otomatis sebelum menghapus.
  function askReset(mode) {
    const all = mode === 'all';
    const word = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Ketik HAPUS', 'aria-label': 'Ketik HAPUS untuk konfirmasi' });
    const go = h('button', { class: 'btn danger', type: 'button', disabled: true }, all ? 'Hapus semua data' : 'Hapus transaksi');
    const err = h('p', { class: 'form-error', role: 'alert' });
    word.addEventListener('input', () => { go.disabled = word.value.trim().toUpperCase() !== 'HAPUS'; });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const res = await api('/reset', { method: 'POST', body: { mode, confirm: 'HAPUS' } });
        clearNotificationHistory();
        closeDialog();
        toast(`Data direset. Salinan lama tersimpan di data/${res.backupFile}`, '', 8000);
        location.hash = '#/home';
        await ctx.refresh();
      } catch (ex) { err.textContent = ex.message; go.disabled = false; }
    });
    openDialog(h('div', { class: 'dialog-body' },
      h('h2', {}, all ? 'Hapus semua data?' : 'Hapus semua transaksi?'),
      h('p', {}, all
        ? 'Semua batch, belanja, penjualan, pengeluaran, bahan, mitra, pengingat, dan pengaturan dikembalikan seperti aplikasi baru.'
        : 'Semua batch, belanja, pengiriman, penjualan, retur, expired, bahan terbuang, pengeluaran, dan catatan modal dihapus. Daftar bahan, mitra, pengingat, dan pengaturan tetap ada.'),
      h('p', { class: 'muted', style: 'margin:10px 0 14px' }, 'Sebelum dihapus, aplikasi menyimpan salinan otomatis di folder data/ komputer server. File itu bisa dipakai lewat Pulihkan dari file.'),
      word, err,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Batal'), go)));
    word.focus();
  }

  // Izin notifikasi perangkat berlaku per browser/perangkat, jadi tidak disimpan di server.
  const status = h('p', { class: 'notif-status' });
  const ask = h('button', { class: 'btn', type: 'button' }, 'Izinkan notifikasi di perangkat ini');
  const test = h('button', { class: 'btn', type: 'button' }, 'Kirim notifikasi tes');
  const syncDevice = () => {
    const s = deviceSupport();
    if (!s.ok) { status.textContent = s.reason; ask.hidden = true; test.hidden = true; return; }
    status.textContent = { granted: 'Notifikasi perangkat sudah aktif di perangkat ini.', denied: 'Notifikasi diblokir di browser ini. Izinkan lewat pengaturan situs di browser, lalu muat ulang halaman.', default: 'Belum diizinkan. Klik tombol di bawah, lalu pilih Izinkan.' }[s.permission];
    ask.hidden = s.permission !== 'default';
    test.hidden = s.permission !== 'granted';
  };
  ask.addEventListener('click', async () => { await requestDevicePermission(); syncDevice(); });
  test.addEventListener('click', async () => { const ok = await sendTestNotification(); toast(ok ? 'Notifikasi tes dikirim' : 'Notifikasi tidak bisa ditampilkan', ok ? '' : 'error'); });
  syncDevice();

  setChildren(root, 
    pageHeader('Pengaturan'),
    h('div', { class: 'panel' }, form,
      h('div', { class: 'settings-block' }, h('h2', {}, 'Keamanan'),
        h('p', {}, 'Aplikasi terkunci dengan sandi. Dengan "Ingat saya 30 hari", perangkat tidak perlu memasukkan sandi lagi selama 30 hari.'),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', type: 'button', onclick: askChangePassword }, 'Ganti sandi'),
          h('button', { class: 'btn', type: 'button', onclick: logout }, 'Keluar dari perangkat ini'))),
      h('div', { class: 'settings-block' }, h('h2', {}, 'Pengingat'),
        h('p', {}, 'Buat pengingat sendiri, misalnya kirim botol ke mart atau belanja kelapa, lengkap dengan jam dan pengulangan.'),
        h('a', { class: 'btn', href: '#/reminders' }, 'Kelola pengingat')),
      h('div', { class: 'settings-block' }, h('h2', {}, 'Notifikasi di perangkat ini'),
        h('p', {}, 'Notifikasi hanya muncul selama aplikasi masih terbuka (boleh di latar belakang). Kalau aplikasi ditutup penuh, pengingat yang terlewat akan muncul di lonceng saat aplikasi dibuka lagi.'),
        status, h('div', { class: 'row-actions' }, ask, test)),
      h('div', { class: 'settings-block' }, h('h2', {}, 'Cadangan data'),
        h('p', {}, 'Unduh cadangan secara berkala. File ini berisi semua bahan, batch, mitra, pengeluaran, dan transaksi, dan bisa dipulihkan kapan saja.'),
        h('div', { class: 'row-actions' },
          h('a', { class: 'btn', href: '/api/backup', download: '' }, 'Unduh cadangan'),
          h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Pulihkan dari file'), file)),
      h('div', { class: 'settings-block' }, h('h2', {}, 'Mulai dari awal'),
        h('p', {}, 'Untuk mengosongkan data uji coba atau memulai pembukuan baru. Unduh cadangan dulu kalau ragu. Aplikasi juga menyimpan salinan otomatis sebelum menghapus.'),
        h('div', { class: 'danger-zone' }, h('h3', {}, 'Hapus transaksi saja'),
          h('p', {}, 'Mengosongkan batch, belanja, penjualan, pengeluaran, dan kas. Daftar bahan, mitra, pengingat, dan pengaturan tetap ada.'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => askReset('transactions') }, 'Hapus transaksi…')),
        h('div', { class: 'danger-zone' }, h('h3', {}, 'Hapus semua data'),
          h('p', {}, 'Kembali seperti aplikasi baru, termasuk mitra, bahan, dan pengaturan.'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => askReset('all') }, 'Hapus semua…')))));
}
