/**
 * GHOSTING Video Metadata Inspector
 *
 * Client-side binary parsing of video container metadata across MP4, MOV, WebM, and MKV.
 * Extracts technical stream specifications, creation timestamps, camera/device identifiers,
 * GPS coordinates (ISO 6709), chapters, and embedded metadata tags.
 */

import {
  VideoContainerFormat,
  detectVideoContainer,
  formatVideoDuration,
  formatVideoFileSize,
} from './videoFormatDetector';

export interface VideoMetadataTag {
  group: 'GPS' | 'Camera & Device' | 'Timestamps & Dates' | 'Encoder & Software' | 'Container & Tracks' | 'Chapters & Subtitles' | 'User Metadata';
  name: string;
  value: string;
  isSensitive: boolean;
  description?: string;
}

export interface VideoChapter {
  id: number;
  title: string;
  startTimeSeconds: number;
  endTimeSeconds?: number;
  timeFormatted: string;
}

export interface VideoTrackInfo {
  trackId: number;
  type: 'video' | 'audio' | 'subtitle' | 'meta';
  codec: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  language?: string;
  bitrateKbps?: number;
}

export interface VideoMetadataReport {
  fileName: string;
  fileSize: number;
  fileSizeFormatted: string;
  containerFormat: VideoContainerFormat;
  mimeType: string;
  durationSeconds: number;
  durationFormatted: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio: boolean;
  frameRate?: number;
  bitrateKbps?: number;
  creationDate?: string;
  modificationDate?: string;
  cameraMake?: string;
  cameraModel?: string;
  software?: string;
  encoder?: string;
  hasGps: boolean;
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    sourceRaw: string;
    mapsLink: string;
  };
  chapters: VideoChapter[];
  tracks: VideoTrackInfo[];
  tags: VideoMetadataTag[];
  rawTagCount: number;
  privacyRiskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
  inspectionStatus: {
    foundCategories: string[];
    notFoundCategories: string[];
    unsupportedItems: string[];
  };
}

// Epoch offset: MP4 timestamps count seconds since 1904-01-01 00:00:00 UTC
const MP4_EPOCH_OFFSET_SECONDS = 2082844800;

/**
 * Convert MP4 timestamp (seconds since 1904-01-01) to ISO date string.
 */
export function mp4TimeToDate(seconds: number): string | undefined {
  if (!seconds || seconds <= 0 || seconds === 2082844800) return undefined;
  // Convert to Unix epoch milliseconds
  const unixSeconds = seconds - MP4_EPOCH_OFFSET_SECONDS;
  if (unixSeconds <= 0) return undefined;
  try {
    const d = new Date(unixSeconds * 1000);
    if (isNaN(d.getTime()) || d.getFullYear() < 1990 || d.getFullYear() > 2100) {
      return undefined;
    }
    return d.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Parse ISO 6709 GPS string format commonly stored in QuickTime/MP4 '©xyz' or 'loci' atom.
 * Example strings:
 *   "+37.7749-122.4194/"
 *   "+37.7749-122.4194+015.000/"
 *   "+374630.0-1222510.0/"
 */
export function parseIso6709Gps(raw: string): { latitude: number; longitude: number; altitude?: number } | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw.trim();

  // Pattern 1: Decimal degrees: [+-]DD.DDDD[+-]DDD.DDDD([+-]AAA.AAA)?/
  const decimalRegex = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:([+-]\d+(?:\.\d+)?))?\/$/;
  const match = cleaned.match(decimalRegex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const alt = match[3] ? parseFloat(match[3]) : undefined;
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon, altitude: alt };
    }
  }

  // Pattern 2: Degrees and Minutes: [+-]DDMM.MMMM[+-]DDDMM.MMMM([+-]AAA.AAA)?/
  const dmsRegex = /^([+-]\d{2})(\d{2}(?:\.\d+)?)([+-]\d{3})(\d{2}(?:\.\d+)?)(?:([+-]\d+(?:\.\d+)?))?\/$/;
  const dmsMatch = cleaned.match(dmsRegex);
  if (dmsMatch) {
    const latDeg = parseFloat(dmsMatch[1]);
    const latMin = parseFloat(dmsMatch[2]);
    const lonDeg = parseFloat(dmsMatch[3]);
    const lonMin = parseFloat(dmsMatch[4]);
    const lat = latDeg + (latDeg >= 0 ? 1 : -1) * (latMin / 60);
    const lon = lonDeg + (lonDeg >= 0 ? 1 : -1) * (lonMin / 60);
    const alt = dmsMatch[5] ? parseFloat(dmsMatch[5]) : undefined;
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon, altitude: alt };
    }
  }

  return undefined;
}

