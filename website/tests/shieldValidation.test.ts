import { describe, expect, it } from 'vitest';
import { formatBytes, isLosslessWebp, stageLabel, validateImageFile, validateVideoFile } from '../src/lib/shieldValidation';

const file = (bytes: number[] | Uint8Array, name = 'f.bin', pad = 0): File =>
  new File([new Uint8Array([...bytes, ...new Array(pad).fill(0)])], name);
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const webp = (chunk: string) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(chunk), 4, 0, 0, 0, 0, 0, 0, 0];

describe('image validation (client-side convenience only)', () => {
  it('accepts PNG and lossless WebP', async () => {
    expect((await validateImageFile(file(PNG, 'a.png', 20), null)).ok).toBe(true);
    expect((await validateImageFile(file(webp('VP8L')), null)).ok).toBe(true);
  });
  it('rejects JPEG with an explanation', async () => {
    const r = await validateImageFile(file([0xff, 0xd8, 0xff, 0xe0, 1, 2], 'a.jpg'), null);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/JPEG is not supported/);
  });
  it('rejects lossy WebP, unknown signatures, empty and oversized files', async () => {
    expect((await validateImageFile(file(webp('VP8 ')), null)).message).toMatch(/lossy/i);
    expect((await validateImageFile(file(ascii('GIF89a....')), null)).ok).toBe(false);
    expect((await validateImageFile(new File([], 'e.png'), null)).message).toMatch(/empty/);
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png');
    const caps = { image: { limits: { max_upload_mb: 2 } } } as never;
    expect((await validateImageFile(big, caps)).message).toMatch(/2 MB/);
  });
  it('trusts the bytes, not the file name', async () => {
    expect((await validateImageFile(file(PNG, 'photo.jpg', 8), null)).ok).toBe(true);
    expect((await validateImageFile(file(ascii('not an image'), 'photo.png'), null)).ok).toBe(false);
  });
  it('detects lossless WebP inside an extended (VP8X) container', () => {
    const vp8x = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8X'), 10, 0, 0, 0, ...new Array(10).fill(0), ...ascii('VP8L'), 0, 0, 0, 0];
    expect(isLosslessWebp(new Uint8Array(vp8x))).toBe(true);
  });
});

describe('video validation', () => {
  it('accepts MP4/MOV and WebM signatures and rejects others', async () => {
    expect((await validateVideoFile(file([0, 0, 0, 24, ...ascii('ftypmp42'), 0, 0, 0, 0]), null)).ok).toBe(true);
    expect((await validateVideoFile(file([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]), null)).ok).toBe(true);
    expect((await validateVideoFile(file(ascii('#EXTM3U playlist..')), null)).ok).toBe(false);
  });
  it('enforces the size limit reported by the server', async () => {
    const caps = { video: { limits: { max_upload_mb: 1 } } } as never;
    const big = new File([new Uint8Array([0, 0, 0, 24, ...ascii('ftypmp42')]), new Uint8Array(2 * 1024 * 1024)], 'v.mp4');
    expect((await validateVideoFile(big, caps)).message).toMatch(/1 MB/);
  });
});

describe('labels', () => {
  it('formats bytes and server stages', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(stageLabel('protecting_keyframe_2_of_4')).toBe('Protecting keyframe 2 of 4');
    expect(stageLabel('extracting_frames')).toBe('Extracting frames');
  });
});
