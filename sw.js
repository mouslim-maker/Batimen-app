/* Incrémenter ce numéro à CHAQUE nouvelle version déployée.
   C'est ce qui force les téléphones à récupérer les nouveaux fichiers
   au lieu de rester bloqués sur une ancienne version en cache. */
const CACHE_VERSION = 'batimen-v1';

const FICHIERS_A_METTRE_EN_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(FICHIERS_A_METTRE_EN_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Les appels vers le connecteur Apps Script ne passent jamais par le cache :
  // on veut toujours des données à jour, jamais une réponse figée.
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