/**
 * Main video metadata inspection engine.
 * Reads binary array buffer to extract full metadata report.
 */
export async function inspectVideoMetadata(file: File): Promise<VideoMetadataReport> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const container = detectVideoContainer(bytes.slice(0, 256), file.name);

  // Initialize report
  const report: VideoMetadataReport = {
    fileName: file.name,
    fileSize: file.size,
    fileSizeFormatted: formatVideoFileSize(file.size),
    containerFormat: container,
    mimeType: file.type || (container === 'mp4' ? 'video/mp4' : container === 'mov' ? 'video/quicktime' : 'video/webm'),
    durationSeconds: 0,
    durationFormatted: '0:00',
    hasAudio: false,
    hasGps: false,
    chapters: [],
    tracks: [],
    tags: [],
    rawTagCount: 0,
    privacyRiskLevel: 'CLEAN',
    inspectionStatus: {
      foundCategories: [],
      notFoundCategories: [],
      unsupportedItems: [],
    },
  };

  // Inspect based on container format
  if (container === 'mp4' || container === 'mov') {
    parseMp4Boxes(bytes, report);
  } else if (container === 'webm' || container === 'mkv') {
    parseEbml(bytes, report);
  } else {
    report.inspectionStatus.unsupportedItems.push('Detailed container-specific atom parsing is unsupported for AVI files.');
  }

  // Calculate privacy risk level
  calculatePrivacyRisk(report);

  // Compile inspection status categories
  compileInspectionStatus(report);

  return report;
}

/**
 * ISO Base Media File Format (ISOBMFF) Box Parser for MP4 and QuickTime MOV.
 */
function parseMp4Boxes(bytes: Uint8Array, report: VideoMetadataReport): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const length = bytes.byteLength;

  while (offset + 8 <= length) {
    let boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    let headerSize = 8;
    if (boxSize === 1 && offset + 16 <= length) {
      // 64-bit extended box size
      boxSize = Number(view.getBigUint64(offset + 8));
      headerSize = 16;
    } else if (boxSize === 0) {
      // Box extends to end of file
      boxSize = length - offset;
    }

    if (boxSize < headerSize || offset + boxSize > length) {
      break; // Malformed box or EOF
    }

    const payloadStart = offset + headerSize;
    const payloadEnd = offset + boxSize;

    if (boxType === 'moov') {
      parseMoovBox(bytes, view, payloadStart, payloadEnd, report);
    } else if (boxType === 'ftyp') {
      parseFtypBox(bytes, payloadStart, payloadEnd, report);
    }

    offset += boxSize;
  }
}

function parseFtypBox(bytes: Uint8Array, start: number, end: number, report: VideoMetadataReport): void {
  if (end - start < 8) return;
  const majorBrand = String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
  const minorVersion = new DataView(bytes.buffer, bytes.byteOffset + start + 4).getUint32(0);
  
  report.tags.push({
    group: 'Container & Tracks',
    name: 'Major Brand',
    value: majorBrand.trim(),
    isSensitive: false,
    description: 'ISO-BMFF major compatible brand signature.',
  });

  report.tags.push({
    group: 'Container & Tracks',
    name: 'Minor Version',
    value: minorVersion.toString(),
    isSensitive: false,
  });
}

function parseMoovBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  let offset = start;

  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (boxSize < 8 || offset + boxSize > end) break;
    const payloadStart = offset + 8;
    const payloadEnd = offset + boxSize;

    if (boxType === 'mvhd') {
      parseMvhdBox(bytes, view, payloadStart, payloadEnd, report);
    } else if (boxType === 'trak') {
      parseTrakBox(bytes, view, payloadStart, payloadEnd, report);
    } else if (boxType === 'udta') {
      parseUdtaBox(bytes, view, payloadStart, payloadEnd, report);
    } else if (boxType === 'meta') {
      parseMetaBox(bytes, view, payloadStart, payloadEnd, report);
    }

    offset += boxSize;
  }
}

