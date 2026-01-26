// Service Worker: runtime caching for external logo images (assets.parqet.com)
// Strategy: Cache-first with background revalidation (stale-while-revalidate)

const CACHE_NAME = 'parqet-logos-v1';
const LOGO_HOST = 'assets.parqet.com';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  try {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle GET requests to the Parqet logo host
    if (req.method !== 'GET') return;
    if (url.hostname !== LOGO_HOST) return;
    if (!url.pathname.startsWith('/logos/')) return;

    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      // Start a background network fetch to refresh the cache
      const networkFetch = fetch(req).then(async (resp) => {
        try {
          if (resp && resp.ok) {
            await cache.put(req, resp.clone());
          }
        } catch (e) {
          // ignore cache put errors
        }
        return resp;
      }).catch(() => null);

      // Prefer cached response for fast repeat loads; fall back to network
      return cached || (await networkFetch) || new Response('', { status: 404, statusText: 'Not Found' });
    })());
  } catch (e) {
    // swallow SW errors to avoid breaking navigation
  }
});
