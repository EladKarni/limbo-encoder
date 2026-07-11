import React, { useRef, useEffect } from 'react';

import styles from './KofiWidget.module.scss';

// Official Ko-fi widget (loaded in index.html; absent when offline or
// blocked). getHTML() instead of draw() — draw() document.writes, which
// cannot land inside the React tree. The img/link it draws must also be
// CORS requests to load under COEP, hence the crossorigin patching. Purely
// cosmetic: when the script didn't load the container renders empty and the
// :empty rule collapses it.
function KofiWidget() {
  const kofiRef = useRef(null);

  useEffect(() => {
    const kofi = window.kofiwidget2;
    if (!kofi || !kofiRef.current) return;
    kofi.init('Support me on Ko-fi', '#4ee894', 'B4W823036B');
    // The widget's own CSS also swaps the cup in via no-cors content:url()
    // loads, which COEP blocks (Chrome even fetches them from losing
    // cascade declarations). Neutralize them; the CORS-loaded img src
    // renders the cup instead.
    kofiRef.current.innerHTML = kofi.getHTML()
      .replace('<img ', '<img crossorigin="anonymous" ')
      .replace('<link ', '<link crossorigin="anonymous" ')
      .replace(/content:url\([^)]*\)/g, 'content:normal');
  }, []);

  return <div ref={kofiRef} className={styles.kofi} />;
}

export default KofiWidget;
