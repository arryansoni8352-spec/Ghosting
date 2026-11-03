/**
 * GHOSTING Video Format Detector & Validator
 *
 * Client-side container detection, magic byte validation, and video file property extraction.
 * Supports MP4, MOV, WebM, MKV, AVI.
 */

export type VideoContainerFormat = 'mp4' | 'mov' | 'webm' | 'mkv' | 'avi' | 'unknown';

export interface VideoFormatInfo {
  format: VideoContainerFormat;
  mimeType: string;
  label: string;
  isSupported: boolean;
  canPlayInBrowser: boolean;
  canStripMetadata: boolean;
  canEditInBrowser: boolean;
}

export interface VideoFileValidation {
  valid: boolean;
  error?: string;
  formatInfo?: VideoFormatInfo;
  fileSizeFormatted: string;
  sizeWarning?: string;
}

// Maximum recommended file size for pure in-memory browser canvas processing (1.5 GB)
export const MAX_SAFE_FILE_SIZE_BYTES = 1.5 * 1024 * 1024 * 1024;
// Recommended soft threshold where browser memory warning is shown (350 MB)
export const MEMORY_WARNING_THRESHOLD_BYTES = 350 * 1024 * 1024;

export const SUPPORTED_VIDEO_FORMATS: Record<VideoContainerFormat, VideoFormatInfo> = {
  mp4: {
    format: 'mp4',
    mimeType: 'video/mp4',
    label: 'MPEG-4 Part 14 (.mp4)',
    isSupported: true,
    canPlayInBrowser: true,
    canStripMetadata: true,
    canEditInBrowser: true,
  },
  mov: {
    format: 'mov',
    mimeType: 'video/quicktime',
    label: 'Apple QuickTime (.mov)',
    isSupported: true,
    canPlayInBrowser: true,
    canStripMetadata: true,
    canEditInBrowser: true,
  },
  webm: {
    format: 'webm',
    mimeType: 'video/webm',
    label: 'WebM Video (.webm)',
    isSupported: true,
    canPlayInBrowser: true,
    canStripMetadata: true,
    canEditInBrowser: true,
  },
  mkv: {
    format: 'mkv',
    mimeType: 'video/x-matroska',
    label: 'Matroska Video (.mkv)',
    isSupported: true,
    canPlayInBrowser: false, // Some browsers can play VP9/H264 in MKV, but generally needs remuxing
    canStripMetadata: true,
    canEditInBrowser: false,
  },
  avi: {
    format: 'avi',
    mimeType: 'video/x-msvideo',
    label: 'Audio Video Interleave (.avi)',
    isSupported: true,
    canPlayInBrowser: false,
    canStripMetadata: false,
    canEditInBrowser: false,
  },
  unknown: {
    format: 'unknown',
    mimeType: 'application/octet-stream',
    label: 'Unknown Container',
    isSupported: false,
    canPlayInBrowser: false,
    canStripMetadata: false,
    canEditInBrowser: false,
  },
};

/**
 * Format bytes into human-readable string (B, KB, MB, GB).
 */
export function formatVideoFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format seconds into mm:ss or hh:mm:ss.
 */
export function formatVideoDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Detect video container format from initial bytes (header magic numbers).
 */
