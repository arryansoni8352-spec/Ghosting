import { describe, it, expect, vi, afterEach } from 'vitest';
import ExifReader from 'exifreader';
import {
  stripImageMetadata,
  createCleanJpegBytes,
  SENSITIVE_METADATA_GROUPS,
  countTagsInValue,
  countSensitiveTags,
} from '../src/utils/metadataStripper';

/**
 * Creates a valid, conforming JPEG byte stream with an APP1 Exif marker
 * so both ExifReader and image decoders accept it as a valid image.
 */
function createValidTestJpeg(): Uint8Array {
  const bytes = [
    0xFF, 0xD8, // SOI
    0xFF, 0xE1, // APP1 marker
    0x00, 0x22, // Length = 34 bytes
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2A, 0x00, // TIFF header (Little Endian)
    0x08, 0x00, 0x00, 0x00, // Offset to IFD0
    0x01, 0x00, // 1 directory entry
    0x12, 0x01, // Tag 0x0112 (Orientation)
    0x03, 0x00, // SHORT
    0x01, 0x00, 0x00, 0x00, // Count 1
    0x01, 0x00, 0x00, 0x00, // Value = 1
    0x00, 0x00, 0x00, 0x00, // Next IFD offset
    0xFF, 0xC0, // SOF0
    0x00, 0x11,
    0x08,
    0x00, 0x40, // Height = 64
    0x00, 0x40, // Width = 64
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xFF, 0xD9  // EOI
  ];
  return new Uint8Array(bytes);
}

function makeValidFile(bytes: Uint8Array = createValidTestJpeg()): File {
  return new File([bytes.buffer as ArrayBuffer], 'sample_test_photo.jpg', { type: 'image/jpeg' });
}

function isInputFixture(buf: ArrayBuffer, expectedInputBytes: Uint8Array): boolean {
  if (buf.byteLength !== expectedInputBytes.byteLength) return false;
  const view = new Uint8Array(buf);
  for (let i = 0; i < Math.min(16, view.length); i++) {
    if (view[i] !== expectedInputBytes[i]) return false;
  }
  return true;
}

