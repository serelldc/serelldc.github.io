// Zenkicks service worker: makes the app installable and opens fast.
// Code and settings load network-first, so updates show on the next open.
var VERSION = 'zk-v10';
var SHELL = ['./', 'index.html', 'config.js', 'assets/app.js', 'assets/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // never cache Supabase or other sites
  // images and icons: cache first (they rarely change)
  if (/\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); return res; });
    }));
    return;
  }
  // pages, code, settings and data: network first so updates show right away; cache only when offline
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
    var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); return res;
  }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
});
