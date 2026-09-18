/* ============================================================
   Market Dashboard — Service Worker
   ============================================================
   MUST match APP_VERSION in index.html. The browser only treats a
   service worker as updated when THIS FILE changes byte-for-byte, so
   bumping this string is what makes a deploy reach users. Change it in
   both files, every deploy, or the old page keeps being served from
   cache no matter what is on GitHub Pages.
   ============================================================ */

const APP_VERSION = '2026.09.17-c';
const CACHE_NAME  = 'market-dashboard-' + APP_VERSION;

// The app shell. Everything here is fetched fresh on install.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// data.json lives on raw.githubusercontent.com and changes hourly.
// It must NEVER be served from cache — a stale price is worse than no
// price, and the dashboard has its own staleness banner for genuine
// outages.
const NEVER_CACHE = [
  'raw.githubusercontent.com',
  'api.github.com',
  'script.google.com',
  'script.googleusercontent.com',
  'query1.finance.yahoo.com',
  'finnhub.io'
];

function isNeverCache(url) {
  return NEVER_CACHE.some(function(host) { return url.indexOf(host) > -1; });
}

// ── Install ─────────────────────────────────────────────────
// cache.addAll() is all-or-nothing: one 404 aborts the whole install and
// leaves the old worker in charge. Each URL is added individually so a
// missing optional file cannot block the update.
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(PRECACHE_URLS.map(function(url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function(err) {
          console.warn('[sw] precache skipped:', url, err && err.message);
        });
      }));
    }).then(function() {
      console.log('[sw] installed ' + APP_VERSION);
    })
  );
  // Deliberately NOT calling skipWaiting() here. The page shows a
  // "newer version ready" bar and calls it via postMessage, so an open
  // tab is never swapped out from under you mid-interaction.
});

// ── Activate ────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(name) {
        // Delete every cache belonging to this app except the current
        // version. Without this, old versions accumulate forever.
        if (name.indexOf('market-dashboard-') === 0 && name !== CACHE_NAME) {
          console.log('[sw] removing old cache', name);
          return caches.delete(name);
        }
        return null;
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Message channel ─────────────────────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

// ── Fetch ───────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = req.url;

  // Live data and API calls always go to the network, untouched.
  if (isNeverCache(url)) return;

  // Cross-origin assets (fonts, CDN scripts) — leave to the browser.
  if (new URL(url).origin !== self.location.origin) return;

  // NAVIGATION: network-first. This is the important one. A cache-first
  // navigation is exactly how a deployed update fails to appear —
  // the page renders from cache before the new HTML is ever requested.
  // Network-first means a deploy shows up on the next load, with the
  // cache as an offline fallback.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1) {
    event.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // STATIC ASSETS: stale-while-revalidate. Serve instantly from cache,
  // refresh in the background for next time.
  event.respondWith(
    caches.match(req).then(function(hit) {
      const network = fetch(req).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() {
        return hit;
      });
      return hit || network;
    })
  );
});
