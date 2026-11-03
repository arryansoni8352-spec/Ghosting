/**
 * GHOSTING Video Processing Engine
 *
 * Client-side video editing, watermarking, trimming, cropping, rotation,
 * compression, and conversion using HTML5 Canvas, Web Audio, and MediaRecorder.
 *
 * 100% private and in-browser: zero network calls, zero server processing.
 */

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface TextWatermarkConfig {
  enabled: boolean;
  text: string;
  fontSize: number; // e.g. 24, 32, 48
  color: string; // e.g. '#FFFFFF', '#11181C', '#80E5D8'
  opacity: number; // 0.1 to 1.0
  position: WatermarkPosition;
  margin: number; // margin in px
  hasBackgroundPill: boolean;
  pillColor: string; // e.g. 'rgba(0,0,0,0.45)'
}

export interface ImageWatermarkConfig {
  enabled: boolean;
  imageElement?: HTMLImageElement | null;
  imageBlobUrl?: string;
  scalePercent: number; // e.g. 15 = 15% of video width
  opacity: number; // 0.1 to 1.0
  position: WatermarkPosition;
  margin: number;
}

export type AspectRatioPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:5';
export type ResolutionPreset = 'original' | '1080p' | '720p' | '480p';
export type CompressionPreset = 'original' | 'high' | 'balanced' | 'smaller';
export type OutputFormatPreset = 'mp4' | 'webm';

export interface VideoEditOptions {
  trimEnabled: boolean;
  startTime: number; // in seconds
  endTime: number; // in seconds
  cropPreset: AspectRatioPreset;
  rotationDegrees: 0 | 90 | 180 | 270;
  resolutionPreset: ResolutionPreset;
  compressionPreset: CompressionPreset;
  outputFormat: OutputFormatPreset;
  textWatermark: TextWatermarkConfig;
  imageWatermark: ImageWatermarkConfig;
}

export interface VideoProcessProgress {
  percent: number; // 0 - 100
  phase: string;
  currentTimeSeconds: number;
  totalTimeSeconds: number;
}

export interface ProcessedVideoResult {
  file: File;
  objectUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  durationMs: number;
}

export const DEFAULT_TEXT_WATERMARK: TextWatermarkConfig = {
  enabled: false,
  text: 'GHOSTING',
  fontSize: 28,
  color: '#FFFFFF',
  opacity: 0.85,
  position: 'bottom-right',
  margin: 32,
  hasBackgroundPill: true,
  pillColor: 'rgba(17, 24, 28, 0.65)',
};

export const DEFAULT_IMAGE_WATERMARK: ImageWatermarkConfig = {
  enabled: false,
  imageElement: null,
  scalePercent: 12,
  opacity: 0.85,
  position: 'top-right',
  margin: 32,
};

export const DEFAULT_EDIT_OPTIONS: VideoEditOptions = {
  trimEnabled: false,
  startTime: 0,
  endTime: 0,
  cropPreset: 'original',
  rotationDegrees: 0,
  resolutionPreset: 'original',
  compressionPreset: 'balanced',
  outputFormat: 'mp4',
  textWatermark: { ...DEFAULT_TEXT_WATERMARK },
  imageWatermark: { ...DEFAULT_IMAGE_WATERMARK },
};

/**
 * Calculate target render dimensions based on resolution, crop aspect ratio, and rotation.
 */
