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

self.addEventListener('push', e => {
    let data = { title: 'PLATINUM LASER', body: 'יש לך תזכורות חדשות' };
    try { if (e.data) data = { ...data, ...e.data.json() }; } catch { if (e.data) data.body = e.data.text(); }
    e.waitUntil(self.registration.showNotification(data.title, {
        body: data.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { url: data.url || './' }
    }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const url = e.notification.data?.url || './';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) if ('focus' in c) return c.focus();
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
