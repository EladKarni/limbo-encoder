import {
  useState, useRef, useEffect, useCallback,
} from 'react';
import { CODEC_OPTIONS, MAX_INPUT_BYTES } from '../utils/codecs';
import { PLATFORMS, isAcceptedVideo } from '../utils/presets';

let uid = 0;
function genId() {
  uid += 1;
  return `f${uid}`;
}

// Copy for files whose input size is over the app's cap. The cap is 4 GiB
// (binary), but the label is deliberately the round decimal "4 GB": dividing
// by 1e9 and flooring turns 4·1024^3 (≈4.29e9) back into 4 for the user.
export const oversizedMsg = (name) => (
  `${name} is over ${Math.floor(MAX_INPUT_BYTES / 1e9)} GB — trim it into parts first`
);

// The per-file state list and everything that mutates it: add (with input
// validation + metadata probing), update, remove (with object-URL cleanup),
// and the active-file selection. filesRef mirrors files so async callers
// (encode, remove) read the latest list without stale closures.
export default function useFiles(showToast) {
  const [files, setFiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const updateFile = useCallback((id, patch) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const loadMeta = useCallback((id, url, name) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const d = Number.isFinite(probe.duration) ? probe.duration : 0;
      updateFile(id, {
        duration: d,
        trimEnd: d,
        width: probe.videoWidth || 0,
        height: probe.videoHeight || 0,
      });
    };
    probe.onerror = () => {
      showToast(`${name} could not be read as a video`, 'error');
    };
    probe.src = url;
  }, [updateFile, showToast]);

  const addFiles = useCallback((list) => {
    const videos = [...list].filter(isAcceptedVideo);
    const oversized = videos.find((f) => f.size > MAX_INPUT_BYTES);
    if (oversized) {
      showToast(oversizedMsg(oversized.name), 'error');
    }
    const accepted = videos.filter((f) => f.size <= MAX_INPUT_BYTES);
    if (!accepted.length) return;
    const defaultPlatform = PLATFORMS[0];
    const created = accepted.map((f) => ({
      id: genId(),
      file: f,
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
      targetMB: defaultPlatform.mb,
      platform: defaultPlatform.id,
      res: 'Original',
      codec: CODEC_OPTIONS[0],
      fps: 'Original',
      status: 'ready',
      progress: 0,
      outUrl: null,
      outBlob: null,
      outBytes: null,
      outMime: null,
      outExt: null,
    }));
    setFiles((fs) => [...fs, ...created]);
    setActiveId((prev) => prev || created[0].id);
    created.forEach((f) => loadMeta(f.id, f.url, f.name));
  }, [loadMeta, showToast]);

  const removeFile = useCallback((id) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f) return;
    if (f.status === 'encoding') {
      showToast('Wait for the current encode to finish');
      return;
    }
    URL.revokeObjectURL(f.url);
    if (f.outUrl) URL.revokeObjectURL(f.outUrl);
    setFiles((fs) => fs.filter((x) => x.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const rest = filesRef.current.filter((x) => x.id !== id);
      return rest[0] ? rest[0].id : null;
    });
  }, [showToast]);

  return {
    files,
    filesRef,
    activeId,
    setActiveId,
    updateFile,
    addFiles,
    removeFile,
    oversizedMsg,
  };
}