function parseMvhdBox(
  _bytes: Uint8Array,
  view: DataView,
  start: number,
  _end: number,
  report: VideoMetadataReport
): void {
  const version = view.getUint8(start);
  let creationTime = 0;
  let modificationTime = 0;
  let timescale = 1;
  let duration = 0;

  if (version === 1) {
    creationTime = Number(view.getBigUint64(start + 4));
    modificationTime = Number(view.getBigUint64(start + 12));
    timescale = view.getUint32(start + 20);
    duration = Number(view.getBigUint64(start + 24));
  } else {
    creationTime = view.getUint32(start + 4);
    modificationTime = view.getUint32(start + 8);
    timescale = view.getUint32(start + 12);
    duration = view.getUint32(start + 16);
  }

  const creationDate = mp4TimeToDate(creationTime);
  const modDate = mp4TimeToDate(modificationTime);

  if (creationDate) {
    report.creationDate = creationDate;
    report.tags.push({
      group: 'Timestamps & Dates',
      name: 'Creation Date (mvhd)',
      value: creationDate,
      isSensitive: true,
      description: 'Timestamp when video was originally recorded/authored.',
    });
  }

  if (modDate) {
    report.modificationDate = modDate;
    report.tags.push({
      group: 'Timestamps & Dates',
      name: 'Modification Date (mvhd)',
      value: modDate,
      isSensitive: true,
      description: 'Timestamp when video container was last saved or modified.',
    });
  }

  if (timescale > 0 && duration > 0) {
    report.durationSeconds = duration / timescale;
    report.durationFormatted = formatVideoDuration(report.durationSeconds);
    if (report.fileSize > 0 && report.durationSeconds > 0) {
      report.bitrateKbps = Math.round((report.fileSize * 8) / (report.durationSeconds * 1000));
    }
  }
}

function parseTrakBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  let offset = start;
  let trackType: 'video' | 'audio' | 'subtitle' | 'meta' = 'video';
  let trackId = report.tracks.length + 1;
  let width = 0;
  let height = 0;
  let codec = '';

  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (boxSize < 8 || offset + boxSize > end) break;
    const payloadStart = offset + 8;

    if (boxType === 'tkhd') {
      const version = view.getUint8(payloadStart);
      const widthOffset = version === 1 ? payloadStart + 80 : payloadStart + 68;
      trackId = version === 1 ? Number(view.getBigUint64(payloadStart + 16)) : view.getUint32(payloadStart + 12);
      width = Math.round(view.getUint32(widthOffset) / 65536);
      height = Math.round(view.getUint32(widthOffset + 4) / 65536);
    } else if (boxType === 'mdia') {
      // Find hdlr and minf in mdia
      let mdiaOffset = payloadStart;
      const mdiaEnd = offset + boxSize;
      while (mdiaOffset + 8 <= mdiaEnd) {
        const subBoxSize = view.getUint32(mdiaOffset);
        const subBoxType = String.fromCharCode(
          bytes[mdiaOffset + 4],
          bytes[mdiaOffset + 5],
          bytes[mdiaOffset + 6],
          bytes[mdiaOffset + 7]
        );
        if (subBoxSize < 8 || mdiaOffset + subBoxSize > mdiaEnd) break;

        if (subBoxType === 'hdlr') {
          const handlerType = String.fromCharCode(
            bytes[mdiaOffset + 16],
            bytes[mdiaOffset + 17],
            bytes[mdiaOffset + 18],
            bytes[mdiaOffset + 19]
          );
          if (handlerType === 'vide') trackType = 'video';
          else if (handlerType === 'soun') trackType = 'audio';
          else if (handlerType === 'subt' || handlerType === 'text') trackType = 'subtitle';
          else if (handlerType === 'meta') trackType = 'meta';
        } else if (subBoxType === 'minf') {
          // Look for stsd in stbl
          codec = extractCodecFromMinf(bytes, view, mdiaOffset + 8, mdiaOffset + subBoxSize);
        }
        mdiaOffset += subBoxSize;
      }
    }

    offset += boxSize;
  }

  if (trackType === 'video') {
    if (width > 0 && height > 0) {
      report.width = width;
      report.height = height;
      report.aspectRatio = `${width}:${height}`;
    }
    if (codec) {
      report.videoCodec = mapCodecName(codec);
    }
  } else if (trackType === 'audio') {
    report.hasAudio = true;
    if (codec && !report.audioCodec) {
      report.audioCodec = mapCodecName(codec);
    }
  }

  report.tracks.push({
    trackId,
    type: trackType,
    codec: codec ? mapCodecName(codec) : 'Unknown',
    width: width || undefined,
    height: height || undefined,
  });
}

