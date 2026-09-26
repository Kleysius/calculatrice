/* Service worker : l'application fonctionne hors ligne après la première visite. */
const CACHE = 'ti26-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './assets/css/style.css',
    './assets/javascript/engine.js',
    './assets/javascript/script.js',
    './assets/img/icon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

/* Stale-while-revalidate : réponse immédiate depuis le cache, mise à jour en arrière-plan. */
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(event.request);
            const network = fetch(event.request)
                .then((response) => {
                    if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone());
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
