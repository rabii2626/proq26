// Offline-first service worker: app shell is cached, map tiles/fonts are cached as they are used.
const VERSION = 'wakeel-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/db.js',
  'js/ui.js',
  'js/data.js',
  'js/match.js',
  'js/photo.js',
  'js/editor.js',
  'js/map.js',
  'js/icons.js',
  'js/demo.js',
  'js/views/common.js',
  'js/views/home.js',
  'js/views/properties.js',
  'js/views/clients.js',
  'js/views/agenda.js',
  'js/views/more.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'wakeel-runtime').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell: network first so updates arrive quickly, cache as offline fallback.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
    );
    return;
  }

  // Fonts, Leaflet and map tiles: cache first.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|tile\.openstreetmap\.org/.test(url.host)) {
    e.respondWith(
      caches.open('wakeel-runtime').then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })),
      ),
    );
  }
});
