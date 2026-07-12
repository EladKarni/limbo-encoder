// User-facing input policy in one place: the platform size presets, and the
// single source of truth for which files the app accepts and which take the
// WebCodecs fast path. Three consumers used to each hardcode their own list
// (the dropzone accept string, App.addFiles, plannedPath) and could drift.
import { WASM_MAX_INPUT_BYTES } from './codecs';

// Copy for files whose input size is over the cap that applies to them. The
// caps are binary (GiB) but the label is the round decimal the user expects,
// so we floor the *binary* GiB count: 4·1024^3 → "4 GB", 64·1024^3 → "64 GB".
// Defaults to the wasm cap so callers that don't know the path stay correct.
export const oversizedMsg = (name, capBytes = WASM_MAX_INPUT_BYTES) => (
  `${name} is over ${Math.floor(capBytes / (1024 ** 3))} GB — trim it into parts first`
);

export const PLATFORMS = [
  {
    id: 'discord', name: 'Discord', sub: 'Free · 10 MB', mb: 10, color: '#5865F2',
  },
  {
    id: 'nitro', name: 'Discord', sub: 'Nitro · 500 MB', mb: 500, color: '#5865F2',
  },
  {
    id: 'whatsapp', name: 'WhatsApp', sub: '16 MB', mb: 16, color: '#25D366',
  },
  {
    id: 'gmail', name: 'Email', sub: 'Gmail · 25 MB', mb: 25, color: '#EA4335',
  },
  {
    id: 'reddit', name: 'Reddit', sub: '1 GB', mb: 1024, color: '#FF4500',
  },
  {
    id: 'slack', name: 'Slack', sub: '1 GB', mb: 1024, color: '#36C5F0',
  },
  {
    id: 'telegram', name: 'Telegram', sub: '2 GB', mb: 2048, color: '#229ED9',
  },
];

// Containers the app accepts as input. MKV/AVI often report an empty or
// generic MIME type, so a file is accepted by extension OR a video/* type.
const INPUT_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi'];
// Containers the WebCodecs fast path can demux (mp4box + the in-memory mp4
// muxer target H.264/mp4 only).
const FAST_PATH_EXTENSIONS = ['mp4', 'mov'];

const extRe = (exts) => new RegExp(`\\.(${exts.join('|')})$`, 'i');
const INPUT_RE = extRe(INPUT_EXTENSIONS);
const FAST_PATH_RE = extRe(FAST_PATH_EXTENSIONS);

// The <input accept> / react-dropzone accept string: any video plus the
// explicit extensions (for the MIME-less containers).
export const ACCEPT_VIDEO = ['video/*', ...INPUT_EXTENSIONS.map((e) => `.${e}`)].join(',');

// Whether a dropped/picked File should be accepted as a video input.
export function isAcceptedVideo(file) {
  return file.type.startsWith('video') || INPUT_RE.test(file.name);
}

// Whether a filename is a container the WebCodecs fast path can handle.
export function isFastPathContainer(name) {
  return FAST_PATH_RE.test(name);
}
