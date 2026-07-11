import React from 'react';
import PropTypes from 'prop-types';

import styles from './AppLayout.module.scss';
import Header from '../Header/Header';
import Stage from '../Stage/Stage';
import Sidebar from '../Sidebar/Sidebar';
import Toast from '../Toast/Toast';
import KofiWidget from '../KofiWidget/KofiWidget';
import fileShape from '../../fileShape';
import { ACCEPT_VIDEO } from '../../utils/presets';

// The app chrome: header, the stage/sidebar two-column main, footer, the toast
// region, and the hidden file input. Purely presentational — App owns the state
// and passes the Stage/Sidebar prop groups straight through.
function AppLayout({
  engine, active, files, toast, stage, sidebar, pickerRef, onPick,
}) {
  return (
    <div className={styles.app}>
      <div className={styles.glow} />
      <div className={styles.shell}>
        <Header engine={engine} />

        <main className={styles.main}>
          <Stage active={active} files={files} {...stage} />
          {active && <Sidebar active={active} {...sidebar} />}
        </main>

        <footer className={styles.footer}>
          <div className={styles.credits}>
            <span>Special thanks:</span>
            <span>Nakajima Megumi#7432</span>
            <a href="https://blog.otterbro.com/">Flaeri</a>
            <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Icons by Freepik</a>
          </div>
          <KofiWidget />
        </footer>
      </div>

      <Toast message={toast && toast.message} tone={toast ? toast.tone : 'ok'} />
      <input
        ref={pickerRef}
        type="file"
        accept={ACCEPT_VIDEO}
        multiple
        className={styles.hiddenInput}
        onChange={onPick}
        aria-label="Add videos"
      />
    </div>
  );
}

AppLayout.propTypes = {
  engine: PropTypes.oneOf(['ready', 'loading', 'error']).isRequired,
  active: fileShape,
  files: PropTypes.arrayOf(fileShape).isRequired,
  toast: PropTypes.shape({ message: PropTypes.string, tone: PropTypes.string }),
  // The remaining Stage / Sidebar props, forwarded verbatim (each panel
  // declares its own shape).
  stage: PropTypes.object.isRequired,
  sidebar: PropTypes.object.isRequired,
  pickerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  onPick: PropTypes.func.isRequired,
};

AppLayout.defaultProps = {
  active: null,
  toast: null,
};

export default AppLayout;
