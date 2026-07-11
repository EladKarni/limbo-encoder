import React, { useState, useRef } from 'react';

import AppLayout from './Components/AppLayout/AppLayout';
import { CODECS, CODEC_OPTIONS } from './utils/codecs';
import {
  bitrateKbps, estimateOutBytes, isTargetReachable, overWasmCeiling,
} from './utils/fit';
import { plannedPath } from './utils/webcodecs';
import { overCeilingMsg } from './utils/encodePipeline';
import useToast from './hooks/useToast';
import useFiles from './hooks/useFiles';
import useEngine from './hooks/useEngine';
import useEncoder from './hooks/useEncoder';
import useFileActions from './hooks/useFileActions';

// The composition root: wires the state hooks (toast, files, engine, encoder)
// to the two panels via AppLayout. All app state lives in the hooks under App's
// tree; the components are props-in / callbacks-out.
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

  const canEncode = (f) => f.status === 'ready' && f.duration > 0 && f.targetMB > 0
    && isTargetReachable(f) && !overWasmCeiling(f, plannedPath(f));
  const encodable = files.filter(canEncode);
  const canConvert = files.length > 1
    ? encodable.length > 0
    : Boolean(active && encodable.some((f) => f.id === active.id));

  const stage = {
    overCeiling: Boolean(active) && overWasmCeiling(active, plannedPath(active)),
    overCeilingMsg,
    onFiles: addFiles,
    onUpdate: updateFile,
    onDownload: download,
    onShare: share,
    onRedo: redo,
    onRetry: (id) => updateFile(id, { status: 'ready', progress: 0, errorLog: null }),
    onSelect: setActiveId,
    onRemove: removeFile,
    onAdd: () => pickerRef.current && pickerRef.current.click(),
  };

  const sidebar = active && {
    isEncoding,
    showAdv,
    codecOptions: CODEC_OPTIONS,
    codecHint: (CODECS[active.codec] || CODECS['H.264']).hint,
    estBytes: estimateOutBytes(active),
    bitrateLabel: br > 0 ? `${br.toLocaleString()} kbps` : '—',
    convertLabel: files.length > 1 ? `Convert all (${readyCount})` : 'Convert',
    canConvert,
    ready,
    onUpdate: updateFile,
    onToggleAdv: () => setShowAdv((s) => !s),
    onConvert: () => {
      if (ready && !isEncoding) convert(files, active);
    },
  };

  return (
    <AppLayout
      engine={engine}
      active={active}
      files={files}
      toast={toast}
      stage={stage}
      sidebar={sidebar || {}}
      pickerRef={pickerRef}
      onPick={(e) => { addFiles(e.target.files); e.target.value = ''; }}
    />
  );
}

export default App;
