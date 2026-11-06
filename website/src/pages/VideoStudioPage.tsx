import React, { useState, useRef, useEffect, useId } from 'react';
import {
  UploadCloud,
  ShieldCheck,
  Eye,
  Trash2,
  Film,
  Stamp,
  Scissors,
  RotateCw,
  Crop,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Play,
  Pause,
  Sparkles,
  Lock,
  RefreshCw,
  FileText,
  Layers,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GhostMascot } from '../components/GhostLogo';
import {
  validateVideoFile,
  VideoFormatInfo,
  formatVideoFileSize,
  formatVideoDuration,
  extractHtml5VideoMetrics,
} from '../utils/videoFormatDetector';
import {
  VideoMetadataReport,
  inspectVideoMetadata,
} from '../utils/videoMetadataInspector';
import {
  cleanVideoMetadata,
  VideoCleanResult,
} from '../utils/videoMetadataStripper';
import {
  VideoEditOptions,
  DEFAULT_EDIT_OPTIONS,
  processVideo,
  ProcessedVideoResult,
  VideoProcessProgress,
  WatermarkPosition,
  AspectRatioPreset,
  CompressionPreset,
  OutputFormatPreset,
} from '../utils/videoProcessor';

export type VideoStudioTab = 'inspector' | 'watermark' | 'editor';

