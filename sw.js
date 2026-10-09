var CACHE = 'family-roots-pages';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(e.request.url, copy); });
    return response;
  }).catch(function () {
    return caches.match(e.request.url);
  }));
});
