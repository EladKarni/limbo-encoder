// WebCodecs fast path: decode with the browser's own (often hardware)
// decoders — which handle AV1/HEVC/H.264 that the wasm core cannot — then
// encode H.264 at the target bitrate and mux to mp4. Demuxing uses the
// MP4Box global and muxing the Mp4Muxer global, both loaded via script tags
// in index.html (their dists use syntax webpack 4 cannot parse).

import { chooseHeight } from './video';

const READ_CHUNK = 16 * 1024 * 1024;
const QUEUE_HIGH_WATER = 60;

export function webCodecsAvailable() {
  return typeof window.VideoDecoder === 'function'
    && typeof window.VideoEncoder === 'function'
    && typeof window.EncodedVideoChunk === 'function'
    && typeof window.OffscreenCanvas === 'function'
    && Boolean(window.MP4Box)
    && Boolean(window.Mp4Muxer);
}

// Serialize the codec-specific config box (avcC/hvcC) VideoDecoder needs.
// AV1 and VP9 configure from the codec string alone.
function videoDescription(mp4, trackId) {
  const trak = mp4.getTrackById(trackId);
  const { entries } = trak.mdia.minf.stbl.stsd;
  for (let i = 0; i < entries.length; i += 1) {
    const box = entries[i].avcC || entries[i].hvcC;
    if (box) {
      const ds = new window.DataStream(undefined, 0, window.DataStream.BIG_ENDIAN);
      box.write(ds);
      return new Uint8Array(ds.buffer, 8); // strip the 8-byte box header
    }
  }
  return null;
}

// AudioSpecificConfig bytes from the esds box, needed to copy AAC verbatim.
function audioSpecificConfig(mp4, trackId) {
  const trak = mp4.getTrackById(trackId);
  const { entries } = trak.mdia.minf.stbl.stsd;
  for (let i = 0; i < entries.length; i += 1) {
    const esds = entries[i].esds && entries[i].esds.esd;
    if (esds && esds.descs) {
      for (let j = 0; j < esds.descs.length; j += 1) {
        const d = esds.descs[j];
        if (d.tag === 4 && d.descs) {
          for (let k = 0; k < d.descs.length; k += 1) {
            if (d.descs[k].tag === 5) return new Uint8Array(d.descs[k].data);
          }
        }
      }
    }
  }
  return null;
}

function even(n) {
  return 2 * Math.floor(n / 2);
}

// Find a supported encoder configuration, preferring the GPU. Chrome only
// engages hardware encoders (NVENC etc.) in realtime latency mode, so that
// combination is tried first; software fills in when hardware refuses.
async function pickEncoderConfig(base) {
  // High → Main → Constrained Baseline, level 5.2 (covers 4K60).
  const codecs = ['avc1.640034', 'avc1.4d0034', 'avc1.42c034'];
  const variants = [
    {
      label: 'hardware',
      opts: {
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
        bitrateMode: 'constant',
      },
    },
    {
      label: 'software',
      opts: { latencyMode: 'quality', bitrateMode: 'constant' },
    },
    {
      // Some encoders reject CBR; variable mode overshoots, so shave the
      // request (the size-verification pass catches the rest).
      label: 'software-vbr',
      opts: { latencyMode: 'quality', bitrateMode: 'variable' },
      bitrateScale: 0.88,
    },
  ];
  for (let v = 0; v < variants.length; v += 1) {
    for (let c = 0; c < codecs.length; c += 1) {
      const cfg = {
        ...base,
        ...variants[v].opts,
        codec: codecs[c],
        bitrate: Math.round(base.bitrate * (variants[v].bitrateScale || 1)),
      };
      // eslint-disable-next-line no-await-in-loop
      const res = await window.VideoEncoder.isConfigSupported(cfg);
      if (res.supported) return { cfg, label: variants[v].label };
    }
  }
  throw new Error('No supported H.264 encoder configuration');
}

