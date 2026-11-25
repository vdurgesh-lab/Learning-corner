/* Learning Corner voice helper (service worker).
   Lets the natural voice use several processor cores instead of one, which makes it much faster.
   Browsers allow that only on "cross-origin isolated" pages, which needs two response headers that
   GitHub Pages cannot send. This file adds them, but only to the pages that talk and the voice
   worker. Every other page and file passes through untouched.
   Installed by lc/voice.js when someone turns on the natural voice; removed when they turn it off. */
/* pages that use the natural voice (lc/voice.js) */
const PAGES = /\/(multiplication-grade[2-5]|fractions-grade[3-5]|fraction-steps|money-time|story-shelf)(\.html)?$/;
const WORKER = /\/lc\/voice-worker\.js$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  const page = r.mode === 'navigate' && PAGES.test(u.pathname);
  if (!page && !WORKER.test(u.pathname)) return;
  e.respondWith(fetch(r).then(res => {
    if (res.status === 0 || res.type === 'opaqueredirect') return res;
    const h = new Headers(res.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }).catch(() => fetch(r)));
});
