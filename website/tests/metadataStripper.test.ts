import { describe, it, expect } from 'vitest';
import {
  stripImageMetadata,
  getOrientationTransform,
  detectBrowserAutoOrientation,
} from '../src/utils/metadataStripper';

function createMockJpegWithOrientation(width: number, height: number, orientation: number): Uint8Array {
  const bytes = [
    0xFF, 0xD8, // SOI
    0xFF, 0xE1, // APP1 marker
    0x00, 0x22, // Length = 34 bytes (2 length bytes + 32 data bytes)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2A, 0x00, // TIFF header (Little Endian)
    0x08, 0x00, 0x00, 0x00, // Offset to IFD0 (8)
    0x01, 0x00, // 1 directory entry
    0x12, 0x01, // Tag 0x0112 (Orientation)
    0x03, 0x00, // SHORT
    0x01, 0x00, 0x00, 0x00, // Count 1
    orientation, 0x00, 0x00, 0x00, // Value
    0x00, 0x00, 0x00, 0x00, // Next IFD offset (0)
    0xFF, 0xC0, // SOF0
    0x00, 0x11,
    0x08,
    (height >> 8) & 0xFF, height & 0xFF,
    (width >> 8) & 0xFF, width & 0xFF,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xFF, 0xD9  // EOI
  ];
  return new Uint8Array(bytes);
}

describe('Metadata Stripper & Orientation Normalizer', () => {
  it('preserves PNG format and generates sanitized download filename', async () => {
    const file = new File(['mock-png-data'], 'vacation_photo.png', { type: 'image/png' });

    const result = await stripImageMetadata(file, { targetFormat: 'preserve' });

    expect(result.originalMimeType).toBe('image/png');
    expect(result.cleanMimeType).toBe('image/png');
    expect(result.downloadFileName).toBe('vacation_photo_clean.png');
    expect(result.formatConverted).toBe(false);
  });

  it('preserves JPEG format and appends clean suffix', async () => {
    const file = new File(['mock-jpeg-data'], 'portrait.jpg', { type: 'image/jpeg' });

    const result = await stripImageMetadata(file, { targetFormat: 'preserve' });

    expect(result.originalMimeType).toBe('image/jpeg');
    expect(result.cleanMimeType).toBe('image/jpeg');
    expect(result.downloadFileName).toBe('portrait_clean.jpg');
    expect(result.formatConverted).toBe(false);
  });

  it('warns and converts unsupported formats like TIFF to lossless PNG', async () => {
    const file = new File(['mock-tiff-data'], 'scan.tiff', { type: 'image/tiff' });

    const result = await stripImageMetadata(file, { targetFormat: 'preserve' });

    expect(result.cleanMimeType).toBe('image/png');
    expect(result.formatConverted).toBe(true);
    expect(result.conversionNotice).toContain('converted to lossless PNG');
    expect(result.downloadFileName).toBe('scan_clean.png');
  });

  it('honors explicit user format override (e.g. converting JPEG to WebP)', async () => {
    const file = new File(['mock-jpeg-data'], 'banner.jpg', { type: 'image/jpeg' });

    const result = await stripImageMetadata(file, { targetFormat: 'image/webp' });

    expect(result.cleanMimeType).toBe('image/webp');
    expect(result.formatConverted).toBe(true);
    expect(result.downloadFileName).toBe('banner_clean.webp');
  });

  it('calculates mathematically verified affine transformation matrices for all 8 orientations', () => {
    const w = 2048;
    const h = 1529;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];

    for (let o = 1; o <= 8; o++) {
      const transform = getOrientationTransform(o, w, h);
      const [a, b, c, d, e, f] = transform.matrix;

      if (o >= 5 && o <= 8) {
        expect(transform.canvasWidth).toBe(h);
        expect(transform.canvasHeight).toBe(w);
      } else {
        expect(transform.canvasWidth).toBe(w);
        expect(transform.canvasHeight).toBe(h);
      }

      // Check all 4 transformed corners remain within the canvas boundaries [0, cw] x [0, ch]
      for (const [x, y] of corners) {
        const xc = a * x + c * y + e;
        const yc = b * x + d * y + f;
        expect(xc).toBeGreaterThanOrEqual(0);
        expect(xc).toBeLessThanOrEqual(transform.canvasWidth);
        expect(yc).toBeGreaterThanOrEqual(0);
        expect(yc).toBeLessThanOrEqual(transform.canvasHeight);
      }
    }
  });

  it('detects browser auto-orientation safely without crashing in test environment', async () => {
    const autoOrient = await detectBrowserAutoOrientation();
    expect(typeof autoOrient).toBe('boolean');
  });

  it('strips metadata and normalizes orientation for JPEGs across all 8 orientation values', async () => {
    for (let o = 1; o <= 8; o++) {
      const jpegBytes = createMockJpegWithOrientation(2048, 1529, o);
      const file = new File([jpegBytes.buffer as ArrayBuffer], `camera_sample_o${o}.jpg`, { type: 'image/jpeg' });

      const result = await stripImageMetadata(file, { targetFormat: 'preserve' });

      expect(result.verifiedClean).toBe(true);
      expect(result.remainingTagCount).toBe(0);
      expect(result.originalOrientation).toBe(o);
      expect(result.cleanMimeType).toBe('image/jpeg');

      if (o >= 5 && o <= 8) {
        expect(result.orientationNormalized).toBe(true);
        expect(result.visualDimensions).toEqual({ width: 1529, height: 2048 });
      } else if (o === 1) {
        expect(result.orientationNormalized).toBe(false);
        expect(result.visualDimensions).toEqual({ width: 2048, height: 1529 });
      } else {
        expect(result.orientationNormalized).toBe(true);
        expect(result.visualDimensions).toEqual({ width: 2048, height: 1529 });
      }
    }
  });
});
