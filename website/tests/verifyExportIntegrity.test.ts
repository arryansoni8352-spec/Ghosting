import { describe, it, expect, vi } from 'vitest';
import ExifReader from 'exifreader';
import { inspectImageMetadata, getImageHeaderDimensions } from '../src/utils/metadataInspector';
import { stripImageMetadata } from '../src/utils/metadataStripper';

describe('Deep Privacy & Binary Export Verification', () => {
  // Helper to generate a valid minimal JPEG with APP1 EXIF segment containing Make tag
  function createMockExifJpeg(): Uint8Array {
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
      0xFF, 0xC0, 0x00, 0x11, 0x08, 0x04, 0x00, 0x06, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
      0xFF, 0xD9  // EOI
    ]);
  }

  // Helper to generate a JPEG with specific dimensions and EXIF Orientation (tag 274)
  function createMockOrientationJpeg(width: number, height: number, orientation: number): Uint8Array {
    return new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE1, // APP1 marker
      0x00, 0x22, // Length = 34 bytes (2 length bytes + 32 data bytes)
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x49, 0x49, 0x2A, 0x00, // TIFF header (Little Endian)
      0x08, 0x00, 0x00, 0x00, // Offset to IFD0
      0x01, 0x00, // 1 directory entry
      0x12, 0x01, // Tag 0x0112 (Orientation)
      0x03, 0x00, // SHORT
      0x01, 0x00, 0x00, 0x00, // Count 1
      orientation, 0x00, 0x00, 0x00, // Orientation value
      0x00, 0x00, 0x00, 0x00, // Next IFD
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

  it('regression: resolves image orientation discrepancy between raw sensor JPEG and oriented JPEG', async () => {
    // Image A: 2048 x 1529 with Orientation 6 (rotated 90° CW, visually 1529 x 2048)
    const bytesA = createMockOrientationJpeg(2048, 1529, 6);
    const fileA = new File([bytesA.buffer as ArrayBuffer], 'sensor_raw_o6.jpg', { type: 'image/jpeg' });

    // Image B: 1529 x 2048 with Orientation 1 (native portrait, visually 1529 x 2048)
    const bytesB = createMockOrientationJpeg(1529, 2048, 1);
    const fileB = new File([bytesB.buffer as ArrayBuffer], 'native_portrait_o1.jpg', { type: 'image/jpeg' });

    // 1. Inspect Image A
    const reportA = await inspectImageMetadata(fileA);
    expect(reportA.orientation).toBe(6);
    expect(reportA.dimensions?.width).toBe(2048);
    expect(reportA.dimensions?.height).toBe(1529);
    expect(reportA.dimensions?.visualWidth).toBe(1529);
    expect(reportA.dimensions?.visualHeight).toBe(2048);

    // 2. Inspect Image B
    const reportB = await inspectImageMetadata(fileB);
    expect(reportB.orientation).toBe(1);
    expect(reportB.dimensions?.width).toBe(1529);
    expect(reportB.dimensions?.height).toBe(2048);
    expect(reportB.dimensions?.visualWidth).toBe(1529);
    expect(reportB.dimensions?.visualHeight).toBe(2048);

    // 3. Strip Image A and Image B
    const resA = await stripImageMetadata(fileA, { targetFormat: 'preserve' });
    const resB = await stripImageMetadata(fileB, { targetFormat: 'preserve' });

    // Both exported images must have matching visual dimensions: 1529 x 2048
    expect(resA.visualDimensions).toEqual({ width: 1529, height: 2048 });
    expect(resB.visualDimensions).toEqual({ width: 1529, height: 2048 });

    // 4. Independent binary inspection of exported clean blobs
    const cleanBufferA = await resA.cleanBlob.arrayBuffer();
    const cleanBufferB = await resB.cleanBlob.arrayBuffer();

    const cleanDimsA = getImageHeaderDimensions(cleanBufferA);
    const cleanDimsB = getImageHeaderDimensions(cleanBufferB);

    // Both output binary streams have dimensions 1529 x 2048 in their SOF0 header
    expect(cleanDimsA).toEqual({ width: 1529, height: 2048 });
    expect(cleanDimsB).toEqual({ width: 1529, height: 2048 });

    // Both outputs have 0 metadata tags
    const tagsOutA = ExifReader.load(cleanBufferA, { expanded: true });
    const tagsOutB = ExifReader.load(cleanBufferB, { expanded: true });

    expect(tagsOutA.exif?.Orientation).toBeUndefined();
    expect(tagsOutB.exif?.Orientation).toBeUndefined();
    expect(tagsOutA.gps).toBeUndefined();
    expect(tagsOutB.gps).toBeUndefined();
  });

  it('regression: preserves native landscape image with Orientation 1 without swapping dimensions', async () => {
    // 2048 x 1529 with Orientation 1 must remain 2048 x 1529 (never blindly rotated)
    const bytes = createMockOrientationJpeg(2048, 1529, 1);
    const file = new File([bytes.buffer as ArrayBuffer], 'native_landscape_o1.jpg', { type: 'image/jpeg' });

    const report = await inspectImageMetadata(file);
    expect(report.dimensions?.width).toBe(2048);
    expect(report.dimensions?.height).toBe(1529);
    expect(report.dimensions?.visualWidth).toBe(2048);
    expect(report.dimensions?.visualHeight).toBe(1529);

    const res = await stripImageMetadata(file, { targetFormat: 'preserve' });
    expect(res.visualDimensions).toEqual({ width: 2048, height: 1529 });
    expect(res.orientationNormalized).toBe(false);

    const cleanBuffer = await res.cleanBlob.arrayBuffer();
    const cleanDims = getImageHeaderDimensions(cleanBuffer);
    expect(cleanDims).toEqual({ width: 2048, height: 1529 });
  });

  it('regression: strips auxiliary text and metadata from PNG while preserving dimensions', async () => {
    // Generate PNG with tEXt metadata chunk
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c;
    }
    function crc32(b: Uint8Array): number {
      let c = 0xffffffff;
      for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    }
    function makeChunk(type: string, data: Uint8Array): Uint8Array {
      const typeCodes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
      const toCrc = new Uint8Array(4 + data.length);
      toCrc.set(typeCodes, 0);
      toCrc.set(data, 4);
      const crc = crc32(toCrc);
      const chunk = new Uint8Array(4 + 4 + data.length + 4);
      const view = new DataView(chunk.buffer);
      view.setUint32(0, data.length, false);
      chunk.set(toCrc, 4);
      view.setUint32(8 + data.length, crc, false);
      return chunk;
    }

    const w = 500;
    const h = 400;
    const ihdr = new Uint8Array(13);
    const iview = new DataView(ihdr.buffer);
    iview.setUint32(0, w, false);
    iview.setUint32(4, h, false);
    ihdr[8] = 8; ihdr[9] = 2;

    const comment = 'Comment\0Sensitive camera info';
    const textBytes = new Uint8Array(comment.length);
    for (let i = 0; i < comment.length; i++) textBytes[i] = comment.charCodeAt(i);

    const rawData = new Uint8Array(4);
    const len = rawData.length;
    const nlen = (~len) & 0xFFFF;
    const idatData = new Uint8Array(2 + 5 + len + 4);
    idatData[0] = 0x78; idatData[1] = 0x01; idatData[2] = 0x01;
    idatData[3] = len & 0xFF; idatData[4] = (len >> 8) & 0xFF;
    idatData[5] = nlen & 0xFF; idatData[6] = (nlen >> 8) & 0xFF;
    idatData.set(rawData, 7);
    const aview = new DataView(idatData.buffer);
    aview.setUint32(7 + len, 1, false);

    const ihdrChunk = makeChunk('IHDR', ihdr);
    const textChunk = makeChunk('tEXt', textBytes);
    const idatChunk = makeChunk('IDAT', idatData);
    const iendChunk = makeChunk('IEND', new Uint8Array(0));

    const pngBytes = new Uint8Array(sig.length + ihdrChunk.length + textChunk.length + idatChunk.length + iendChunk.length);
    let pos = 0;
    pngBytes.set(sig, pos); pos += sig.length;
    pngBytes.set(ihdrChunk, pos); pos += ihdrChunk.length;
    pngBytes.set(textChunk, pos); pos += textChunk.length;
    pngBytes.set(idatChunk, pos); pos += idatChunk.length;
    pngBytes.set(iendChunk, pos); pos += iendChunk.length;

    // Verify source has comment metadata
    const tagsIn = ExifReader.load(pngBytes.buffer as ArrayBuffer, { expanded: true });
    expect(tagsIn.png?.['Comment']).toBeDefined();

    // Strip metadata
    const file = new File([pngBytes.buffer as ArrayBuffer], 'graphic_with_comment.png', { type: 'image/png' });
    const res = await stripImageMetadata(file, { targetFormat: 'preserve' });

    expect(res.cleanMimeType).toBe('image/png');
    expect(res.verifiedClean).toBe(true);
    expect(res.remainingTagCount).toBe(0);

    // Verify exported binary has zero Comment chunk and preserves 500 x 400 dimensions
    const cleanBuffer = await res.cleanBlob.arrayBuffer();
    const cleanTags = ExifReader.load(cleanBuffer, { expanded: true });
    expect(cleanTags.png?.['Comment']).toBeUndefined();
    expect(cleanTags.exif).toBeUndefined();

    const cleanDims = getImageHeaderDimensions(cleanBuffer);
    expect(cleanDims).toEqual({ width: 500, height: 400 });
  });

  it('regression: preserves WebP format and visual dimensions after stripping', async () => {
    // Generate valid WebP file (640 x 480)
    const vp8Data = new Uint8Array(10);
    vp8Data[0] = 0x00; vp8Data[1] = 0x00; vp8Data[2] = 0x00;
    vp8Data[3] = 0x9D; vp8Data[4] = 0x01; vp8Data[5] = 0x2A;
    const view = new DataView(vp8Data.buffer);
    view.setUint16(6, 640 & 0x3FFF, true);
    view.setUint16(8, 480 & 0x3FFF, true);

    const chunkSize = vp8Data.length;
    const riffSize = 4 + 8 + chunkSize;
    const webpBytes = new Uint8Array(12 + 8 + chunkSize);
    const resView = new DataView(webpBytes.buffer);
    webpBytes[0] = 0x52; webpBytes[1] = 0x49; webpBytes[2] = 0x46; webpBytes[3] = 0x46; // 'RIFF'
    resView.setUint32(4, riffSize, true);
    webpBytes[8] = 0x57; webpBytes[9] = 0x45; webpBytes[10] = 0x42; webpBytes[11] = 0x50; // 'WEBP'
    webpBytes[12] = 0x56; webpBytes[13] = 0x50; webpBytes[14] = 0x38; webpBytes[15] = 0x20; // 'VP8 '
    resView.setUint32(16, chunkSize, true);
    webpBytes.set(vp8Data, 20);

    const file = new File([webpBytes.buffer as ArrayBuffer], 'illustration.webp', { type: 'image/webp' });
    const res = await stripImageMetadata(file, { targetFormat: 'preserve' });

    expect(res.cleanMimeType).toBe('image/webp');
    expect(res.verifiedClean).toBe(true);
    expect(res.visualDimensions).toEqual({ width: 640, height: 480 });

    const cleanBuffer = await res.cleanBlob.arrayBuffer();
    const cleanDims = getImageHeaderDimensions(cleanBuffer);
    expect(cleanDims).toEqual({ width: 640, height: 480 });
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
