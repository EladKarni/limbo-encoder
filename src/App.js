import React, { useState, useRef } from 'react';

import AppLayout from './Components/AppLayout/AppLayout';
import useToast from './hooks/useToast';
import useFiles from './hooks/useFiles';
import useEngine from './hooks/useEngine';
import useEncoder from './hooks/useEncoder';
import useFileActions from './hooks/useFileActions';
import useEncodeControls from './hooks/useEncodeControls';

// The composition root: wire the state hooks and hand AppLayout the state plus
// one callbacks bag. All app state lives in these hooks under App's tree;
// everything below is props-in / callbacks-out.
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
  const active = files.find((f) => f.id === activeId) || files[0] || null;
  const { download, share, redo } = useFileActions(active, showToast, updateFile);
  const controls = useEncodeControls(files, active, engine);

  const cb = {
    addFiles,
    updateFile,
    download,
    share,
    redo,
    removeFile,
    select: setActiveId,
    retry: (id) => updateFile(id, { status: 'ready', progress: 0, errorLog: null }),
    openPicker: () => pickerRef.current && pickerRef.current.click(),
    toggleAdv: () => setShowAdv((s) => !s),
    pick: (e) => { addFiles(e.target.files); e.target.value = ''; },
    convert: () => {
      if (controls.ready && !controls.isEncoding) runConvert(files, active);
    },
  };

  return (
    <AppLayout
      engine={engine}
      active={active}
      files={files}
      toast={toast}
      controls={{ ...controls, overCeilingMsg }}
      cb={cb}
      showAdv={showAdv}
      pickerRef={pickerRef}
    />
  );
}

export default App;
