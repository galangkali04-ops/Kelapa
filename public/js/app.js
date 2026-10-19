// Router sederhana: menghubungkan menu (config.js) dengan halaman (pages/*).
import { PAGES } from './config.js';
import { loadAll } from './api.js';
import { h, closeDialog } from './ui.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderBatches } from './pages/batches.js';
import { renderCrud } from './pages/crud.js';
import { renderSettings } from './pages/settings.js';
import { renderHome } from './pages/home.js';
import { renderStock } from './pages/stock.js';
import { renderVisit } from './pages/visit.js';
import { startNotifications } from './notify.js';
import { initMenu } from './menu.js';

// Tambahkan jenis halaman baru di sini jika membuat modul sendiri.
const renderers = { stock: renderStock, home: renderHome, visit: renderVisit, dashboard: renderDashboard, batches: renderBatches, crud: renderCrud, settings: renderSettings };

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const ctx = { data: {}, settings: {}, params: new URLSearchParams(), refresh: async () => { await reload(); await route(); } };

async function reload() {
  const { settings, data } = await loadAll();
  ctx.settings = settings; ctx.data = data;
  const name = settings.businessName || 'Air Kelapa';
  document.getElementById('brand').textContent = name;
  document.title = `${name} · Kelola usaha`;
}

// Alamat: #/halaman atau #/halaman?parameter (mis. ?add membuka form tambah).
function currentPage() {
  const [id, query = ''] = location.hash.replace('#/', '').split('?');
  ctx.params = new URLSearchParams(query);
  return PAGES.find((p) => p.id === id) || PAGES[0];
}

async function route() {
  const page = currentPage();
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.id === (page.nav || page.id)) {
      a.setAttribute('aria-current', 'page');
    } else a.removeAttribute('aria-current');
  });
  try {
    await renderers[page.type](view, page, ctx);
  } catch (e) {
    view.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, 'Halaman tidak bisa dimuat'), h('p', { class: 'muted' }, `${e.message}. Muat ulang halaman atau periksa apakah server masih berjalan.`)));
  }
}

nav.append(...PAGES.filter((p) => !p.hidden).map((p) => h('a', { href: `#/${p.id}`, 'data-id': p.id }, p.label)));
initMenu({ btn: document.getElementById('menuBtn'), nav, scrim: document.getElementById('scrim') });
window.addEventListener('hashchange', () => { closeDialog(); route(); window.scrollTo(0, 0); });
document.getElementById('dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog') closeDialog(); });

reload().then(route).then(() => startNotifications(ctx)).catch((e) => {
  view.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, 'Tidak bisa terhubung ke server'), h('p', { class: 'muted' }, e.message)));
});
