import ExifReader from 'exifreader';

export interface MetadataTag {
  group: 'GPS' | 'Camera' | 'Exposure' | 'Date & Time' | 'Software & Device' | 'Technical';
  name: string;
  value: string;
  isSensitive: boolean;
}

export interface ImageDimensions {
  width: number;
  height: number;
  visualWidth: number;
  visualHeight: number;
}

export interface ImageMetadataReport {
  fileName: string;
  fileSize: number;
  mimeType: string;
  dimensions?: ImageDimensions;
  orientation?: number;
  orientationDescription?: string;
  rawTagCount: number;
  hasGps: boolean;
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    mapsLink?: string;
  };
  cameraModel?: string;
  captureDate?: string;
  software?: string;
  tags: MetadataTag[];
  privacyRiskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
}

/**
 * Maps standard EXIF Orientation tag (tag 274 / 0x0112) numeric value to human description.
 */
export function getOrientationDescription(orientation: number): string {
  switch (orientation) {
    case 1:
      return 'Horizontal (normal / 0°)';
    case 2:
      return 'Mirror horizontal';
    case 3:
      return 'Rotate 180°';
    case 4:
      return 'Mirror vertical';
    case 5:
      return 'Mirror horizontal and rotate 270° CW (Transpose)';
    case 6:
      return 'Rotate 90° CW';
    case 7:
      return 'Mirror horizontal and rotate 90° CW (Transverse)';
    case 8:
      return 'Rotate 270° CW (90° CCW)';
    default:
      return `Orientation ${orientation}`;
  }
}

/**
 * Determines whether an orientation value swaps the width and height dimensions.
 * Orientations 5, 6, 7, and 8 involve 90°/270° coordinate axis transpositions.
 */
export function doesOrientationSwapDimensions(orientation: number = 1): boolean {
  return orientation >= 5 && orientation <= 8;
}

/**
 * Calculates effective visual dimensions given raw dimensions and orientation.
 */
export function calculateVisualDimensions(
  width: number,
  height: number,
  orientation: number = 1
): { visualWidth: number; visualHeight: number } {
  if (doesOrientationSwapDimensions(orientation)) {
    return { visualWidth: height, visualHeight: width };
  }
  return { visualWidth: width, visualHeight: height };
}

/**
 * Extracts EXIF orientation tag from parsed ExifReader tags.
 */
export function getExifOrientation(tags: any): { orientation: number; description: string } | null {
  const exif = tags?.exif;
  const tag = tags?.Orientation || exif?.Orientation;
  if (!tag) return null;
  const val = typeof tag.value === 'number' ? tag.value : Number(tag.value);
  if (!isNaN(val) && val >= 1 && val <= 8) {
    return {
      orientation: val,
      description: tag.description || getOrientationDescription(val),
    };
  }
  return null;
}

/**
 * Fast binary header inspection to determine intrinsic pixel dimensions of common image formats.
 */
export function getImageHeaderDimensions(buffer: ArrayBuffer | Uint8Array): { width: number; height: number } | null {
  const view = buffer instanceof Uint8Array ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new DataView(buffer);
  if (view.byteLength < 16) return null;

  try {
    // 1. JPEG (SOI 0xFFD8)
    if (view.getUint16(0, false) === 0xFFD8) {
      let offset = 2;
      while (offset < view.byteLength - 8) {
        while (offset < view.byteLength && view.getUint8(offset) !== 0xFF) offset++;
        while (offset < view.byteLength && view.getUint8(offset) === 0xFF) offset++;
        if (offset >= view.byteLength) break;
        const markerType = view.getUint8(offset);
        offset++;
        // SOF markers (SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15)
        if (
          (markerType >= 0xC0 && markerType <= 0xC3) ||
          (markerType >= 0xC5 && markerType <= 0xC7) ||
          (markerType >= 0xC9 && markerType <= 0xCB) ||
          (markerType >= 0xCD && markerType <= 0xCF)
        ) {
          const height = view.getUint16(offset + 3, false);
          const width = view.getUint16(offset + 5, false);
          if (width > 0 && height > 0) return { width, height };
        }
        if (markerType === 0xDA || markerType === 0xD9) break; // SOS or EOI
        const len = view.getUint16(offset, false);
        offset += len;
      }
    }

    // 2. PNG (0x89504E47)
    if (view.getUint32(0, false) === 0x89504E47 && view.byteLength >= 24) {
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      if (width > 0 && height > 0) return { width, height };
    }

    // 3. WebP (RIFF....WEBP)
    if (view.byteLength >= 30) {
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      const webp = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      if (riff === 'RIFF' && webp === 'WEBP') {
        const chunkType = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
        if (chunkType === 'VP8 ' && view.byteLength >= 30) {
          const width = view.getUint16(26, true) & 0x3FFF;
          const height = view.getUint16(28, true) & 0x3FFF;
          if (width > 0 && height > 0) return { width, height };
        } else if (chunkType === 'VP8L' && view.byteLength >= 25) {
          const b0 = view.getUint8(21);
          const b1 = view.getUint8(22);
          const b2 = view.getUint8(23);
          const b3 = view.getUint8(24);
          const width = 1 + (((b1 & 0x3F) << 8) | b0);
          const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
          if (width > 0 && height > 0) return { width, height };
        } else if (chunkType === 'VP8X' && view.byteLength >= 30) {
          const width = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
          const height = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
          if (width > 0 && height > 0) return { width, height };
        }
      }
    }

    // 4. BMP (BM 0x424D)
    if (view.getUint16(0, false) === 0x424D && view.byteLength >= 26) {
      const width = Math.abs(view.getInt32(18, true));
      const height = Math.abs(view.getInt32(22, true));
      if (width > 0 && height > 0) return { width, height };
    }
  } catch {
    // If malformed header, ignore
  }

  return null;
}

