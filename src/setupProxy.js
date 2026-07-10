// The dev server must send the same cross-origin-isolation headers that
// netlify.toml sets in production, or SharedArrayBuffer (and with it
// ffmpeg.wasm) is unavailable during development.
module.exports = function setupProxy(app) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });
};
