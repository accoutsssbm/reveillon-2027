// Service worker: permite instalar o site como app.
// Sempre busca a versão nova na internet; a cópia guardada só é usada sem conexão.
// Dados do Supabase (outro endereço) não passam por aqui.
const CACHE = 'rev27-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(c => c || caches.match('./index.html')))
  );
});