export function calculateTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  cropPreset: AspectRatioPreset,
  rotation: 0 | 90 | 180 | 270,
  resolutionPreset: ResolutionPreset
): {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
} {
  // 1. Calculate crop box from source
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (cropPreset === '16:9') {
    const targetAspect = 16 / 9;
    if (sourceWidth / sourceHeight > targetAspect) {
      cropWidth = Math.round(sourceHeight * targetAspect);
    } else {
      cropHeight = Math.round(sourceWidth / targetAspect);
    }
  } else if (cropPreset === '9:16') {
    const targetAspect = 9 / 16;
    if (sourceWidth / sourceHeight > targetAspect) {
      cropWidth = Math.round(sourceHeight * targetAspect);
    } else {
      cropHeight = Math.round(sourceWidth / targetAspect);
    }
  } else if (cropPreset === '1:1') {
    const minDim = Math.min(sourceWidth, sourceHeight);
    cropWidth = minDim;
    cropHeight = minDim;
  } else if (cropPreset === '4:5') {
    const targetAspect = 4 / 5;
    if (sourceWidth / sourceHeight > targetAspect) {
      cropWidth = Math.round(sourceHeight * targetAspect);
    } else {
      cropHeight = Math.round(sourceWidth / targetAspect);
    }
  }

  const cropX = Math.round((sourceWidth - cropWidth) / 2);
  const cropY = Math.round((sourceHeight - cropHeight) / 2);

  // 2. Account for rotation (swap width & height for 90 or 270 deg)
  const isRotated = rotation === 90 || rotation === 270;
  let preScaleW = isRotated ? cropHeight : cropWidth;
  let preScaleH = isRotated ? cropWidth : cropHeight;

  // 3. Apply resolution preset limits
  let maxDim = Infinity;
  if (resolutionPreset === '1080p') maxDim = 1920;
  else if (resolutionPreset === '720p') maxDim = 1280;
  else if (resolutionPreset === '480p') maxDim = 854;

  let outputWidth = preScaleW;
  let outputHeight = preScaleH;

  const currentMax = Math.max(preScaleW, preScaleH);
  if (currentMax > maxDim) {
    const scale = maxDim / currentMax;
    outputWidth = Math.round(preScaleW * scale);
    outputHeight = Math.round(preScaleH * scale);
  }

  // Ensure even dimensions (required for H.264 video encoding)
  outputWidth = outputWidth % 2 === 0 ? outputWidth : outputWidth - 1;
  outputHeight = outputHeight % 2 === 0 ? outputHeight : outputHeight - 1;

  return {
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    outputWidth: Math.max(outputWidth, 64),
    outputHeight: Math.max(outputHeight, 64),
  };
}

/**
 * Determine supported mimeType for MediaRecorder in current browser.
 */
export function getSupportedRecorderMimeType(desiredFormat: OutputFormatPreset): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';

  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,aac',
    'video/mp4',
  ];

  const webmTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  const preferred = desiredFormat === 'mp4' ? [...mp4Types, ...webmTypes] : [...webmTypes, ...mp4Types];

  for (const t of preferred) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }

  return 'video/webm';
}

/**
 * Get target bitrate in bits/sec based on preset and dimensions.
 */
export function getTargetBitrate(preset: CompressionPreset, width: number, height: number): number {
  const pixelCount = width * height;
  const is1080pOrHigher = pixelCount >= 1920 * 1080;
  const is720p = pixelCount >= 1280 * 720;

  switch (preset) {
    case 'original':
      return is1080pOrHigher ? 8_000_000 : is720p ? 4_500_000 : 2_000_000;
    case 'high':
      return is1080pOrHigher ? 5_000_000 : is720p ? 3_000_000 : 1_500_000;
    case 'balanced':
      return is1080pOrHigher ? 2_500_000 : is720p ? 1_500_000 : 900_000;
    case 'smaller':
      return is1080pOrHigher ? 1_200_000 : is720p ? 800_000 : 500_000;
  }
}

/**
 * Render watermarks directly onto a 2D canvas context.
 */
