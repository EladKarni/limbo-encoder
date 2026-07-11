# Caching follow-ups (Phase 3 + review leftovers)

Deferred items from the asset-caching work that landed in `ae76e54`
(versioned `/ffmpeg/<version>/` paths, immutable Netlify headers, hand-rolled
service worker). Each needs a decision or an external precondition — none are
blockers. Design rationale for the SW itself lives in the comments of
`scripts/sw.template.js`.

## 1. Verify Netlify compresses the wasm (diagnostic — blocked on deploy)

First visits download `ffmpeg-core.wasm` at full size if Netlify doesn't
brotli/gzip `application/wasm`. Measured locally: **31.2 MB raw, 9.8 MB
gzip -9** (brotli should land ~8–9 MB) — a ~3× first-visit cut if it turns
out uncompressed. Only affects the first visit and dependency version bumps;
every other visit is served from Cache Storage.

Could not be checked on 2026-07-11: `limbo-encoder.netlify.app` (the URL in
the og tags) returned 404 — nothing deployed there yet. Once live, run:

```sh
curl -sI -H 'Accept-Encoding: br, gzip' \
  "https://<site>/ffmpeg/$(grep -o 'FFMPEG_VERSION=.*' .env.local | cut -d= -f2)/ffmpeg-core.wasm" \
  | grep -i content-encoding
```

`content-encoding: br` (or `gzip`) → done, nothing to do. No header → raise
with Netlify config/support; static-asset brotli is usually automatic, so a
missing header likely means the content-type mapping needs fixing.

## 2. Defer the eager `loadEngine()` (UX tradeoff — NOT approved, decide first)

`src/App.js` boots the 31 MB wasm engine on mount for everyone, including
users whose files all take the WebCodecs fast path and never touch ffmpeg.
Deferring would load the engine only when a file actually needs the wasm path
(non-mp4 input, WebM output, or WebCodecs falling through).

- Win: pure-WebCodecs users never pay the 31 MB download or the memory.
- Cost: on a cold cache the first wasm-path encode stalls behind the download
  at the exact moment the user clicked Convert (tens of seconds on slow
  connections), and the Convert-button / engine-ready gating gets more
  states.

Explicitly discussed during planning and left un-approved — do not implement
without deciding the tradeoff is worth it.

## 3. Review-accepted low-severity items (fine to leave; noted for honesty)

From the adversarial review of `ae76e54`; accepted as tradeoffs of the
no-precache SW design:

- **`app-shell-v1` grows across deploys.** Old content-hashed `/static/`
  bundles (~100s of KB per deploy) are never pruned, and
  `navigator.storage.persist()` blocks eviction. Fix would need a build
  manifest or a versioned app-shell cache name; cost/benefit didn't justify
  it yet.
- **Shell updates aren't atomic.** A navigation on flaky connectivity can
  cache a new `index.html` whose hashed assets never got cached, degrading
  offline mode until the next successful online visit. Inherent to
  cache-as-you-fetch; a precache manifest would fix this too.

If either ever gets fixed, the natural shape is the same: generate an asset
manifest at build time (CRA emits `build/asset-manifest.json`) and have the
SW precache + prune against it.
