import React from 'react';
import ReactDOM from 'react-dom';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root'),
);

// Cache the ~33 MB encoder runtime for repeat visits (see
// scripts/sw.template.js). Production only: a service worker under
// webpack-dev-server serves stale bundles and poisons dev.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/sw.js`).catch(() => {});
    if (navigator.storage && navigator.storage.persist) {
      // Ask the browser not to evict the 32 MB wasm cache entry under
      // storage pressure. Fire-and-forget; rejection just means no promise.
      navigator.storage.persist().catch(() => {});
    }
  });
} else if ('serviceWorker' in navigator) {
  // Dev safety net: a production worker left behind on this origin (say,
  // after verifying a build served on localhost:3000) would keep serving
  // stale cached bundles to webpack-dev-server. Remove any found.
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((reg) => reg.unregister()))
    .catch(() => {});
}
