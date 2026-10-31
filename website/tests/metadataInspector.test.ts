import { describe, it, expect } from 'vitest';
import { validateImageFile, inspectImageMetadata } from '../src/utils/metadataInspector';

describe('Image Metadata Inspector & Validation', () => {
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

    const pdfRes = validateImageFile(pdfFile);
    expect(pdfRes.valid).toBe(false);
    expect(pdfRes.error).toContain('Unsupported format');

    const exeRes = validateImageFile(exeFile);
    expect(exeRes.valid).toBe(false);

    const txtRes = validateImageFile(txtFile);
    expect(txtRes.valid).toBe(false);
  });

  it('rejects empty files (0 bytes)', () => {
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
    const res = validateImageFile(emptyFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('empty (0 bytes)');
  });

  it('rejects oversized files exceeding 25 MB', () => {
    // Mock an oversized file object
    const largeFile = {
      name: 'large_raw.png',
      type: 'image/png',
      size: 30 * 1024 * 1024, // 30 MB
    } as unknown as File;

    const res = validateImageFile(largeFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds 25 MB limit');
  });

  it('parses empty metadata cleanly without throwing', async () => {
    const cleanPngBuffer = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, // PNG header
      0, 0, 0, 13, 73, 72, 68, 82, // IHDR chunk
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 // IEND chunk
    ]);
    const file = new File([cleanPngBuffer], 'test_clean.png', { type: 'image/png' });

    const report = await inspectImageMetadata(file);
    expect(report.fileName).toBe('test_clean.png');
    expect(report.hasGps).toBe(false);
    expect(report.privacyRiskLevel).toBe('CLEAN');
    expect(Array.isArray(report.tags)).toBe(true);
  });
});
