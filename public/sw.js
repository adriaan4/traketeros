// Service worker mínimo: hace la web instalable. No cachea nada (todo va a la red).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
