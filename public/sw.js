// Service worker minimal: hanya dipakai untuk menampilkan notifikasi dan membuka aplikasi saat notifikasi diklik.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list[0];
    if (!open) return self.clients.openWindow(url);
    return open.focus().then((c) => (c && c.navigate ? c.navigate(url) : null)).catch(() => null);
  }));
});
