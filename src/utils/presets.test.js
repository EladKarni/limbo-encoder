// The input-accept policy — one source of truth for the three consumers that
// used to hardcode their own extension lists (dropzone accept, App.addFiles,
// plannedPath's fast-path check).
import {
  PLATFORMS, ACCEPT_VIDEO, isAcceptedVideo, isFastPathContainer,
} from './presets';

describe('ACCEPT_VIDEO', () => {
  it('covers video/* plus every accepted extension', () => {
    expect(ACCEPT_VIDEO).toBe('video/*,.mp4,.mov,.webm,.mkv,.avi');
  });
});

describe('isAcceptedVideo', () => {
  it('accepts a file with a video MIME type regardless of name', () => {
    expect(isAcceptedVideo({ type: 'video/webm', name: 'clip.dat' })).toBe(true);
  });

  it('accepts MIME-less containers by extension (case-insensitive)', () => {
    ['a.mp4', 'a.MOV', 'a.webm', 'a.mkv', 'a.avi'].forEach((name) => {
      expect(isAcceptedVideo({ type: '', name })).toBe(true);
    });
  });

  it('rejects non-video files', () => {
    expect(isAcceptedVideo({ type: 'image/png', name: 'a.png' })).toBe(false);
    expect(isAcceptedVideo({ type: '', name: 'a.txt' })).toBe(false);
  });
});

describe('isFastPathContainer', () => {
  it('is true only for mp4/mov (what the WebCodecs demuxer + muxer handle)', () => {
    expect(isFastPathContainer('clip.mp4')).toBe(true);
    expect(isFastPathContainer('clip.MOV')).toBe(true);
    expect(isFastPathContainer('clip.webm')).toBe(false);
    expect(isFastPathContainer('clip.mkv')).toBe(false);
    expect(isFastPathContainer('clip.avi')).toBe(false);
  });
});

describe('PLATFORMS', () => {
  it('has stable ids, positive MB targets, and a color each', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(ids).toEqual(['discord', 'nitro', 'whatsapp', 'gmail', 'reddit', 'slack', 'telegram']);
    PLATFORMS.forEach((p) => {
      expect(p.mb).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('defaults to Discord Free 10 MB (the first preset)', () => {
    expect(PLATFORMS[0]).toMatchObject({ id: 'discord', mb: 10 });
  });
});
