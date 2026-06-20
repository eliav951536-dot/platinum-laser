const CACHE = 'pl-v2';
const ASSETS = ['./manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e =>
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    )
);

self.addEventListener('fetch', e => {
    // HTML / navigation requests: ALWAYS go to network, never serve a stale cached page.
    if (e.request.mode === 'navigate' || e.request.destination === 'document') {
        e.respondWith(fetch(e.request, { cache: 'no-store' }));
        return;
    }
    // Static assets: network first, cache fallback (for true offline use).
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
