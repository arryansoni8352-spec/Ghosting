import ExifReader from 'exifreader';

export interface MetadataTag {
  group: 'GPS' | 'Camera' | 'Exposure' | 'Date & Time' | 'Software & Device' | 'Technical';
  name: string;
  value: string;
  isSensitive: boolean;
}

export interface ImageMetadataReport {
  fileName: string;
  fileSize: number;
  mimeType: string;
  dimensions?: { width: number; height: number };
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
        group: 'Technical',
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
