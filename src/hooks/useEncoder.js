import {
  useRef, useEffect, useMemo, useCallback,
} from 'react';
import { parseTimeSecs } from '../utils/ffmpegEncoder';
import {
  runEncode, runBatch, selectEncodeIds, overCeilingMsg,
} from '../utils/encodePipeline';

// React binding for the encode pipeline (src/utils/encodePipeline.js): owns the
// in-flight refs and the failure/log surfaces, assembles the pipeline context,
// and exposes encodeOne. The pipeline logic itself is plain functions so it
// stays testable and this hook stays thin.
export default function useEncoder({
  filesRef, updateFile, setActiveId, showToast, setEngine, setLogHandler,
}) {
  const encodingIdRef = useRef(null);
  // Output duration of the encode in flight; progress is parsed out of ffmpeg's
  // own "time=" log lines against this (the core's progress events are
  // unreliable — they can report 0 or >1 for real-world files).
  const encodingDurRef = useRef(0);
  // Rolling tail of ffmpeg log lines, kept for the error card.
  const logTailRef = useRef([]);

  // Feed every ffmpeg log line here (wired into the engine boot). Keeps the tail
  // for the error card and parses time= into progress for the active encode.
  const handleLogLine = useCallback((message) => {
    // eslint-disable-next-line no-console
    console.log(message);
    logTailRef.current.push(message);
    if (logTailRef.current.length > 30) logTailRef.current.shift();
    const id = encodingIdRef.current;
    const dur = encodingDurRef.current;
    if (!id || !dur) return;
    const secs = parseTimeSecs(message);
    if (secs === null) return;
    updateFile(id, { progress: Math.min(100, Math.max(0, (secs / dur) * 100)) });
  }, [updateFile]);

  useEffect(() => setLogHandler(handleLogLine), [setLogHandler, handleLogLine]);

  // Shared failure surface for both encode paths: the persistent error card
  // carrying the log tail (never toast-only) plus a transient toast.
  const failEncode = useCallback((id, name, lastLine) => {
    updateFile(id, {
      status: 'error',
      progress: 0,
      errorLog: [...logTailRef.current, lastLine].join('\n'),
    });
    showToast(`Encoding ${name} failed`, 'error');
  }, [updateFile, showToast]);

  const ctx = useMemo(() => ({
    filesRef,
    updateFile,
    setActiveId,
    showToast,
    setEngine,
    failEncode,
    encodingIdRef,
    encodingDurRef,
    logTailRef,
  }), [filesRef, updateFile, setActiveId, showToast, setEngine, failEncode]);

  const encodeOne = useCallback((id) => runEncode(ctx, id), [ctx]);

  // A Convert click: encode the selected ids (batch or active), then report a
  // batch summary. Guarded by the caller for engine-ready / not-already-encoding.
  const convert = useCallback(async (files, active) => {
    const ids = selectEncodeIds(files, active);
    if (!ids.length) return;
    const succeeded = await runBatch(ctx, ids);
    if (ids.length > 1) {
      if (succeeded === ids.length) showToast(`Encoded ${succeeded} videos`);
      else showToast(`Encoded ${succeeded} of ${ids.length} videos — the rest were skipped`, 'error');
    }
  }, [ctx, showToast]);

  return { encodeOne, convert, overCeilingMsg };
}