describe('stripImageMetadata verification result & error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports all 6 expected sensitive metadata groups', () => {
    expect(SENSITIVE_METADATA_GROUPS).toEqual([
      'exif',
      'gps',
      'iptc',
      'xmp',
      'makernotes',
      'photoshop',
    ]);
  });

  it('treats ExifReader MetadataMissingError on output buffer as verified clean', async () => {
    const inputBytes = createValidTestJpeg();
    const file = makeValidFile(inputBytes);
    const realLoad = ExifReader.load;
    let verificationCallCount = 0;

    vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
      if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
        return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
      }
      verificationCallCount++;
      const MissingErrorClass = ExifReader.errors?.MetadataMissingError;
      if (MissingErrorClass) {
        throw new MissingErrorClass('No Exif data');
      }
      const err = new Error('No Exif data');
      err.name = 'MetadataMissingError';
      throw err;
    }) as unknown) as typeof ExifReader.load);

    const result = await stripImageMetadata(file);
    expect(verificationCallCount).toBe(1);
    expect(result.verifiedClean).toBe(true);
    expect(result.remainingTagCount).toBe(0);
  });

  it('does not claim clean when verification throws an unexpected parser failure', async () => {
    const inputBytes = createValidTestJpeg();
    const file = makeValidFile(inputBytes);
    const realLoad = ExifReader.load;
    let verificationCallCount = 0;

    vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
      if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
        return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
      }
      verificationCallCount++;
      throw new Error('unexpected parser failure or corruption');
    }) as unknown) as typeof ExifReader.load);

    const result = await stripImageMetadata(file);
    expect(verificationCallCount).toBe(1);
    expect(result.verifiedClean).toBe(false);
  });

  // Test EACH of the 6 sensitive metadata groups individually
  const testCases: Array<{ group: typeof SENSITIVE_METADATA_GROUPS[number]; tags: Record<string, unknown>; expectedCount: number }> = [
    {
      group: 'gps',
      tags: {
        GPSLatitude: { value: [37, 48, 0], description: '37° 48\' 0"' },
        GPSLongitude: { value: [-122, 24, 0], description: '-122° 24\' 0"' },
      },
      expectedCount: 2,
    },
    {
      group: 'exif',
      tags: {
        Model: { value: 'Alpha 7 IV', description: 'Alpha 7 IV' },
        Make: { value: 'Sony', description: 'Sony' },
        DateTimeOriginal: { value: '2026:10:14 12:00:00', description: '2026:10:14 12:00:00' },
      },
      expectedCount: 3,
    },
    {
      group: 'iptc',
      tags: {
        'Caption/Abstract': { value: 'Confidential photo', description: 'Confidential photo' },
      },
      expectedCount: 1,
    },
    {
      group: 'xmp',
      tags: {
        Creator: { value: 'Photographer Name', description: 'Photographer Name' },
      },
      expectedCount: 1,
    },
    {
      group: 'makernotes',
      tags: {
        CameraSerialNumber: { value: '987654321', description: '987654321' },
      },
      expectedCount: 1,
    },
    {
      group: 'photoshop',
      tags: {
        CaptionDigest: { value: 'abcdef123456', description: 'abcdef123456' },
      },
      expectedCount: 1,
    },
  ];

  for (const { group, tags, expectedCount } of testCases) {
    it(`detects remaining sensitive metadata in "${group}" group and accurately counts ${expectedCount} remaining tags`, async () => {
      const inputBytes = createValidTestJpeg();
      const file = makeValidFile(inputBytes);
      const realLoad = ExifReader.load;
      let verificationCallCount = 0;

      vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
        if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
          return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
        }
        verificationCallCount++;
        return {
          [group]: tags,
        };
      }) as unknown) as typeof ExifReader.load);

      const result = await stripImageMetadata(file);
      expect(verificationCallCount).toBe(1);
      expect(result.verifiedClean).toBe(false);
      expect(result.remainingTagCount).toBe(expectedCount);
    });
  }

  it('accurately sums remaining tags across multiple sensitive groups simultaneously', async () => {
    const inputBytes = createValidTestJpeg();
    const file = makeValidFile(inputBytes);
    const realLoad = ExifReader.load;

    vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
      if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
        return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
      }
      return {
        gps: {
          GPSLatitude: { value: 37.5 },
          GPSLongitude: { value: -122.5 },
        },
        exif: {
          Model: { value: 'Camera' },
          Make: { value: 'Brand' },
          ISO: { value: 100 },
        },
        iptc: {
          Author: { value: 'User' },
        },
      };
    }) as unknown) as typeof ExifReader.load);

    const result = await stripImageMetadata(file);
    expect(result.verifiedClean).toBe(false);
    // 2 GPS + 3 EXIF + 1 IPTC = 6 tags
    expect(result.remainingTagCount).toBe(6);
  });

  it('excludes non-sensitive technical markers (JFIF, ICC, file) and verifies clean when 0 sensitive tags remain', async () => {
    const inputBytes = createValidTestJpeg();
    const file = makeValidFile(inputBytes);
    const realLoad = ExifReader.load;

    vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
      if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
        return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
      }
      // Standard browser canvas export with JFIF, sRGB ICC profile, and file info
      return {
        file: {
          'Bits Per Sample': { value: 8 },
          FileType: { value: 'jpeg' },
        },
        jfif: {
          'JFIF Version': { value: 257 },
          XResolution: { value: 72 },
          YResolution: { value: 72 },
        },
        icc: {
          'Profile Description': { value: 'sRGB IEC61966-2.1' },
          'Profile Version': { value: 512 },
        },
      };
    }) as unknown) as typeof ExifReader.load);

    const result = await stripImageMetadata(file);
    expect(result.verifiedClean).toBe(true);
    expect(result.remainingTagCount).toBe(0);
  });

  it('verifies clean end-to-end with real ExifReader on clean canvas outputs', async () => {
    const inputBytes = createCleanJpegBytes(100, 100);
    const file = makeValidFile(inputBytes);

    const result = await stripImageMetadata(file);
    expect(result.verifiedClean).toBe(true);
    expect(result.remainingTagCount).toBe(0);
  });

  describe('nested structures and tag counter accuracy', () => {
    it('counts individual fields inside nested XMP structures', () => {
      const nestedXmp = {
        creatorContactInfo: {
          description: 'Contact info',
          value: {
            City: { value: 'Seattle', description: 'Seattle' },
            Country: { value: 'USA', description: 'USA' },
            PostalCode: { value: '98101', description: '98101' },
          },
        },
      };

      const count = countTagsInValue(nestedXmp);
      expect(count).toBe(3);
    });

    it('counts individual items in XMP array structures (Bag / Seq)', () => {
      const arrayXmp = {
        subject: {
          description: 'Subject list',
          value: [
            { value: 'nature', description: 'nature' },
            { value: 'portrait', description: 'portrait' },
            { value: 'wildlife', description: 'wildlife' },
            { value: 'sunset', description: 'sunset' },
          ],
        },
      };

      const count = countTagsInValue(arrayXmp);
      expect(count).toBe(4);
    });

    it('registers an unparsed raw XMP packet (_raw) as 1 tag when no parsed tags exist', () => {
      const rawOnly = {
        _raw: '<x:xmpmeta xmlns:x="adobe:ns:meta/">...</x:xmpmeta>',
      };

      const count = countTagsInValue(rawOnly);
      expect(count).toBe(1);
    });

    it('counts parsed tags without inflating tag count from _raw packet string', () => {
      const mixedXmp = {
        _raw: '<x:xmpmeta xmlns:x="adobe:ns:meta/">...</x:xmpmeta>',
        Creator: { value: 'Photographer', description: 'Photographer' },
        Title: { value: 'Artwork', description: 'Artwork' },
      };

      const count = countTagsInValue(mixedXmp);
      expect(count).toBe(2);
    });

    it('detects and counts makerNotes regardless of camelCase or lowercase key', () => {
      const camelCaseTags = {
        makerNotes: {
          SerialNumber: { value: '123456', description: '123456' },
          FirmwareVersion: { value: '1.0.0', description: '1.0.0' },
        },
      };
      expect(countSensitiveTags(camelCaseTags)).toBe(2);

      const lowerCaseTags = {
        makernotes: {
          LensType: { value: 'Prime 50mm', description: 'Prime 50mm' },
        },
      };
      expect(countSensitiveTags(lowerCaseTags)).toBe(1);

      // Does not double-count if both keys are somehow present
      const bothKeys = {
        makerNotes: { TagA: { value: 1 } },
        makernotes: { TagA: { value: 1 } },
      };
      expect(countSensitiveTags(bothKeys)).toBe(1);
    });

    it('accurately reports remainingTagCount when stripped output contains nested XMP metadata', async () => {
      const inputBytes = createValidTestJpeg();
      const file = makeValidFile(inputBytes);
      const realLoad = ExifReader.load;

      vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
        if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
          return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
        }
        return {
          xmp: {
            _raw: '<xmp>...</xmp>',
            creatorContactInfo: {
              description: 'Contact info',
              value: {
                City: { value: 'San Francisco', description: 'San Francisco' },
                Country: { value: 'USA', description: 'USA' },
              },
            },
          },
        };
      }) as unknown) as typeof ExifReader.load);

      const result = await stripImageMetadata(file);
      expect(result.verifiedClean).toBe(false);
      // City + Country = 2 nested tags
      expect(result.remainingTagCount).toBe(2);
    });
  });

  describe('ICC profile handling & verification limitations', () => {
    it('documents that input ICC profiles are discarded during canvas rasterization', () => {
      // The canvas pipeline draws to raw pixel buffer, discarding any input ICC profile
      // containing device serial numbers or copyright data. Any output ICC profile
      // is a synthetic browser-default profile.
      expect(SENSITIVE_METADATA_GROUPS).not.toContain('icc');
      expect(SENSITIVE_METADATA_GROUPS).not.toContain('jfif');
    });

    it('does not treat parser exceptions as verified clean', async () => {
      const inputBytes = createValidTestJpeg();
      const file = makeValidFile(inputBytes);
      const realLoad = ExifReader.load;

      vi.spyOn(ExifReader, 'load').mockImplementation((((buf: unknown, opts?: unknown) => {
        if (buf instanceof ArrayBuffer && isInputFixture(buf, inputBytes)) {
          return (realLoad as (b: unknown, o?: unknown) => unknown)(buf, opts);
        }
        throw new TypeError('Cannot read properties of undefined');
      }) as unknown) as typeof ExifReader.load);

      const result = await stripImageMetadata(file);
      // Parser failure must NEVER be reported as verified clean
      expect(result.verifiedClean).toBe(false);
    });
  });
});
