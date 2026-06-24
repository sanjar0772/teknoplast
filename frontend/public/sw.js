// TEKNOPLAST PWA service worker.
// Maqsad: ilovani Android/Chrome'da "o'rnatish" mumkin bo'lishi va oflayn shellni ko'rsatish.
// MUHIM: faqat sahifa ochilishi (navigate) keshlanadi — API, JS, CSS so'rovlarga
// aralashmaymiz, shu bois mavjud avtomatik yangilanish buzilmaydi.

const CACHE = 'teknoplast-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Faqat sahifa navigatsiyasi: tarmoq birinchi, internet bo'lmasa keshdagi shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
  }
  // Boshqa barcha so'rovlar (API, assets) — brauzerning o'zi hal qiladi
});
