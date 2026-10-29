/**
 * VeilGuard — Electron Preload Script
 *
 * This is the ONLY bridge between the renderer process and the main process.
 * All APIs exposed here must be:
 *   1. Narrowly scoped — expose only what the renderer needs
 *   2. Named — no generic "ipcRenderer.invoke" passthrough
 *   3. Validated — no raw user input passed directly to filesystem/shell APIs
 *
 * The renderer has NO access to Node.js, Electron, or the filesystem directly.
 */

import { contextBridge, ipcRenderer } from "electron";
import type {
  EngineHealthRequest,
  EngineRequest,
  AppPreferences,
} from "../../../packages/engine-interface/src/types";
import { IPC_CHANNELS } from "../../../packages/engine-interface/src/types";

// ─── Exposed API ──────────────────────────────────────────────────────────────

const veilguardAPI = {
  /** Request the engine health status */
  engineHealth: (req: EngineHealthRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_HEALTH, req),

  /** Start a protection processing job */
  engineProcess: (req: EngineRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PROCESS, req),

  /** Cancel an in-progress job */
  engineCancel: (requestId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_CANCEL, { requestId }),

  /** Validate an image file and get metadata + preview */
  imageValidate: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMAGE_VALIDATE, { filePath }),

  /** Open a native file open dialog */
  openFileDialog: (options?: { title?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG, options ?? {}),

  /** Open a native file save dialog */
  saveFileDialog: (options?: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_DIALOG, options ?? {}),

  /** Read image file metadata (including safe preview data URL) */
  readImageMetadata: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_METADATA, { filePath }),

  /** Get current application preferences */
  getPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.PREFS_GET),

  /** Update application preferences (partial update allowed) */
  setPreferences: (prefs: Partial<AppPreferences>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PREFS_SET, prefs),

  /** Get the application version string */
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // ── Event listeners ──────────────────────────────────────────────────────

  /** Listen for engine progress events */
  onEngineProgress: (
    callback: (progress: {
      requestId: string;
      percent: number;
      message: string;
      elapsedMs: number;
    }) => void
  ) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
      callback(data as Parameters<typeof callback>[0]);
    ipcRenderer.on(IPC_CHANNELS.ENGINE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ENGINE_PROGRESS, handler);
  },

  /** Listen for engine result events */
  onEngineResult: (callback: (result: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.ENGINE_RESULT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ENGINE_RESULT, handler);
  },
};

// Expose the typed API to the renderer under window.veilguard
contextBridge.exposeInMainWorld("veilguard", veilguardAPI);

// Export type for the renderer (imported via declare global in renderer/types.ts)
export type VeilguardAPI = typeof veilguardAPI;
