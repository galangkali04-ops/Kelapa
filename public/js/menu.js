// Menu hamburger untuk HP dan iPad portrait. Di layar lebar menu tetap di kiri dan tombol ini disembunyikan.
export function initMenu({ btn, nav, scrim }) {
  const isOpen = () => document.body.classList.contains('menu-open');
  const set = (open) => {
    document.body.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    scrim.hidden = !open;
  };
  btn.addEventListener('click', () => set(!isOpen()));
  scrim.addEventListener('click', () => set(false));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); }); // pilih menu -> tertutup
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 900 && isOpen()) set(false); });
  window.addEventListener('hashchange', () => set(false));
  set(false);
  return { open: () => set(true), close: () => set(false), isOpen };
}
