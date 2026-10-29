/**
 * VeilGuard — Electron Main Process
 *
 * Security requirements (enforced here):
 *   - contextIsolation: true (renderer has no direct Node access)
 *   - nodeIntegration: false
 *   - sandbox: true
 *   - webSecurity: true
 *   - Content-Security-Policy via session.webRequest
 *   - IPC channel allowlist enforced in ipc-handlers.ts
 *   - No arbitrary shell execution exposed to renderer
 *   - Unsafe URL navigation blocked
 */

import {
  app,
  BrowserWindow,
  session,
  shell,
  ipcMain,
} from "electron";
import path from "path";
import fs from "fs";
import { registerIpcHandlers } from "./ipc-handlers";
import { EngineManager } from "./engine-manager";

// ─── Constants ──────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";
const RENDERER_URL = "http://localhost:5173";

function getRendererFile(): string {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, "dist", "index.html"),
    path.resolve(__dirname, "../../../../dist/index.html"),
    path.resolve(__dirname, "../../../dist/index.html"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

// ─── App State ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let engineManager: EngineManager | null = null;

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // Show only after ready-to-show to avoid flash
    backgroundColor: "#0f0f13", // Match app dark background
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      // ── Security: strict isolation ────────────────────────────────────────
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Preload: the only bridge between renderer and main
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Show window gracefully after content loads
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Block navigation to external URLs — renderer must use shell.openExternal
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? url.startsWith("http://localhost:5173")
      : url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
      // Open external links in the system browser, not Electron
      shell.openExternal(url).catch(() => {});
    }
  });

  // Block new window / popup creation from renderer
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Load the app
  if (isDev) {
    mainWindow.loadURL(RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(getRendererFile());
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Content Security Policy ──────────────────────────────────────────────────

function applyCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? // Dev: allow Vite HMR websocket
        "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5173; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';"
      : // Production: strict CSP
        "default-src 'self'; script-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none';";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Apply CSP before creating window
  applyCSP();

  // Start the engine manager (manages the Python subprocess)
  engineManager = new EngineManager();

  // Register all IPC handlers with a reference to the engine manager
  registerIpcHandlers(ipcMain, engineManager);

  // Create the main window
  createWindow();

  // macOS: re-create window when dock icon clicked with no windows open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await engineManager?.shutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await engineManager?.shutdown();
});

// ─── Prevent second instance ─────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