function waitForDrain(decoder, encoder) {
  return new Promise((resolve) => {
    const tick = () => {
      if (decoder.decodeQueueSize < QUEUE_HIGH_WATER
        && encoder.encodeQueueSize < QUEUE_HIGH_WATER) resolve();
      else setTimeout(tick, 15);
    };
    tick();
  });
}

// One end-to-end transcode pass. videoKbpsOverride skips the budget
// computation (used by the corrective pass below).
async function transcodeOnce({
  file, targetMB, trimStart, trimEnd, resHeight, fpsOut, onProgress, videoKbpsOverride,
}) {
  const mp4 = window.MP4Box.createFile();
  let info = null;
  let demuxError = null;
  mp4.onError = (e) => { demuxError = new Error(`demux failed: ${e}`); };
  mp4.onReady = (i) => { info = i; };

  // Pump the header. appendBuffer returns the next offset mp4box wants, so
  // moov-at-end files skip over the mdat instead of reading gigabytes.
  // Bytes must never be fed twice — mp4box would deliver samples twice — so
  // track how far the contiguous-from-zero region reaches and where the
  // first skipped-ahead (already appended) region begins.
  let offset = 0;
  let contiguousUpTo = 0;
  let tailStart = file.size;
  while (!info && !demuxError && offset < file.size) {
    const end = Math.min(offset + READ_CHUNK, file.size);
    // eslint-disable-next-line no-await-in-loop
    const buf = await file.slice(offset, end).arrayBuffer();
    buf.fileStart = offset;
    const next = mp4.appendBuffer(buf);
    if (offset === contiguousUpTo) contiguousUpTo = end;
    if (typeof next === 'number' && next > end) {
      if (tailStart === file.size) tailStart = next;
      offset = next;
    } else {
      offset = end;
    }
  }
  if (demuxError) throw demuxError;
  if (!info) throw new Error('No moov box found in file');

  const vTrack = info.videoTracks && info.videoTracks[0];
  if (!vTrack) throw new Error('No video track found');
  const aTrack = (info.audioTracks || []).find((t) => t.codec.indexOf('mp4a') === 0);
  const asc = aTrack ? audioSpecificConfig(mp4, aTrack.id) : null;
  if (aTrack && !asc) throw new Error('Could not read the AAC configuration');

  const srcW = vTrack.video.width;
  const srcH = vTrack.video.height;
  const srcDur = vTrack.duration / vTrack.timescale;
  const fpsSrc = srcDur > 0 ? vTrack.nb_samples / srcDur : 30;
  const fpsTarget = fpsOut && fpsOut < fpsSrc ? fpsOut : fpsSrc;

  // Note: outW/outH are chosen after the bitrate budget below, because the
  // resolution ladder depends on the bits-per-pixel the budget affords.

  const startUs = (trimStart || 0) * 1e6;
  const endUs = trimEnd && trimEnd < srcDur ? trimEnd * 1e6 : srcDur * 1e6 + 1;
  const outDur = Math.max(0.1, (endUs - startUs) / 1e6 > srcDur
    ? srcDur - (trimStart || 0)
    : (endUs - startUs) / 1e6);

  // Audio is copied verbatim, so budget the video bitrate around the
  // track's real bitrate rather than an assumed 128k.
  const audioKbps = aTrack
    ? Math.max(32, Math.round((aTrack.bitrate || 128000) / 1000))
    : 0;
  const sourceVideoKbps = Math.round((vTrack.bitrate || (file.size * 8) / srcDur) / 1000);
  const budgetKbps = ((8000 * targetMB) / outDur) * 0.95 - audioKbps;
  const videoKbps = videoKbpsOverride
    || Math.max(100, Math.min(budgetKbps, sourceVideoKbps));

  // Pick the largest resolution (capped by the user's choice) where the
  // budget still gives a workable bits-per-pixel. Encoders can't hit very
  // thin budgets at high resolutions — their quantizer floor makes them
  // overshoot the target instead — and the quality would be mush anyway.
  const userMaxH = resHeight && resHeight < srcH ? resHeight : srcH;
  const chosenH = chooseHeight(videoKbps, srcW, srcH, fpsTarget, userMaxH);
  const outH = even(chosenH);
  const outW = even(srcW * (chosenH / srcH));

  let decCfg = {
    codec: vTrack.codec,
    codedWidth: srcW,
    codedHeight: srcH,
    hardwareAcceleration: 'prefer-hardware',
  };
  const desc = videoDescription(mp4, vTrack.id);
  if (desc) decCfg.description = desc;
  let decLabel = 'hardware';
  if (!(await window.VideoDecoder.isConfigSupported(decCfg)).supported) {
    decCfg = { ...decCfg, hardwareAcceleration: 'no-preference' };
    decLabel = 'auto';
    if (!(await window.VideoDecoder.isConfigSupported(decCfg)).supported) {
      throw new Error(`Browser cannot decode ${vTrack.codec}`);
    }
  }

  const { cfg: encCfg, label: encLabel } = await pickEncoderConfig({
    width: outW,
    height: outH,
    bitrate: Math.max(100000, Math.round(videoKbps * 1000)),
    framerate: fpsTarget,
    avc: { format: 'avc' },
  });
  // eslint-disable-next-line no-console
  console.log(
    `Limbo WebCodecs: decode=${decLabel} (${vTrack.codec}), encode=${encLabel} `
    + `(${encCfg.codec}, ${encCfg.bitrateMode}), ${outW}x${outH}@${Math.round(fpsTarget)} `
    + `${Math.round(encCfg.bitrate / 1000)} kbps`,
  );

  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: outW, height: outH },
    audio: aTrack ? {
      codec: 'aac',
      sampleRate: aTrack.audio.sample_rate,
      numberOfChannels: aTrack.audio.channel_count,
    } : undefined,
  });

  let fail = null;
  const failWith = (e) => { fail = fail || (e instanceof Error ? e : new Error(String(e))); };

  const keyInterval = Math.max(1, Math.round(fpsTarget * 2));
  let encodedFrames = 0;
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => {
      try { muxer.addVideoChunk(chunk, meta); } catch (e) { failWith(e); }
    },
    error: failWith,
  });
  encoder.configure(encCfg);

  const needScale = outW !== even(srcW) || outH !== even(srcH) || srcW % 2 || srcH % 2;
  const canvas = needScale ? new window.OffscreenCanvas(outW, outH) : null;
  const ctx = canvas ? canvas.getContext('2d') : null;

  let nextEmitUs = -1;
  const stepUs = 1e6 / fpsTarget;
  const dropFps = fpsTarget < fpsSrc - 0.01;
  const decoder = new window.VideoDecoder({
    output: (frame) => {
      try {
        const t = frame.timestamp;
        if (t < startUs || t > endUs) { frame.close(); return; }
        if (dropFps) {
          if (nextEmitUs < 0) nextEmitUs = t;
          if (t < nextEmitUs) { frame.close(); return; }
          nextEmitUs += stepUs;
        }
        let out = frame;
        if (ctx) {
          ctx.drawImage(frame, 0, 0, outW, outH);
          out = new window.VideoFrame(canvas, { timestamp: t, duration: frame.duration });
          frame.close();
        }
        encoder.encode(out, { keyFrame: encodedFrames % keyInterval === 0 });
        encodedFrames += 1;
        out.close();
      } catch (e) {
        frame.close();
        failWith(e);
      }
    },
    error: failWith,
  });
  decoder.configure(decCfg);

  let audioMetaSent = false;
  let processed = 0;
  let lastVideoSample = 0;
  mp4.onSamples = (id, user, samples) => {
    try {
      if (id === vTrack.id) {
        for (let i = 0; i < samples.length; i += 1) {
          const s = samples[i];
          decoder.decode(new window.EncodedVideoChunk({
            type: s.is_sync ? 'key' : 'delta',
            timestamp: (s.cts / s.timescale) * 1e6,
            duration: (s.duration / s.timescale) * 1e6,
            data: s.data,
          }));
          processed += 1;
          lastVideoSample = s.number;
        }
        if (onProgress) onProgress(processed / vTrack.nb_samples);
        mp4.releaseUsedSamples(id, lastVideoSample);
      } else if (aTrack && id === aTrack.id) {
        for (let i = 0; i < samples.length; i += 1) {
          const s = samples[i];
          const tUs = (s.cts / s.timescale) * 1e6;
          if (tUs >= startUs && tUs <= endUs) {
            muxer.addAudioChunkRaw(
              s.data,
              'key',
              tUs,
              (s.duration / s.timescale) * 1e6,
              audioMetaSent ? undefined : {
                decoderConfig: {
                  codec: aTrack.codec,
                  sampleRate: aTrack.audio.sample_rate,
                  numberOfChannels: aTrack.audio.channel_count,
                  description: asc,
                },
              },
            );
            audioMetaSent = true;
          }
        }
        mp4.releaseUsedSamples(id, samples[samples.length - 1].number);
      }
    } catch (e) {
      failWith(e);
    }
  };

  mp4.setExtractionOptions(vTrack.id, null, { nbSamples: 100 });
  if (aTrack) mp4.setExtractionOptions(aTrack.id, null, { nbSamples: 100 });
  // start() delivers samples already buffered during the header pump; the
  // loop below feeds only bytes mp4box has not seen (never re-feeding —
  // duplicate ranges make mp4box deliver duplicate samples), stopping where
  // the already-appended tail (moov-at-end case) begins.
  mp4.start();

  const totalVideoSamples = vTrack.nb_samples;
  offset = contiguousUpTo;
  while (offset < tailStart && processed < totalVideoSamples && !fail) {
    const end = Math.min(offset + READ_CHUNK, tailStart);
    // eslint-disable-next-line no-await-in-loop
    const buf = await file.slice(offset, end).arrayBuffer();
    buf.fileStart = offset;
    mp4.appendBuffer(buf);
    offset = end;
    // eslint-disable-next-line no-await-in-loop
    await waitForDrain(decoder, encoder);
  }
  mp4.flush();
  if (fail) throw fail;
  if (processed < totalVideoSamples) {
    throw new Error(`Demuxer delivered ${processed} of ${totalVideoSamples} video samples`);
  }

  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();
  if (fail) throw fail;
  if (encodedFrames === 0) throw new Error('No frames were produced');

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  if (blob.size < 1024) throw new Error('Transcode produced no output');
  return { blob, videoKbps };
}

// Transcode an mp4/mov File to H.264 mp4, guaranteed to fit targetMB.
// Browser encoders' rate control can overshoot the requested average
// (especially software fallbacks), so measure and re-encode with a
// corrected bitrate when the first pass misses. Throws on anything
// unsupported — the caller falls back to the wasm encoder.
export async function transcodeMp4(opts) {
  const targetBytes = opts.targetMB * 1e6;
  let pass = await transcodeOnce(opts);
  for (let i = 0; i < 3 && pass.blob.size > targetBytes * 1.02 && pass.videoKbps > 100; i += 1) {
    // A lower corrected bitrate also re-picks a lower ladder resolution.
    const corrected = Math.max(
      100,
      Math.floor(pass.videoKbps * (targetBytes / pass.blob.size) * 0.95),
    );
    // eslint-disable-next-line no-await-in-loop
    pass = await transcodeOnce({ ...opts, videoKbpsOverride: corrected });
  }
  if (pass.blob.size > targetBytes * 1.02) {
    throw new Error(
      `Result is ${(pass.blob.size / 1e6).toFixed(1)} MB, over the ${opts.targetMB} MB target`,
    );
  }
  return pass.blob;
}