function extractCodecFromMinf(bytes: Uint8Array, view: DataView, start: number, end: number): string {
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (size < 8 || offset + size > end) break;

    if (type === 'stbl') {
      let stblOffset = offset + 8;
      const stblEnd = offset + size;
      while (stblOffset + 8 <= stblEnd) {
        const subSize = view.getUint32(stblOffset);
        const subType = String.fromCharCode(bytes[stblOffset + 4], bytes[stblOffset + 5], bytes[stblOffset + 6], bytes[stblOffset + 7]);
        if (subSize < 8 || stblOffset + subSize > stblEnd) break;

        if (subType === 'stsd') {
          // In stsd FullBox:
          // 0-3: size, 4-7: 'stsd', 8-11: version & flags, 12-15: entry_count
          // 16-19: first sample entry size
          // 20-23: first sample entry format fourcc (e.g. 'avc1', 'mp4a')
          if (stblOffset + 24 <= stblEnd) {
            return String.fromCharCode(
              bytes[stblOffset + 20],
              bytes[stblOffset + 21],
              bytes[stblOffset + 22],
              bytes[stblOffset + 23]
            );
          }
        }
        stblOffset += subSize;
      }
    }
    offset += size;
  }
  return '';
}

function parseUdtaBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  let offset = start;
  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (boxSize < 8 || offset + boxSize > end) break;
    const payloadStart = offset + 8;
    const payloadEnd = offset + boxSize;

    if (boxType === 'meta') {
      parseMetaBox(bytes, view, payloadStart, payloadEnd, report);
    } else if (boxType === '©xyz' || boxType === 'xyz ') {
      // ISO 6709 GPS coordinates
      parseGpsAtom(bytes, payloadStart, payloadEnd, report);
    } else if (boxType === 'chpl') {
      // Chapter list
      parseChplBox(bytes, view, payloadStart, payloadEnd, report);
    } else {
      parseAppleMetadataAtom(bytes, boxType, payloadStart, payloadEnd, report);
    }

    offset += boxSize;
  }
}

function parseMetaBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  // meta box may have 4 bytes version/flags
  let offset = start;
  if (offset + 4 <= end) {
    offset += 4; // skip version & flags
  }

  while (offset + 8 <= end) {
    const boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (boxSize < 8 || offset + boxSize > end) break;
    const payloadStart = offset + 8;
    const payloadEnd = offset + boxSize;

    if (boxType === 'ilst') {
      parseIlstBox(bytes, view, payloadStart, payloadEnd, report);
    }

    offset += boxSize;
  }
}

function parseIlstBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  let offset = start;
  while (offset + 8 <= end) {
    const atomSize = view.getUint32(offset);
    const atomType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (atomSize < 8 || offset + atomSize > end) break;
    const payloadStart = offset + 8;
    const payloadEnd = offset + atomSize;

    // Search for 'data' atom inside this metadata entry
    let dataOffset = payloadStart;
    while (dataOffset + 16 <= payloadEnd) {
      const dataSize = view.getUint32(dataOffset);
      const dataType = String.fromCharCode(
        bytes[dataOffset + 4],
        bytes[dataOffset + 5],
        bytes[dataOffset + 6],
        bytes[dataOffset + 7]
      );
      if (dataType === 'data' && dataSize >= 16) {
        // payload of data box starts at +16
        const textBytes = bytes.slice(dataOffset + 16, dataOffset + dataSize);
        const textVal = new TextDecoder('utf-8', { fatal: false }).decode(textBytes).trim();
        if (textVal) {
          handleNamedMetadataAtom(atomType, textVal, report);
        }
        break;
      }
      if (dataSize < 8) break;
      dataOffset += dataSize;
    }

    offset += atomSize;
  }
}

