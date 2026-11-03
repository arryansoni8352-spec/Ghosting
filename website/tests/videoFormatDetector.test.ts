import { describe, it, expect } from 'vitest';
import {
  detectVideoContainer,
  formatVideoFileSize,
  formatVideoDuration,
  validateVideoFile,
} from '../src/utils/videoFormatDetector';

describe('videoFormatDetector', () => {
  describe('formatVideoFileSize', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatVideoFileSize(0)).toBe('0 B');
    });

    it('formats kilobytes correctly', () => {
      expect(formatVideoFileSize(1024)).toBe('1.0 KB');
      expect(formatVideoFileSize(50 * 1024)).toBe('50.0 KB');
    });

    it('formats megabytes and gigabytes correctly', () => {
      expect(formatVideoFileSize(15.5 * 1024 * 1024)).toBe('15.5 MB');
      expect(formatVideoFileSize(2.4 * 1024 * 1024 * 1024)).toBe('2.4 GB');
    });
  });

  describe('formatVideoDuration', () => {
    it('formats seconds into mm:ss', () => {
      expect(formatVideoDuration(0)).toBe('0:00');
      expect(formatVideoDuration(45)).toBe('0:45');
      expect(formatVideoDuration(125)).toBe('2:05');
    });

    it('formats hours into hh:mm:ss', () => {
      expect(formatVideoDuration(3665)).toBe('1:01:05');
      expect(formatVideoDuration(7200)).toBe('2:00:00');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatVideoDuration(-10)).toBe('0:00');
      expect(formatVideoDuration(NaN)).toBe('0:00');
    });
  });

  describe('detectVideoContainer', () => {
    it('detects MP4 from ftyp box', () => {
      const header = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, // size 32
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x69, 0x73, 0x6f, 0x6d, // 'isom'
      ]);
      expect(detectVideoContainer(header, 'sample.mp4')).toBe('mp4');
    });

    it('detects MOV from QuickTime brand or moov box', () => {
      const header = new Uint8Array([
        0x00, 0x00, 0x00, 0x20,
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x71, 0x74, 0x20, 0x20, // 'qt  '
      ]);
      expect(detectVideoContainer(header, 'sample.mov')).toBe('mov');
    });

    it('detects WebM from EBML header', () => {
      // 0x1A 0x45 0xDF 0xA3 followed by 'webm' DocType
      const header = new Uint8Array(64);
      header[0] = 0x1a;
      header[1] = 0x45;
      header[2] = 0xdf;
      header[3] = 0xa3;
      const webmStr = '...webm...';
      for (let i = 0; i < webmStr.length; i++) {
        header[10 + i] = webmStr.charCodeAt(i);
      }
      expect(detectVideoContainer(header, 'sample.webm')).toBe('webm');
    });

    it('detects MKV from EBML header with matroska DocType', () => {
      const header = new Uint8Array(64);
      header[0] = 0x1a;
      header[1] = 0x45;
      header[2] = 0xdf;
      header[3] = 0xa3;
      const mkvStr = '...matroska...';
      for (let i = 0; i < mkvStr.length; i++) {
        header[10 + i] = mkvStr.charCodeAt(i);
      }
      expect(detectVideoContainer(header, 'sample.mkv')).toBe('mkv');
    });

    it('detects AVI from RIFF header', () => {
      const header = new Uint8Array(16);
      header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46; // 'RIFF'
      header[8] = 0x41; header[9] = 0x56; header[10] = 0x49; header[11] = 0x20; // 'AVI '
      expect(detectVideoContainer(header, 'sample.avi')).toBe('avi');
    });

    it('falls back to file extension when header is short', () => {
      const shortHeader = new Uint8Array([0x00, 0x01]);
      expect(detectVideoContainer(shortHeader, 'clip.mp4')).toBe('mp4');
      expect(detectVideoContainer(shortHeader, 'video.mov')).toBe('mov');
      expect(detectVideoContainer(shortHeader, 'stream.webm')).toBe('webm');
      expect(detectVideoContainer(shortHeader, 'unknown.xyz')).toBe('unknown');
    });
  });

  describe('validateVideoFile', () => {
    it('rejects empty files (0 bytes)', async () => {
      const emptyFile = new File([], 'empty.mp4', { type: 'video/mp4' });
      const result = await validateVideoFile(emptyFile);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/empty/i);
    });

    it('rejects unsupported file formats', async () => {
      const textFile = new File(['hello world text data'], 'doc.txt', { type: 'text/plain' });
      const result = await validateVideoFile(textFile);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unsupported/i);
    });

    it('validates valid MP4 file successfully', async () => {
      const mp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20,
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x69, 0x73, 0x6f, 0x6d,
        0x00, 0x00, 0x02, 0x00,
        0x6d, 0x70, 0x34, 0x31,
      ]);
      const validMp4 = new File([mp4Bytes], 'test-video.mp4', { type: 'video/mp4' });
      const result = await validateVideoFile(validMp4);
      expect(result.valid).toBe(true);
      expect(result.formatInfo?.format).toBe('mp4');
      expect(result.formatInfo?.canStripMetadata).toBe(true);
    });

    it('shows memory warning for large files', async () => {
      const mp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20,
        0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d,
      ]);
      const largeFile = new File([mp4Bytes], 'huge.mp4', { type: 'video/mp4' });
      // Mock large size
      Object.defineProperty(largeFile, 'size', { value: 400 * 1024 * 1024 });

      const result = await validateVideoFile(largeFile);
      expect(result.valid).toBe(true);
      expect(result.sizeWarning).toBeDefined();
      expect(result.sizeWarning).toMatch(/400.0 MB/);
    });
  });
});
