/**
 * VeilGuard — IPC Handler Registration
 *
 * Security policy:
 *   - ONLY channels in the explicit allowlist may be handled
 *   - Every handler validates its input before acting
 *   - No raw file paths from the renderer are used without validation
 *   - No shell execution
 *   - Dialogs are opened by the main process, not the renderer
 */

import {
  IpcMain,
  dialog,
  app,
  BrowserWindow,
} from "electron";
import path from "path";
import fs from "fs";
import { EngineManager } from "./engine-manager";
import { IPC_CHANNELS, DEFAULT_PREFERENCES } from "../../../packages/engine-interface/src/types";
import type {
  AppPreferences,
  ImageMetadata,
  SupportedFormat,
} from "../../../packages/engine-interface/src/types";

// ─── Store ────────────────────────────────────────────────────────────────────

let preferences: AppPreferences = { ...DEFAULT_PREFERENCES };

const PREFS_PATH = path.join(app.getPath("userData"), "preferences.json");

function loadPreferences(): void {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const raw = fs.readFileSync(PREFS_PATH, "utf-8");
      const saved = JSON.parse(raw);
      preferences = { ...DEFAULT_PREFERENCES, ...saved };
    }
  } catch {
    // Ignore; use defaults
  }
}

function savePreferences(): void {
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(preferences, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save preferences:", err);
  }
}

// Load on startup
loadPreferences();

// ─── Image Validation Constants ────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"]);

// ─── Path Safety ──────────────────────────────────────────────────────────────

