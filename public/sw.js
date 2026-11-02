// Service worker mínimo: hace la web instalable. No cachea nada (todo va a la red).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// 🔔 Avisos al admin: alguien ha añadido una canción a la playlist.
// El aviso llega vacío; aquí se pide la última canción para decir quién y cuál.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let cuerpo = 'Alguien ha añadido una canción a la playlist.';
    try {
      const r = await fetch('/api/tidal/ultima', { cache: 'no-store' });
      const u = r.ok ? await r.json() : null;
      if (u && u.title) {
        const artistas = (u.artists || []).join(', ');
        cuerpo = `${u.by || 'Alguien'} ha añadido «${u.title}»${artistas ? ' · ' + artistas : ''}`;
      }
    } catch { /* se queda el texto genérico */ }
    await self.registration.showNotification('🎧 Nueva canción en la playlist', {
      body: cuerpo,
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: 'playlist-nueva',
      renotify: true,
      data: { url: '/playlist.html?admin=1' }
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/playlist.html?admin=1';
  e.waitUntil((async () => {
    const todas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of todas) {
      if (new URL(c.url).pathname === '/playlist.html' && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
