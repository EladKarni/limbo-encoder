// The ffmpeg.wasm encode path as a module with a clean seam, mirroring the
// WebCodecs path's transcodeMp4(opts) -> Blob. It owns the engine singleton,
// its lifecycle (load / recover), the WORKERFS mount, the ffmpeg arg-building,
// the measure-and-correct retry loop, and FS cleanup. All UI state stays in
// App — this module only reports progress and throws on failure.
//
// See docs/ARCHITECTURE.md § ffmpeg.wasm fallback for the constraints encoded
// here (thread caps, terminate-and-reload recovery, exit-code checks).

import {
  chooseHeight, correctBitrate, TOLERANCE, ATTEMPTS,
} from './fit';

// The ffmpeg.wasm UMD runtime is loaded via a <script> tag in index.html
// (webpack 4 cannot parse the library's dist, and self-hosting keeps it
// same-origin under the COOP/COEP isolation headers).
const { FFmpeg } = window.FFmpegWASM || {};
const ffmpeg = FFmpeg ? new FFmpeg() : null;

// True when the runtime script loaded; App renders an error engine state
// otherwise.
export const hasFfmpeg = Boolean(ffmpeg);

// The version segment comes from scripts/copy-ffmpeg-assets.js via .env.local;
// versioned paths let the assets be cached as immutable.
const FFMPEG_BASE = `${process.env.PUBLIC_URL || ''}/ffmpeg/${process.env.REACT_APP_FFMPEG_VERSION}`;

// Input files are mounted here via WORKERFS: ffmpeg reads straight from the
// File object on demand, so the input never has to fit in wasm memory.
const MOUNT_DIR = '/work';

async function safeFsOp(op) {
  try {
    await op();
  } catch (err) {
    // Nothing to clean up.
  }
}

export function loadEngine() {
  return ffmpeg.load({
    coreURL: `${FFMPEG_BASE}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_BASE}/ffmpeg-core.wasm`,
    workerURL: `${FFMPEG_BASE}/ffmpeg-core.worker.js`,
  });
}

// Subscribe to every ffmpeg log line. The core's own progress events are
// unreliable (see ARCHITECTURE.md), so App parses time= out of these instead.
export function onLog(handler) {
  ffmpeg.on('log', ({ message }) => handler(message));
}

// Seconds parsed from an ffmpeg "time=HH:MM:SS.ss" log line, or null.
export function parseTimeSecs(message) {
  const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(message);
  if (!m) return null;
  return (parseInt(m[1], 10) * 3600) + (parseInt(m[2], 10) * 60) + parseFloat(m[3]);
}

// A failed exec can leave the wasm core aborted, and any further FS call on it
// can crash the tab — a fresh worker is the only safe recovery (it also wipes
// the in-memory FS, so no cleanup needed). App drives the engine-state UI
// around this call.
export async function recover() {
  ffmpeg.terminate();
  await loadEngine();
}

// Cap both decode and encode thread counts. The wasm core pre-spawns a fixed
// pool of 32 pthread workers, and no more can start while exec blocks its
// worker; auto threading (decoder ~cores + x264 ~1.5x cores) overflows the
// pool on many-core machines and deadlocks.
function threadCap() {
  return `${Math.min(8, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)))}`;
}

// One end-to-end wasm transcode, guaranteed to fit targetBytes. Mounts the
// input via WORKERFS, runs the measure-and-correct retry loop, cleans up the
// FS, and returns the output Blob. Throws on any failure WITHOUT recovering —
// the caller runs recover() (the FS is unusable after an aborted exec, so
// cleanup is skipped on the throw path). onRetry fires before each corrective
// pass so the UI can reset its progress bar.
export async function transcodeWasm({
  id, file, codec, startBitrateKbps, targetMB, targetBytes,
  srcW, srcH, fpsForBudget, userMaxH, durationSec, trimStart, trimEnd, fps, onRetry,
}) {
  const outputName = `output-${id}.${codec.ext}`;
  let cleanup = true;
  try {
    await ffmpeg.createDir(MOUNT_DIR);
    const mounted = await ffmpeg.mount('WORKERFS', { files: [file] }, MOUNT_DIR);
    if (!mounted) throw new Error('Could not mount the input file');
    const inputPath = `${MOUNT_DIR}/${file.name}`;

    const trimmed = trimStart > 0.05 || (trimEnd > 0 && trimEnd < durationSec - 0.05);
    const threads = threadCap();

    let bitrate = startBitrateKbps;
    let data = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const height = chooseHeight(bitrate, srcW, srcH, fpsForBudget, userMaxH);

      const args = ['-threads', threads];
      if (trimmed && trimStart > 0) args.push('-ss', `${trimStart}`);
      args.push('-i', inputPath);
      if (trimmed) args.push('-t', `${durationSec}`);
      // Always scale to even dimensions — yuv420p encoders reject odd sizes.
      args.push('-vf', `scale=-2:min(${height}\\,trunc(ih/2)*2)`);
      if (fps !== 'Original') args.push('-r', fps.replace(' fps', ''));
      // Generic encoder thread cap first, so a codec's own -threads wins.
      args.push('-threads', threads);
      args.push(...codec.videoArgs);
      args.push(
        '-b:v', `${bitrate}k`,
        '-minrate', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`,
      );
      args.push('-ac', '2', ...codec.audioArgs);
      args.push(outputName);

      // eslint-disable-next-line no-await-in-loop
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);

      // eslint-disable-next-line no-await-in-loop
      data = await ffmpeg.readFile(outputName);
      if (!data || data.length < 1024) throw new Error('Encoder produced no output');
      if (data.length <= targetBytes * TOLERANCE) break;

      if (attempt === ATTEMPTS - 1) {
        throw new Error(
          `Could not fit under ${targetMB} MB (got ${(data.length / 1e6).toFixed(1)} MB) `
          + '— try a larger target, a shorter trim, or a lower frame rate',
        );
      }
      bitrate = correctBitrate(bitrate, data.length, targetBytes);
      // eslint-disable-next-line no-await-in-loop
      await safeFsOp(() => ffmpeg.deleteFile(outputName));
      if (onRetry) onRetry();
    }

    return new Blob([data.buffer], { type: codec.mime });
  } catch (err) {
    // Leave FS cleanup to recover() — an aborted core crashes the tab on
    // further FS calls.
    cleanup = false;
    throw err;
  } finally {
    if (cleanup) {
      await safeFsOp(() => ffmpeg.deleteFile(outputName));
      await safeFsOp(() => ffmpeg.unmount(MOUNT_DIR));
      await safeFsOp(() => ffmpeg.deleteDir(MOUNT_DIR));
    }
  }
}