function isSafeImagePath(filePath: string): boolean {
  try {
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return false;
    if (!fs.existsSync(resolved)) return false;
    if (!fs.statSync(resolved).isFile()) return false;
    if (fs.statSync(resolved).size > MAX_FILE_SIZE_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

function isSafeOutputPath(filePath: string, inputPath: string): boolean {
  try {
    const resolved = path.resolve(filePath);
    const inputResolved = path.resolve(inputPath);
    if (resolved === inputResolved) return false; // Must not overwrite original
    const ext = path.extname(resolved).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return false;
    if (!fs.existsSync(path.dirname(resolved))) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Image Preview Generator ──────────────────────────────────────────────────

async function generatePreviewDataUrl(filePath: string): Promise<string> {
  // Read raw bytes and base64-encode — no external libraries needed for preview
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  const data = fs.readFileSync(filePath);
  const b64 = data.toString("base64");
  return `data:${mime};base64,${b64}`;
}

function detectFormat(filePath: string): SupportedFormat | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    const hex = buf.slice(0, 4).toString("hex");
    if (hex.startsWith("ffd8ff")) return "jpeg";
    if (hex === "89504e47") return "png";
    if (hex === "52494646" && buf.slice(8, 12).toString("ascii") === "WEBP")
      return "webp";
    if (hex === "49492a00" || hex === "4d4d002a") return "tiff";
    return null;
  } catch {
    return null;
  }
}

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerIpcHandlers(
  ipcMain: IpcMain,
  engineManager: EngineManager
): void {
  // ── App version ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion());

  // ── Preferences ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.PREFS_GET, () => ({ ...preferences }));

  ipcMain.handle(IPC_CHANNELS.PREFS_SET, (_, update: Partial<AppPreferences>) => {
    // Only allow known keys to be updated
    const allowed = new Set(Object.keys(DEFAULT_PREFERENCES));
    const safeUpdate: Partial<AppPreferences> = {};
    for (const [key, value] of Object.entries(update)) {
      if (allowed.has(key)) {
        (safeUpdate as Record<string, unknown>)[key] = value;
      }
    }
    preferences = { ...preferences, ...safeUpdate };
    savePreferences();
    return { ...preferences };
  });

  // ── File dialogs ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: "Open Image",
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "tiff", "tif"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_DIALOG,
    async (event, opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win!, {
        title: "Save Protected Image",
        defaultPath: opts?.defaultPath,
        filters: opts?.filters ?? [
          { name: "PNG Image", extensions: ["png"] },
          { name: "JPEG Image", extensions: ["jpg"] },
          { name: "WebP Image", extensions: ["webp"] },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    }
  );

  // ── Image metadata ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ_METADATA,
    async (_, { filePath }: { filePath: string }): Promise<ImageMetadata | null> => {
      if (!isSafeImagePath(filePath)) return null;

      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);
      const fmt = detectFormat(resolved);
      if (!fmt) return null;

      const previewDataUrl = await generatePreviewDataUrl(resolved);

      // Basic dimension extraction without spawning a process
      // We use a simple buffer read for PNG and JPEG only; others return 0
      let width = 0;
      let height = 0;
      try {
        const buf = fs.readFileSync(resolved);
        if (fmt === "png") {
          // PNG IHDR: width at bytes 16-19, height at 20-23
          width = buf.readUInt32BE(16);
          height = buf.readUInt32BE(20);
        } else if (fmt === "jpeg") {
          // Scan JPEG SOF markers for dimensions
          const dims = extractJpegDimensions(buf);
          width = dims.width;
          height = dims.height;
        }
      } catch {
        // Dimensions unavailable; continue
      }

      return {
        path: resolved,
        filename: path.basename(resolved),
        format: fmt,
        widthPx: width,
        heightPx: height,
        fileSizeBytes: stat.size,
        hasExif: fmt === "jpeg",
        hasAlpha: fmt === "png" || fmt === "webp",
        previewDataUrl,
      };
    }
  );

  // ── Image validate (security check before processing) ───────────────────
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_VALIDATE,
    (_, { filePath }: { filePath: string }) => {
      const safe = isSafeImagePath(filePath);
      const fmt = safe ? detectFormat(path.resolve(filePath)) : null;
      return { valid: safe && fmt !== null, format: fmt };
    }
  );

  // ── Engine health ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.ENGINE_HEALTH, async () => {
    try {
      return await engineManager.health();
    } catch (err) {
      return {
        status: "unavailable",
        engineId: "veilguard-python-v1",
        degradedReasons: [String(err)],
        availableAlgorithms: [],
        availableDevices: [],
        torchAvailable: false,
        cudaAvailable: false,
      };
    }
  });

  // ── Engine process ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ENGINE_PROCESS,
    async (event, request: Record<string, unknown>) => {
      // Validate paths before passing to engine
      const inputPath = String(request["inputPath"] ?? "");
      const outputPath = String(request["outputPath"] ?? "");

      if (!isSafeImagePath(inputPath)) {
        return {
          status: "failure",
          requestId: request["requestId"],
          error: {
            code: "INPUT_PATH_UNSAFE",
            message: "Input file path failed security validation.",
          },
          elapsedMs: 0,
        };
      }

      if (!isSafeOutputPath(outputPath, inputPath)) {
        return {
          status: "failure",
          requestId: request["requestId"],
          error: {
            code: "OUTPUT_PATH_UNSAFE",
            message: "Output file path failed security validation.",
          },
          elapsedMs: 0,
        };
      }

      const win = BrowserWindow.fromWebContents(event.sender);

      const progressCallback = (progress: {
        requestId: string;
        percent: number;
        message: string;
        elapsedMs: number;
      }) => {
        win?.webContents.send(IPC_CHANNELS.ENGINE_PROGRESS, progress);
      };

      try {
        const result = await engineManager.runProcess(
          request,
          progressCallback,
          (Number(request["timeoutSeconds"]) || 120) * 1000
        );
        win?.webContents.send(IPC_CHANNELS.ENGINE_RESULT, result);
        return result;
      } catch (err) {
        const errorResult = {
          status: "failure",
          requestId: request["requestId"],
          error: {
            code: "INTERNAL_ERROR",
            message: String(err),
          },
          elapsedMs: 0,
        };
        win?.webContents.send(IPC_CHANNELS.ENGINE_RESULT, errorResult);
        return errorResult;
      }
    }
  );

  // ── Engine cancel ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ENGINE_CANCEL,
    (_, { requestId }: { requestId: string }) => {
      engineManager.cancel(requestId);
      return { cancelled: true };
    }
  );
}

// ─── JPEG Dimension Extractor ─────────────────────────────────────────────────

function extractJpegDimensions(buf: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    // SOF markers: C0, C1, C2, C3, C5, C6, C7, C9, CA, CB, CD, CE, CF
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker
      )
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buf.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}
