import { describe, it, expect } from 'vitest';
import {
  parseIso6709Gps,
  mp4TimeToDate,
  inspectVideoMetadata,
} from '../src/utils/videoMetadataInspector';

describe('videoMetadataInspector', () => {
  describe('parseIso6709Gps', () => {
    it('parses standard decimal degree coordinate strings', () => {
      const parsed = parseIso6709Gps('+37.7749-122.4194/');
      expect(parsed).toBeDefined();
      expect(parsed?.latitude).toBeCloseTo(37.7749);
      expect(parsed?.longitude).toBeCloseTo(-122.4194);
      expect(parsed?.altitude).toBeUndefined();
    });

    it('parses coordinates with embedded altitude', () => {
      const parsed = parseIso6709Gps('+51.5074-0.1278+025.500/');
      expect(parsed).toBeDefined();
      expect(parsed?.latitude).toBeCloseTo(51.5074);
      expect(parsed?.longitude).toBeCloseTo(-0.1278);
      expect(parsed?.altitude).toBeCloseTo(25.5);
    });

    it('parses degrees and minutes format', () => {
      // 37° 46.494' N, 122° 25.164' W
      const parsed = parseIso6709Gps('+3746.4940-12225.1640/');
      expect(parsed).toBeDefined();
      expect(parsed?.latitude).toBeGreaterThan(37);
      expect(parsed?.longitude).toBeLessThan(-122);
    });

    it('rejects invalid or out-of-range coordinates', () => {
      expect(parseIso6709Gps('')).toBeUndefined();
      expect(parseIso6709Gps('invalid-coords')).toBeUndefined();
      expect(parseIso6709Gps('+95.0000-122.0000/')).toBeUndefined(); // Lat > 90
      expect(parseIso6709Gps('+37.0000-195.0000/')).toBeUndefined(); // Lon < -180
    });
  });

  describe('mp4TimeToDate', () => {
    it('converts MP4 epoch seconds to valid ISO date string', () => {
      // 2024-01-01 00:00:00 UTC = 1704067200 Unix sec = 1704067200 + 2082844800 = 3786912000 MP4 sec
      const iso = mp4TimeToDate(3786912000);
      expect(iso).toBeDefined();
      expect(iso).toContain('2024-01-01');
    });

    it('returns undefined for 0 or invalid timestamps', () => {
      expect(mp4TimeToDate(0)).toBeUndefined();
      expect(mp4TimeToDate(2082844800)).toBeUndefined(); // Unix epoch 0
    });
  });

  describe('inspectVideoMetadata binary parser', () => {
    function createMockMp4WithMetadata(): Uint8Array {
      // Build a minimal ISO-BMFF box tree in memory:
      // ftyp [size 24]
      // moov [size ...]
      //   mvhd [size 108] (with creation date)
      //   udta [size ...]
      //     ©xyz [size 34] (with GPS coords: "+37.7749-122.4194/")
      //     ©mak [size 22] ('Apple')
      //     ©mod [size 30] ('iPhone 15 Pro')

      const chunks: number[] = [];

      function writeBox(type: string, payload: number[]) {
        const size = payload.length + 8;
        chunks.push((size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff);
        for (let i = 0; i < 4; i++) chunks.push(type.charCodeAt(i));
        chunks.push(...payload);
      }

      // 1. ftyp box
      const ftypPayload = [
        0x69, 0x73, 0x6f, 0x6d, // 'isom'
        0x00, 0x00, 0x02, 0x00, // version
        0x6d, 0x70, 0x34, 0x31, // 'mp41'
      ];
      writeBox('ftyp', ftypPayload);

      // 2. mvhd box (108 bytes payload)
      const mvhdPayload = new Array(100).fill(0);
      // mvhd version = 0 (1 byte), flags (3 bytes)
      mvhdPayload[0] = 0;
      // creation_time at +4 (3786912000 = 2024-01-01)
      const ct = 3786912000;
      mvhdPayload[4] = (ct >> 24) & 0xff;
      mvhdPayload[5] = (ct >> 16) & 0xff;
      mvhdPayload[6] = (ct >> 8) & 0xff;
      mvhdPayload[7] = ct & 0xff;
      // modification_time at +8
      mvhdPayload[8] = (ct >> 24) & 0xff;
      mvhdPayload[9] = (ct >> 16) & 0xff;
      mvhdPayload[10] = (ct >> 8) & 0xff;
      mvhdPayload[11] = ct & 0xff;
      // timescale = 1000 at +12
      mvhdPayload[14] = 0x03;
      mvhdPayload[15] = 0xe8;
      // duration = 10000 (10s) at +16
      mvhdPayload[18] = 0x27;
      mvhdPayload[19] = 0x10;

      // 3. udta children:
      const udtaChildren: number[] = [];

      // ©xyz box:
      const gpsStr = '+37.7749-122.4194/';
      const gpsPayload: number[] = [0, 0, 0, 0]; // 4 bytes flags/lang
      for (let i = 0; i < gpsStr.length; i++) gpsPayload.push(gpsStr.charCodeAt(i));
      const gpsBoxSize = gpsPayload.length + 8;
      udtaChildren.push(
        (gpsBoxSize >> 24) & 0xff, (gpsBoxSize >> 16) & 0xff, (gpsBoxSize >> 8) & 0xff, gpsBoxSize & 0xff,
        0xa9, 0x78, 0x79, 0x7a, // '©xyz'
        ...gpsPayload
      );

      // ©mak box:
      const makStr = 'Apple';
      const makPayload: number[] = [0, 0, 0, 0];
      for (let i = 0; i < makStr.length; i++) makPayload.push(makStr.charCodeAt(i));
      const makBoxSize = makPayload.length + 8;
      udtaChildren.push(
        (makBoxSize >> 24) & 0xff, (makBoxSize >> 16) & 0xff, (makBoxSize >> 8) & 0xff, makBoxSize & 0xff,
        0xa9, 0x6d, 0x61, 0x6b, // '©mak'
        ...makPayload
      );

      // ©mod box:
      const modStr = 'iPhone 15 Pro';
      const modPayload: number[] = [0, 0, 0, 0];
      for (let i = 0; i < modStr.length; i++) modPayload.push(modStr.charCodeAt(i));
      const modBoxSize = modPayload.length + 8;
      udtaChildren.push(
        (modBoxSize >> 24) & 0xff, (modBoxSize >> 16) & 0xff, (modBoxSize >> 8) & 0xff, modBoxSize & 0xff,
        0xa9, 0x6d, 0x6f, 0x64, // '©mod'
        ...modPayload
      );

      // Package udta box:
      const udtaBoxSize = udtaChildren.length + 8;
      const udtaBox = [
        (udtaBoxSize >> 24) & 0xff, (udtaBoxSize >> 16) & 0xff, (udtaBoxSize >> 8) & 0xff, udtaBoxSize & 0xff,
        0x75, 0x64, 0x74, 0x61, // 'udta'
        ...udtaChildren
      ];

      // Package moov box:
      const mvhdBoxSize = mvhdPayload.length + 8;
      const mvhdBox = [
        (mvhdBoxSize >> 24) & 0xff, (mvhdBoxSize >> 16) & 0xff, (mvhdBoxSize >> 8) & 0xff, mvhdBoxSize & 0xff,
        0x6d, 0x76, 0x68, 0x64, // 'mvhd'
        ...mvhdPayload
      ];

      const moovPayload = [...mvhdBox, ...udtaBox];
      writeBox('moov', moovPayload);

      return new Uint8Array(chunks);
    }

    it('extracts GPS, camera model, and timestamps from MP4 container', async () => {
      const mockBytes = createMockMp4WithMetadata();
      const file = new File([mockBytes.buffer as ArrayBuffer], 'camera-clip.mp4', { type: 'video/mp4' });

      const report = await inspectVideoMetadata(file);

      expect(report.containerFormat).toBe('mp4');
      expect(report.durationSeconds).toBeCloseTo(10);
      expect(report.creationDate).toBeDefined();
      expect(report.creationDate).toContain('2024-01-01');

      // GPS verification
      expect(report.hasGps).toBe(true);
      expect(report.gpsCoordinates).toBeDefined();
      expect(report.gpsCoordinates?.latitude).toBeCloseTo(37.7749);
      expect(report.gpsCoordinates?.longitude).toBeCloseTo(-122.4194);
      expect(report.gpsCoordinates?.mapsLink).toContain('google.com/maps');

      // Device & Camera verification
      expect(report.cameraMake).toBe('Apple');
      expect(report.cameraModel).toBe('iPhone 15 Pro');

      // Privacy Risk Level verification
      expect(report.privacyRiskLevel).toBe('HIGH');
      expect(report.tags.length).toBeGreaterThanOrEqual(4);
      expect(report.inspectionStatus.foundCategories).toContain('GPS Geolocation Coordinates');
      expect(report.inspectionStatus.foundCategories).toContain('Camera & Device Identifiers');
    });
  });
});
