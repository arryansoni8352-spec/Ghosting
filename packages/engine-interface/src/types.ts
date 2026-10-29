/**
 * VeilGuard Engine Interface — Shared typed contract between the Electron main
 * process and the Python engine worker.
 *
 * Version history is explicit so UI code can negotiate capabilities.
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const ENGINE_INTERFACE_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Algorithm status — clearly separates production-ready from experimental
// ---------------------------------------------------------------------------

export type AlgorithmStatus =
  | "PRODUCTION_READY"   // Peer-reviewed, tested against target models
  | "EXPERIMENTAL"       // Functional but not validated against target models
  | "RESEARCH_ONLY"      // Reference implementation, not suitable for end users
  | "BLOCKED"            // Cannot run: dependency or license issue
  | "UNAVAILABLE";       // Model weights not downloaded

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

export type ProcessingDevice = "cpu" | "cuda" | "mps" | "auto";

// ---------------------------------------------------------------------------
// Supported image formats
// ---------------------------------------------------------------------------

export type SupportedFormat = "jpeg" | "png" | "webp" | "tiff";

// ---------------------------------------------------------------------------
// Algorithm descriptor
// ---------------------------------------------------------------------------

export interface AlgorithmDescriptor {
  /** Stable machine-readable identifier, e.g. "baseline-pixel-noise" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description shown in the UI */
  description: string;
  /** Research paper reference if applicable */
  paperReference?: string;
  /** Official repository if applicable */
  officialRepository?: string;
  /** Current operational status */
  status: AlgorithmStatus;
  /** Human-readable explanation of a BLOCKED or UNAVAILABLE status */
  statusReason?: string;
  /** Supported devices for this algorithm */
  supportedDevices: ProcessingDevice[];
  /** Whether GPU is required (as opposed to recommended) */
  requiresGpu: boolean;
  /** License of any model weights used */
  weightsLicense?: string;
  /** Whether this algorithm is safe for commercial use (requires legal review) */
  commercialUseReviewed: boolean;
}

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

/** A validated numeric parameter with explicit bounds */
export interface NumericParam {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  value: number;
  unit?: string;
}

/** A validated string enum parameter */
export interface EnumParam {
  id: string;
  label: string;
  description: string;
  options: string[];
  default: string;
  value: string;
}

export type EngineParam = NumericParam | EnumParam;

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface EngineRequest {
  /** Unique request ID for correlating responses */
  requestId: string;
  /** Engine identifier (future: support multiple engine backends) */
  engineId: "veilguard-python-v1";
  /** Algorithm to apply */
  algorithmId: string;
  /** Absolute path to the validated source image (read-only) */
  inputPath: string;
  /** Absolute path where the protected image should be written */
  outputPath: string;
  /** Processing device preference */
  device: ProcessingDevice;
  /** Algorithm parameters, validated against descriptor bounds */
  params: Record<string, number | string>;
  /** Optional seed for reproducibility (where supported) */
  seed?: number;
  /** Maximum allowed wall-clock seconds before the engine aborts */
  timeoutSeconds: number;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface EngineProgress {
  requestId: string;
  /** 0–100 */
  percent: number;
  message: string;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type EngineErrorCode =
  | "INPUT_NOT_FOUND"
  | "INPUT_TOO_LARGE"
  | "INPUT_DIMENSIONS_EXCEEDED"
  | "INPUT_FORMAT_UNSUPPORTED"
  | "INPUT_MALFORMED"
  | "OUTPUT_PATH_UNSAFE"
  | "OUTPUT_WRITE_FAILED"
  | "ALGORITHM_UNAVAILABLE"
  | "ALGORITHM_BLOCKED"
  | "DEVICE_UNAVAILABLE"
  | "TIMEOUT"
  | "CANCELLED"
  | "OUT_OF_MEMORY"
  | "INTERNAL_ERROR";

export interface EngineError {
  code: EngineErrorCode;
  message: string;
  detail?: string;
}

export interface EngineResultSuccess {
  status: "success";
  requestId: string;
  algorithmId: string;
  algorithmStatus: AlgorithmStatus;
  device: ProcessingDevice;
  outputPath: string;
  outputFormat: SupportedFormat;
  elapsedMs: number;
  peakMemoryMb?: number;
  /** SHA-256 of the output file for integrity verification */
  outputHash: string;
  /** Reproducibility: seed used (if any) */
  seed?: number;
  /** Warnings that don't prevent success */
  warnings: string[];
  /** Human-readable limitation notices for the protection report */
  limitationNotices: string[];
}

export interface EngineResultFailure {
  status: "failure";
  requestId: string;
  error: EngineError;
  elapsedMs: number;
}

export type EngineResult = EngineResultSuccess | EngineResultFailure;

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface EngineHealthRequest {
  engineId: "veilguard-python-v1";
}

export interface EngineHealthResponse {
  engineId: "veilguard-python-v1";
  interfaceVersion: string;
  engineVersion: string;
  pythonVersion: string;
  availableAlgorithms: AlgorithmDescriptor[];
  availableDevices: ProcessingDevice[];
  torchAvailable: boolean;
  cudaAvailable: boolean;
  status: "ready" | "degraded" | "unavailable";
  degradedReasons: string[];
}

// ---------------------------------------------------------------------------
// IPC channel names (used in both main and renderer)
// ---------------------------------------------------------------------------

export const IPC_CHANNELS = {
  ENGINE_HEALTH: "engine:health",
  ENGINE_PROCESS: "engine:process",
  ENGINE_CANCEL: "engine:cancel",
  ENGINE_PROGRESS: "engine:progress",
  ENGINE_RESULT: "engine:result",
  IMAGE_VALIDATE: "image:validate",
  FILE_SAVE_DIALOG: "file:save-dialog",
  FILE_OPEN_DIALOG: "file:open-dialog",
  FILE_READ_METADATA: "file:read-metadata",
  PREFS_GET: "prefs:get",
  PREFS_SET: "prefs:set",
  APP_VERSION: "app:version",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ---------------------------------------------------------------------------
// Image metadata (returned by file:read-metadata)
// ---------------------------------------------------------------------------

export interface ImageMetadata {
  path: string;
  filename: string;
  format: SupportedFormat;
  widthPx: number;
  heightPx: number;
  fileSizeBytes: number;
  hasExif: boolean;
  exifOrientation?: number;
  hasAlpha: boolean;
  colorProfile?: string;
  /** Data URL for preview — renderer never reads the raw file directly */
  previewDataUrl: string;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface AppPreferences {
  theme: "dark" | "light" | "system";
  defaultOutputDirectory: string | null;
  defaultDevice: ProcessingDevice;
  keepProcessingHistory: boolean;
  maxHistoryEntries: number;
  defaultOutputFormat: SupportedFormat;
  defaultJpegQuality: number; // 1–100
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "dark",
  defaultOutputDirectory: null,
  defaultDevice: "cpu",
  keepProcessingHistory: false,
  maxHistoryEntries: 100,
  defaultOutputFormat: "png",
  defaultJpegQuality: 92,
};
