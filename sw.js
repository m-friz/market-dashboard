// Market Dashboard service worker
// Strategy: network-first for the app shell (so you always get the latest
// version when online), falling back to cache when offline.
// Cross-origin requests (e.g. data.json from raw.githubusercontent.com)
// are NOT intercepted — those always hit the network fresh, same as before.

var CACHE_NAME = 'market-dashboard-v2';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle same-origin GET requests (the app shell).
  // Leave data.json / API calls to raw.githubusercontent.com etc. untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(function() {
        return caches.match(event.request);
      })
  );
});
