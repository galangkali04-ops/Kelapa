// Router sederhana: menghubungkan menu (config.js) dengan halaman (pages/*).
import { PAGES } from './config.js';
import { loadAll } from './api.js';
import { h, closeDialog } from './ui.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderBatches } from './pages/batches.js';
import { renderCrud } from './pages/crud.js';
import { renderSettings } from './pages/settings.js';

// Tambahkan jenis halaman baru di sini jika membuat modul sendiri.
const renderers = { dashboard: renderDashboard, batches: renderBatches, crud: renderCrud, settings: renderSettings };

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const ctx = { data: {}, settings: {}, refresh: async () => { await reload(); await route(); } };

async function reload() {
  const { settings, data } = await loadAll();
  ctx.settings = settings; ctx.data = data;
  const name = settings.businessName || 'Air Kelapa';
  document.getElementById('brand').textContent = name;
  document.title = `${name} · Kelola usaha`;
}

function currentPage() {
  const id = location.hash.replace('#/', '');
  return PAGES.find((p) => p.id === id) || PAGES[0];
}

async function route() {
  const page = currentPage();
  closeMenu();
  document.querySelectorAll('#nav a, #menu-panel a').forEach((a) => {
    if (a.dataset.id === page.id) {
      a.setAttribute('aria-current', 'page');
      // di HP/iPad portrait menu bisa digeser: bawa menu aktif ke tengah
      if (a.closest('#nav') && a.offsetWidth > 0) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2 });
    } else a.removeAttribute('aria-current');
  });
  if (menuBtn) {
    const inMenu = !page.primary;
    menuLabel.textContent = inMenu ? page.label : 'Menu';
    if (inMenu) menuBtn.setAttribute('aria-current', 'true'); else menuBtn.removeAttribute('aria-current');
  }
  try {
    await renderers[page.type](view, page, ctx);
  } catch (e) {
    view.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, 'Halaman tidak bisa dimuat'), h('p', { class: 'muted' }, `${e.message}. Muat ulang halaman atau periksa apakah server masih berjalan.`)));
  }
}

// Menu: di laptop semua tampil di samping. Di HP/iPad portrait hanya menu utama (primary) yang tampil,
// sisanya masuk ke tombol hamburger.
const hasMenu = PAGES.some((p) => p.primary) && PAGES.some((p) => !p.primary);
const link = (p, cls) => h('a', { href: `#/${p.id}`, 'data-id': p.id, class: cls }, p.label);
const menuLabel = h('span', {}, 'Menu');
const menuBtn = hasMenu
  ? h('button', { type: 'button', class: 'menu-btn', 'aria-expanded': 'false', 'aria-controls': 'menu-panel', onclick: () => toggleMenu() },
    h('span', { class: 'burger', 'aria-hidden': 'true' }), menuLabel)
  : null;
const menuPanel = hasMenu
  ? h('div', { id: 'menu-panel', class: 'menu-panel', 'aria-label': 'Menu lainnya' }, PAGES.filter((p) => !p.primary).map((p) => link(p)))
  : null;

function closeMenu() {
  if (!menuPanel) return;
  menuPanel.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
}
function toggleMenu() {
  const open = menuPanel.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
}

nav.append(...PAGES.map((p) => link(p, hasMenu && !p.primary ? 'secondary' : '')));
if (hasMenu) {
  nav.append(menuBtn);
  document.querySelector('.sidebar').append(menuPanel);
  document.addEventListener('click', (e) => { if (!menuPanel.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
}
window.addEventListener('hashchange', () => { closeDialog(); route(); window.scrollTo(0, 0); });
document.getElementById('dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog') closeDialog(); });

reload().then(route).catch((e) => {
  view.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, 'Tidak bisa terhubung ke server'), h('p', { class: 'muted' }, e.message)));
});
