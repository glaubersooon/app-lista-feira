// Guarda o app no aparelho para abrir sem internet.
// Página e scripts do app: busca a versão nova primeiro (rede), e usa a guardada se estiver sem internet.
// Bibliotecas externas (Firebase, Sortable, fonte): usa a guardada primeiro.
// O banco (Firestore) não passa por aqui: ele tem o próprio modo offline.
const VERSAO = 'compras-v1';
const APP = ['./', 'index.html', 'nuvem.js', 'manifest.json', 'icone-192.png', 'icone-512.png', 'apple-touch-icon.png'];
const EXTERNOS = [
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js'
];
const HOSTS_EXTERNOS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(async c => {
    await c.addAll(APP);
    await Promise.all(EXTERNOS.map(u => fetch(u, {mode: 'cors'}).then(r => r.ok && c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, cp)); }
        return r;
      }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, {ignoreSearch: true}))
    );
    return;
  }

  if (HOSTS_EXTERNOS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(g => g || fetch(req).then(r => {
        if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
        return r;
      }))
    );
  }
});