export function detectVideoContainer(headerBytes: Uint8Array, fileName: string = ''): VideoContainerFormat {
  if (!headerBytes || headerBytes.length < 12) {
    // Fall back to filename extension if bytes insufficient
    return detectFormatFromExtension(fileName);
  }

  // 1. MP4 / MOV (ISOBMFF): Box starting with [size 4B][ftyp 4B]
  // Box type at offset 4 must be 'ftyp' or 'moov' or 'mdat' or 'wide'
  const tag4 = String.fromCharCode(headerBytes[4], headerBytes[5], headerBytes[6], headerBytes[7]);
  if (tag4 === 'ftyp') {
    // Check major brand at offset 8-12
    const brand = String.fromCharCode(headerBytes[8], headerBytes[9], headerBytes[10], headerBytes[11]).toLowerCase();
    if (brand === 'qt  ' || brand === 'moov') {
      return 'mov';
    }
    return 'mp4';
  }

  // QuickTime movie without ftyp (starts with 'moov' or 'wide' or 'mdat' directly)
  if (tag4 === 'moov' || tag4 === 'wide' || tag4 === 'mdat') {
    return 'mov';
  }

  // 2. EBML (WebM or Matroska): Header starts with 0x1A 0x45 0xDF 0xA3
  if (
    headerBytes[0] === 0x1a &&
    headerBytes[1] === 0x45 &&
    headerBytes[2] === 0xdf &&
    headerBytes[3] === 0xa3
  ) {
    // Search first 128 bytes for 'webm' or 'matroska' DocType string
    const sample = new TextDecoder('latin1').decode(headerBytes.slice(0, Math.min(headerBytes.length, 128)));
    if (sample.includes('webm')) {
      return 'webm';
    }
    if (sample.includes('matroska')) {
      return 'mkv';
    }
    // Infer from filename extension if both are EBML
    const extFormat = detectFormatFromExtension(fileName);
    return extFormat === 'webm' || extFormat === 'mkv' ? extFormat : 'webm';
  }

  // 3. AVI (RIFF ... AVI ): Starts with 'RIFF' and at offset 8 has 'AVI '
  const riff = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
  const avi = String.fromCharCode(headerBytes[8], headerBytes[9], headerBytes[10], headerBytes[11]);
  if (riff === 'RIFF' && avi === 'AVI ') {
    return 'avi';
  }

  // Fallback to filename extension
  return detectFormatFromExtension(fileName);
}

function detectFormatFromExtension(fileName: string): VideoContainerFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'mp4' || ext === 'm4v') return 'mp4';
  if (ext === 'mov') return 'mov';
  if (ext === 'webm') return 'webm';
  if (ext === 'mkv') return 'mkv';
  if (ext === 'avi') return 'avi';
  return 'unknown';
}

/**
 * Validate user-uploaded video file against supported formats and memory limits.
 */
export async function validateVideoFile(file: File): Promise<VideoFileValidation> {
  if (!file) {
    return {
      valid: false,
      error: 'No file selected.',
      fileSizeFormatted: '0 B',
    };
  }

  const fileSizeFormatted = formatVideoFileSize(file.size);

  if (file.size === 0) {
    return {
      valid: false,
      error: 'The selected file is empty (0 bytes).',
      fileSizeFormatted,
    };
  }

  if (file.size > MAX_SAFE_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${fileSizeFormatted}) exceeds the browser client-side safety limit of 1.5 GB. Processing this file in-memory may crash the browser tab.`,
      fileSizeFormatted,
    };
  }

  // Read first 256 bytes for container header magic detection
  let headerBytes: Uint8Array;
  try {
    const slice = file.slice(0, 256);
    const buffer = await slice.arrayBuffer();
    headerBytes = new Uint8Array(buffer);
  } catch (err) {
    return {
      valid: false,
      error: 'Failed to read video file header. Please try selecting the file again.',
      fileSizeFormatted,
    };
  }

  const container = detectVideoContainer(headerBytes, file.name);
  const formatInfo = SUPPORTED_VIDEO_FORMATS[container];

  if (!formatInfo || !formatInfo.isSupported) {
    return {
      valid: false,
      error: `Unsupported file format. GHOSTING Video Suite supports MP4, MOV, WebM, MKV, and AVI.`,
      fileSizeFormatted,
      formatInfo,
    };
  }

  let sizeWarning: string | undefined;
  if (file.size > MEMORY_WARNING_THRESHOLD_BYTES) {
    sizeWarning = `This video is ${fileSizeFormatted}. Processing large videos in the browser may take a moment depending on your device's memory.`;
  }

  return {
    valid: true,
    formatInfo,
    fileSizeFormatted,
    sizeWarning,
  };
}

/**
 * Read basic HTML5 video element metrics (duration, resolution).
 */
export function extractHtml5VideoMetrics(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  videoElement: HTMLVideoElement;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve({
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        videoElement: video,
        objectUrl,
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Browser could not decode video stream. The video codec may not be natively supported by your browser.'));
    };

    video.src = objectUrl;
  });
}
