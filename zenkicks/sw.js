// Zenkicks service worker: makes the app installable and opens it instantly.
// - The page opens from the phone's cache and refreshes itself in the background.
// - Code files carry ?v=N, so each version is cached once and never re-downloaded.
// - Drops and What's hot data open from the cache (same day) and refresh in the background.
// A new version of this file (VERSION changes) reloads the app once with the new code.
var VERSION = 'zk-v52';
var SHELL = ['./', 'index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function put(req, res) { if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); } return res; }
function fromNet(req) { return fetch(req, { cache: 'no-cache' }).then(function (res) { return put(req, res); }); }
function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('slow')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request; var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // never cache Supabase or other sites
  if (/\.mp4$/i.test(url.pathname)) return; // intro video: leave to the browser (phones need ranged video requests)

  // the app page: open from cache right away, refresh the copy in the background
  if (req.mode === 'navigate' || /\/zenkicks\/(index\.html)?$/.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fromNet(req).catch(function () { return hit; });
      return hit || net.then(function (r) { return r || caches.match('index.html'); });
    }));
    return;
  }
  // versioned code (app.js?v=12 etc.) and images: cache first
  if (url.search.indexOf('v=') > -1 && /\.(js|css)$/.test(url.pathname) || /\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return put(req, res); }); }));
    return;
  }
  // drops / what's hot data (?v=<day>): show the saved copy instantly, refresh it in the background
  if (/\/data\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fromNet(req).catch(function () { return hit || caches.match(req, { ignoreSearch: true }); });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return Promise.race([net, timeout(3000)]).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (old) { return old || net; }); });
    }));
    return;
  }
  // data and everything else: network first (3s max), cache when slow or offline
  e.respondWith(Promise.race([fromNet(req), timeout(3000)]).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fromNet(req); });
  }));
});

// ---- drop-day notifications (sent by the "push" Edge Function) ----
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Zenkicks', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    image: d.image || undefined,
    tag: d.tag || 'zenkicks',
    renotify: true,
    data: { url: d.url || './#/drops' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) { if ('navigate' in c) c.navigate(url).catch(function () {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
