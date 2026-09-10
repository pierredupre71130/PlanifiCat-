const CACHE_NAME = 'planificat-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './scheduler.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau en priorité : sert toujours la dernière version tant qu'il y a du
// réseau, et ne se rabat sur le cache que hors-ligne (sinon une ancienne
// version reste servie indéfiniment après chaque mise à jour de l'app).
// cache: 'no-store' est indispensable ici : sans ça, fetch() peut renvoyer
// une réponse prise dans le cache HTTP normal du navigateur (GitHub Pages
// envoie des en-têtes de cache sur ses fichiers) au lieu d'aller vraiment
// sur le réseau, et l'app resterait bloquée sur une ancienne version.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const freshRequest = new Request(event.request, { cache: 'no-store' });
  event.respondWith(
    fetch(freshRequest)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