function parseAppleMetadataAtom(
  bytes: Uint8Array,
  atomType: string,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  // Try reading string payload directly (skipping any size header if present)
  let textBytes = bytes.slice(start, end);
  if (textBytes.length > 4 && textBytes[0] === 0 && textBytes[1] === 0) {
    textBytes = textBytes.slice(4);
  }
  const textVal = new TextDecoder('utf-8', { fatal: false }).decode(textBytes).trim();
  if (textVal && textVal.length > 0 && textVal.length < 500) {
    handleNamedMetadataAtom(atomType, textVal, report);
  }
}

function handleNamedMetadataAtom(atomType: string, value: string, report: VideoMetadataReport): void {
  switch (atomType) {
    case '©mak':
      report.cameraMake = value;
      report.tags.push({
        group: 'Camera & Device',
        name: 'Camera Manufacturer',
        value,
        isSensitive: true,
        description: 'Manufacturer of the recording camera/device.',
      });
      break;
    case '©mod':
      report.cameraModel = value;
      report.tags.push({
        group: 'Camera & Device',
        name: 'Camera Model',
        value,
        isSensitive: true,
        description: 'Device hardware model identifier (e.g. iPhone, Pixel).',
      });
      break;
    case '©swr':
    case '©too':
      report.software = value;
      report.encoder = value;
      report.tags.push({
        group: 'Encoder & Software',
        name: 'Encoder / Software',
        value,
        isSensitive: false,
        description: 'Software application that encoded or muxed the video.',
      });
      break;
    case '©xyz':
    case 'xyz ':
      parseGpsString(value, report);
      break;
    case '©nam':
      report.tags.push({ group: 'User Metadata', name: 'Title', value, isSensitive: true });
      break;
    case '©art':
      report.tags.push({ group: 'User Metadata', name: 'Artist / Author', value, isSensitive: true });
      break;
    case '©cpr':
      report.tags.push({ group: 'User Metadata', name: 'Copyright', value, isSensitive: false });
      break;
    case '©day':
      report.tags.push({ group: 'Timestamps & Dates', name: 'Capture Year', value, isSensitive: true });
      break;
    case '©cmt':
      report.tags.push({ group: 'User Metadata', name: 'Comment', value, isSensitive: true });
      break;
    default:
      if (atomType.startsWith('©') || /^[a-zA-Z0-9]{4}$/.test(atomType)) {
        report.tags.push({
          group: 'User Metadata',
          name: atomType,
          value,
          isSensitive: false,
        });
      }
      break;
  }
}

function parseGpsAtom(bytes: Uint8Array, start: number, end: number, report: VideoMetadataReport): void {
  // ©xyz atom payload contains 2-byte size/lang code followed by ISO 6709 coordinate string
  let strOffset = start;
  if (end - start > 4) {
    strOffset += 4;
  }
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(strOffset, end)).trim();
  parseGpsString(raw, report);
}

function parseGpsString(raw: string, report: VideoMetadataReport): void {
  const coords = parseIso6709Gps(raw);
  if (coords) {
    report.hasGps = true;
    report.gpsCoordinates = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude,
      sourceRaw: raw,
      mapsLink: `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`,
    };
    report.tags.push({
      group: 'GPS',
      name: 'GPS Coordinates',
      value: `${coords.latitude.toFixed(6)}°, ${coords.longitude.toFixed(6)}°${coords.altitude ? ` (${coords.altitude}m)` : ''}`,
      isSensitive: true,
      description: 'Exact physical geolocation where the video was captured.',
    });
  }
}

function parseChplBox(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  report: VideoMetadataReport
): void {
  // Nero chapter atom 'chpl' (FullBox: version 1B, flags 3B, then count)
  if (end - start < 6) return;
  let offset = start + 4;
  let chapterCount = 0;

  if (offset + 4 <= end && view.getUint32(offset) > 0 && view.getUint32(offset) < 256) {
    chapterCount = view.getUint32(offset);
    offset += 4;
  } else if (offset < end) {
    chapterCount = bytes[offset];
    offset += 1;
  }

  for (let i = 0; i < chapterCount && offset + 9 <= end; i++) {
    const timestampMs = Number(view.getBigUint64(offset)) / 10000;
    const titleLen = bytes[offset + 8];
    offset += 9;
    if (offset + titleLen <= end) {
      const title = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(offset, offset + titleLen));
      offset += titleLen;
      const startTimeSeconds = timestampMs / 1000;
      report.chapters.push({
        id: i + 1,
        title: title || `Chapter ${i + 1}`,
        startTimeSeconds,
        timeFormatted: formatVideoDuration(startTimeSeconds),
      });
    }
  }

  if (report.chapters.length > 0) {
    report.tags.push({
      group: 'Chapters & Subtitles',
      name: 'Chapters',
      value: `${report.chapters.length} chapter markers embedded`,
      isSensitive: false,
    });
  }
}

