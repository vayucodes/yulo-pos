// Keeps a copy of the app on the tablet so it opens and bills with no internet.
// When the app is updated, CACHE changes and the app offers "Update now".
const CACHE = 'yulo-pos-1.1.0';
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/logo-clear.png', './js/files.js',
  './js/app.js', './js/admin.js', './js/billing.js', './js/bills.js', './js/csv.js', './js/db.js', './js/printer.js',
  './js/receipt.js', './js/seed.js', './js/state.js', './js/tax.js', './js/ui.js', './js/util.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));
});
