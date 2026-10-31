import { describe, it, expect } from 'vitest';
import { stripImageMetadata } from '../src/utils/metadataStripper';

describe('Metadata Stripper & Sanitizer', () => {
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
});
