// User-facing input policy in one place: the platform size presets, and the
// single source of truth for which files the app accepts and which take the
// WebCodecs fast path. Three consumers used to each hardcode their own list
// (the dropzone accept string, App.addFiles, plannedPath) and could drift.
import { MAX_INPUT_BYTES } from './codecs';

// Copy for files whose input size is over the app's cap. The cap is 4 GiB
// (binary), but the label is deliberately the round decimal "4 GB": dividing
// by 1e9 and flooring turns 4·1024^3 (≈4.29e9) back into 4 for the user.
export const oversizedMsg = (name) => (
  `${name} is over ${Math.floor(MAX_INPUT_BYTES / 1e9)} GB — trim it into parts first`
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
