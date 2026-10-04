/* TheToolTable service worker — makes the app installable and fully usable offline after the first visit.
   Hashed build files are immutable → cache-first. The page itself is network-first so updates arrive on the next load. */
const V = 'ttt-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (req.headers.has('range')) return // media seeking is served by the network / blob URLs

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put('/index.html', c)); return r }).catch(() => caches.match('/index.html')))
    return
  }
  const immutable = ['/assets/', '/models/', '/flags/', '/icons/', '/ffmpeg/'].some((p) => url.pathname.startsWith(p))
  e.respondWith(caches.match(req).then((hit) => {
    if (hit && immutable) return hit
    const net = fetch(req).then((r) => { if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(V).then((x) => x.put(req, c)) } return r }).catch(() => hit)
    return hit || net
  }))
})
