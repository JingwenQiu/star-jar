/* ============================================================
   sw.js — offline cache for Superstar's Star Jar
   ------------------------------------------------------------
   The app is a static shell plus local data, so cache-first for our own
   files (instant, works with no signal) and network-only for Google Fonts.
   Bump CACHE when shipping new files; activate() clears older ones.
   ============================================================ */
const CACHE = 'star-jar-v12';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './cloud.js',
  './supabase.js',
  './SUPABASE-SETUP.txt',
  './vendor/workbuddy-cloud-sdk.js',
  './vendor/supabase.min.js',
  './manifest.json',
  './assets/star-jar-mascot.png',
  './assets/star-jar-empty.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; add individually so one 404 cannot
      // leave the app with no cache at all.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never cache the Google Fonts origin — let the network handle it so font
  // updates are picked up, and failures simply fall back to the system stack.
  if (!sameOrigin) return;

  // Navigations: try the network so a fresh copy is picked up when online,
  // but fall back to the cached shell so a phone with no signal still opens.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
