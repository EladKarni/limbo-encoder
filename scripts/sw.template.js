/* eslint-disable no-restricted-globals */
/* eslint-env serviceworker */
// Service worker for Limbo Encoder. This file is a TEMPLATE: the copy script
// (scripts/copy-ffmpeg-assets.js) fills in the version placeholder below and
// writes the result to public/sw.js (generated, git-ignored). Edit this file.
//
// Purpose: keep the ~33 MB encoder runtime in Cache Storage so repeat visits
// don't re-download it, and keep the last good app shell around for offline.
//
// CRITICAL INVARIANT — cross-origin isolation must survive this worker.
// Cached Response objects are stored and served COMPLETE, original headers
// included; the COOP/COEP headers riding along on a cached navigation are
// what keep crossOriginIsolated === true on a SW-served reload. Synthesizing
// responses (new Response(...)) or stripping headers here would silently
// remove SharedArrayBuffer and kill the multithreaded wasm engine.
//
// Deliberately NO skipWaiting(): an updated worker waits until every tab of
// the previous deploy is closed. Activating early would delete the previous
// versioned runtime cache while still-open tabs — whose FFMPEG_BASE bakes in
// that version — depend on it for the terminate()+reload engine recovery
// documented in docs/ARCHITECTURE.md (the old /ffmpeg/<version>/ dir is gone
// from the server after a deploy, so the cache is the only copy).

const FFMPEG_CACHE = 'ffmpeg-__FFMPEG_VERSION__';
const APP_CACHE = 'app-shell-v1';

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name !== FFMPEG_CACHE && name !== APP_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// The runtime cache is named after the version segment in the request URL,
// not the version this worker was generated with: during a deploy transition
// the previous deploy's worker still serves pages that fetch the NEW runtime,
// and those 33 MB must land in the new version's cache so they survive the
// next activate cleanup.
function runtimeCacheName(pathname) {
  const m = /^\/ffmpeg\/([^/]+)\//.exec(pathname);
  return m ? `ffmpeg-${m[1]}` : FFMPEG_CACHE;
}

// Caching is best-effort on both paths below: cache.put() can reject (most
// plausibly QuotaExceededError while writing the 32 MB wasm on a tight
// profile), and a rejection inside respondWith() would turn a perfectly
// good network response into a page-visible load failure. Only status-200
// responses are cached (Cache.put() rejects partial 206 responses outright).
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 200) {
    try {
      await cache.put(request, response.clone());
    } catch (err) {
      // Out of quota — serve the network response anyway.
    }
  }
  return response;
}

async function networkFirst(cacheName, request, cacheKey) {
  const cache = await caches.open(cacheName);
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
  if (response.status === 200) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch (err) {
      // Out of quota — serve the network response anyway.
    }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Same-origin GETs only; everything else falls through to the network
  // untouched (COEP already forbids cross-origin resources anyway).
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Range requests can't be satisfied from a full cached response by
  // Cache.match, and Cache.put would reject the 206 — let them through.
  if (request.headers.has('range')) return;

  // Versioned runtime + content-hashed CRA output: immutable, cache-first.
  if (url.pathname.startsWith('/ffmpeg/')) {
    event.respondWith(cacheFirst(runtimeCacheName(url.pathname), request));
    return;
  }
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(APP_CACHE, request));
    return;
  }
  // Navigations: network-first so deploys propagate, cached fallback so the
  // app still opens offline. Keyed by pathname — the SPA serves one shell
  // regardless of query string, and "/?utm_source=…" while offline must not
  // miss the shell cached under "/".
  if (request.mode === 'navigate') {
    const cacheKey = new Request(url.origin + url.pathname);
    event.respondWith(networkFirst(APP_CACHE, request, cacheKey));
  }
});
