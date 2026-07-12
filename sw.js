const CACHE = 'overload-v8';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './bg-aurora.jpg',
  './app.js',
  './db.js',
  './engine.js',
  './charts.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero con respaldo en caché: siempre recibes la versión más nueva
// cuando hay internet, y la app sigue funcionando sin conexión en el gym.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const url = new URL(e.request.url);
      const cacheable = url.origin === location.origin || url.hostname.includes('fonts.g');
      if (res.ok && cacheable) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
    )
  );
});
