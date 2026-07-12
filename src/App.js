import React, { useState, useRef } from 'react';
import styles from './App.module.scss';

import Header from './Components/Header/Header';
import Stage from './Components/Stage/Stage';
import Sidebar from './Components/Sidebar/Sidebar';
import Toast from './Components/Toast/Toast';
import KofiWidget from './Components/KofiWidget/KofiWidget';
import { CODECS, CODEC_OPTIONS } from './utils/codecs';
import {
  bitrateKbps, estimateOutBytes, overWasmCeiling, videoQuality,
} from './utils/fit';
import { plannedPath } from './utils/webcodecs';
import { ACCEPT_VIDEO } from './utils/presets';
import { canEncode, encodeBlocker, overCeilingMsg } from './utils/encodePipeline';
import useToast from './hooks/useToast';
import useFiles from './hooks/useFiles';
import useEngine from './hooks/useEngine';
import useEncoder from './hooks/useEncoder';
import useFileActions from './hooks/useFileActions';

// Wires the state hooks (toast, files, engine, encoder) to the presentational
// panels. All app state lives in the hooks under App's tree; the components are
// props-in / callbacks-out.
function App() {
  const { toast, showToast } = useToast();
  const {
    files, filesRef, activeId, setActiveId, updateFile, addFiles, removeFile,
  } = useFiles(showToast);
  const { engine, setEngine, setLogHandler } = useEngine(showToast);
  const { convert } = useEncoder({
    filesRef, updateFile, setActiveId, showToast, setEngine, setLogHandler,
  });

  const [showAdv, setShowAdv] = useState(false);
  const pickerRef = useRef(null);
  const active = files.find((f) => f.id === activeId) || files[0] || null;
  const { download, share, redo } = useFileActions(active, showToast, updateFile);

  const ready = engine === 'ready';
  const isEncoding = files.some((f) => f.status === 'encoding');
  const readyCount = files.filter((f) => f.status === 'ready').length;
  const br = active ? bitrateKbps(active) : 0;
  // The quality band the current res/codec/fps buys at this bit budget — the
  // one figure in the advanced panel that visibly responds to those choices.
  const quality = active ? videoQuality(active) : null;

  const encodable = files.filter(canEncode);
  const canConvert = files.length > 1
    ? encodable.length > 0
    : Boolean(active && encodable.some((f) => f.id === active.id));

  // Why Convert is disabled for the active file, as fixable copy — so a greyed
  // button is never a dead end. encodeBlocker returns '' for not-ready-no-
  // message and null when ready; only a non-empty string is worth surfacing.
  const activeBlocker = active ? encodeBlocker(active) : '';
  const convertHint = activeBlocker || null;

  const openPicker = () => pickerRef.current && pickerRef.current.click();
  const runConvert = () => {
    if (ready && !isEncoding) convert(files, active);
  };
  const onPick = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

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
              bitrateLabel={br > 0 ? `${br.toLocaleString()} kbps` : '—'}
              quality={quality}
              convertLabel={files.length > 1 ? `Convert all (${readyCount})` : 'Convert'}
              canConvert={canConvert}
              convertHint={files.length > 1 ? null : convertHint}
              ready={ready}
              onUpdate={updateFile}
              onToggleAdv={() => setShowAdv((s) => !s)}
              onConvert={runConvert}
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
