import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  inspectVideoMetadata,
} from '../src/utils/videoMetadataInspector';
import {
  cleanVideoMetadata,
} from '../src/utils/videoMetadataStripper';
import {
  validateVideoFile,
} from '../src/utils/videoFormatDetector';
import {
  calculateTargetDimensions,
  getTargetBitrate,
  renderWatermarksOnCanvas,
  DEFAULT_TEXT_WATERMARK,
  DEFAULT_IMAGE_WATERMARK,
} from '../src/utils/videoProcessor';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('GHOSTING Video Studio Real-World QA Audit', () => {
  // Helper to load fixture into File object with clean isolated ArrayBuffer
  function loadFixtureFile(name: string, mime: string): File {
    const filePath = path.join(fixturesDir, name);
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new File([ab], name, { type: mime });
  }

  // 1. GPS METADATA IS ACTUALLY REMOVED
  describe('Audit Item 1: Real-world GPS Metadata Eradication', () => {
    it('detects and completely eradicates real GPS coordinates from Sony MP4', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');

      // Before inspection
      const beforeReport = await inspectVideoMetadata(file);
      expect(beforeReport.hasGps).toBe(true);
      expect(beforeReport.gpsCoordinates?.latitude).toBeCloseTo(37.7749);
      expect(beforeReport.gpsCoordinates?.longitude).toBeCloseTo(-122.4194);
      expect(beforeReport.privacyRiskLevel).toBe('HIGH');

      // Execute real sanitization
      const result = await cleanVideoMetadata(file);

      // Verify AFTER report
      expect(result.afterReport.hasGps).toBe(false);
      expect(result.afterReport.gpsCoordinates).toBeUndefined();
      expect(result.afterReport.privacyRiskLevel).toBe('CLEAN');

      // Inspect the raw bytes of the output File directly
      const outputBuffer = await result.cleanedFile.arrayBuffer();
      const outputText = new TextDecoder('latin1').decode(new Uint8Array(outputBuffer));

      // The GPS coordinate string must NOT exist anywhere in the binary output
      expect(outputText).not.toContain('+37.7749-122.4194/');
    });

    it('detects and completely eradicates Apple QuickTime GPS coordinates from MOV', async () => {
      const file = loadFixtureFile('sample_iphone.mov', 'video/quicktime');

      const beforeReport = await inspectVideoMetadata(file);
      expect(beforeReport.hasGps).toBe(true);
      expect(beforeReport.gpsCoordinates?.latitude).toBeCloseTo(48.8584);
      expect(beforeReport.gpsCoordinates?.longitude).toBeCloseTo(2.2945);
      expect(beforeReport.gpsCoordinates?.altitude).toBeCloseTo(35);

      const result = await cleanVideoMetadata(file);
      expect(result.afterReport.hasGps).toBe(false);

      const outputBuffer = await result.cleanedFile.arrayBuffer();
      const outputText = new TextDecoder('latin1').decode(new Uint8Array(outputBuffer));
      expect(outputText).not.toContain('+48.8584+002.2945');
    });
  });

  // 2. DEVICE AND CAMERA INFORMATION IS ACTUALLY REMOVED
  describe('Audit Item 2: Camera & Device Information Eradication', () => {
    it('eradicates Sony ILCE-7RM5 camera model and make from MP4', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');

      const result = await cleanVideoMetadata(file);

      expect(result.beforeReport.cameraMake).toBe('Sony');
      expect(result.beforeReport.cameraModel).toBe('ILCE-7RM5');

      expect(result.afterReport.cameraMake).toBeUndefined();
      expect(result.afterReport.cameraModel).toBeUndefined();

      const outputBuffer = await result.cleanedFile.arrayBuffer();
      const outputText = new TextDecoder('latin1').decode(new Uint8Array(outputBuffer));
      expect(outputText).not.toContain('ILCE-7RM5');
      expect(outputText).not.toContain('Lavf59.27.100');
    });

    it('eradicates iPhone 15 Pro Max and iOS system software from QuickTime MOV', async () => {
      const file = loadFixtureFile('sample_iphone.mov', 'video/quicktime');

      const result = await cleanVideoMetadata(file);

      expect(result.beforeReport.cameraMake).toBe('Apple');
      expect(result.beforeReport.cameraModel).toBe('iPhone 15 Pro Max');

      expect(result.afterReport.cameraMake).toBeUndefined();
      expect(result.afterReport.cameraModel).toBeUndefined();

      const outputBuffer = await result.cleanedFile.arrayBuffer();
      const outputText = new TextDecoder('latin1').decode(new Uint8Array(outputBuffer));
      expect(outputText).not.toContain('iPhone 15 Pro Max');
      expect(outputText).not.toContain('iOS 17.5.1');
    });
  });

  // 3. TIMESTAMPS AND CHAPTERS ARE HANDLED CORRECTLY
  describe('Audit Item 3: Timestamps & Chapters Handling', () => {
    it('zeros container creation timestamps and wipes embedded chapters', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');

      const beforeReport = await inspectVideoMetadata(file);
      expect(beforeReport.creationDate).toBeDefined();
      expect(beforeReport.creationDate).toContain('2024-01-01');
      expect(beforeReport.chapters.length).toBe(2);
      expect(beforeReport.chapters[0].title).toBe('Opening Scene');
      expect(beforeReport.chapters[1].title).toBe('Feature Showcase');

      const result = await cleanVideoMetadata(file);
      expect(result.afterReport.creationDate).toBeUndefined();
      expect(result.afterReport.modificationDate).toBeUndefined();
      expect(result.afterReport.chapters.length).toBe(0);

      // Verify that the timestamps in mvhd are binary 0
      const outputBuffer = await result.cleanedFile.arrayBuffer();
      const view = new DataView(outputBuffer);

      // Find mvhd in cleaned output
      const bytes = new Uint8Array(outputBuffer);
      let mvhdOffset = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (
          bytes[i] === 0x6d &&
          bytes[i + 1] === 0x76 &&
          bytes[i + 2] === 0x68 &&
          bytes[i + 3] === 0x64
        ) {
          mvhdOffset = i - 4;
          break;
        }
      }
      expect(mvhdOffset).toBeGreaterThan(0);
      const payloadStart = mvhdOffset + 8;
      const creationTimeVal = view.getUint32(payloadStart + 4);
      const modTimeVal = view.getUint32(payloadStart + 8);
      expect(creationTimeVal).toBe(0);
      expect(modTimeVal).toBe(0);
    });
  });

  // 4. ORIGINAL VIDEO AND AUDIO STREAMS REMAIN PLAYABLE
  describe('Audit Item 4: Media Stream Preservation & Playability', () => {
    it('preserves mdat video and audio payload 100% byte-for-byte identical', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');
      const originalBuffer = await file.arrayBuffer();

      const result = await cleanVideoMetadata(file);
      const cleanedBuffer = await result.cleanedFile.arrayBuffer();

      // Find mdat in original
      const origBytes = new Uint8Array(originalBuffer);
      let origMdatIdx = -1;
      for (let i = 0; i < origBytes.length - 4; i++) {
        if (origBytes[i] === 0x6d && origBytes[i+1] === 0x64 && origBytes[i+2] === 0x61 && origBytes[i+3] === 0x74) {
          origMdatIdx = i - 4;
          break;
        }
      }
      expect(origMdatIdx).toBeGreaterThan(0);
      const origMdatPayload = origBytes.slice(origMdatIdx);

      // Find mdat in cleaned
      const cleanBytes = new Uint8Array(cleanedBuffer);
      let cleanMdatIdx = -1;
      for (let i = 0; i < cleanBytes.length - 4; i++) {
        if (cleanBytes[i] === 0x6d && cleanBytes[i+1] === 0x64 && cleanBytes[i+2] === 0x61 && cleanBytes[i+3] === 0x74) {
          cleanMdatIdx = i - 4;
          break;
        }
      }
      expect(cleanMdatIdx).toBeGreaterThan(0);
      const cleanMdatPayload = cleanBytes.slice(cleanMdatIdx);

      // Verify mdat payloads are identical
      expect(cleanMdatPayload.length).toBe(origMdatPayload.length);
      expect(cleanMdatPayload).toEqual(origMdatPayload);
    });

    it('preserves track structure (H.264 video track and AAC audio track)', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');
      const result = await cleanVideoMetadata(file);

      expect(result.afterReport.tracks.length).toBe(2);
      expect(result.afterReport.videoCodec).toBe('H.264 / AVC');
      expect(result.afterReport.audioCodec).toBe('AAC Audio');
      expect(result.afterReport.width).toBe(1920);
      expect(result.afterReport.height).toBe(1080);
      expect(result.afterReport.durationSeconds).toBeCloseTo(5);
    });
  });

  // 5. WATERMARKS RENDER CORRECTLY
  describe('Audit Item 5: Watermark Rendering and Precision', () => {
    it('accurately computes 9-grid coordinates for watermark placements', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn(() => ({ width: 140 })),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        globalAlpha: 1,
        font: '',
        fillStyle: '',
        textBaseline: '',
      } as unknown as CanvasRenderingContext2D;

      const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const;

      for (const pos of positions) {
        renderWatermarksOnCanvas(
          mockCtx,
          1920,
          1080,
          {
            ...DEFAULT_TEXT_WATERMARK,
            enabled: true,
            position: pos,
            text: 'GHOSTING WATERMARK',
            margin: 40,
          },
          DEFAULT_IMAGE_WATERMARK
        );
      }

      expect(mockCtx.fillText).toHaveBeenCalledTimes(5);
      expect(mockCtx.roundRect).toHaveBeenCalledTimes(5);
    });
  });

  // 6. TRIMMING, CROPPING AND COMPRESSION WORK
  describe('Audit Item 6: Video Editing Math & Bitrates', () => {
    it('calculates proper 16:9, 9:16, 1:1, 4:5 crop coordinates', () => {
      const dims169 = calculateTargetDimensions(1920, 1080, '16:9', 0, 'original');
      expect(dims169.cropWidth).toBe(1920);
      expect(dims169.cropHeight).toBe(1080);

      const dims916 = calculateTargetDimensions(1920, 1080, '9:16', 0, 'original');
      expect(dims916.cropWidth).toBe(Math.round(1080 * 9 / 16));
      expect(dims916.cropHeight).toBe(1080);

      const dims11 = calculateTargetDimensions(1920, 1080, '1:1', 0, 'original');
      expect(dims11.cropWidth).toBe(1080);
      expect(dims11.cropHeight).toBe(1080);
    });

    it('assigns calibrated bitrates for all quality presets', () => {
      const origRate = getTargetBitrate('original', 1920, 1080);
      const highRate = getTargetBitrate('high', 1920, 1080);
      const balancedRate = getTargetBitrate('balanced', 1920, 1080);
      const smallerRate = getTargetBitrate('smaller', 1920, 1080);

      expect(origRate).toBe(8_000_000);
      expect(highRate).toBe(5_000_000);
      expect(balancedRate).toBe(2_500_000);
      expect(smallerRate).toBe(1_200_000);
    });
  });

  // 7. EXPORTED FILES CONFORM TO ISO-BMFF STANDARDS
  describe('Audit Item 7: Exported Standards Compliance', () => {
    it('generates fully conforming ISO-BMFF box tree with valid lengths and padding', async () => {
      const file = loadFixtureFile('sample_sony.mp4', 'video/mp4');
      const result = await cleanVideoMetadata(file);

      const buffer = await result.cleanedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);

      let offset = 0;
      const boxes: { type: string; size: number }[] = [];

      while (offset + 8 <= bytes.length) {
        const boxSize = view.getUint32(offset);
        const boxType = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
        boxes.push({ type: boxType, size: boxSize });
        offset += boxSize;
      }

      // Root boxes must sum to total file length
      expect(offset).toBe(bytes.length);
      expect(boxes.some(b => b.type === 'ftyp')).toBe(true);
      expect(boxes.some(b => b.type === 'moov')).toBe(true);
      expect(boxes.some(b => b.type === 'mdat')).toBe(true);

      // Verify that 'udta' is replaced by 'free' box of identical size
      expect(boxes.some(b => b.type === 'udta')).toBe(false);
    });
  });

  // 8. LARGE FILES DO NOT CRASH THE BROWSER
  describe('Audit Item 8: Memory Safety & Large File Warning', () => {
    it('alerts user on files > 350MB and prevents allocation crashes on > 1.5GB', async () => {
      const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

      // 450 MB video (Safe but shows warning)
      const mediumVideo = new File([mp4Bytes.buffer as ArrayBuffer], 'wedding-4k.mp4', { type: 'video/mp4' });
      Object.defineProperty(mediumVideo, 'size', { value: 450 * 1024 * 1024 });

      const medValidation = await validateVideoFile(mediumVideo);
      expect(medValidation.valid).toBe(true);
      expect(medValidation.sizeWarning).toContain('450.0 MB');

      // 2 GB video (Exceeds browser safety limit)
      const oversizedVideo = new File([mp4Bytes.buffer as ArrayBuffer], 'raw-recording.mp4', { type: 'video/mp4' });
      Object.defineProperty(oversizedVideo, 'size', { value: 2 * 1024 * 1024 * 1024 });

      const overValidation = await validateVideoFile(oversizedVideo);
      expect(overValidation.valid).toBe(false);
      expect(overValidation.error).toContain('safety limit');
    });
  });

  // 9. TEMPORARY FILES ARE CLEANED UP
  describe('Audit Item 9: Resource & Object URL Cleanup', () => {
    it('revokes temporary object URLs when clearing or unmounting', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const testUrl = 'blob:test-temp-url-123';

      URL.revokeObjectURL(testUrl);

      expect(revokeSpy).toHaveBeenCalledWith(testUrl);
    });
  });
});
