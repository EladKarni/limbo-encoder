import React, { useState, useRef } from 'react';
import styles from './App.module.scss';

import Header from './Components/Header/Header';
import Stage from './Components/Stage/Stage';
import Sidebar from './Components/Sidebar/Sidebar';
import Toast from './Components/Toast/Toast';
import KofiWidget from './Components/KofiWidget/KofiWidget';
import { ACCEPT_VIDEO } from './utils/presets';
import { CODECS, CODEC_OPTIONS } from './utils/codecs';
import {
  bitrateKbps, estimateOutBytes, isTargetReachable, overWasmCeiling,
} from './utils/fit';
import { plannedPath } from './utils/webcodecs';
import useToast from './hooks/useToast';
import useFiles from './hooks/useFiles';
import useEngine from './hooks/useEngine';
import useEncoder from './hooks/useEncoder';
import useFileActions from './hooks/useFileActions';

// The composition root: wires the state hooks (toast, files, engine, encoder)
// to the three presentational panels. All app state lives in these hooks under
// App's tree; the components below are props-in / callbacks-out.
function App() {
  const { toast, showToast } = useToast();
  const {
    files, filesRef, activeId, setActiveId, updateFile, addFiles, removeFile,
  } = useFiles(showToast);
  const { engine, setEngine, setLogHandler } = useEngine(showToast);
  const { convert: runConvert, overCeilingMsg } = useEncoder({
    filesRef, updateFile, setActiveId, showToast, setEngine, setLogHandler,
  });

  const [showAdv, setShowAdv] = useState(false);
  const pickerRef = useRef(null);

  const ready = engine === 'ready';
  const active = files.find((f) => f.id === activeId) || files[0] || null;
  const isEncoding = files.some((f) => f.status === 'encoding');
  const readyCount = files.filter((f) => f.status === 'ready').length;
  const { download, share, redo } = useFileActions(active, showToast, updateFile);

  const convert = () => {
    if (!ready || isEncoding) return;
    runConvert(files, active);
  };

  const openPicker = () => {
    if (pickerRef.current) pickerRef.current.click();
  };

  const onPick = (e) => {
    const input = e.target;
    addFiles(input.files);
    input.value = '';
  };

  const br = active ? bitrateKbps(active) : 0;
  const bitrateLabel = br > 0 ? `${br.toLocaleString()} kbps` : '—';
  const convertLabel = files.length > 1 ? `Convert all (${readyCount})` : 'Convert';
  const encodable = files.filter(
    (f) => f.status === 'ready' && f.duration > 0 && f.targetMB > 0
      && isTargetReachable(f) && !overWasmCeiling(f, plannedPath(f)),
  );
  const canConvert = files.length > 1
    ? encodable.length > 0
    : Boolean(active && encodable.some((f) => f.id === active.id));

  return (
    <div className={styles.app}>
      <div className={styles.glow} />
      <div className={styles.shell}>
        <Header engine={engine} />

        <main className={styles.main}>
          <Stage
            active={active}
            files={files}
            overCeiling={Boolean(active) && overWasmCeiling(active, plannedPath(active))}
            overCeilingMsg={overCeilingMsg}
            onFiles={addFiles}
            onUpdate={updateFile}
            onDownload={download}
            onShare={share}
            onRedo={redo}
            onRetry={(id) => updateFile(id, { status: 'ready', progress: 0, errorLog: null })}
            onSelect={setActiveId}
            onRemove={removeFile}
            onAdd={openPicker}
          />

          {active && (
            <Sidebar
              active={active}
              isEncoding={isEncoding}
              showAdv={showAdv}
              codecOptions={CODEC_OPTIONS}
              codecHint={(CODECS[active.codec] || CODECS['H.264']).hint}
              estBytes={estimateOutBytes(active)}
              bitrateLabel={bitrateLabel}
              convertLabel={convertLabel}
              canConvert={canConvert}
              ready={ready}
              onUpdate={updateFile}
              onToggleAdv={() => setShowAdv((s) => !s)}
              onConvert={convert}
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
        onChange={onPick}
        aria-label="Add videos"
      />
    </div>
  );
}

export default App;
