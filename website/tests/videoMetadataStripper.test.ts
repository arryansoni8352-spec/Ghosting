import { describe, it, expect } from 'vitest';
import {
  cleanVideoMetadata,
  generateCleanVideoFileName,
} from '../src/utils/videoMetadataStripper';

describe('videoMetadataStripper', () => {
  describe('generateCleanVideoFileName', () => {
    it('appends -ghosted to filename before extension', () => {
      expect(generateCleanVideoFileName('trip.mp4')).toBe('trip-ghosted.mp4');
      expect(generateCleanVideoFileName('drone_4k.mov')).toBe('drone_4k-ghosted.mov');
      expect(generateCleanVideoFileName('screen.record.webm')).toBe('screen.record-ghosted.webm');
      expect(generateCleanVideoFileName('rawvideo')).toBe('rawvideo-ghosted.mp4');
    });
  });

  describe('cleanVideoMetadata', () => {
    function createMockMp4WithPrivacyData(): Uint8Array {
      const chunks: number[] = [];

      function writeBox(type: string, payload: number[]) {
        const size = payload.length + 8;
        chunks.push((size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff);
        for (let i = 0; i < 4; i++) chunks.push(type.charCodeAt(i));
        chunks.push(...payload);
      }

      // ftyp box
      writeBox('ftyp', [0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x6d, 0x70, 0x34, 0x31]);

      // mvhd box
      const mvhdPayload = new Array(100).fill(0);
      mvhdPayload[0] = 0;
      const ct = 3786912000;
      mvhdPayload[4] = (ct >> 24) & 0xff;
      mvhdPayload[5] = (ct >> 16) & 0xff;
      mvhdPayload[6] = (ct >> 8) & 0xff;
      mvhdPayload[7] = ct & 0xff;
      mvhdPayload[14] = 0x03; mvhdPayload[15] = 0xe8;
      mvhdPayload[18] = 0x27; mvhdPayload[19] = 0x10;

      // udta box with ©xyz (GPS) and ©mod
      const udtaChildren: number[] = [];
      const gpsStr = '+48.8584+2.2945/'; // Eiffel Tower GPS
      const gpsPayload: number[] = [0, 0, 0, 0];
      for (let i = 0; i < gpsStr.length; i++) gpsPayload.push(gpsStr.charCodeAt(i));
      const gpsBoxSize = gpsPayload.length + 8;
      udtaChildren.push(
        (gpsBoxSize >> 24) & 0xff, (gpsBoxSize >> 16) & 0xff, (gpsBoxSize >> 8) & 0xff, gpsBoxSize & 0xff,
        0xa9, 0x78, 0x79, 0x7a,
        ...gpsPayload
      );

      const modStr = 'Google Pixel 8 Pro';
      const modPayload: number[] = [0, 0, 0, 0];
      for (let i = 0; i < modStr.length; i++) modPayload.push(modStr.charCodeAt(i));
      const modBoxSize = modPayload.length + 8;
      udtaChildren.push(
        (modBoxSize >> 24) & 0xff, (modBoxSize >> 16) & 0xff, (modBoxSize >> 8) & 0xff, modBoxSize & 0xff,
        0xa9, 0x6d, 0x6f, 0x64,
        ...modPayload
      );

      const udtaBoxSize = udtaChildren.length + 8;
      const udtaBox = [
        (udtaBoxSize >> 24) & 0xff, (udtaBoxSize >> 16) & 0xff, (udtaBoxSize >> 8) & 0xff, udtaBoxSize & 0xff,
        0x75, 0x64, 0x74, 0x61,
        ...udtaChildren
      ];

      const mvhdBoxSize = mvhdPayload.length + 8;
      const mvhdBox = [
        (mvhdBoxSize >> 24) & 0xff, (mvhdBoxSize >> 16) & 0xff, (mvhdBoxSize >> 8) & 0xff, mvhdBoxSize & 0xff,
        0x6d, 0x76, 0x68, 0x64,
        ...mvhdPayload
      ];

      writeBox('moov', [...mvhdBox, ...udtaBox]);
      return new Uint8Array(chunks);
    }

    it('eradicates GPS, camera model, and creation timestamp from video', async () => {
      const initialBytes = createMockMp4WithPrivacyData();
      const originalFile = new File([initialBytes.buffer as ArrayBuffer], 'vacation-trip.mp4', { type: 'video/mp4' });

      const result = await cleanVideoMetadata(originalFile);

      // Verify BEFORE report had privacy risks
      expect(result.beforeReport.hasGps).toBe(true);
      expect(result.beforeReport.gpsCoordinates?.latitude).toBeCloseTo(48.8584);
      expect(result.beforeReport.cameraModel).toBe('Google Pixel 8 Pro');
      expect(result.beforeReport.creationDate).toBeDefined();
      expect(result.beforeReport.privacyRiskLevel).toBe('HIGH');

      // Verify AFTER report is completely clean
      expect(result.afterReport.hasGps).toBe(false);
      expect(result.afterReport.gpsCoordinates).toBeUndefined();
      expect(result.afterReport.cameraModel).toBeUndefined();
      expect(result.afterReport.cameraMake).toBeUndefined();
      expect(result.afterReport.creationDate).toBeUndefined();
      expect(result.afterReport.privacyRiskLevel).toBe('CLEAN');

      // Verify cleaned file properties
      expect(result.cleanedFile.name).toBe('vacation-trip-ghosted.mp4');
      expect(result.cleanedFile.size).toBe(originalFile.size); // In-place lossless padding preserved
      expect(result.isLossless).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.strippedCategories.length).toBeGreaterThan(0);
    });
  });
});
