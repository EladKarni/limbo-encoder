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
import { CODEC_OPTIONS } from '../../utils/codecs';

// The whole app chrome — header, the stage/sidebar two-column main, the footer,
// the toast region, and the hidden file input. Purely presentational: App hands
// it the state (engine/active/files/toast/controls) and one callbacks bag, and
// this composes the panels. That keeps App a wiring-only root.
function AppLayout({
  engine, active, files, toast, controls, cb, showAdv, pickerRef,
}) {
  return (
    <div className={styles.app}>
      <div className={styles.glow} />
      <div className={styles.shell}>
        <Header engine={engine} />

        <main className={styles.main}>
          <Stage
            active={active}
            files={files}
            overCeiling={controls.overActiveCeiling}
            overCeilingMsg={controls.overCeilingMsg}
            onFiles={cb.addFiles}
            onUpdate={cb.updateFile}
            onDownload={cb.download}
            onShare={cb.share}
            onRedo={cb.redo}
            onRetry={cb.retry}
            onSelect={cb.select}
            onRemove={cb.removeFile}
            onAdd={cb.openPicker}
          />

          {active && (
            <Sidebar
              active={active}
              isEncoding={controls.isEncoding}
              showAdv={showAdv}
              codecOptions={CODEC_OPTIONS}
              codecHint={controls.codecHint}
              estBytes={controls.estBytes}
              bitrateLabel={controls.bitrateLabel}
              convertLabel={controls.convertLabel}
              canConvert={controls.canConvert}
              ready={controls.ready}
              onUpdate={cb.updateFile}
              onToggleAdv={cb.toggleAdv}
              onConvert={cb.convert}
            />
          )}
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
        onChange={cb.pick}
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
  controls: PropTypes.object.isRequired,
  cb: PropTypes.object.isRequired,
  showAdv: PropTypes.bool.isRequired,
  pickerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
};

AppLayout.defaultProps = {
  active: null,
  toast: null,
};

export default AppLayout;