export function renderWatermarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  textConfig: TextWatermarkConfig,
  imageConfig: ImageWatermarkConfig
): void {
  // 1. Text Watermark
  if (textConfig.enabled && textConfig.text.trim()) {
    ctx.save();
    ctx.globalAlpha = textConfig.opacity;
    ctx.font = `600 ${textConfig.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(textConfig.text);
    const textW = metrics.width;
    const textH = textConfig.fontSize;
    const paddingX = 14;
    const paddingY = 8;
    const pillW = textW + paddingX * 2;
    const pillH = textH + paddingY * 2;

    const { x, y } = computeWatermarkCoordinates(
      width,
      height,
      pillW,
      pillH,
      textConfig.position,
      textConfig.margin
    );

    if (textConfig.hasBackgroundPill) {
      ctx.fillStyle = textConfig.pillColor || 'rgba(17, 24, 28, 0.65)';
      ctx.beginPath();
      // Draw rounded rectangle pill
      const r = Math.min(pillH / 2, 8);
      ctx.roundRect(x, y, pillW, pillH, r);
      ctx.fill();
    }

    ctx.fillStyle = textConfig.color || '#FFFFFF';
    ctx.fillText(textConfig.text, x + paddingX, y + pillH / 2);
    ctx.restore();
  }

  // 2. Image Watermark
  if (imageConfig.enabled && imageConfig.imageElement) {
    ctx.save();
    ctx.globalAlpha = imageConfig.opacity;

    const img = imageConfig.imageElement;
    const targetW = (width * imageConfig.scalePercent) / 100;
    const aspect = img.naturalHeight / img.naturalWidth || 1;
    const targetH = targetW * aspect;

    const { x, y } = computeWatermarkCoordinates(
      width,
      height,
      targetW,
      targetH,
      imageConfig.position,
      imageConfig.margin
    );

    ctx.drawImage(img, x, y, targetW, targetH);
    ctx.restore();
  }
}

function computeWatermarkCoordinates(
  canvasW: number,
  canvasH: number,
  itemW: number,
  itemH: number,
  position: WatermarkPosition,
  margin: number
): { x: number; y: number } {
  let x = margin;
  let y = margin;

  switch (position) {
    case 'top-left':
      x = margin;
      y = margin;
      break;
    case 'top-center':
      x = (canvasW - itemW) / 2;
      y = margin;
      break;
    case 'top-right':
      x = canvasW - itemW - margin;
      y = margin;
      break;
    case 'middle-left':
      x = margin;
      y = (canvasH - itemH) / 2;
      break;
    case 'center':
      x = (canvasW - itemW) / 2;
      y = (canvasH - itemH) / 2;
      break;
    case 'middle-right':
      x = canvasW - itemW - margin;
      y = (canvasH - itemH) / 2;
      break;
    case 'bottom-left':
      x = margin;
      y = canvasH - itemH - margin;
      break;
    case 'bottom-center':
      x = (canvasW - itemW) / 2;
      y = canvasH - itemH - margin;
      break;
    case 'bottom-right':
      x = canvasW - itemW - margin;
      y = canvasH - itemH - margin;
      break;
  }

  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/**
 * Execute client-side video processing job.
 */
export async function processVideo(
  sourceFile: File,
  options: VideoEditOptions,
  onProgress?: (progress: VideoProcessProgress) => void,
  abortSignal?: AbortSignal
): Promise<ProcessedVideoResult> {
  const startTimeMs = performance.now();

  const objectUrl = URL.createObjectURL(sourceFile);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;

  // Wait for metadata
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video element.'));
  });

  const totalDuration = video.duration || 1;
  const startSec = options.trimEnabled ? Math.max(0, options.startTime) : 0;
  const endSec = options.trimEnabled && options.endTime > startSec
    ? Math.min(totalDuration, options.endTime)
    : totalDuration;
  const segmentDuration = endSec - startSec;

  // Calculate dimensions
  const dims = calculateTargetDimensions(
    video.videoWidth || 1280,
    video.videoHeight || 720,
    options.cropPreset,
    options.rotationDegrees,
    options.resolutionPreset
  );

  const canvas = document.createElement('canvas');
  canvas.width = dims.outputWidth;
  canvas.height = dims.outputHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Canvas 2D context creation failed.');
  }

  // Setup media recorder stream
  const fps = 30;
  const stream = canvas.captureStream(fps);

  // Optional: Connect audio if available
  let audioContext: AudioContext | null = null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      const sourceNode = audioContext.createMediaElementSource(video);
      const destNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destNode);
      sourceNode.connect(audioContext.destination);
      destNode.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
  } catch {
    // Some browsers restrict MediaElementAudioSourceNode on cross-origin or certain blob streams, proceed with video stream
  }

  const mimeType = getSupportedRecorderMimeType(options.outputFormat);
  const bitrate = getTargetBitrate(options.compressionPreset, dims.outputWidth, dims.outputHeight);

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  const recordedChunks: Blob[] = [];
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  return new Promise<ProcessedVideoResult>((resolve, reject) => {
    let isCancelled = false;
    let animId = 0;

    const cleanup = () => {
      cancelAnimationFrame(animId);
      video.pause();
      video.src = '';
      stream.getTracks().forEach(t => t.stop());
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
      URL.revokeObjectURL(objectUrl);
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        isCancelled = true;
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        cleanup();
        reject(new Error('Video processing was cancelled by user.'));
      });
    }

    mediaRecorder.onstop = () => {
      cleanup();
      if (isCancelled) return;

      const outputBlob = new Blob(recordedChunks, { type: mimeType });
      const ext = options.outputFormat === 'mp4' && mimeType.includes('mp4') ? 'mp4' : 'webm';
      const outName = generateEditedVideoFileName(sourceFile.name, ext);
      const outFile = new File([outputBlob], outName, {
        type: outputBlob.type,
        lastModified: Date.now(),
      });
      const outUrl = URL.createObjectURL(outFile);

      resolve({
        file: outFile,
        objectUrl: outUrl,
        durationSeconds: segmentDuration,
        width: dims.outputWidth,
        height: dims.outputHeight,
        sizeBytes: outFile.size,
        format: ext.toUpperCase(),
        durationMs: Math.round(performance.now() - startTimeMs),
      });
    };

    mediaRecorder.onerror = err => {
      cleanup();
      reject(err);
    };

    // Seek to start position
    video.currentTime = startSec;

    video.onseeked = () => {
      video.onseeked = null;
      if (isCancelled) return;

      mediaRecorder.start(250); // Record chunks every 250ms
      video.play().catch(reject);

      const renderFrame = () => {
        if (isCancelled) return;

        const currentSec = video.currentTime;
        const progressTime = Math.max(0, currentSec - startSec);
        const percent = Math.min(100, Math.round((progressTime / segmentDuration) * 100));

        if (onProgress) {
          onProgress({
            percent,
            phase: 'Rendering & Encoding Video Frames',
            currentTimeSeconds: currentSec,
            totalTimeSeconds: segmentDuration,
          });
        }

        // Draw transformed frame
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, dims.outputWidth, dims.outputHeight);

        // Apply rotation
        if (options.rotationDegrees !== 0) {
          ctx.translate(dims.outputWidth / 2, dims.outputHeight / 2);
          ctx.rotate((options.rotationDegrees * Math.PI) / 180);
          const isSwap = options.rotationDegrees === 90 || options.rotationDegrees === 270;
          const drawW = isSwap ? dims.outputHeight : dims.outputWidth;
          const drawH = isSwap ? dims.outputWidth : dims.outputHeight;
          ctx.drawImage(
            video,
            dims.cropX,
            dims.cropY,
            dims.cropWidth,
            dims.cropHeight,
            -drawW / 2,
            -drawH / 2,
            drawW,
            drawH
          );
        } else {
          ctx.drawImage(
            video,
            dims.cropX,
            dims.cropY,
            dims.cropWidth,
            dims.cropHeight,
            0,
            0,
            dims.outputWidth,
            dims.outputHeight
          );
        }
        ctx.restore();

        // Overlay watermarks
        renderWatermarksOnCanvas(
          ctx,
          dims.outputWidth,
          dims.outputHeight,
          options.textWatermark,
          options.imageWatermark
        );

        // Check if finished
        if (currentSec >= endSec || video.ended) {
          if (onProgress) {
            onProgress({
              percent: 100,
              phase: 'Finalizing Video File',
              currentTimeSeconds: segmentDuration,
              totalTimeSeconds: segmentDuration,
            });
          }
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          return;
        }

        animId = requestAnimationFrame(renderFrame);
      };

      animId = requestAnimationFrame(renderFrame);
    };
  });
}

export function generateEditedVideoFileName(originalName: string, ext: string): string {
  const lastDot = originalName.lastIndexOf('.');
  const base = lastDot === -1 ? originalName : originalName.substring(0, lastDot);
  return `${base}-protected.${ext}`;
}
