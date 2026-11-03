import { describe, it, expect, vi } from 'vitest';
import {
  calculateTargetDimensions,
  getTargetBitrate,
  renderWatermarksOnCanvas,
  generateEditedVideoFileName,
  DEFAULT_TEXT_WATERMARK,
  DEFAULT_IMAGE_WATERMARK,
} from '../src/utils/videoProcessor';

describe('videoProcessor', () => {
  describe('calculateTargetDimensions', () => {
    it('preserves dimensions for original crop and resolution', () => {
      const dims = calculateTargetDimensions(1920, 1080, 'original', 0, 'original');
      expect(dims.outputWidth).toBe(1920);
      expect(dims.outputHeight).toBe(1080);
      expect(dims.cropX).toBe(0);
      expect(dims.cropY).toBe(0);
    });

    it('crops to 1:1 square aspect ratio correctly', () => {
      const dims = calculateTargetDimensions(1920, 1080, '1:1', 0, 'original');
      expect(dims.cropWidth).toBe(1080);
      expect(dims.cropHeight).toBe(1080);
      expect(dims.cropX).toBe((1920 - 1080) / 2);
      expect(dims.cropY).toBe(0);
      expect(dims.outputWidth).toBe(1080);
      expect(dims.outputHeight).toBe(1080);
    });

    it('crops to 9:16 vertical video correctly', () => {
      const dims = calculateTargetDimensions(1920, 1080, '9:16', 0, 'original');
      const targetW = Math.round(1080 * (9 / 16));
      expect(dims.cropWidth).toBe(targetW);
      expect(dims.cropHeight).toBe(1080);
      expect(dims.cropX).toBe(Math.round((1920 - targetW) / 2));
    });

    it('scales down to 720p resolution preset', () => {
      const dims = calculateTargetDimensions(3840, 2160, 'original', 0, '720p');
      expect(dims.outputWidth).toBe(1280);
      expect(dims.outputHeight).toBe(720);
    });

    it('swaps width and height when rotated 90 or 270 degrees', () => {
      const dims90 = calculateTargetDimensions(1920, 1080, 'original', 90, 'original');
      expect(dims90.outputWidth).toBe(1080);
      expect(dims90.outputHeight).toBe(1920);

      const dims180 = calculateTargetDimensions(1920, 1080, 'original', 180, 'original');
      expect(dims180.outputWidth).toBe(1920);
      expect(dims180.outputHeight).toBe(1080);
    });

    it('always outputs even dimensions for video encoding compatibility', () => {
      const dims = calculateTargetDimensions(1921, 1081, 'original', 0, 'original');
      expect(dims.outputWidth % 2).toBe(0);
      expect(dims.outputHeight % 2).toBe(0);
    });
  });

  describe('getTargetBitrate', () => {
    it('returns higher bitrate for original preset and lower for smaller preset', () => {
      const originalRate = getTargetBitrate('original', 1920, 1080);
      const balancedRate = getTargetBitrate('balanced', 1920, 1080);
      const smallerRate = getTargetBitrate('smaller', 1920, 1080);

      expect(originalRate).toBeGreaterThan(balancedRate);
      expect(balancedRate).toBeGreaterThan(smallerRate);
    });
  });

  describe('generateEditedVideoFileName', () => {
    it('appends -protected and uses specified output extension', () => {
      expect(generateEditedVideoFileName('clip.mp4', 'mp4')).toBe('clip-protected.mp4');
      expect(generateEditedVideoFileName('clip.mp4', 'webm')).toBe('clip-protected.webm');
      expect(generateEditedVideoFileName('my.vacation.video.mov', 'mp4')).toBe('my.vacation.video-protected.mp4');
    });
  });

  describe('renderWatermarksOnCanvas', () => {
    it('renders text watermark with pill background when enabled', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn(() => ({ width: 120 })),
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

      const textWatermark = {
        ...DEFAULT_TEXT_WATERMARK,
        enabled: true,
        text: 'CONFIDENTIAL',
        fontSize: 32,
        hasBackgroundPill: true,
      };

      renderWatermarksOnCanvas(mockCtx, 1280, 720, textWatermark, DEFAULT_IMAGE_WATERMARK);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalledWith(
        'CONFIDENTIAL',
        expect.any(Number),
        expect.any(Number)
      );
      expect(mockCtx.roundRect).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('does not draw when watermark is disabled', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn(),
        fillText: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      renderWatermarksOnCanvas(mockCtx, 1280, 720, DEFAULT_TEXT_WATERMARK, DEFAULT_IMAGE_WATERMARK);

      expect(mockCtx.fillText).not.toHaveBeenCalled();
    });
  });
});