/**
 * Validates the file format and size.
 */
export function validateImageFile(file: File, maxSizeBytes: number = 25 * 1024 * 1024): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp'];
  const validExtensions = /\.(jpe?g|png|webp|tiff?|bmp)$/i;

  if (!validTypes.includes(file.type.toLowerCase()) && !validExtensions.test(file.name)) {
    return {
      valid: false,
      error: `Unsupported format (${file.type || 'unknown'}). Supported formats are PNG, JPEG, WebP, TIFF, and BMP.`,
    };
  }

  if (file.size > maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `File size exceeds ${maxMb} MB limit (${sizeMb} MB). Please choose a smaller file.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'Selected file is empty (0 bytes).' };
  }

  return { valid: true };
}

/**
 * Parses all available EXIF, IPTC, XMP, and ICC metadata from an image buffer using ExifReader.
 */
export async function inspectImageMetadata(file: File): Promise<ImageMetadataReport> {
  const buffer = await file.arrayBuffer();

  let tags: any = {};
  try {
    tags = ExifReader.load(buffer, { expanded: true });
  } catch {
    // Some formats or raw headers may throw if malformed; fall back to empty tag set
    tags = {};
  }

  const parsedTags: MetadataTag[] = [];
  let hasGps = false;
  let latNum: number | undefined;
  let lonNum: number | undefined;
  let cameraModel: string | undefined;
  let captureDate: string | undefined;
  let software: string | undefined;

  // 1. Inspect EXIF Orientation (tag 274 / 0x0112)
  const orientationInfo = getExifOrientation(tags);
  const orientation = orientationInfo?.orientation;
  const orientationDescription = orientationInfo?.description;

  // 2. Inspect Dimensions
  const headerDims = getImageHeaderDimensions(buffer);
  let rawWidth = headerDims?.width;
  let rawHeight = headerDims?.height;

  // Fallback to tags for dimensions if binary header check was not conclusive
  if (!rawWidth || !rawHeight) {
    const fileGroup = tags?.file;
    const pngGroup = tags?.png || tags?.pngFile;
    const exifGroup = tags?.exif;
    const wVal = fileGroup?.['Image Width']?.value || pngGroup?.['Image Width']?.value || exifGroup?.['PixelXDimension']?.value || tags?.['Image Width']?.value;
    const hVal = fileGroup?.['Image Height']?.value || pngGroup?.['Image Height']?.value || exifGroup?.['PixelYDimension']?.value || tags?.['Image Height']?.value;
    if (wVal && hVal) {
      rawWidth = typeof wVal === 'number' ? wVal : parseInt(String(wVal), 10);
      rawHeight = typeof hVal === 'number' ? hVal : parseInt(String(hVal), 10);
    }
  }

  let dimensions: ImageDimensions | undefined;
  if (rawWidth && rawHeight && !isNaN(rawWidth) && !isNaN(rawHeight)) {
    const { visualWidth, visualHeight } = calculateVisualDimensions(rawWidth, rawHeight, orientation ?? 1);
    dimensions = {
      width: rawWidth,
      height: rawHeight,
      visualWidth,
      visualHeight,
    };
  }

  // Process standard EXIF and expanded groups
  const allGroups = [
    { key: 'gps', label: 'GPS' as const, isSensitive: true },
    { key: 'exif', label: 'Camera' as const, isSensitive: false },
    { key: 'iptc', label: 'Technical' as const, isSensitive: false },
    { key: 'xmp', label: 'Technical' as const, isSensitive: false },
    { key: 'icc', label: 'Technical' as const, isSensitive: false },
    { key: 'file', label: 'Technical' as const, isSensitive: false },
  ];

  // Helper to extract value string safely
  const getTagDescription = (tagObj: unknown): string => {
    if (!tagObj) return '';
    if (typeof tagObj === 'string') return tagObj;
    if (typeof tagObj === 'number') return String(tagObj);
    if (typeof tagObj === 'object' && tagObj !== null) {
      if ('description' in tagObj) {
        return String((tagObj as { description: unknown }).description);
      }
      if ('value' in tagObj) {
        return String((tagObj as { value: unknown }).value);
      }
    }
    return String(tagObj);
  };

  // Inspect GPS
  const gpsGroup = (tags as Record<string, unknown>)['gps'] as Record<string, unknown> | undefined;
  if (gpsGroup) {
    if ('Latitude' in gpsGroup && 'Longitude' in gpsGroup) {
      hasGps = true;
      const rawLat = gpsGroup['Latitude'];
      const rawLon = gpsGroup['Longitude'];
      if (typeof rawLat === 'number' && typeof rawLon === 'number') {
        latNum = rawLat;
        lonNum = rawLon;
      }
    }
  }

  // Iterate over groups and tags
  for (const groupDef of allGroups) {
    const groupData = (tags as Record<string, unknown>)[groupDef.key] as Record<string, unknown> | undefined;
    if (groupData && typeof groupData === 'object') {
      for (const [tagName, tagVal] of Object.entries(groupData)) {
        if (!tagVal) continue;
        const desc = getTagDescription(tagVal).trim();
        if (!desc || desc === 'undefined') continue;

        let category: MetadataTag['group'] = groupDef.label;
        let isSensitive = groupDef.isSensitive;

        // Classify specific tags
        const lowerName = tagName.toLowerCase();
        if (lowerName.includes('gps') || lowerName.includes('latitude') || lowerName.includes('longitude') || lowerName.includes('altitude')) {
          category = 'GPS';
          isSensitive = true;
          hasGps = true;
        } else if (lowerName.includes('make') || lowerName.includes('model') || lowerName.includes('lens') || lowerName.includes('serial')) {
          category = 'Camera';
          if (lowerName.includes('serial')) isSensitive = true;
          if (!cameraModel && (lowerName.includes('model') || lowerName.includes('make'))) {
            cameraModel = desc;
          }
        } else if (lowerName === 'orientation') {
          category = 'Camera';
        } else if (lowerName.includes('date') || lowerName.includes('time')) {
          category = 'Date & Time';
          if (!captureDate && lowerName.includes('original')) {
            captureDate = desc;
          }
        } else if (lowerName.includes('exposure') || lowerName.includes('iso') || lowerName.includes('fnumber') || lowerName.includes('focallength')) {
          category = 'Exposure';
        } else if (lowerName.includes('software') || lowerName.includes('device') || lowerName.includes('creator') || lowerName.includes('artist')) {
          category = 'Software & Device';
          if (lowerName.includes('artist') || lowerName.includes('creator')) isSensitive = true;
          if (!software && lowerName.includes('software')) software = desc;
        }

        parsedTags.push({
          group: category,
          name: tagName,
          value: desc,
          isSensitive,
        });
      }
    }
  }

  // Also check top-level if expanded groups didn't cover everything
  for (const [tagName, tagVal] of Object.entries(tags)) {
    if (allGroups.some(g => g.key === tagName)) continue; // skip group objects
    const desc = getTagDescription(tagVal).trim();
    if (!desc || desc === 'undefined' || desc === '[object Object]') continue;

    if (!parsedTags.some(t => t.name === tagName)) {
      parsedTags.push({
        group: tagName.toLowerCase() === 'orientation' ? 'Camera' : 'Technical',
        name: tagName,
        value: desc,
        isSensitive: false,
      });
    }
  }

  // Determine privacy risk level
  let privacyRiskLevel: ImageMetadataReport['privacyRiskLevel'] = 'CLEAN';
  const hasExifOrSensitive = hasGps || cameraModel || captureDate || software || parsedTags.some(t => t.isSensitive || t.group !== 'Technical');
  if (parsedTags.length === 0 || !hasExifOrSensitive) {
    privacyRiskLevel = 'CLEAN';
  } else if (hasGps || parsedTags.some(t => t.isSensitive)) {
    privacyRiskLevel = 'HIGH';
  } else if (cameraModel || captureDate || software) {
    privacyRiskLevel = 'MEDIUM';
  } else {
    privacyRiskLevel = 'LOW';
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'image/unknown',
    dimensions,
    orientation,
    orientationDescription,
    rawTagCount: parsedTags.length,
    hasGps,
    gpsCoordinates: latNum !== undefined && lonNum !== undefined ? {
      latitude: latNum,
      longitude: lonNum,
      mapsLink: `https://www.openstreetmap.org/?mlat=${latNum}&mlon=${lonNum}#map=16/${latNum}/${lonNum}`,
    } : undefined,
    cameraModel,
    captureDate,
    software,
    tags: parsedTags,
    privacyRiskLevel,
  };
}
