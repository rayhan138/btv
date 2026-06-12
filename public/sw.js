// BTV HD Live - Service Worker (PWA offline shell)
const CACHE_NAME = 'btv-hd-v1';
const SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Never cache API/HLS proxy requests
    if (url.pathname.startsWith('/api/')) return;

    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
