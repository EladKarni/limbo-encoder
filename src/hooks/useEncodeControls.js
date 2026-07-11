import { CODECS } from '../utils/codecs';
import {
  bitrateKbps, estimateOutBytes, isTargetReachable, overWasmCeiling,
} from '../utils/fit';
import { plannedPath } from '../utils/webcodecs';

// The derived UI values a Convert click and the sidebar need, computed from the
// current files/active/engine state: the bitrate label, the button label, and
// whether anything is actually encodable right now (reachable target, under the
// wasm ceiling). Kept out of App so the root stays wiring-only.
export default function useEncodeControls(files, active, engine) {
  const ready = engine === 'ready';
  const isEncoding = files.some((f) => f.status === 'encoding');
  const readyCount = files.filter((f) => f.status === 'ready').length;

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

  return {
    ready,
    isEncoding,
    bitrateLabel,
    convertLabel,
    canConvert,
    estBytes: active ? estimateOutBytes(active) : 0,
    codecHint: active ? (CODECS[active.codec] || CODECS['H.264']).hint : null,
    overActiveCeiling: Boolean(active) && overWasmCeiling(active, plannedPath(active)),
  };
}