export const VideoStudioPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formatInfo, setFormatInfo] = useState<VideoFormatInfo | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoMetrics, setVideoMetrics] = useState<{ duration: number; width: number; height: number } | null>(null);

  // Inspection & Cleaning state
  const [isInspecting, setIsInspecting] = useState(false);
  const [metadataReport, setMetadataReport] = useState<VideoMetadataReport | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<VideoCleanResult | null>(null);
  // One blob URL per cleaned file, revoked when the result changes or the page unmounts
  const [cleanedDownloadUrl, setCleanedDownloadUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!cleanResult) {
      setCleanedDownloadUrl(null);
      return;
    }
    const url = URL.createObjectURL(cleanResult.cleanedFile);
    setCleanedDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cleanResult]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<VideoStudioTab>('inspector');

  // Video Editor & Watermark Configuration
  const [editOptions, setEditOptions] = useState<VideoEditOptions>({ ...DEFAULT_EDIT_OPTIONS });

  // Processing & Export State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<VideoProcessProgress | null>(null);
  const [processedResult, setProcessedResult] = useState<ProcessedVideoResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  // Player controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const videoFileInputId = useId();
  const logoWatermarkInputId = useId();

  // Handle file selection
  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setSizeWarning(null);
    setCleanResult(null);
    setProcessedResult(null);
    setMetadataReport(null);

    const validation = await validateVideoFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid file format.');
      return;
    }

    if (validation.sizeWarning) {
      setSizeWarning(validation.sizeWarning);
    }

    setSelectedFile(file);
    setFormatInfo(validation.formatInfo || null);

    // Extract HTML5 metrics and object URL
    try {
      const metrics = await extractHtml5VideoMetrics(file);
      setVideoObjectUrl(metrics.objectUrl);
      setVideoMetrics({
        duration: metrics.duration,
        width: metrics.width,
        height: metrics.height,
      });

      // Initialize trim bounds
      setEditOptions(prev => ({
        ...prev,
        startTime: 0,
        endTime: Math.round(metrics.duration),
      }));
    } catch {
      // In case HTML5 video can't decode (e.g. MKV or raw AVI), create basic blob URL
      const fallbackUrl = URL.createObjectURL(file);
      setVideoObjectUrl(fallbackUrl);
    }

    // Automatically inspect metadata
    setIsInspecting(true);
    try {
      const report = await inspectVideoMetadata(file);
      setMetadataReport(report);
    } catch {
      setErrorMessage('Failed to parse video container metadata.');
    } finally {
      setIsInspecting(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Perform lossless metadata cleaning
  const handleStripMetadata = async () => {
    if (!selectedFile) return;
    setIsCleaning(true);
    setErrorMessage(null);
    try {
      const res = await cleanVideoMetadata(selectedFile);
      setCleanResult(res);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to clean video metadata.');
    } finally {
      setIsCleaning(false);
    }
  };

  // Perform video editing / watermarking export
  const handleExportEditedVideo = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessedResult(null);

    abortControllerRef.current = new AbortController();

    try {
      const result = await processVideo(
        selectedFile,
        editOptions,
        progress => setProcessProgress(progress),
        abortControllerRef.current.signal
      );
      setProcessedResult(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('cancelled')) {
        setErrorMessage('Video processing cancelled.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Processing error occurred.');
      }
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
      if (processedResult?.objectUrl) URL.revokeObjectURL(processedResult.objectUrl);
    };
  }, [videoObjectUrl, processedResult]);

  // Video player toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  // Reset workspace
  const handleReset = () => {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    if (processedResult?.objectUrl) URL.revokeObjectURL(processedResult.objectUrl);
    setSelectedFile(null);
    setFormatInfo(null);
    setVideoObjectUrl(null);
    setVideoMetrics(null);
    setMetadataReport(null);
    setCleanResult(null);
    setProcessedResult(null);
    setErrorMessage(null);
    setSizeWarning(null);
    setEditOptions({ ...DEFAULT_EDIT_OPTIONS });
  };

  // Handle Logo Upload for Image Watermark
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        setEditOptions(prev => ({
          ...prev,
          imageWatermark: {
            ...prev.imageWatermark,
            enabled: true,
            imageElement: img,
            imageBlobUrl: url,
          },
        }));
      };
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12">
      {/* 1. HEADER */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 text-xs font-medium text-neutral-600 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-200">
          <GhostMascot size={14} />
          <span>Video Privacy & Protection Studio</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-neutral-900 tracking-tight leading-tight">
          Inspect, sanitize & protect your videos locally
        </h1>
        <p className="text-sm sm:text-base text-neutral-500 leading-relaxed max-w-xl mx-auto">
          Strip hidden GPS coordinates, camera serial numbers, and container timestamps.
          Add custom watermarks, trim, rotate, and compress—all 100% inside your browser.
        </p>

        {/* Guarantees Badges */}
        <div className="flex flex-wrap justify-center items-center gap-4 pt-2 text-xs text-neutral-600">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-neutral-900" />
            100% Client-Side
          </span>
          <span className="text-neutral-300">•</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-900" />
            Lossless Metadata Stripping
          </span>
          <span className="text-neutral-300">•</span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Zero Server Uploads
          </span>
        </div>
      </div>

      {/* ERROR / WARNING BANNERS */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">{errorMessage}</div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss error message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {sizeWarning && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-3 text-amber-800 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">{sizeWarning}</div>
          <button
            onClick={() => setSizeWarning(null)}
            className="text-amber-400 hover:text-amber-600"
            aria-label="Dismiss warning message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. UPLOAD ZONE (Shown when no file is selected) */}
      {!selectedFile && (
        <div
          onDragOver={e => e.preventDefault()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 sm:p-16 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-neutral-900 bg-neutral-50 scale-[1.01]'
              : 'border-neutral-200 hover:border-neutral-400 bg-neutral-50/50'
          }`}
        >
          <input
            id={videoFileInputId}
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.webm,.mkv,.avi"
            className="hidden"
            aria-label="Upload video file"
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleFile(e.target.files[0]);
              }
            }}
          />
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white border border-neutral-200 shadow-subtle flex items-center justify-center mx-auto text-neutral-900">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Drop your video here, or click to browse
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                Supports MP4, MOV, WebM, MKV, and AVI. Up to 1.5 GB.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-1.5">
              {['MP4', 'MOV', 'WebM', 'MKV', 'AVI'].map(ext => (
                <span
                  key={ext}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-neutral-200 text-neutral-600"
                >
                  .{ext.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIVE VIDEO WORKSPACE */}
      {selectedFile && (
        <div className="space-y-8">
          {/* Top Bar: File Details & Reset Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 rounded-lg bg-white border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-900">
                <Film className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="font-semibold text-neutral-900 text-sm truncate max-w-sm">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-neutral-500 flex items-center gap-2">
                  <span>{formatVideoFileSize(selectedFile.size)}</span>
                  <span>•</span>
                  <span>{formatInfo?.label || selectedFile.type || 'Video'}</span>
                  {videoMetrics && (
                    <>
                      <span>•</span>
                      <span>{formatVideoDuration(videoMetrics.duration)}</span>
                      <span>•</span>
                      <span>{videoMetrics.width}×{videoMetrics.height}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Change Video
            </button>
          </div>

          {/* Two-Column Studio Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT: Video Preview Player (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-lg aspect-video flex items-center justify-center">
                {videoObjectUrl ? (
                  <video
                    ref={videoRef}
                    src={videoObjectUrl}
                    className="w-full h-full object-contain"
                    onTimeUpdate={() => {
                      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                    }}
                    onEnded={() => setIsPlaying(false)}
                    playsInline
                  />
                ) : (
                  <div className="text-neutral-500 text-sm">Preview Unavailable</div>
                )}

                {/* Live Watermark Overlay Preview (When configured) */}
                {editOptions.textWatermark.enabled && editOptions.textWatermark.text && (
                  <div
                    style={{
                      opacity: editOptions.textWatermark.opacity,
                      color: editOptions.textWatermark.color,
                      fontSize: `${Math.max(12, Math.round(editOptions.textWatermark.fontSize * 0.5))}px`,
                      backgroundColor: editOptions.textWatermark.hasBackgroundPill ? editOptions.textWatermark.pillColor : 'transparent',
                    }}
                    className={`absolute pointer-events-none font-semibold ${
                      editOptions.textWatermark.hasBackgroundPill
                        ? 'px-3 py-1 rounded-md'
                        : ''
                    } ${
                      editOptions.textWatermark.position === 'top-left' ? 'top-4 left-4' :
                      editOptions.textWatermark.position === 'top-center' ? 'top-4 left-1/2 -translate-x-1/2' :
                      editOptions.textWatermark.position === 'top-right' ? 'top-4 right-4' :
                      editOptions.textWatermark.position === 'middle-left' ? 'top-1/2 -translate-y-1/2 left-4' :
                      editOptions.textWatermark.position === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                      editOptions.textWatermark.position === 'middle-right' ? 'top-1/2 -translate-y-1/2 right-4' :
                      editOptions.textWatermark.position === 'bottom-left' ? 'bottom-4 left-4' :
                      editOptions.textWatermark.position === 'bottom-center' ? 'bottom-4 left-1/2 -translate-x-1/2' :
                      'bottom-4 right-4'
                    }`}
                  >
                    {editOptions.textWatermark.text}
                  </div>
                )}

                {/* Player Controls Bar */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="p-1 hover:text-neutral-300 transition-colors"
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-1 hover:text-neutral-300 transition-colors"
                      aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <span>
                      {formatVideoDuration(currentTime)} / {formatVideoDuration(videoMetrics?.duration || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Risk Indicator Card */}
              {metadataReport && (
                <div className="p-4 rounded-xl bg-white border border-neutral-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Privacy Risk Assessment
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${
                        metadataReport.privacyRiskLevel === 'HIGH'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : metadataReport.privacyRiskLevel === 'MEDIUM'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : metadataReport.privacyRiskLevel === 'LOW'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}
                    >
                      {metadataReport.privacyRiskLevel}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {metadataReport.privacyRiskLevel === 'HIGH' &&
                      'Critical privacy exposure: Video contains precise GPS location coordinates or device serial numbers.'}
                    {metadataReport.privacyRiskLevel === 'MEDIUM' &&
                      'Moderate privacy exposure: Recording timestamps, device model, or author tags are embedded.'}
                    {metadataReport.privacyRiskLevel === 'LOW' &&
                      'Low exposure: Only basic container stream specifications and container headers were detected.'}
                    {metadataReport.privacyRiskLevel === 'CLEAN' &&
                      'Verified clean: No identifying timestamps, camera models, GPS markers, or user metadata found.'}
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT: Studio Controls Tabs (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Tabs Navigation */}
              <div className="flex border-b border-neutral-200">
                <button
                  onClick={() => setActiveTab('inspector')}
                  className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'inspector'
                      ? 'border-neutral-900 text-neutral-900'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  Metadata Inspector & Cleaner
                </button>
                <button
                  onClick={() => setActiveTab('watermark')}
                  className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'watermark'
                      ? 'border-neutral-900 text-neutral-900'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Stamp className="w-4 h-4" />
                  Watermark Studio
                </button>
                <button
                  onClick={() => setActiveTab('editor')}
                  className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'editor'
                      ? 'border-neutral-900 text-neutral-900'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                  Editing & Export
                </button>
              </div>

              {/* TAB 1: METADATA INSPECTOR & CLEANER */}
              {activeTab === 'inspector' && (
                <div className="space-y-6">
                  {/* Clean Action Banner */}
                  <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-neutral-900 text-sm">
                        Lossless In-Place Metadata Eradication
                      </h4>
                      <p className="text-xs text-neutral-500 max-w-md leading-relaxed">
                        Zeros out GPS, recording timestamps, camera identifiers, and user metadata directly in the container without re-encoding.
                      </p>
                    </div>
                    <button
                      onClick={handleStripMetadata}
                      disabled={isCleaning}
                      className="btn-primary whitespace-nowrap text-sm flex items-center gap-2"
                    >
                      {isCleaning ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Sanitizing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 text-teal-400" />
                          Strip All Metadata
                        </>
                      )}
                    </button>
                  </div>

                  {/* Cleaning Result Report Modal / Panel */}
                  {cleanResult && (
                    <div className="p-5 rounded-2xl bg-teal-50/50 border border-teal-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-teal-900 font-semibold text-sm">
                          <CheckCircle2 className="w-5 h-5 text-teal-600" />
                          <span>Video Sanitized Successfully ({cleanResult.durationMs}ms)</span>
                        </div>
                        <a
                          href={cleanedDownloadUrl ?? undefined}
                          download={cleanResult.cleanedFile.name}
                          className="px-3.5 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Clean Video
                        </a>
                      </div>

                      {/* Before / After Comparison */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-1">
                          <span className="font-semibold text-neutral-700">Before Sanitization</span>
                          <div className="text-neutral-500">
                            Tags: <span className="text-neutral-900 font-medium">{cleanResult.beforeReport.rawTagCount}</span>
                          </div>
                          <div className="text-neutral-500">
                            GPS: <span className="text-red-600 font-medium">{cleanResult.beforeReport.hasGps ? 'Found' : 'None'}</span>
                          </div>
                          <div className="text-neutral-500">
                            Risk: <span className="font-semibold">{cleanResult.beforeReport.privacyRiskLevel}</span>
                          </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-teal-200 space-y-1">
                          <span className="font-semibold text-teal-900">After Sanitization</span>
                          <div className="text-neutral-500">
                            Tags: <span className="text-teal-700 font-medium">{cleanResult.afterReport.rawTagCount}</span>
                          </div>
                          <div className="text-neutral-500">
                            GPS: <span className="text-teal-600 font-medium">0 Coordinates</span>
                          </div>
                          <div className="text-neutral-500">
                            Risk: <span className="text-teal-700 font-bold">CLEAN</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-neutral-500 space-y-1">
                        {cleanResult.notes.map((n, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="text-neutral-400">•</span>
                            <span>{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata Tags Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                        Detected Container & Stream Tags ({metadataReport?.tags.length || 0})
                      </h4>
                      {isInspecting && <span className="text-xs text-neutral-400">Inspecting...</span>}
                    </div>

                    {metadataReport && metadataReport.tags.length > 0 ? (
                      <div className="border border-neutral-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Group</th>
                              <th className="py-2.5 px-3 font-semibold">Tag Name</th>
                              <th className="py-2.5 px-3 font-semibold">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {metadataReport.tags.map((t, idx) => (
                              <tr key={idx} className="hover:bg-neutral-50/50">
                                <td className="py-2 px-3 text-neutral-500 font-medium whitespace-nowrap">
                                  {t.group}
                                </td>
                                <td className="py-2 px-3 text-neutral-900 font-medium whitespace-nowrap">
                                  {t.name}
                                </td>
                                <td className="py-2 px-3 text-neutral-600 font-mono break-all">
                                  {t.value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-neutral-400 border border-neutral-200 rounded-xl bg-neutral-50/50">
                        No embedded metadata tags detected in container.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: WATERMARK STUDIO */}
              {activeTab === 'watermark' && (
                <div className="space-y-6">
                  {/* Text Watermark Controls */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-neutral-700" />
                        <span className="font-semibold text-sm text-neutral-900">Text Watermark</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOptions.textWatermark.enabled}
                          onChange={e =>
                            setEditOptions(prev => ({
                              ...prev,
                              textWatermark: { ...prev.textWatermark, enabled: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                      </label>
                    </div>

                    {editOptions.textWatermark.enabled && (
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">
                            Watermark Text
                          </label>
                          <input
                            type="text"
                            value={editOptions.textWatermark.text}
                            onChange={e =>
                              setEditOptions(prev => ({
                                ...prev,
                                textWatermark: { ...prev.textWatermark, text: e.target.value },
                              }))
                            }
                            placeholder="e.g. Copyright © 2026 GHOSTING"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
                          />
                          {/* Quick Presets */}
                          <div className="flex gap-2 mt-1.5">
                            <button
                              onClick={() =>
                                setEditOptions(prev => ({
                                  ...prev,
                                  textWatermark: {
                                    ...prev.textWatermark,
                                    text: `Copyright © ${new Date().getFullYear()} GHOSTING`,
                                  },
                                }))
                              }
                              className="text-[11px] text-neutral-500 hover:text-neutral-900 underline"
                            >
                              Insert Copyright Label
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Font Size ({editOptions.textWatermark.fontSize}px)
                            </label>
                            <input
                              type="range"
                              min={16}
                              max={64}
                              value={editOptions.textWatermark.fontSize}
                              onChange={e =>
                                setEditOptions(prev => ({
                                  ...prev,
                                  textWatermark: {
                                    ...prev.textWatermark,
                                    fontSize: parseInt(e.target.value),
                                  },
                                }))
                              }
                              className="w-full"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-1">
                              Opacity ({Math.round(editOptions.textWatermark.opacity * 100)}%)
                            </label>
                            <input
                              type="range"
                              min={0.1}
                              max={1.0}
                              step={0.05}
                              value={editOptions.textWatermark.opacity}
                              onChange={e =>
                                setEditOptions(prev => ({
                                  ...prev,
                                  textWatermark: {
                                    ...prev.textWatermark,
                                    opacity: parseFloat(e.target.value),
                                  },
                                }))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Position Grid Selector */}
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                            Position
                          </label>
                          <div className="grid grid-cols-3 gap-1.5 max-w-[180px]">
                            {[
                              'top-left', 'top-center', 'top-right',
                              'middle-left', 'center', 'middle-right',
                              'bottom-left', 'bottom-center', 'bottom-right',
                            ].map(pos => (
                              <button
                                key={pos}
                                onClick={() =>
                                  setEditOptions(prev => ({
                                    ...prev,
                                    textWatermark: {
                                      ...prev.textWatermark,
                                      position: pos as WatermarkPosition,
                                    },
                                  }))
                                }
                                className={`h-7 rounded border text-[10px] font-mono transition-colors ${
                                  editOptions.textWatermark.position === pos
                                    ? 'bg-neutral-900 text-white border-neutral-900'
                                    : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100'
                                }`}
                              >
                                {pos.split('-').map(s => s[0].toUpperCase()).join('')}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Logo Watermark Upload */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Stamp className="w-4 h-4 text-neutral-700" />
                        <span className="font-semibold text-sm text-neutral-900">Logo Image Watermark</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOptions.imageWatermark.enabled}
                          onChange={e =>
                            setEditOptions(prev => ({
                              ...prev,
                              imageWatermark: { ...prev.imageWatermark, enabled: e.target.checked },
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                      </label>
                    </div>

                    {editOptions.imageWatermark.enabled && (
                      <div className="space-y-4 pt-2">
                        <input
                          id={logoWatermarkInputId}
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          onChange={handleLogoUpload}
                          className="hidden"
                          aria-label="Upload logo watermark image"
                        />
                        <button
                          onClick={() => logoInputRef.current?.click()}
                          className="w-full py-3 px-4 border border-dashed border-neutral-300 rounded-xl text-xs font-medium text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 transition-colors flex items-center justify-center gap-2"
                        >
                          <UploadCloud className="w-4 h-4" />
                          {editOptions.imageWatermark.imageBlobUrl ? 'Change Logo Image' : 'Select Logo Image (PNG / SVG)'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: VIDEO EDITING TOOLS */}
              {activeTab === 'editor' && (
                <div className="space-y-6">
                  {/* Trimming */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Scissors className="w-4 h-4 text-neutral-700" />
                        <span className="font-semibold text-sm text-neutral-900">Trim Duration</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOptions.trimEnabled}
                          onChange={e =>
                            setEditOptions(prev => ({
                              ...prev,
                              trimEnabled: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                      </label>
                    </div>

                    {editOptions.trimEnabled && videoMetrics && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">
                            Start Time ({formatVideoDuration(editOptions.startTime)})
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, editOptions.endTime - 1)}
                            value={editOptions.startTime}
                            onChange={e =>
                              setEditOptions(prev => ({
                                ...prev,
                                startTime: parseFloat(e.target.value),
                              }))
                            }
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1">
                            End Time ({formatVideoDuration(editOptions.endTime)})
                          </label>
                          <input
                            type="range"
                            min={editOptions.startTime + 1}
                            max={Math.round(videoMetrics.duration)}
                            value={editOptions.endTime}
                            onChange={e =>
                              setEditOptions(prev => ({
                                ...prev,
                                endTime: parseFloat(e.target.value),
                              }))
                            }
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Crop & Aspect Ratio */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Crop className="w-4 h-4 text-neutral-700" />
                      <span className="font-semibold text-sm text-neutral-900">Aspect Ratio / Crop</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {(['original', '16:9', '9:16', '1:1', '4:5'] as AspectRatioPreset[]).map(preset => (
                        <button
                          key={preset}
                          onClick={() => setEditOptions(prev => ({ ...prev, cropPreset: preset }))}
                          className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                            editOptions.cropPreset === preset
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <RotateCw className="w-4 h-4 text-neutral-700" />
                      <span className="font-semibold text-sm text-neutral-900">Rotate Video</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {([0, 90, 180, 270] as const).map(deg => (
                        <button
                          key={deg}
                          onClick={() => setEditOptions(prev => ({ ...prev, rotationDegrees: deg }))}
                          className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                            editOptions.rotationDegrees === deg
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {deg === 0 ? 'Normal (0°)' : `${deg}°`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compression & Quality Presets */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-neutral-700" />
                      <span className="font-semibold text-sm text-neutral-900">Compression Preset</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['original', 'high', 'balanced', 'smaller'] as CompressionPreset[]).map(preset => (
                        <button
                          key={preset}
                          onClick={() => setEditOptions(prev => ({ ...prev, compressionPreset: preset }))}
                          className={`py-2 px-2 text-xs font-medium rounded-lg border capitalize transition-colors ${
                            editOptions.compressionPreset === preset
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Output Format */}
                  <div className="p-5 rounded-2xl bg-white border border-neutral-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Film className="w-4 h-4 text-neutral-700" />
                      <span className="font-semibold text-sm text-neutral-900">Output Container</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['mp4', 'webm'] as OutputFormatPreset[]).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setEditOptions(prev => ({ ...prev, outputFormat: fmt }))}
                          className={`py-2 px-3 text-xs font-medium rounded-lg border uppercase transition-colors ${
                            editOptions.outputFormat === fmt
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          .{fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* EXPORT ACTION & PROGRESS BAR */}
              <div className="pt-4 border-t border-neutral-200 space-y-4">
                {isProcessing && processProgress && (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-neutral-700">
                      <span>{processProgress.phase}</span>
                      <span>{processProgress.percent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className="h-full bg-neutral-900 transition-all duration-200"
                        style={{ width: `${processProgress.percent}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[11px] text-neutral-500">
                        {formatVideoDuration(processProgress.currentTimeSeconds)} / {formatVideoDuration(processProgress.totalTimeSeconds)}
                      </span>
                      <button
                        onClick={handleCancelProcessing}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {processedResult && (
                  <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-teal-900">
                        Processed File Ready ({formatVideoFileSize(processedResult.sizeBytes)})
                      </div>
                      <div className="text-[11px] text-teal-700">
                        {processedResult.width}×{processedResult.height} • {formatVideoDuration(processedResult.durationSeconds)} • {processedResult.format}
                      </div>
                    </div>
                    <a
                      href={processedResult.objectUrl}
                      download={processedResult.file.name}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4 text-teal-400" />
                      Download Processed Video
                    </a>
                  </div>
                )}

                {!isProcessing && !processedResult && (
                  <button
                    onClick={handleExportEditedVideo}
                    className="w-full py-3.5 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    Process & Export Video
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. PRIVACY ARCHITECTURE & LIMITATIONS EXPLANATION */}
      <div className="mt-16 p-8 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-4 max-w-4xl mx-auto">
        <h3 className="text-base font-bold text-neutral-900">
          How GHOSTING Video Privacy Operates
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-neutral-600 leading-relaxed">
          <div className="space-y-2">
            <h4 className="font-semibold text-neutral-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              100% In-Browser Execution
            </h4>
            <p>
              Your videos are parsed and modified entirely inside your device&apos;s memory using client-side JavaScript, Web Audio, and Canvas APIs. No file bytes or stream frames are ever uploaded to any cloud server or third-party service.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-neutral-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Technical Boundaries & Disclaimers
            </h4>
            <p>
              Visible watermarks discourage unauthorized republishing but cannot prevent screen capture. Container sanitization wipes GPS, timestamps, camera models, and user metadata; however, deeply embedded vendor-specific SEI NAL units inside proprietary codecs may remain.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoStudioPage;
