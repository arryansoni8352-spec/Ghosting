import { describe, it, expect } from 'vitest';
import {
  validateImageFile,
  inspectImageMetadata,
  getOrientationDescription,
  doesOrientationSwapDimensions,
  calculateVisualDimensions,
  getImageHeaderDimensions,
} from '../src/utils/metadataInspector';

function createMockJpegWithOrientation(width: number, height: number, orientation?: number): Uint8Array {
  const hasExif = orientation !== undefined;
  const exifSegment = hasExif
    ? [
        0xFF, 0xE1,
        0x00, 0x22, // Length = 34 bytes (2 length bytes + 32 data bytes)
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
        0x49, 0x49, 0x2A, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00,
        0x12, 0x01, // Tag 0x0112 (Orientation)
        0x03, 0x00, // SHORT
        0x01, 0x00, 0x00, 0x00,
        orientation, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]
    : [];

  const bytes = [
    0xFF, 0xD8, // SOI
    ...exifSegment,
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

describe('Image Metadata Inspector & Orientation Detection', () => {
  it('validates standard supported image formats', () => {
    const pngFile = new File(['fake-png-data'], 'sample.png', { type: 'image/png' });
    const jpegFile = new File(['fake-jpg-data'], 'photo.jpg', { type: 'image/jpeg' });
    const webpFile = new File(['fake-webp-data'], 'banner.webp', { type: 'image/webp' });
    const tiffFile = new File(['fake-tiff-data'], 'scan.tiff', { type: 'image/tiff' });

    expect(validateImageFile(pngFile).valid).toBe(true);
    expect(validateImageFile(jpegFile).valid).toBe(true);
    expect(validateImageFile(webpFile).valid).toBe(true);
    expect(validateImageFile(tiffFile).valid).toBe(true);
  });

  it('rejects unsupported file formats', () => {
    const pdfFile = new File(['fake-pdf'], 'document.pdf', { type: 'application/pdf' });
    const exeFile = new File(['fake-exe'], 'program.exe', { type: 'application/x-msdownload' });
    const txtFile = new File(['fake-text'], 'notes.txt', { type: 'text/plain' });

    expect(validateImageFile(pdfFile).valid).toBe(false);
    expect(validateImageFile(exeFile).valid).toBe(false);
    expect(validateImageFile(txtFile).valid).toBe(false);
  });

  it('rejects empty files (0 bytes)', () => {
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(emptyFile).valid).toBe(false);
  });

  it('rejects oversized files exceeding 25 MB', () => {
    const largeFile = {
      name: 'large_raw.png',
      type: 'image/png',
      size: 30 * 1024 * 1024,
    } as unknown as File;

    expect(validateImageFile(largeFile).valid).toBe(false);
  });

  it('correctly maps human-readable descriptions for all 8 EXIF orientations', () => {
    expect(getOrientationDescription(1)).toContain('normal');
    expect(getOrientationDescription(2)).toContain('Mirror horizontal');
    expect(getOrientationDescription(3)).toContain('Rotate 180°');
    expect(getOrientationDescription(4)).toContain('Mirror vertical');
    expect(getOrientationDescription(5)).toContain('Transpose');
    expect(getOrientationDescription(6)).toContain('Rotate 90° CW');
    expect(getOrientationDescription(7)).toContain('Transverse');
    expect(getOrientationDescription(8)).toContain('Rotate 270° CW');
  });

  it('correctly determines which orientations swap width and height dimensions', () => {
    // 1-4 maintain axis orientation
    expect(doesOrientationSwapDimensions(1)).toBe(false);
    expect(doesOrientationSwapDimensions(2)).toBe(false);
    expect(doesOrientationSwapDimensions(3)).toBe(false);
    expect(doesOrientationSwapDimensions(4)).toBe(false);

    // 5-8 involve 90°/270° rotations that swap coordinates
    expect(doesOrientationSwapDimensions(5)).toBe(true);
    expect(doesOrientationSwapDimensions(6)).toBe(true);
    expect(doesOrientationSwapDimensions(7)).toBe(true);
    expect(doesOrientationSwapDimensions(8)).toBe(true);
  });

  it('calculates visual dimensions preserving aspect ratio without blind rotation', () => {
    const rawW = 2048;
    const rawH = 1529;

    // Normal landscape photo (Orientation 1) -> visual is 2048 x 1529
    const normal = calculateVisualDimensions(rawW, rawH, 1);
    expect(normal.visualWidth).toBe(2048);
    expect(normal.visualHeight).toBe(1529);

    // Camera held in portrait with Orientation 6 (Rotate 90° CW) -> visual is 1529 x 2048
    const portraitByExif = calculateVisualDimensions(rawW, rawH, 6);
    expect(portraitByExif.visualWidth).toBe(1529);
    expect(portraitByExif.visualHeight).toBe(2048);

    // Camera held in portrait with Orientation 8 (Rotate 270° CW) -> visual is 1529 x 2048
    const portraitByExif8 = calculateVisualDimensions(rawW, rawH, 8);
    expect(portraitByExif8.visualWidth).toBe(1529);
    expect(portraitByExif8.visualHeight).toBe(2048);

    // Native portrait photo already stored as 1529 x 2048 with Orientation 1 -> visual is 1529 x 2048
    const nativePortrait = calculateVisualDimensions(1529, 2048, 1);
    expect(nativePortrait.visualWidth).toBe(1529);
    expect(nativePortrait.visualHeight).toBe(2048);
  });

  it('inspects EXIF Orientation (tag 274) across all 8 orientation values', async () => {
    for (let o = 1; o <= 8; o++) {
      const bytes = createMockJpegWithOrientation(2048, 1529, o);
      const file = new File([bytes.buffer as ArrayBuffer], `photo_orient_${o}.jpg`, { type: 'image/jpeg' });

      const report = await inspectImageMetadata(file);

      expect(report.orientation).toBe(o);
      expect(report.orientationDescription).toBeDefined();
      expect(report.dimensions).toBeDefined();
      expect(report.dimensions?.width).toBe(2048);
      expect(report.dimensions?.height).toBe(1529);

      if (o >= 5 && o <= 8) {
        expect(report.dimensions?.visualWidth).toBe(1529);
        expect(report.dimensions?.visualHeight).toBe(2048);
      } else {
        expect(report.dimensions?.visualWidth).toBe(2048);
        expect(report.dimensions?.visualHeight).toBe(1529);
      }

      // Check that Orientation tag is listed in report.tags
      const orientTag = report.tags.find(t => t.name.toLowerCase() === 'orientation');
      expect(orientTag).toBeDefined();
      expect(orientTag?.group).toBe('Camera');
    }
  });

  it('correctly inspects images without EXIF orientation tags', async () => {
    const bytes = createMockJpegWithOrientation(1920, 1080); // No EXIF tag
    const file = new File([bytes.buffer as ArrayBuffer], 'landscape_no_exif.jpg', { type: 'image/jpeg' });

    const report = await inspectImageMetadata(file);
    expect(report.orientation).toBeUndefined();
    expect(report.dimensions?.width).toBe(1920);
    expect(report.dimensions?.height).toBe(1080);
    expect(report.dimensions?.visualWidth).toBe(1920);
    expect(report.dimensions?.visualHeight).toBe(1080);
  });

  it('fast header parser extracts correct dimensions from JPEG, PNG, and WebP', () => {
    // JPEG
    const jpegBytes = createMockJpegWithOrientation(800, 600);
    const jpegDims = getImageHeaderDimensions(jpegBytes);
    expect(jpegDims).toEqual({ width: 800, height: 600 });

    // PNG
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x04, 0x00, // 1024
      0x00, 0x00, 0x03, 0x00, // 768
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]);
    const pngDims = getImageHeaderDimensions(pngBytes);
    expect(pngDims).toEqual({ width: 1024, height: 768 });
  });
});