/**
 * Basic EBML parser for WebM and Matroska (MKV).
 */
function parseEbml(bytes: Uint8Array, report: VideoMetadataReport): void {
  const text = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 32768)));

  // Extract MuxingApp
  const muxMatch = text.match(/Lavf[\w.]+|HandBrake[\w.]+|MKVToolNix[\w.]+/i);
  if (muxMatch) {
    report.encoder = muxMatch[0];
    report.software = muxMatch[0];
    report.tags.push({
      group: 'Encoder & Software',
      name: 'Muxing Application',
      value: muxMatch[0],
      isSensitive: false,
    });
  }

  // Detect codecs
  if (text.includes('V_MPEG4/ISO/AVC')) report.videoCodec = 'H.264 / AVC';
  else if (text.includes('V_VP9')) report.videoCodec = 'VP9';
  else if (text.includes('V_VP8')) report.videoCodec = 'VP8';
  else if (text.includes('V_AV1')) report.videoCodec = 'AV1';

  if (text.includes('A_OPUS')) {
    report.audioCodec = 'Opus';
    report.hasAudio = true;
  } else if (text.includes('A_VORBIS')) {
    report.audioCodec = 'Vorbis';
    report.hasAudio = true;
  } else if (text.includes('A_AAC')) {
    report.audioCodec = 'AAC';
    report.hasAudio = true;
  }
}

function mapCodecName(fourcc: string): string {
  const code = fourcc.toLowerCase().trim();
  switch (code) {
    case 'avc1':
    case 'avc3':
      return 'H.264 / AVC';
    case 'hvc1':
    case 'hev1':
      return 'H.265 / HEVC';
    case 'vp09':
    case 'vp9':
      return 'VP9';
    case 'av01':
      return 'AV1';
    case 'mp4v':
      return 'MPEG-4 Visual';
    case 'mp4a':
      return 'AAC Audio';
    case 'opus':
      return 'Opus Audio';
    case 'ac-3':
      return 'Dolby AC-3';
    case 'alac':
      return 'Apple Lossless (ALAC)';
    case 'apcn':
    case 'apch':
    case 'apco':
      return 'Apple ProRes';
    default:
      return fourcc.toUpperCase();
  }
}

function calculatePrivacyRisk(report: VideoMetadataReport): void {
  report.rawTagCount = report.tags.length;

  if (report.hasGps || report.cameraModel) {
    report.privacyRiskLevel = 'HIGH';
  } else if (report.creationDate || report.cameraMake || report.software) {
    report.privacyRiskLevel = 'MEDIUM';
  } else if (report.tags.some(t => t.isSensitive)) {
    report.privacyRiskLevel = 'LOW';
  } else {
    report.privacyRiskLevel = 'CLEAN';
  }
}

function compileInspectionStatus(report: VideoMetadataReport): void {
  const found = new Set<string>();
  const notFound: string[] = [];

  if (report.hasGps) found.add('GPS Geolocation Coordinates');
  else notFound.push('GPS Location Coordinates');

  if (report.cameraModel || report.cameraMake) found.add('Camera & Device Identifiers');
  else notFound.push('Camera & Device Identifiers');

  if (report.creationDate || report.modificationDate) found.add('Container Creation Timestamps');
  else notFound.push('Creation Timestamps');

  if (report.software || report.encoder) found.add('Encoder & Software Metadata');
  else notFound.push('Encoder Application Signature');

  if (report.chapters.length > 0) found.add('Embedded Chapter Titles');
  else notFound.push('Embedded Chapter Markers');

  if (report.tracks.length > 0) found.add('Technical Media Streams (Audio/Video)');

  report.inspectionStatus.foundCategories = Array.from(found);
  report.inspectionStatus.notFoundCategories = notFound;

  if (report.containerFormat === 'mkv' || report.containerFormat === 'avi') {
    report.inspectionStatus.unsupportedItems.push('Proprietary vendor EXIF tags inside AVI/MKV video streams are uninspected.');
  }
}
