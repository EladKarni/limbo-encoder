import {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  hasFfmpeg, loadEngine, onLog,
} from '../utils/ffmpegEncoder';

// The ffmpeg.wasm engine lifecycle: boot it once on mount, track the
// 'loading' | 'ready' | 'error' state the UI pill reflects, and forward every
// log line to the encoder's handler (set via setLogHandler) so encode progress
// can be parsed out of it. setEngine is exposed for the encoder's
// terminate-and-reload recovery after a failed exec.
export default function useEngine(showToast) {
  const [engine, setEngine] = useState('loading');
  const logHandlerRef = useRef(null);

  // The encoder registers its log handler here; the boot effect reads the ref
  // so it works regardless of hook ordering.
  const setLogHandler = useCallback((fn) => {
    logHandlerRef.current = fn;
  }, []);

  useEffect(() => {
    if (!hasFfmpeg) {
      setEngine('error');
      return;
    }
    onLog((message) => {
      if (logHandlerRef.current) logHandlerRef.current(message);
    });
    loadEngine()
      .then(() => setEngine('ready'))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        setEngine('error');
        showToast('Failed to load the encoder engine', 'error');
      });
  }, [showToast]);

  return {
    engine, setEngine, setLogHandler,
  };
}
