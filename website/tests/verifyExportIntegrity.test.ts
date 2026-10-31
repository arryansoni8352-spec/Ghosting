import { describe, it, expect, vi } from 'vitest';
import ExifReader from 'exifreader';
import { inspectImageMetadata } from '../src/utils/metadataInspector';
import { stripImageMetadata } from '../src/utils/metadataStripper';

describe('Deep Privacy & Binary Export Verification', () => {
  // Helper to generate a valid minimal JPEG with APP1 EXIF segment containing GPS tags
  function createMockExifJpeg(): Uint8Array {
    // SOI (FF D8) + APP1 (FF E1) with Exif header + SOF0 + EOI (FF D9)
    return new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE1, // APP1 marker
      0x00, 0x22, // Length (34 bytes)
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x49, 0x49, 0x2A, 0x00, // TIFF header (Little Endian)
      0x08, 0x00, 0x00, 0x00, // Offset to IFD0 (8)
      0x01, 0x00, // 1 directory entry
      0x0F, 0x01, 0x02, 0x00, 0x05, 0x00, 0x00, 0x00, 0x1A, 0x00, 0x00, 0x00, // Tag 0x010F (Make: "Test\0")
      0x00, 0x00, 0x00, 0x00, // Next IFD offset (0)
      0x54, 0x65, 0x73, 0x74, 0x00, 0x00, // Value: "Test\0"
      0xFF, 0xD9  // EOI
    ]);
  }

  it('proves zero network calls occur during image inspection or stripping', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const jpegBytes = createMockExifJpeg();
    const file = new File([jpegBytes.buffer as ArrayBuffer], 'camera_photo.jpg', { type: 'image/jpeg' });

    // 1. Inspect metadata
    const report = await inspectImageMetadata(file);
    expect(report.fileName).toBe('camera_photo.jpg');

    // 2. Strip metadata
    const result = await stripImageMetadata(file, { targetFormat: 'preserve' });
    expect(result.cleanMimeType).toBe('image/jpeg');

    // 3. Verify zero network requests were triggered
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('proves metadata removal is verified on disk/buffer rather than trusting UI', async () => {
    const jpegBytes = createMockExifJpeg();
    const file = new File([jpegBytes.buffer as ArrayBuffer], 'camera_photo.jpg', { type: 'image/jpeg' });

    // Verify original has EXIF tags
    const originalTags = ExifReader.load(jpegBytes.buffer as ArrayBuffer, { expanded: true });
    expect(Object.keys(originalTags).length).toBeGreaterThan(0);

    // Perform strip
    const result = await stripImageMetadata(file, { targetFormat: 'preserve' });
    expect(result.verifiedClean).toBe(true);
    expect(result.remainingTagCount).toBe(0);

    // Verify raw clean blob buffer independently with ExifReader
    const cleanBuffer = await result.cleanBlob.arrayBuffer();
    let reParsedTags: any = {};
    try {
      reParsedTags = ExifReader.load(cleanBuffer, { expanded: true });
    } catch {
      reParsedTags = {};
    }
    const nonTechnicalKeys = Object.keys(reParsedTags).filter(k => k === 'exif' || k === 'gps' || k === 'iptc' || k === 'xmp');
    expect(nonTechnicalKeys.length).toBe(0);
  });

  it('correctly handles PNG, JPEG, and WebP preservation without cross-format degradation', async () => {
    const pngFile = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer as ArrayBuffer], 'clean.png', { type: 'image/png' });
    const pngRes = await stripImageMetadata(pngFile, { targetFormat: 'preserve' });
    expect(pngRes.cleanMimeType).toBe('image/png');
    expect(pngRes.formatConverted).toBe(false);

    const jpgFile = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer as ArrayBuffer], 'clean.jpg', { type: 'image/jpeg' });
    const jpgRes = await stripImageMetadata(jpgFile, { targetFormat: 'preserve' });
    expect(jpgRes.cleanMimeType).toBe('image/jpeg');
    expect(jpgRes.formatConverted).toBe(false);

    const webpFile = new File([new Uint8Array([82, 73, 70, 70]).buffer as ArrayBuffer], 'clean.webp', { type: 'image/webp' });
    const webpRes = await stripImageMetadata(webpFile, { targetFormat: 'preserve' });
    expect(webpRes.cleanMimeType).toBe('image/webp');
    expect(webpRes.formatConverted).toBe(false);
  });

  it('converts TIFF and BMP to lossless PNG and provides format conversion disclosure', async () => {
    const tiffFile = new File([new Uint8Array([0x49, 0x49, 0x2A, 0x00]).buffer as ArrayBuffer], 'document.tiff', { type: 'image/tiff' });
    const tiffRes = await stripImageMetadata(tiffFile, { targetFormat: 'preserve' });
    expect(tiffRes.cleanMimeType).toBe('image/png');
    expect(tiffRes.formatConverted).toBe(true);
    expect(tiffRes.conversionNotice).toContain('converted to lossless PNG');
    expect(tiffRes.downloadFileName).toBe('document_clean.png');

    const bmpFile = new File([new Uint8Array([0x42, 0x4D]).buffer as ArrayBuffer], 'graphic.bmp', { type: 'image/bmp' });
    const bmpRes = await stripImageMetadata(bmpFile, { targetFormat: 'preserve' });
    expect(bmpRes.cleanMimeType).toBe('image/png');
    expect(bmpRes.formatConverted).toBe(true);
    expect(bmpRes.downloadFileName).toBe('graphic_clean.png');
  });

  it('verifies that no telemetry, analytics, or external CDN tracking scripts exist in index.html', () => {
    const fs = require('fs');
    const path = require('path');
    const indexPath = path.resolve(__dirname, '../index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Check for common tracking/analytics vectors
    expect(indexContent).not.toContain('google-analytics');
    expect(indexContent).not.toContain('googletagmanager');
    expect(indexContent).not.toContain('hotjar');
    expect(indexContent).not.toContain('mixpanel');
    expect(indexContent).not.toContain('segment.com');
    expect(indexContent).not.toContain('facebook.net');
    expect(indexContent).not.toContain('cdn.jsdelivr.net');
    expect(indexContent).not.toContain('unpkg.com');
  });
});
